/**
 * IndexedDB-Cache für große Labyrinth-Daten (Uint32Array) mit Chunking.
 *
 * Eigenschaften:
 * - Speichert immer nur ein einziges Level (ersetzt vorherigen Eintrag vollständig).
 * - Chunking in feste Byte-Größe, um sehr große Arrays (hundert+ MB) robust zu speichern.
 * - Fallback: Wenn IndexedDB nicht verfügbar ist, sind die Methoden no-ops bzw. liefern null.
 */
export class LabyCache {
    // Datenbankspezifikation
    private static readonly DB_NAME = 'idle-laby-cache';
    private static readonly DB_VERSION = 1;
    private static readonly STORE_META = 'meta';
    private static readonly STORE_CHUNKS = 'chunks';

    // Ziel-Chunksize in Bytes. 8 MiB ist konservativ und funktioniert in gängigen Browsern.
    private static readonly CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB

    // Internes, einmaliges Open-Promise
    private static dbPromise: Promise<IDBDatabase> | null = null;

    // In-Memory-Cache des zuletzt gespeicherten Levels
    private static currentLevel: number | null = null;
    private static currentData: Uint32Array | null = null;

    /**
     * Einmalige Initialisierung: öffnet IndexedDB und lädt vorhandenes (einziges) Level in den RAM.
     * Muss idealerweise beim Start (vor Nutzung) awaited werden.
     */
    static async init(): Promise<void> {
        const idb = this.getIndexedDB();
        if (!idb) return; // kein IndexedDB -> kein Persistenz-Layer
        try {
            const db = await this.openDB(idb);
            const tx = db.transaction([this.STORE_CHUNKS, this.STORE_META], 'readonly');
            const chunks = tx.objectStore(this.STORE_CHUNKS);
            const meta = tx.objectStore(this.STORE_META);
            const metaRec = await this.reqToPromise<any>(meta.get('meta'));
            if (!metaRec || !Number.isFinite(metaRec.length) || metaRec.length < 0 || !Number.isFinite(metaRec.level)) {
                tx.abort();
                return;
            }
            const length: number = metaRec.length >>> 0;
            const bytesPerElement: number = metaRec.bytesPerElement === 4 ? 4 : 4;
            const chunkBytes: number = Number.isFinite(metaRec.chunkBytes) && metaRec.chunkBytes > 0 ? metaRec.chunkBytes : this.CHUNK_BYTES;
            const chunkElements = Math.max(1, (chunkBytes / bytesPerElement) | 0);
            const chunkCount: number = Math.ceil(length / chunkElements);

            const out = new Uint32Array(length);
            for (let i = 0; i < chunkCount; i++) {
                const buf = await this.reqToPromise<ArrayBuffer | undefined>(chunks.get(i));
                if (!buf) {
                    tx.abort();
                    return;
                }
                const view = new Uint32Array(buf);
                const start = i * chunkElements;
                out.set(view, start);
            }
            await this.txDone(tx);
            this.currentLevel = metaRec.level >>> 0;
            this.currentData = out;
        } catch {
            // Ignorieren – Cache bleibt leer
        }
    }

    /**
     * Speichert das angegebene Level als einziges (überschreibt ggf. vorhandene Daten).
     * Hinweis: IndexedDB ist asynchron; daher Rückgabe als Promise.
     */
    static saveLaby(level: number, data: Uint32Array): void {
        // Synchroner Aufruf: RAM aktualisieren, Persistenz asynchron anstoßen
        this.currentLevel = level >>> 0;
        this.currentData = data; // keine Kopie im RAM, um Speicher zu sparen

        // Async-Persist im Hintergrund ausführen
        void this.saveLabyAsync(level, data);
    }

    /** Interner, asynchroner Persist-Schritt (Chunking + Meta). */
    private static async saveLabyAsync(level: number, data: Uint32Array): Promise<void> {
        const idb = this.getIndexedDB();
        if (!idb) return; // Fallback: keine Persistenz möglich

        const db = await this.openDB(idb);
        const tx = db.transaction([this.STORE_CHUNKS, this.STORE_META], 'readwrite');
        const chunks = tx.objectStore(this.STORE_CHUNKS);
        const meta = tx.objectStore(this.STORE_META);

        // Zunächst komplett leeren, damit nur ein Level existiert
        await Promise.all([
            this.reqToPromise(chunks.clear() as IDBRequest<any>),
            this.reqToPromise(meta.clear() as IDBRequest<any>),
        ]);

        // Chunking vorbereiten
        const bytesPerElement = 4; // Uint32
        const chunkElements = Math.max(1, (this.CHUNK_BYTES / bytesPerElement) | 0);
        const totalLen = data.length;
        const chunkCount = Math.ceil(totalLen / chunkElements);

        // Chunks speichern (Schlüssel = Chunk-Index, Wert = ArrayBuffer)
        for (let i = 0; i < chunkCount; i++) {
            const start = i * chunkElements;
            const end = Math.min(totalLen, start + chunkElements);
            const view = data.subarray(start, end);
            // Slices nur für den genauen Bereich erstellen (vermeidet das Teilen des gesamten Buffers)
            const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
            chunks.put(buffer, i);
        }

        // Meta zuletzt schreiben (quasi commit-artig)
        const metaRecord = {
            k: 'meta',
            level,
            length: totalLen,
            chunkBytes: this.CHUNK_BYTES,
            chunkCount,
            bytesPerElement,
            createdAt: Date.now(),
        } as const;
        meta.put(metaRecord, 'meta');

        await this.txDone(tx);
    }

    /**
     * Liest das Level aus dem Cache oder liefert null, wenn nicht vorhanden/inkonsistent.
     * Hinweis: IndexedDB ist asynchron; daher Rückgabe als Promise.
     */
    static readLaby(level: number): Uint32Array | null {
        if (this.currentLevel === (level >>> 0) && this.currentData) return this.currentData;
        return null;
    }

    // Hilfsfunktionen

    /** Liefert das IndexedDB-Objekt oder null (z. B. in nicht-Window-Umgebungen). */
    private static getIndexedDB(): IDBFactory | null {
        try {
            // @ts-expect-error: WebKit-Präfix nur als Fallback
            const idb: IDBFactory | undefined = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
            return idb ?? null;
        } catch {
            return null;
        }
    }

    /** Öffnet die DB einmalig und cached das Promise. */
    private static openDB(idb: IDBFactory): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;
        this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            const req = idb.open(this.DB_NAME, this.DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                // Stores anlegen, falls nicht vorhanden
                if (!db.objectStoreNames.contains(this.STORE_CHUNKS)) db.createObjectStore(this.STORE_CHUNKS);
                if (!db.objectStoreNames.contains(this.STORE_META)) db.createObjectStore(this.STORE_META);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            req.onblocked = () => {
                // Blocked-Fall: lieber failen als hängen
                reject(new Error('IndexedDB upgrade blocked'));
            };
        });
        return this.dbPromise;
    }

    /** Wandelt ein IDBRequest in ein Promise um. */
    private static reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    /** Liefert ein Promise, das bei Transaktionsende auflöst. */
    private static txDone(tx: IDBTransaction): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
            tx.onerror = () => reject(tx.error);
        });
    }
}
