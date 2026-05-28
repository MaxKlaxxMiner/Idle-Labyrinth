/**
 * Persistenter Spielstand pro Slot (z. B. 'idle', 'endless'), backed by IndexedDB.
 *
 * Aktuell minimal: nur das höchste erreichte Level. Spätere Felder (Coins, Upgrades, ...)
 * kommen ins gleiche State-Record.
 *
 * Verwendung:
 *   const save = new GameSave('idle');
 *   await save.init();             // lädt RAM-State
 *   save.getLevel();               // synchroner Lookup
 *   save.setLevel(7);              // RAM sofort, Persistenz async
 */
export class GameSave {
    private static readonly DB_VERSION = 1;
    private static readonly STORE = 'state';
    private static readonly KEY = 'save';

    private readonly dbName: string;
    private dbPromise: Promise<IDBDatabase> | null = null;

    private level = 0;

    constructor(slot: string) {
        this.dbName = `idle-laby-save-${slot}`;
    }

    /** Einmalige Initialisierung: lädt vorhandenen State in den RAM. */
    async init(): Promise<void> {
        const idb = GameSave.getIndexedDB();
        if (!idb) return;
        try {
            const db = await this.openDB(idb);
            const tx = db.transaction([GameSave.STORE], 'readonly');
            const rec = await GameSave.reqToPromise<any>(tx.objectStore(GameSave.STORE).get(GameSave.KEY));
            await GameSave.txDone(tx);
            if (rec && Number.isFinite(rec.level) && rec.level >= 0) {
                this.level = rec.level >>> 0;
            }
        } catch {
            // Cache bleibt leer
        }
    }

    getLevel(): number {
        return this.level;
    }

    setLevel(level: number): void {
        if (!Number.isFinite(level) || level < 0) return;
        const next = level >>> 0;
        if (next === this.level) return;
        this.level = next;
        void this.persist();
    }

    private async persist(): Promise<void> {
        const idb = GameSave.getIndexedDB();
        if (!idb) return;
        try {
            const db = await this.openDB(idb);
            const tx = db.transaction([GameSave.STORE], 'readwrite');
            tx.objectStore(GameSave.STORE).put({level: this.level}, GameSave.KEY);
            await GameSave.txDone(tx);
        } catch {
            // ignorieren
        }
    }

    private openDB(idb: IDBFactory): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;
        const name = this.dbName;
        this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            const req = idb.open(name, GameSave.DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(GameSave.STORE)) db.createObjectStore(GameSave.STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
        });
        return this.dbPromise;
    }

    private static getIndexedDB(): IDBFactory | null {
        try {
            // @ts-expect-error: WebKit-Präfix nur als Fallback
            const idb: IDBFactory | undefined = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
            return idb ?? null;
        } catch {
            return null;
        }
    }

    private static reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    private static txDone(tx: IDBTransaction): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
            tx.onerror = () => reject(tx.error);
        });
    }
}
