/**
 * IndexedDB-Cache für große Labyrinth-Daten (Uint32Array) mit Chunking.
 *
 * Eigenschaften:
 * - Eine Instanz pro Slot (z. B. 'idle', 'endless'); jede Instanz nutzt eine eigene IndexedDB.
 * - Speichert pro Slot immer nur ein einziges Level (ersetzt vorherigen Eintrag vollständig).
 * - Chunking in feste Byte-Größe, um sehr große Arrays (hundert+ MB) robust zu speichern.
 * - Fallback: Wenn IndexedDB nicht verfügbar ist, sind die Methoden no-ops bzw. liefern null.
 */
export class LabyCache {
    // Konstanten teilen sich alle Instanzen
    private static readonly DB_VERSION = 1;
    private static readonly STORE_META = 'meta';
    private static readonly STORE_CHUNKS = 'chunks';
    // Ziel-Chunksize in Bytes. 8 MiB ist konservativ und funktioniert in gängigen Browsern.
    private static readonly CHUNK_BYTES = 8 * 1024 * 1024;

    private readonly dbName: string;
    private dbPromise: Promise<IDBDatabase> | null = null;

    // In-Memory-Cache des zuletzt gespeicherten Levels (für synchronen Lookup)
    private currentLevel: number | null = null;
    private currentData: Uint32Array | null = null;

    constructor(slot: string) {
        this.dbName = `idle-laby-cache-${slot}`;
    }

    /**
     * Einmalige Initialisierung: öffnet IndexedDB und lädt vorhandenes (einziges) Level in den RAM.
     * Muss idealerweise beim Start (vor Nutzung) awaited werden.
     */
    async init(): Promise<void> {
        const idb = LabyCache.getIndexedDB();
        if (!idb) return; // kein IndexedDB -> kein Persistenz-Layer
        try {
            const db = await this.openDB(idb);
            const tx = db.transaction([LabyCache.STORE_CHUNKS, LabyCache.STORE_META], 'readonly');
            const chunks = tx.objectStore(LabyCache.STORE_CHUNKS);
            const meta = tx.objectStore(LabyCache.STORE_META);
            const metaRec = await LabyCache.reqToPromise<any>(meta.get('meta'));
            if (!metaRec || !Number.isFinite(metaRec.length) || metaRec.length <= 0 || !Number.isFinite(metaRec.level)) {
                tx.abort();
                return;
            }
            const length: number = metaRec.length >>> 0;
            const bytesPerElement = 4; // Uint32
            const chunkBytes: number = Number.isFinite(metaRec.chunkBytes) && metaRec.chunkBytes > 0 ? metaRec.chunkBytes : LabyCache.CHUNK_BYTES;
            const chunkElements = Math.max(1, (chunkBytes / bytesPerElement) | 0);
            const chunkCount: number = Math.ceil(length / chunkElements);

            const out = new Uint32Array(length);
            for (let i = 0; i < chunkCount; i++) {
                const buf = await LabyCache.reqToPromise<ArrayBuffer | undefined>(chunks.get(i));
                if (!buf) {
                    tx.abort();
                    return;
                }
                const view = new Uint32Array(buf);
                const start = i * chunkElements;
                out.set(view, start);
            }
            await LabyCache.txDone(tx);
            this.currentLevel = metaRec.level >>> 0;
            this.currentData = out;
        } catch {
            // Ignorieren - Cache bleibt leer
        }
    }

    /**
     * Speichert das angegebene Level als einziges (überschreibt ggf. vorhandene Daten).
     * RAM wird sofort aktualisiert, Persistenz läuft asynchron im Hintergrund.
     */
    saveLaby(level: number, data: Uint32Array): void {
        this.currentLevel = level >>> 0;
        this.currentData = data; // keine Kopie im RAM, um Speicher zu sparen
        void this.saveLabyAsync(level, data);
    }

    /** Liest das Level aus dem RAM-Cache oder liefert null, wenn nicht vorhanden. */
    readLaby(level: number): Uint32Array | null {
        if (this.currentLevel === (level >>> 0) && this.currentData && this.currentData.length > 0) return this.currentData;
        return null;
    }

    /** Interner, asynchroner Persist-Schritt (Chunking + Meta). */
    private async saveLabyAsync(level: number, data: Uint32Array): Promise<void> {
        const idb = LabyCache.getIndexedDB();
        if (!idb) return;

        const db = await this.openDB(idb);
        const tx = db.transaction([LabyCache.STORE_CHUNKS, LabyCache.STORE_META], 'readwrite');
        const chunks = tx.objectStore(LabyCache.STORE_CHUNKS);
        const meta = tx.objectStore(LabyCache.STORE_META);

        // Zunächst komplett leeren, damit nur ein Level existiert
        await Promise.all([
            LabyCache.reqToPromise(chunks.clear() as IDBRequest<any>),
            LabyCache.reqToPromise(meta.clear() as IDBRequest<any>),
        ]);

        const bytesPerElement = 4; // Uint32
        const chunkElements = Math.max(1, (LabyCache.CHUNK_BYTES / bytesPerElement) | 0);
        const totalLen = data.length;
        const chunkCount = Math.ceil(totalLen / chunkElements);

        for (let i = 0; i < chunkCount; i++) {
            const start = i * chunkElements;
            const end = Math.min(totalLen, start + chunkElements);
            const view = data.subarray(start, end);
            const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
            chunks.put(buffer, i);
        }

        const metaRecord = {
            k: 'meta',
            level,
            length: totalLen,
            chunkBytes: LabyCache.CHUNK_BYTES,
            chunkCount,
            bytesPerElement,
            createdAt: Date.now(),
        } as const;
        meta.put(metaRecord, 'meta');

        await LabyCache.txDone(tx);
    }

    /** Öffnet die DB einmalig und cached das Promise. */
    private openDB(idb: IDBFactory): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;
        const name = this.dbName;
        this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            const req = idb.open(name, LabyCache.DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(LabyCache.STORE_CHUNKS)) db.createObjectStore(LabyCache.STORE_CHUNKS);
                if (!db.objectStoreNames.contains(LabyCache.STORE_META)) db.createObjectStore(LabyCache.STORE_META);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
        });
        return this.dbPromise;
    }

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
