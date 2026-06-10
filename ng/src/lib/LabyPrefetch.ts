import type { LabyWorkerRequest, LabyWorkerResponse } from "@/lib/LabyWorker";

/**
 * Vorab-Generierung von Labyrinthen in Web Workern (kleiner Pool).
 *
 * Fertige Bitsets liegen pro Level in einer In-Memory-Map; die Spiellogik holt sie
 * beim Levelwechsel per take() ab und fällt andernfalls auf die synchrone Generierung
 * zurück. Ohne Worker-Unterstützung sind alle Methoden No-ops (Fallback bleibt aktiv).
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

	/** Beendet alle Worker und verwirft Queue und Puffer. Idempotent. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
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

	private spawnWorker(): Worker | null {
		if (this.workers.length >= this.maxWorkers) return null;
		const worker = new Worker(new URL('./LabyWorker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (e: MessageEvent<LabyWorkerResponse>) => {
			const { level, bits } = e.data;
			this.running.delete(worker);
			this.pending.delete(level);
			if (this.disposed) return;
			this.ready.set(level, bits);
			// Puffer auf die Ziel-Tiefe begrenzen: Map ist einfügegeordnet, der erste Key ist der älteste Eintrag
			while (this.ready.size > this.bufferDepth) {
				this.ready.delete(this.ready.keys().next().value!);
			}
			console.log(`Laby: buffer ${this.ready.size} / ${this.bufferDepth}`);
			this.idleWorkers.push(worker);
			this.dispatch();
		};
		worker.onerror = (e: ErrorEvent) => {
			// Auftrag verwerfen; das Level entsteht dann über den synchronen Fallback.
			const level = this.running.get(worker);
			this.running.delete(worker);
			if (level !== undefined) this.pending.delete(level);
			console.warn(`LabyPrefetch: Generierung fehlgeschlagen${level !== undefined ? ` (Level ${level})` : ''}: ${e.message}`);
			// Worker verwerfen statt recyceln: 'error' kann auch ein Skript-Ladefehler sein
			// (z. B. 404 auf den Worker-Chunk nach einem Deployment) - danach wäre der Worker
			// dauerhaft tot und würde Aufträge schlucken. dispatch() spawnt bei Bedarf frisch.
			worker.terminate();
			const i = this.workers.indexOf(worker);
			if (i >= 0) this.workers.splice(i, 1);
			if (this.disposed) return;
			this.dispatch();
		};
		this.workers.push(worker);
		return worker;
	}
}
