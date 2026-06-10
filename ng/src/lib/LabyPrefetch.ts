import type { LabyWorkerRequest, LabyWorkerResponse } from "@/lib/LabyWorker";

/**
 * Vorab-Generierung von Labyrinthen in Web Workern (kleiner Pool).
 *
 * Fertige Bitsets liegen pro Level in einer In-Memory-Map; die Spiellogik holt sie beim Levelwechsel per take() ab oder wartet per acquire() auf die (meist schon laufende) Worker-Generierung.
 * Überholte Aufträge räumt discardBelow() ab. Ohne Worker-Unterstützung liefert acquire() null - der Aufrufer generiert dann selbst.
 */
export class LabyPrefetch {
	/** Anzahl paralleler Worker: logische Cores - 1 (mind. 1), gedeckelt; 0 ohne Worker-Unterstützung. */
	readonly maxWorkers: number;
	/** Ziel-Tiefe des Level-Puffers (Anzahl vorgehaltener Ergebnisse). */
	private readonly bufferDepth: number;

	private readonly workers: Worker[] = [];
	private readonly idleWorkers: Worker[] = [];
	private readonly queue: LabyWorkerRequest[] = [];
	private readonly running = new Map<Worker, number>(); // Worker -> Level in Arbeit
	private readonly pending = new Set<number>();         // angefragte Level (Queue + in Arbeit)
	private readonly ready = new Map<number, Uint32Array>();
	private readonly waiters = new Map<number, Array<(bits: Uint32Array | null) => void>>();
	private disposed = false;

	constructor(bufferDepth: number, workerCap: number) {
		this.bufferDepth = bufferDepth;
		const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
		this.maxWorkers = typeof Worker === 'undefined' ? 0 : Math.min(workerCap, Math.max(1, cores - 1));
		console.log(`LabyPrefetch: ${this.maxWorkers} Worker (${cores} logische Cores), Puffer ${this.bufferDepth} Level`);
	}

	/** Stößt die Generierung eines Levels an; no-op, wenn bereits angefragt oder fertig. */
	request(level: number, width: number, height: number, seed: number): void {
		if (this.disposed || this.maxWorkers === 0) return;
		if (this.pending.has(level) || this.ready.has(level)) return;
		this.pending.add(level);
		this.queue.push({ level, width, height, seed });
		this.dispatch();
	}

	/** Holt das vorab generierte Bitset für ein Level ab und entfernt es aus dem Puffer. */
	take(level: number): Uint32Array | null {
		const bits = this.ready.get(level) ?? null;
		if (bits) this.ready.delete(level);
		return bits;
	}

	/**
	 * Liefert ein Promise auf das Bitset des Levels: Puffer-Treffer sofort, sonst wird der Auftrag an die Queue-Spitze gezogen bzw. auf die bereits laufende Generierung gewartet.
	 * Auflösung mit null bei Worker-Fehler oder dispose() - der Aufrufer generiert dann selbst. Gibt null zurück, wenn keine Worker zur Verfügung stehen.
	 */
	acquire(level: number, width: number, height: number, seed: number): Promise<Uint32Array | null> | null {
		if (this.disposed || this.maxWorkers === 0) return null;
		const buffered = this.take(level);
		if (buffered) return Promise.resolve(buffered);
		if (!this.pending.has(level)) {
			this.pending.add(level);
			this.queue.unshift({ level, width, height, seed });
		} else {
			// Bereits eingereiht, aber noch nicht in Arbeit -> an die Queue-Spitze ziehen
			const i = this.queue.findIndex((req) => req.level === level);
			if (i > 0) this.queue.unshift(this.queue.splice(i, 1)[0]);
		}
		this.dispatch();
		return new Promise((resolve) => {
			const list = this.waiters.get(level);
			if (list) list.push(resolve); else this.waiters.set(level, [resolve]);
		});
	}

