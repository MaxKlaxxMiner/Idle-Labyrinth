import {Consts} from '@/game/Consts';
import {Laby} from '@/lib/Laby';
import {PixBuffer256} from '@/view/PixBuffer256';

export class Level {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    private laby!: Laby;
    // Chunked Pixel-Puffer (1px = 1 Zelle), feste Größe 256x256
    private chunks: (PixBuffer256 | null)[] = [];
    private chunksX = 0;
    private chunksY = 0;
    private pixW = 0;
    private pixH = 0;
    // Farbcache (gepackte Uint32-Werte)
    bgColor32 = 0;
    wallColor32 = 0;
    trailColor32 = 0;
    backtrackColor32 = 0;
    deadendColor32 = 0;

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
        // Chunk-Raster aufbauen (immer 256x256 pro Chunk)
        // Ceil-Division via (n + 255) >> 8
        this.chunksX = Math.max(1, (this.pixW + 255) >> 8);
        this.chunksY = Math.max(1, (this.pixH + 255) >> 8);
        // Lazy-Build: Platz reservieren, aber nicht erstellen
        this.chunks = new Array(this.chunksX * this.chunksY).fill(null);
        // Debug-Ausgabe: Pixelabmessungen und Chunkanzahl
        console.log(`Level: Bitmap-Größe ${this.pixW} x ${this.pixH} Pixel, Chunks ${this.chunksX} x ${this.chunksY}`);
        // Farben einmalig packen
        this.bgColor32 = this.parseColor(Consts.colors.background);
        this.wallColor32 = this.parseColor(Consts.colors.wall);
        this.trailColor32 = this.parseColor(Consts.colors.trail);
        this.backtrackColor32 = this.parseColor(Consts.colors.backtrack);
        this.deadendColor32 = this.parseColor(Consts.colors.deadend);
        this.clearHighlights();
    }

    resize(width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.imageSmoothingEnabled = false;
    }

    // Tile/Path API (direkter Pixeleingriff)
    clearHighlights() {
        this.chunks = new Array(this.chunksX * this.chunksY).fill(null);
        this.markCell(1, 1, 'trail'); // Startfeld pauschal markieren
    }

    setPixel(x: number, y: number, color: number) {
        if (x < 0 || y < 0 || x >= this.pixW || y >= this.pixH) return;
        const cx = x >> 8;
        const cy = y >> 8;
        const idx = cy * this.chunksX + cx;
        const chunk = this.chunks[idx] ?? this.createChunk(cx, cy);
        chunk.setPixel(x, y, color);
    }

    getPixel(x: number, y: number): number {
        if (!this.laby) return 0;
        if (x < 0 || y < 0 || x >= this.pixW || y >= this.pixH) return 0;
        const cx = x >> 8;
        const cy = y >> 8;
        const idx = cy * this.chunksX + cx;
        const chunk = this.chunks[idx] ?? this.createChunk(cx, cy);
        return chunk.getPixel(x, y);
    }

    markCell(x: number, y: number, mode: 'trail' | 'backtrack' | 'deadend') {
        let color = this.backtrackColor32;
        if (mode === 'trail') color = this.trailColor32;
        else if (mode === 'deadend') color = this.deadendColor32;
        this.setPixel(x, y, color);
    }

    // Draw labyrinth + overlays in 1px-Bitmap und anschließend skaliert blitten
    render(ox: number, oy: number, tileSize: number) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        // Sichtbaren Pixelbereich (in Laby-Pixelkoordinaten) bestimmen
        // x sichtbar, wenn [ox + x*tileSize, ox + (x+1)*tileSize) mit [0,w) schneidet
        // y analog
        const visX0 = Math.max(0, Math.floor((0 - ox) / tileSize));
        const visY0 = Math.max(0, Math.floor((0 - oy) / tileSize));
        const visX1 = Math.min(this.pixW - 1, Math.ceil((w - ox) / tileSize) - 1);
        const visY1 = Math.min(this.pixH - 1, Math.ceil((h - oy) / tileSize) - 1);

        if (visX0 > visX1 || visY0 > visY1) return;

        // Sichtbare Chunk-Indizes ermitteln (je 256er Blöcke)
        const c0x = visX0 >> 8;
        const c0y = visY0 >> 8;
        const c1x = visX1 >> 8;
        const c1y = visY1 >> 8;

        // Nur sichtbare Chunks aktualisieren und blitten
        this.ctx.imageSmoothingEnabled = false;
        for (let cy = c0y; cy <= c1y; cy++) {
            for (let cx = c0x; cx <= c1x; cx++) {
                let chunk = this.chunks[cy * this.chunksX + cx];
                if (!chunk) {
                    chunk = this.createChunk(cx, cy);
                }
                // Sichtbaren Quellbereich innerhalb des Chunks bestimmen
                const sx = Math.max(0, visX0 - chunk.ofsX);
                const sy = Math.max(0, visY0 - chunk.ofsY);
                const ex = Math.min(256, visX1 - chunk.ofsX + 1); // exklusiv
                const ey = Math.min(256, visY1 - chunk.ofsY + 1);
                const sw = ex - sx;
                const sh = ey - sy;
                if (sw <= 0 || sh <= 0) continue;
                chunk.put();
                const dx = ox + (chunk.ofsX + sx) * tileSize;
                const dy = oy + (chunk.ofsY + sy) * tileSize;
                const dw = sw * tileSize;
                const dh = sh * tileSize;
                chunk.drawTo(this.ctx, sx, sy, sw, sh, dx, dy, dw, dh);
            }
        }

        // Gaps (1px) zwischen den Zellen/NODES optional überlagern
        if (tileSize >= Consts.sizes.gapThreshold) {
            this.drawGaps(ox, oy, tileSize);
        }
    }

    // Zeichnet 1px-Linien in Hintergrundfarbe zwischen allen Zellen (sichtbare Abstände)
    private drawGaps(ox: number, oy: number, tileSize: number) {
        const ctx = this.ctx;
        const totalW = this.pixW * tileSize;
        const totalH = this.pixH * tileSize;
        ctx.fillStyle = Consts.colors.background;
        // Vertikale Gaps
        for (let x = 1; x < this.pixW; x++) {
            const dx = ox + x * tileSize;
            ctx.fillRect(dx, oy, 1, totalH);
        }
        // Horizontale Gaps
        for (let y = 1; y < this.pixH; y++) {
            const dy = oy + y * tileSize;
            ctx.fillRect(ox, dy, totalW, 1);
        }
    }

    // Erzeugt einen Chunk an Position (cx, cy), zeichnet das Grundbild hinein und merkt ihn
    private createChunk(cx: number, cy: number): PixBuffer256 {
        const ofsX = cx << 8;
        const ofsY = cy << 8;
        const chunk = new PixBuffer256(ofsX, ofsY);
        // Grundbild füllen (Clipping am Levelrand)
        const x0 = ofsX;
        const y0 = ofsY;
        const x1 = Math.min(this.pixW, x0 + 256);
        const y1 = Math.min(this.pixH, y0 + 256);
        const u32 = chunk.u32;
        let idxRowStart = 0;
        for (let y = y0; y < y1; y++) {
            let idx = idxRowStart;
            for (let x = x0; x < x1; x++) {
                const free = this.laby.isFree(x, y);
                u32[idx++] = free ? this.bgColor32 : this.wallColor32;
            }
            idxRowStart += 256;
        }
        chunk.changed = true;
        this.chunks[cy * this.chunksX + cx] = chunk;
        return chunk;
    }

    // '#rrggbb' oder 'rgba(r,g,b,a)' -> packed Uint32 (Endianness berücksichtigt)
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
