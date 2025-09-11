import {Consts} from '../game/Consts';
import {Laby} from '../lib/Laby';

export class Level {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    private laby!: Laby;
    private pixCanvas: HTMLCanvasElement | null = null;
    private pixCtx: CanvasRenderingContext2D | null = null;
    private imgData: ImageData | null = null;
    private u32: Uint32Array | null = null;
    private pixW = 0;
    private pixH = 0;
    private bg32 = 0;
    private wall32 = 0;
    private trail32 = 0;
    private back32 = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D Context (bg) nicht verfügbar');
        this.ctx = ctx;
        this.ctx.imageSmoothingEnabled = false;
        this.canvas.style.backgroundColor = Consts.colors.background;
    }

    setLaby(laby: Laby) {
        this.laby = laby;
        this.pixW = this.laby.pixWidth;
        this.pixH = this.laby.pixHeight;
        const c = document.createElement('canvas');
        c.width = this.pixW;
        c.height = this.pixH;
        const pctx = c.getContext('2d');
        if (!pctx) throw new Error('Canvas 2D Context (pix) nicht verfügbar');
        pctx.imageSmoothingEnabled = false;
        this.pixCanvas = c;
        this.pixCtx = pctx;
        this.imgData = pctx.createImageData(this.pixW, this.pixH);
        this.u32 = new Uint32Array(this.imgData.data.buffer, 0, this.pixW * this.pixH);
        console.log(`Level: Bitmap-Größe ${this.pixW} x ${this.pixH} Pixel`);
        this.bg32 = this.parseColor(Consts.colors.background);
        this.wall32 = this.parseColor(Consts.colors.wall);
        this.trail32 = this.parseColor(Consts.colors.trail);
        this.back32 = this.parseColor(Consts.colors.backtrack);
        this.clearHighlights();
    }

    resize(width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.imageSmoothingEnabled = false;
    }

    clearHighlights() {
        this.drawBase();
        this.markCell(1, 1, true);
    }

    markCell(x: number, y: number, history: boolean) {
        if (!this.u32) return;
        const p = this.cellKey(x, y);
        if (p < 0) return;
        this.u32[p] = history ? this.trail32 : this.back32;
    }

    clearCell(x: number, y: number, history: boolean) {
        if (!this.u32) return;
        const p = this.cellKey(x, y);
        if (p < 0) return;
        this.u32[p] = this.laby.isFree(x, y) ? this.bg32 : this.wall32;
    }

    private cellKey(x: number, y: number): number {
        if (this.pixW <= 0 || this.pixH <= 0) return -1;
        if (x < 0 || y < 0 || x >= this.pixW || y >= this.pixH) return -1;
        return y * this.pixW + x;
    }

    render(ox: number, oy: number, tileSize: number) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        if (!this.pixCtx || !this.imgData) return;
        this.pixCtx.putImageData(this.imgData, 0, 0);
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.pixCanvas!, 0, 0, this.pixW, this.pixH, ox, oy, this.pixW * tileSize, this.pixH * tileSize);

        if (tileSize >= Consts.sizes.gapThreshold) {
            this.drawGaps(ox, oy, tileSize);
        }
    }

    private drawGaps(ox: number, oy: number, tileSize: number) {
        const ctx = this.ctx;
        const totalW = this.pixW * tileSize;
        const totalH = this.pixH * tileSize;
        ctx.fillStyle = Consts.colors.background;
        for (let x = 1; x < this.pixW; x++) {
            const dx = ox + x * tileSize;
            ctx.fillRect(dx, oy, 1, totalH);
        }
        for (let y = 1; y < this.pixH; y++) {
            const dy = oy + y * tileSize;
            ctx.fillRect(ox, dy, totalW, 1);
        }
    }

    private drawBase() {
        if (!this.u32) return;
        let idx = 0;
        for (let y = 0; y < this.pixH; y++) {
            for (let x = 0; x < this.pixW; x++) {
                const free = this.laby.isFree(x, y);
                this.u32[idx++] = free ? this.bg32 : this.wall32;
            }
        }
    }

    private parseColor(s: string): number {
        if (s.startsWith('#')) {
            const r = parseInt(s.slice(1, 3), 16);
            const g = parseInt(s.slice(3, 5), 16);
            const b = parseInt(s.slice(5, 7), 16);
            return this.packRGBA(r, g, b, 255);
        }
        const m = s.match(/rgba?\s*\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/i);
        if (m) {
            const r = Math.round(parseFloat(m[1]));
            const g = Math.round(parseFloat(m[2]));
            const b = Math.round(parseFloat(m[3]));
            const a = m[4] != null ? Math.max(0, Math.min(1, parseFloat(m[4]))) : 1;
            return this.packRGBA(r, g, b, Math.round(a * 255));
        }
        return this.packRGBA(0, 0, 0, 255);
    }

    private packRGBA(r: number, g: number, b: number, a: number): number {
        if (Level.isLittleEndian === null) {
            const test = new Uint32Array([0x11223344]);
            Level.isLittleEndian = new Uint8Array(test.buffer)[0] === 0x44;
        }
        if (Level.isLittleEndian) {
            return (a << 24) | (b << 16) | (g << 8) | r >>> 0;
        } else {
            return (r << 24) | (g << 16) | (b << 8) | a >>> 0;
        }
    }

    private static isLittleEndian: boolean | null = null;
}

