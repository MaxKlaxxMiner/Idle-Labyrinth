import {RandomMersenne} from "./Random";
import {LabyCache} from "@/lib/LabyCache";

export class Laby {
    readonly width: number;
    readonly height: number;
    readonly pixWidth: number;
    readonly pixHeight: number;
    readonly getHWall: (pos: number) => boolean;
    readonly getVWall: (pos: number) => boolean;

    constructor(width: number, height: number, seed: number) {
        if (width < 5) width = 5;
        width = (width + 1) >> 1;
        if (height < 5) height = 5;
        height = (height + 1) >> 1;
        if ((width - 2) * (height - 2) >= 1 << 28) throw "out of range";
        this.width = width;
        this.height = height;
        this.pixWidth = width * 2 - 1;
        this.pixHeight = height * 2 - 1;
        console.log(`Laby: start ${this.pixWidth} x ${this.pixHeight} pixels`);
        const labyCache = LabyCache.readLaby(this.width * this.height ^ seed);
        if (labyCache) {
            this.getHWall = (pos: number): boolean => (labyCache[pos >> 4] & (1 << ((pos << 1) & 31))) != 0;
            this.getVWall = (pos: number): boolean => (labyCache[pos >> 4] & (1 << (((pos << 1) | 1) & 31))) != 0;
            console.log(`Laby: ready. (cached)`);
            return
        }

        const fields = new Uint32Array(width * height);

        function setId(pos: number, id: number): number {
            fields[pos] = (fields[pos] & 3) | (id << 2);
            return pos;
        }

        function getId(pos: number): number {
            return fields[pos] >> 2;
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
        let limit = Math.min(Math.max(width * height * 2, 100), 2000000);
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
            console.log(`Laby: generate ${totalFounds} / ${totalEstimate} (${((totalFounds / totalEstimate) * 100).toFixed(2)} %)`);
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
            console.log(`Laby: remain ${remain.length}`);
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

        console.log(`Laby: convert & save...`);
        const tmp = new Uint32Array((width * height * 2 + 31) >> 5);
        this.getHWall = (pos: number): boolean => (tmp[pos >> 4] & (1 << ((pos << 1) & 31))) != 0;
        this.getVWall = (pos: number): boolean => (tmp[pos >> 4] & (1 << (((pos << 1) | 1) & 31))) != 0;
        for (let pos = 0; pos < fields.length; pos++) {
            if (getHWall(pos)) tmp[pos >> 4] |= 1 << ((pos << 1) & 31);
            if (getVWall(pos)) tmp[pos >> 4] |= 1 << (((pos << 1) | 1) & 31);
        }
        LabyCache.saveLaby(this.width * this.height ^ seed, tmp);
        console.log(`Laby: ready.`);
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
