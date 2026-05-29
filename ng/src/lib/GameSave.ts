/**
 * Persistenter Spielstand pro Slot (z. B. 'idle', 'endless'), backed by IndexedDB.
 *
 * Stores:
 * - state:      { save: { level: number } }              - aktueller Level-Stand
 * - histories:  { [level: number]: string }              - pro Level die Eingabespur (Endless)
 * - best:       { [level: number]: { moves, totalMoves } } - Bestwerte pro gelöstem Level
 *
 * Alle Daten werden bei init() in den RAM geladen; Lese-Ops sind synchron,
 * Schreib-Ops aktualisieren RAM sofort und persistieren asynchron im Hintergrund.
 */

export interface BestStat {
    moves: number;
    totalMoves: number;
}

export class GameSave {
    private static readonly DB_VERSION = 2;
    private static readonly STORE_STATE = 'state';
    private static readonly STORE_HISTORIES = 'histories';
    private static readonly STORE_BEST = 'best';
    private static readonly KEY_STATE = 'save';

    private readonly dbName: string;
    private dbPromise: Promise<IDBDatabase> | null = null;

    private level = 0;
    private histories = new Map<number, string>();
    private bests = new Map<number, BestStat>();

    constructor(slot: string) {
        this.dbName = `idle-laby-save-${slot}`;
    }

    /** Einmalige Initialisierung: lädt vorhandenen State + alle Historien + Bestwerte in den RAM. */
    async init(): Promise<void> {
        const idb = GameSave.getIndexedDB();
        if (!idb) return;
        try {
            const db = await this.openDB(idb);
            const tx = db.transaction([GameSave.STORE_STATE, GameSave.STORE_HISTORIES, GameSave.STORE_BEST], 'readonly');
            const state = tx.objectStore(GameSave.STORE_STATE);
            const histories = tx.objectStore(GameSave.STORE_HISTORIES);
            const best = tx.objectStore(GameSave.STORE_BEST);

            const stateRec = await GameSave.reqToPromise<any>(state.get(GameSave.KEY_STATE));
            if (stateRec && Number.isFinite(stateRec.level) && stateRec.level >= 0) {
                this.level = stateRec.level >>> 0;
            }

            // Histories laden (Cursor)
            await new Promise<void>((resolve, reject) => {
                const req = histories.openCursor();
                req.onerror = () => reject(req.error);
                req.onsuccess = () => {
                    const cur = req.result;
                    if (!cur) { resolve(); return; }
                    const key = Number(cur.key);
                    if (Number.isFinite(key) && typeof cur.value === 'string') {
                        this.histories.set(key, cur.value);
                    }
                    cur.continue();
                };
            });

            // Best-Stats laden (Cursor)
            await new Promise<void>((resolve, reject) => {
                const req = best.openCursor();
                req.onerror = () => reject(req.error);
                req.onsuccess = () => {
                    const cur = req.result;
                    if (!cur) { resolve(); return; }
                    const key = Number(cur.key);
                    const v = cur.value;
                    if (Number.isFinite(key) && v && Number.isFinite(v.moves) && Number.isFinite(v.totalMoves)) {
                        this.bests.set(key, {moves: v.moves >>> 0, totalMoves: v.totalMoves >>> 0});
                    }
                    cur.continue();
                };
            });

            await GameSave.txDone(tx);
        } catch {
            // Cache bleibt leer / unvollständig
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
        void this.persistState();
    }

    getHistory(level: number): string {
        return this.histories.get(level >>> 0) ?? '';
    }

    setHistory(level: number, raw: string): void {
        const key = level >>> 0;
        if (raw.length === 0) {
            if (!this.histories.has(key)) return;
            this.histories.delete(key);
            void this.persistHistory(key, null);
        } else {
            if (this.histories.get(key) === raw) return;
            this.histories.set(key, raw);
            void this.persistHistory(key, raw);
        }
    }

    getBest(level: number): BestStat | null {
        return this.bests.get(level >>> 0) ?? null;
    }

    /** Liefert alle bekannten Bestwerte, aufsteigend nach Level sortiert. */
    listBests(): Array<{level: number; moves: number; totalMoves: number}> {
        const out: Array<{level: number; moves: number; totalMoves: number}> = [];
        for (const [level, best] of this.bests) {
            out.push({level, moves: best.moves, totalMoves: best.totalMoves});
        }
        out.sort((a, b) => a.level - b.level);
        return out;
    }

    /** Aktualisiert die Bestwerte, falls die neuen Werte besser (kleiner) sind. */
    recordBest(level: number, moves: number, totalMoves: number): void {
        const key = level >>> 0;
        const m = moves >>> 0;
        const t = totalMoves >>> 0;
        const existing = this.bests.get(key);
        const next: BestStat = existing
            ? {moves: Math.min(existing.moves, m), totalMoves: Math.min(existing.totalMoves, t)}
            : {moves: m, totalMoves: t};
        if (existing && next.moves === existing.moves && next.totalMoves === existing.totalMoves) return;
        this.bests.set(key, next);
        void this.persistBest(key, next);
    }

    private async persistState(): Promise<void> {
        const idb = GameSave.getIndexedDB();
        if (!idb) return;
        try {
            const db = await this.openDB(idb);
            const tx = db.transaction([GameSave.STORE_STATE], 'readwrite');
            tx.objectStore(GameSave.STORE_STATE).put({level: this.level}, GameSave.KEY_STATE);
            await GameSave.txDone(tx);
        } catch {
            // ignorieren
        }
    }

    private async persistHistory(level: number, raw: string | null): Promise<void> {
        const idb = GameSave.getIndexedDB();
        if (!idb) return;
        try {
            const db = await this.openDB(idb);
            const tx = db.transaction([GameSave.STORE_HISTORIES], 'readwrite');
            const store = tx.objectStore(GameSave.STORE_HISTORIES);
            if (raw === null) store.delete(level);
            else store.put(raw, level);
            await GameSave.txDone(tx);
        } catch {
            // ignorieren
        }
    }

    private async persistBest(level: number, best: BestStat): Promise<void> {
        const idb = GameSave.getIndexedDB();
        if (!idb) return;
        try {
            const db = await this.openDB(idb);
            const tx = db.transaction([GameSave.STORE_BEST], 'readwrite');
            tx.objectStore(GameSave.STORE_BEST).put({moves: best.moves, totalMoves: best.totalMoves}, level);
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
                if (!db.objectStoreNames.contains(GameSave.STORE_STATE)) db.createObjectStore(GameSave.STORE_STATE);
                if (!db.objectStoreNames.contains(GameSave.STORE_HISTORIES)) db.createObjectStore(GameSave.STORE_HISTORIES);
                if (!db.objectStoreNames.contains(GameSave.STORE_BEST)) db.createObjectStore(GameSave.STORE_BEST);
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
