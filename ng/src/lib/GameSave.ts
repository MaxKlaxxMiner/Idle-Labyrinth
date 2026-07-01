/**
 * Persistenter Spielstand pro Slot (z. B. 'idle', 'endless'), backed by IndexedDB.
 *
 * Stores (DB v3):
 * - state:      { save: { level: number } }              - aktueller Level-Stand
 * - histories:  { [level: number]: string }              - pro Level die Eingabespur (Endless)
 * - best:       { [level: number]: { moves, totalMoves } } - Bestwerte pro gelöstem Level
 * - meta:       { coins: bigint }                        - Coin-Wallet (Idle)
 * - upgrades:   { [upgradeId: string]: number }          - gekaufte Upgrade-Stufen (Idle)
 * - clears:     { [level: number]: number }              - Wiederholungs-Zähler pro Level (Idle)
 * - greenMarkers: { [level: number]: number[] }          - pro Level frei per Rechtsklick gesetzte Marker (Endless),
 *                                                          je Marker als (x << 16) | y gepackt
 *
 * Alle Daten werden bei init() in den RAM geladen; Lese-Ops sind synchron,
 * Schreib-Ops aktualisieren RAM sofort und persistieren asynchron im Hintergrund.
 */

export interface BestStat {
	moves: number;
	totalMoves: number;
}

export class GameSave {
	private static readonly DB_VERSION = 4;
	private static readonly STORE_STATE = 'state';
	private static readonly STORE_HISTORIES = 'histories';
	private static readonly STORE_BEST = 'best';
	private static readonly STORE_META = 'meta';
	private static readonly STORE_UPGRADES = 'upgrades';
	private static readonly STORE_CLEARS = 'clears';
	private static readonly STORE_GREEN_MARKERS = 'greenMarkers';
	private static readonly KEY_STATE = 'save';
	private static readonly KEY_META = 'meta';

	private readonly dbName: string;
	private dbPromise: Promise<IDBDatabase> | null = null;

	private level = 0;
	private histories = new Map<number, string>();
	private bests = new Map<number, BestStat>();
	private coins = 0n;
	private upgrades = new Map<string, number>();
	private clears = new Map<number, number>();
	private greenMarkers = new Map<number, number[]>();

	constructor(slot: string) {
		this.dbName = `idle-laby-save-${slot}`;
	}

	/** Einmalige Initialisierung: lädt alles in den RAM. */
	async init(): Promise<void> {
		const idb = GameSave.getIndexedDB();
		if (!idb) return;
		try {
			const db = await this.openDB(idb);
			const stores = [
				GameSave.STORE_STATE, GameSave.STORE_HISTORIES, GameSave.STORE_BEST,
				GameSave.STORE_META, GameSave.STORE_UPGRADES, GameSave.STORE_CLEARS,
				GameSave.STORE_GREEN_MARKERS,
			];
			const tx = db.transaction(stores, 'readonly');

			// state -> level
			const stateRec = await GameSave.reqToPromise<any>(
				tx.objectStore(GameSave.STORE_STATE).get(GameSave.KEY_STATE),
			);
			if (stateRec && Number.isFinite(stateRec.level) && stateRec.level >= 0) {
				this.level = stateRec.level >>> 0;
			}

			// meta -> coins
			const metaRec = await GameSave.reqToPromise<any>(
				tx.objectStore(GameSave.STORE_META).get(GameSave.KEY_META),
			);
			const loadedCoins = metaRec?.coins;
			if (typeof loadedCoins === 'bigint' && loadedCoins >= 0n) {
				this.coins = loadedCoins;
			}

			// histories: Map<level, string>
			await GameSave.cursorEach(tx.objectStore(GameSave.STORE_HISTORIES), (key, value) => {
				const k = Number(key);
				if (Number.isFinite(k) && typeof value === 'string') {
					this.histories.set(k, value);
				}
			});

			// best: Map<level, BestStat>
			await GameSave.cursorEach(tx.objectStore(GameSave.STORE_BEST), (key, value) => {
				const k = Number(key);
				if (Number.isFinite(k) && value && Number.isFinite(value.moves) && Number.isFinite(value.totalMoves)) {
					this.bests.set(k, { moves: value.moves >>> 0, totalMoves: value.totalMoves >>> 0 });
				}
			});

			// upgrades: Map<upgradeId, level>
			await GameSave.cursorEach(tx.objectStore(GameSave.STORE_UPGRADES), (key, value) => {
				const k = String(key);
				const n = Number(value);
				if (k && Number.isFinite(n) && n >= 0) {
					this.upgrades.set(k, n >>> 0);
				}
			});

			// clears: Map<level, count>
			await GameSave.cursorEach(tx.objectStore(GameSave.STORE_CLEARS), (key, value) => {
				const k = Number(key);
				const n = Number(value);
				if (Number.isFinite(k) && Number.isFinite(n) && n >= 0) {
					this.clears.set(k, n >>> 0);
				}
			});

			// greenMarkers: Map<level, number[]> (gepackte (x<<16)|y-Keys)
			await GameSave.cursorEach(tx.objectStore(GameSave.STORE_GREEN_MARKERS), (key, value) => {
				const k = Number(key);
				if (Number.isFinite(k) && Array.isArray(value)) {
					const keys = value.filter((v) => typeof v === 'number' && Number.isFinite(v));
					if (keys.length > 0) this.greenMarkers.set(k, keys);
				}
			});

			await GameSave.txDone(tx);
		} catch {
			// Cache bleibt leer / unvollständig
		}
	}

