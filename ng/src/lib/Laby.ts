import type { LabyCache } from "@/lib/LabyCache";
import { RandomMersenne } from "@/lib/Random";

// Generator-Fortschritt nur im Main-Thread loggen; in Workern bleibt die Konsole still
// (dort meldet der Empfänger den Puffer-Stand).
const inWorker = typeof window === 'undefined';

function log(message: string): void {
	if (!inWorker) console.log(message);
}

export class Laby {
	readonly width: number;
	readonly height: number;
	readonly pixWidth: number;
	readonly pixHeight: number;
	/** Gepackte Wanddaten (2 Bits pro Zelle, H/V); vollständige Repräsentation des Labyrinths. */
	readonly bits: Uint32Array;

	constructor(width: number, height: number, seed: number, cache?: LabyCache | null, bits?: Uint32Array | null) {
		if (width < 5) width = 5;
		width = (width + 1) >> 1;
		if (height < 5) height = 5;
		height = (height + 1) >> 1;
		if ((width - 2) * (height - 2) >= 1 << 30) throw "out of range";
		this.width = width;
		this.height = height;
		this.pixWidth = width * 2 - 1;
		this.pixHeight = height * 2 - 1;
		log(`Laby: start ${this.pixWidth} x ${this.pixHeight} pixels`);
		const cacheKey = this.width * this.height ^ seed;
		if (bits) {
			// Vorab generierte Wanddaten (z. B. aus einem Worker) direkt übernehmen;
			// wie bei frischer Generierung im Cache ablegen (Endless-Resume).
			this.bits = bits;
			if (cache) cache.saveLaby(cacheKey, bits);
			log(`Laby: ready. (precomputed)`);
			return;
		}
		const cached = cache ? cache.readLaby(cacheKey) : null;
		if (cached) {
			this.bits = cached;
			log(`Laby: ready. (cached)`);
			return;
		}

		const fields = new Uint32Array(width * height);

		function setId(pos: number, id: number): number {
			fields[pos] = (fields[pos] & 3) | (id << 2);
			return pos;
		}

		function getId(pos: number): number {
			// unsigned Shift: id<<2 wird in einem Uint32Array gehalten; mit >> (arithmetisch)
			// lieferten IDs >= 2^29 negative Werte. Roundtrip bleibt für id < 2^30 korrekt.
			return fields[pos] >>> 2;
		}

		function setHWall(pos: number): number {
			fields[pos] |= 1;
			return pos;
		}

		function getHWall(pos: number): boolean {
			return (fields[pos] & 1) !== 0;
		}

		function setVWall(pos: number): number {
			fields[pos] |= 2;
			return pos;
		}

		function getVWall(pos: number): boolean {
			return (fields[pos] & 2) !== 0;
		}

		function calcRemainLimit(limit: number, fullSize: number): number {
			if (fullSize > 1000000000) {
				limit /= 10;
				if (fullSize > 10000000000) {
					limit /= 10;
					if (fullSize > 100000000000) {
						limit /= 10;
						if (fullSize > 1000000000000) {
							limit /= 10;
						}
					}
				}
			}
			return limit / 20 | 0;
		}

		function searchfill(pos1: number, pos2: number) {
			if (getId(pos1) > getId(pos2)) {
				const tmp = pos1;
				pos1 = pos2;
				pos2 = tmp;
			}
			const buffer: Array<number> = [pos2];
			const fillId = getId(pos1);
			while (buffer.length > 0) {
				const next = buffer.pop()!;
				setId(next, fillId);
				if (getHWall(next - 1) && getId(next - 1) != fillId) {
					buffer.push(next - 1);
				}
				if (getVWall(next - width) && getId(next - width) != fillId) {
					buffer.push(next - width);
				}
				if (getHWall(next) && getId(next + 1) != fillId) {
					buffer.push(next + 1);
				}
				if (getVWall(next) && getId(next + width) != fillId) {
					buffer.push(next + width);
				}
			}
		}

		for (let x = 0; x < width - 1; x++) {
			setHWall(setId(x, 0));
			setHWall(setId(x + (height - 1) * width, 0))
		}

		for (let y = 0; y < height - 1; y++) {
			setVWall(setId(y * width, 0));
			setVWall(setId(width - 1 + y * width, 0));
		}
		setId(width - 1 + (height - 1) * width, 0);

		for (let y = 1; y < height - 1; y++) {
			for (let x = 1; x < width - 1; x++) {
				setId(x + y * width, x + y * width);
			}
		}

		const rnd = new RandomMersenne(seed);
		const limit = Math.min(Math.max(width * height * 2, 100), 2000000);
		const fullSize = (width - 1) * (height - 1);
		const remainLimit = calcRemainLimit(limit, fullSize);

		const totalEstimate = (width - 1.5) * (height - 1.5) | 0;

		let totalFounds = 0;
		for (; ;) {
			let founds = 0;
			for (let i = 0; i < limit; i++) {
				let next = rnd.nextInt() % (fullSize * 2)
				if (next >= fullSize) {
					next -= fullSize;
					const q = (next / (width - 1)) | 0;
					const r = next % (width - 1);
					const pos = q * width + r;
					if (!getHWall(pos) && getId(pos) != getId(pos + 1)) {
						setHWall(pos);
						searchfill(pos, pos + 1);
						founds++;
					}
				} else {
					const q = (next / (width - 1)) | 0;
					const r = next % (width - 1);
					const pos = q * width + r;
					if (!getVWall(pos) && getId(pos) != getId(pos + width)) {
						setVWall(pos);
						searchfill(pos, pos + width);
						founds++;
					}
				}
			}
			totalFounds += founds;
			log(`Laby: generate ${totalFounds} / ${totalEstimate} (${((totalFounds / totalEstimate) * 100).toFixed(2)} %)`);
			if (founds < remainLimit) break;
		}

		{
			const remain: Array<number> = [];
			for (let y = 0; y < height - 1; y++) {
				for (let x = 0; x < width - 1; x++) {
					if (!getHWall(x + y * width) && getId(x + y * width) != getId(x + 1 + y * width)) {
						remain.push(x + y * width + fields.length);
					}
					if (!getVWall(x + y * width) && getId(x + y * width) != getId(x + (y + 1) * width)) {
						remain.push(x + y * width);
					}
				}
			}
			log(`Laby: remain ${remain.length}`);
			for (let i = 0; i < remain.length; i++) {
				const j = rnd.nextInt() % (i + 1);
				const tmp = remain[i];
				remain[i] = remain[j];
				remain[j] = tmp;
			}
			for (let i = 0; i < remain.length; i++) {
				let next = remain[i];
				if (next >= fields.length) {
					const pos = next - fields.length;
					if (!getHWall(pos) && getId(pos) != getId(pos + 1)) {
						setHWall(pos);
						searchfill(pos, pos + 1);
					}
				} else {
					const pos = next;
					if (!getVWall(pos) && getId(pos) != getId(pos + width)) {
						setVWall(pos);
						searchfill(pos, pos + width);
					}
				}
			}
		}

		log(cache ? `Laby: convert & save...` : `Laby: convert...`);
		const tmp = new Uint32Array((width * height * 2 + 31) >> 5);
		for (let pos = 0; pos < fields.length; pos++) {
			if (getHWall(pos)) tmp[pos >> 4] |= 1 << ((pos << 1) & 31);
			if (getVWall(pos)) tmp[pos >> 4] |= 1 << (((pos << 1) | 1) & 31);
		}
		this.bits = tmp;
		if (cache) cache.saveLaby(cacheKey, tmp);
		log(`Laby: ready.`);
	}

	// Wand-Abfragen auf dem gepackten Bitset (pos = Zellindex im width*height-Raster)
	getHWall(pos: number): boolean {
		return (this.bits[pos >> 4] & (1 << ((pos << 1) & 31))) != 0;
	}

	getVWall(pos: number): boolean {
		return (this.bits[pos >> 4] & (1 << (((pos << 1) | 1) & 31))) != 0;
	}

	// Grid-Helper: true, wenn Tile (x,y) begehbar ist
	// Koordinaten im expandierten Raster: pixWidth x pixHeight
	isFree(x: number, y: number): boolean {
		if (x < 0 || y < 0 || x >= this.pixWidth || y >= this.pixHeight) return false;
		// Kreuzungen sind Wände
		if ((x & 1) === 0 && (y & 1) === 0) return false;
		const pos = (x >> 1) + (y >> 1) * this.width;
		if ((x & 1) === 0) {
			// Vertikale Kante: frei, wenn keine vertikale Wand
			return !this.getVWall(pos);
		} else if ((y & 1) === 0) {
			// Horizontale Kante: frei, wenn keine horizontale Wand
			return !this.getHWall(pos);
		} else {
			// Zelleninneres
			return true;
		}
	}
}