	/**
	 * Verwirft alle Aufträge und Puffer-Einträge unterhalb des Levels (überholte Arbeit).
	 * Laufende Generierungen älterer Level werden per terminate() abgebrochen; dispatch() besetzt die frei gewordenen Slots mit aktuellen Aufträgen neu.
	 */
	discardBelow(level: number): void {
		if (this.disposed) return;
		for (let i = this.queue.length - 1; i >= 0; i--) {
			if (this.queue[i].level < level) {
				this.pending.delete(this.queue[i].level);
				this.resolveWaiters(this.queue[i].level, null);
				this.queue.splice(i, 1);
			}
		}
		for (const l of [...this.ready.keys()]) {
			if (l < level) this.ready.delete(l);
		}
		for (const [worker, l] of [...this.running]) {
			if (l >= level) continue;
			worker.terminate();
			this.running.delete(worker);
			this.pending.delete(l);
			const i = this.workers.indexOf(worker);
			if (i >= 0) this.workers.splice(i, 1);
			this.resolveWaiters(l, null);
		}
		this.dispatch();
	}

	/** Beendet alle Worker und verwirft Queue und Puffer. Idempotent. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const level of [...this.waiters.keys()]) this.resolveWaiters(level, null);
		for (const worker of this.workers) worker.terminate();
		this.workers.length = 0;
		this.idleWorkers.length = 0;
		this.queue.length = 0;
		this.running.clear();
		this.pending.clear();
		this.ready.clear();
	}

	private dispatch(): void {
		while (this.queue.length > 0) {
			const worker = this.idleWorkers.pop() ?? this.spawnWorker();
			if (!worker) return; // Pool ausgeschöpft -> Aufträge warten auf freie Worker
			const req = this.queue.shift()!;
			this.running.set(worker, req.level);
			worker.postMessage(req);
		}
	}

	/** Löst alle auf ein Level wartenden Promises auf; liefert true, wenn es Wartende gab. */
	private resolveWaiters(level: number, bits: Uint32Array | null): boolean {
		const list = this.waiters.get(level);
		if (!list) return false;
		this.waiters.delete(level);
		for (const resolve of list) resolve(bits);
		return true;
	}

	private spawnWorker(): Worker | null {
		if (this.workers.length >= this.maxWorkers) return null;
		const worker = new Worker(new URL('./LabyWorker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (e: MessageEvent<LabyWorkerResponse>) => {
			const { level, bits } = e.data;
			this.running.delete(worker);
			this.pending.delete(level);
			if (this.disposed) return;
			// Wartet der Main-Thread bereits auf dieses Level, direkt ausliefern statt puffern
			if (!this.resolveWaiters(level, bits)) {
				this.ready.set(level, bits);
				// Puffer auf die Ziel-Tiefe begrenzen: Map ist einfügegeordnet, der erste Key ist der älteste Eintrag
				while (this.ready.size > this.bufferDepth) {
					this.ready.delete(this.ready.keys().next().value!);
				}
				console.log(`Laby: buffer ${this.ready.size} / ${this.bufferDepth}`);
			}
			this.idleWorkers.push(worker);
			this.dispatch();
		};
		worker.onerror = (e: ErrorEvent) => {
			// Auftrag verwerfen; das Level entsteht dann über den synchronen Fallback.
			const level = this.running.get(worker);
			this.running.delete(worker);
			if (level !== undefined) {
				this.pending.delete(level);
				this.resolveWaiters(level, null);
			}
			console.warn(`LabyPrefetch: Generierung fehlgeschlagen${level !== undefined ? ` (Level ${level})` : ''}: ${e.message}`);
			// Worker verwerfen statt recyceln: 'error' kann auch ein Skript-Ladefehler sein
			// (z. B. 404 auf den Worker-Chunk nach einem Deployment) - danach wäre der Worker
			// dauerhaft tot und würde Aufträge schlucken. dispatch() spawnt bei Bedarf frisch.
			worker.terminate();
			const i = this.workers.indexOf(worker);
			if (i >= 0) this.workers.splice(i, 1);
			const j = this.idleWorkers.indexOf(worker);
			if (j >= 0) this.idleWorkers.splice(j, 1);
			if (this.disposed) return;
			this.dispatch();
		};
		this.workers.push(worker);
		return worker;
	}
}