	// ----- Level (current) -----

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

	// ----- History (Endless) -----

	getHistory(level: number): string {
		return this.histories.get(level >>> 0) ?? '';
	}

	setHistory(level: number, raw: string): void {
		const key = level >>> 0;
		if (raw.length === 0) {
			if (!this.histories.has(key)) return;
			this.histories.delete(key);
			void this.persistKV(GameSave.STORE_HISTORIES, key, null);
		} else {
			if (this.histories.get(key) === raw) return;
			this.histories.set(key, raw);
			void this.persistKV(GameSave.STORE_HISTORIES, key, raw);
		}
	}

	// ----- Grüne Marker (Endless, frei per Rechtsklick gesetzt) -----
	// Anders als die roten Marker (Zeichen 'M' im historyRaw, immer an der Spielerposition,
	// daher beim Replay rekonstruierbar) sitzen grüne Marker an beliebigen Mauskoordinaten.
	// Sie lassen sich nicht aus dem Eingabeverlauf ableiten und werden deshalb als
	// explizite, pro Level gepackte Koordinatenliste gespeichert.

	getGreenMarkers(level: number): number[] {
		return this.greenMarkers.get(level >>> 0) ?? [];
	}

	setGreenMarkers(level: number, keys: number[]): void {
		const key = level >>> 0;
		if (keys.length === 0) {
			if (!this.greenMarkers.has(key)) return;
			this.greenMarkers.delete(key);
			void this.persistKV(GameSave.STORE_GREEN_MARKERS, key, null);
		} else {
			// Kopie ablegen, damit spätere Mutationen am Aufrufer-Array den RAM-Cache nicht verändern.
			const copy = keys.slice();
			this.greenMarkers.set(key, copy);
			void this.persistKV(GameSave.STORE_GREEN_MARKERS, key, copy);
		}
	}

	// ----- Best-Stats (Endless) -----

	getBest(level: number): BestStat | null {
		return this.bests.get(level >>> 0) ?? null;
	}

