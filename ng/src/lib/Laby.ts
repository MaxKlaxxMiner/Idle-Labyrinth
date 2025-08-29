import { RandomMersenne } from "./Random";

export class Laby {
    readonly width: number;
    readonly height: number;
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
        this.getHWall = getHWall;
        this.getVWall = getVWall;
    }

    getchars(blocked = "██", free = ""): string {
        while (free.length < blocked.length) free += " ";
        let str = "";
        for (let y = 0; y < this.height * 2 - 1; y++) {
            for (let x = 0; x < this.width * 2 - 1; x++) {
                if (x % 2 === 0 && y % 2 === 0) {
                    str += blocked; // Kreuzungspunkt der Wände
                } else if (x % 2 === 0) {
                    str += this.getVWall((x >> 1) + (y >> 1) * this.width) ? blocked : free;
                } else if (y % 2 === 0) {
                    str += this.getHWall((x >> 1) + (y >> 1) * this.width) ? blocked : free;
                } else {
                    str += free; // freier Raum
                }
            }
            str += "\n";
        }
        return str;
    }
}
