export class RandomMersenne {
    n: number;
    m: number[];

    constructor(seed: number) {
        if (seed === undefined) seed = Date.now();
        this.m = new Array(624);
        this.n = 0;
        this.init(seed);
    }

    private init(seed: number) {
        this.m[0] = seed >>> 0;
        for (let i = 1; i < 624; i++) {
            const s = this.m[i - 1] ^ (this.m[i - 1] >>> 30);
            this.m[i] = ((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253 + i;
            this.m[i] >>>= 0;
        }
        this.nextBlock();
    }

    private nextBlock() {
        let y: number;
        for (let i = 0; i < 227; i++) {
            y = (this.m[i] & 0x80000000) | (this.m[i + 1] & 0x7fffffff);
            this.m[i] = this.m[i + 397] ^ (y >>> 1) ^ ((y & 0x1) * 0x9908b0df);
        }
        for (let i = 227; i < 623; i++) {
            y = (this.m[i] & 0x80000000) | (this.m[i + 1] & 0x7fffffff);
            this.m[i] = this.m[i - 227] ^ (y >>> 1) ^ ((y & 0x1) * 0x9908b0df);
        }
        y = (this.m[623] & 0x80000000) | (this.m[0] & 0x7fffffff);
        this.m[623] = this.m[396] ^ (y >>> 1) ^ ((y & 0x1) * 0x9908b0df);

        this.n = 0;
    }

    nextInt(): number {
        let y = this.m[this.n++];
        if (this.n >= 624) this.nextBlock();

        y ^= (y >>> 11);
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= (y >>> 18);

        return y >>> 0;
    }

    next(): number {
        return this.nextInt() / 4294967296;
    }
}

export class RandomFast {
    n: number;

    constructor(seed: number) {
        this.n = seed >>> 0;
    }

    nextInt() {
        return this.n = this.n * 16807 >>> 0;
    }

    next(): number {
        return this.nextInt() / 4294967296;
    }
}