	listBests(): Array<{ level: number; moves: number; totalMoves: number }> {
		const out: Array<{ level: number; moves: number; totalMoves: number }> = [];
		for (const [level, best] of this.bests) {
			out.push({ level, moves: best.moves, totalMoves: best.totalMoves });
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
			? { moves: Math.min(existing.moves, m), totalMoves: Math.min(existing.totalMoves, t) }
			: { moves: m, totalMoves: t };
		if (existing && next.moves === existing.moves && next.totalMoves === existing.totalMoves) return;
		this.bests.set(key, next);
		void this.persistKV(GameSave.STORE_BEST, key, { moves: next.moves, totalMoves: next.totalMoves });
	}

	// ----- Coins (Idle) -----

	getCoins(): bigint {
		return this.coins;
	}

	setCoins(value: bigint): void {
		const next = value < 0n ? 0n : value;
		if (next === this.coins) return;
		this.coins = next;
		void this.persistMeta();
	}

	addCoins(delta: bigint): void {
		if (delta === 0n) return;
		this.setCoins(this.coins + delta);
	}

	// ----- Upgrades (Idle) -----

	getUpgrade(id: string): number {
		return this.upgrades.get(id) ?? 0;
	}

	setUpgrade(id: string, level: number): void {
		if (!id || !Number.isFinite(level) || level < 0) return;
		const next = level >>> 0;
		const current = this.upgrades.get(id) ?? 0;
		if (next === current) return;
		if (next === 0) {
			this.upgrades.delete(id);
			void this.persistKV(GameSave.STORE_UPGRADES, id, null);
		} else {
			this.upgrades.set(id, next);
			void this.persistKV(GameSave.STORE_UPGRADES, id, next);
		}
	}

	listUpgrades(): Array<{ id: string; level: number }> {
		const out: Array<{ id: string; level: number }> = [];
		for (const [id, level] of this.upgrades) out.push({ id, level });
		return out;
	}

	// ----- Level-Clears (Idle Wiederholungszähler) -----

	getLevelClears(level: number): number {
		return this.clears.get(level >>> 0) ?? 0;
	}

	/** Erhöht den Wiederholungszähler für ein Level und gibt den neuen Wert zurück. */
	incrementLevelClears(level: number): number {
		const key = level >>> 0;
		const next = (this.clears.get(key) ?? 0) + 1;
		this.clears.set(key, next);
		void this.persistKV(GameSave.STORE_CLEARS, key, next);
		return next;
	}

	// ----- Persistenz -----

	private async persistState(): Promise<void> {
		const idb = GameSave.getIndexedDB();
		if (!idb) return;
		try {
			const db = await this.openDB(idb);
			const tx = db.transaction([GameSave.STORE_STATE], 'readwrite');
			tx.objectStore(GameSave.STORE_STATE).put({ level: this.level }, GameSave.KEY_STATE);
			await GameSave.txDone(tx);
		} catch { /* ignorieren */ }
	}

	private async persistMeta(): Promise<void> {
		const idb = GameSave.getIndexedDB();
		if (!idb) return;
		try {
			const db = await this.openDB(idb);
			const tx = db.transaction([GameSave.STORE_META], 'readwrite');
			tx.objectStore(GameSave.STORE_META).put({ coins: this.coins }, GameSave.KEY_META);
			await GameSave.txDone(tx);
		} catch { /* ignorieren */ }
	}

	/** Generischer K/V-Schreiber für die Map-Stores. value=null löscht den Eintrag. */
	private async persistKV(store: string, key: IDBValidKey, value: any | null): Promise<void> {
		const idb = GameSave.getIndexedDB();
		if (!idb) return;
		try {
			const db = await this.openDB(idb);
			const tx = db.transaction([store], 'readwrite');
			const os = tx.objectStore(store);
			if (value === null) os.delete(key);
			else os.put(value, key);
			await GameSave.txDone(tx);
		} catch { /* ignorieren */ }
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
				if (!db.objectStoreNames.contains(GameSave.STORE_META)) db.createObjectStore(GameSave.STORE_META);
				if (!db.objectStoreNames.contains(GameSave.STORE_UPGRADES)) db.createObjectStore(GameSave.STORE_UPGRADES);
				if (!db.objectStoreNames.contains(GameSave.STORE_CLEARS)) db.createObjectStore(GameSave.STORE_CLEARS);
				if (!db.objectStoreNames.contains(GameSave.STORE_GREEN_MARKERS)) db.createObjectStore(GameSave.STORE_GREEN_MARKERS);
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

	/** Iteriert per Cursor über einen ObjectStore und ruft cb(key, value) auf. */
	private static cursorEach(store: IDBObjectStore, cb: (key: IDBValidKey, value: any) => void): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const req = store.openCursor();
			req.onerror = () => reject(req.error);
			req.onsuccess = () => {
				const cur = req.result;
				if (!cur) {
					resolve();
					return;
				}
				cb(cur.key, cur.value);
				cur.continue();
			};
		});
	}
}
