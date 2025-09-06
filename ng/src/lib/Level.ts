import {Consts} from './Consts';
import {Laby} from './Laby';

export class Level {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    private laby!: Laby;
    // Pixel-basierte Hintergrund-Bitmap (1px = 1 Zelle)
    private pixCanvas: HTMLCanvasElement | null = null;
    private pixCtx: CanvasRenderingContext2D | null = null;
    private imgData: ImageData | null = null;
    private pixW = 0;
    private pixH = 0;

    // Highlight state managed by Level (store cells instead of edges)
    // We keep counts per cell so overlapping edges don't get lost on removal
    // Key = direkter Pixelindex im Uint32-Buffer: p = y * pixW + x
    private historyCells = new Map<number, number>();
    private backtrackedCells = new Map<number, number>();

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
        // Bitmap gemäß Zellenmaß (w*2-1 x h*2-1) anlegen/erneuern
        this.pixW = this.laby.width * 2 - 1;
        this.pixH = this.laby.height * 2 - 1;
        const c = document.createElement('canvas');
        c.width = this.pixW;
        c.height = this.pixH;
        const pctx = c.getContext('2d');
        if (!pctx) throw new Error('Canvas 2D Context (pix) nicht verfügbar');
        pctx.imageSmoothingEnabled = false;
        this.pixCanvas = c;
        this.pixCtx = pctx;
        this.imgData = pctx.createImageData(this.pixW, this.pixH);
        // Highlights zurücksetzen, um Inkonsistenzen zu vermeiden
        this.clearHighlights();
    }

    resize(width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.imageSmoothingEnabled = false;
    }

    // Tile/Path memory API
    clearHighlights() {
        this.historyCells.clear();
        this.backtrackedCells.clear();
        this.markCell(1, 1, true); // Startfeld pauschal markieren
    }

    markCell(x: number, y: number, history: boolean) {
        this.incCell(history ? this.historyCells : this.backtrackedCells, x, y);
    }

    clearCell(x: number, y: number, history: boolean) {
        this.decCell(history ? this.historyCells : this.backtrackedCells, x, y);
    }

    private cellKey(x: number, y: number): number {
        if (this.pixW <= 0 || this.pixH <= 0) return -1;
        if (x < 0 || y < 0 || x >= this.pixW || y >= this.pixH) return -1;
        return y * this.pixW + x;
    }

    private incCell(map: Map<number, number>, x: number, y: number) {
        const k = this.cellKey(x, y);
        if (k < 0) return; // ungültig ignorieren
        map.set(k, (map.get(k) || 0) + 1);
    }

    private decCell(map: Map<number, number>, x: number, y: number) {
        const k = this.cellKey(x, y);
        if (k < 0) return; // ungültig ignorieren
        const v = (map.get(k) || 0) - 1;
        if (v > 0) map.set(k, v); else map.delete(k);
    }

    // Draw labyrinth + overlays in 1px-Bitmap und anschließend skaliert blitten
    render(ox: number, oy: number, tileSize: number) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        if (!this.pixCtx || !this.imgData) return;

        const cols = this.pixW;
        const rows = this.pixH;
        // Palette vorbereiten (direkt als Uint32-Pixelwerte)
        const bg32 = this.parseColor(Consts.colors.background);
        const wall32 = this.parseColor(Consts.colors.wall);
        const trail32 = this.parseColor(Consts.colors.trail);
        const back32 = this.parseColor(Consts.colors.backtrack);

        const u32 = new Uint32Array(this.imgData.data.buffer, 0, (rows * cols));

        // Grundbild: freie Felder = Hintergrund, Wände = wall
        let idx = 0;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const free = this.laby.isFree(x, y);
                u32[idx++] = free ? bg32 : wall32;
            }
        }

        // Overlays (trail + backtrack) direkt setzen per Pixelindex (keine Boundschecks nötig)
        for (const p of this.historyCells.keys()) u32[p] = trail32;
        for (const p of this.backtrackedCells.keys()) u32[p] = back32;

        // Auf Pixel-Canvas schreiben und skaliert blitten
        this.pixCtx.putImageData(this.imgData, 0, 0);
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.pixCanvas!, 0, 0, cols, rows, ox, oy, cols * tileSize, rows * tileSize);
    }

    // '#rrggbb' oder 'rgba(r,g,b,a)' → packed Uint32 (Endianness berücksichtigt)
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

    // RGBA (Bytewerte 0..255) zu Uint32 passend zur Endianness des Systems packen
    private packRGBA(r: number, g: number, b: number, a: number): number {
        // Endianness-Erkennung einmalig per statischem Cache
        if (Level.isLittleEndian === null) {
            const test = new Uint32Array([0x11223344]);
            Level.isLittleEndian = new Uint8Array(test.buffer)[0] === 0x44;
        }
        if (Level.isLittleEndian) {
            // Little Endian: niedrigstes Byte zuerst → [R, G, B, A]
            return (a << 24) | (b << 16) | (g << 8) | r >>> 0;
        } else {
            // Big Endian: höchstes Byte zuerst → [R, G, B, A]
            return (r << 24) | (g << 16) | (b << 8) | a >>> 0;
        }
    }

    private static isLittleEndian: boolean | null = null;
}
