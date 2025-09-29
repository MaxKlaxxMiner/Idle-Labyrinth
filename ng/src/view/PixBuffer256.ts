// Kapselt den 1px-basierten Pixelpuffer samt Offscreen-Canvas
// Zweck: vereinfachte Weiterentwicklung hin zu 256x256-Chunks

export class PixBuffer256 {
    // Öffentliche, schreibbare Sicht auf die Pixel (gepackte RGBA-Uint32-Werte)
    readonly u32: Uint32Array;
    readonly imgData: ImageData;
    readonly canvas: HTMLCanvasElement;
    readonly ctx: CanvasRenderingContext2D;
    readonly ofsX: number;
    readonly ofsY: number;
    changed: boolean;

    constructor(ofsX: number, ofsY: number) {
        this.ofsX = ofsX;
        this.ofsY = ofsY;
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 256;
        const pctx = c.getContext('2d');
        if (!pctx) throw new Error('Canvas 2D Context (pix) nicht verfügbar');
        pctx.imageSmoothingEnabled = false;
        this.canvas = c;
        this.ctx = pctx;
        const img = pctx.createImageData(256, 256);
        this.imgData = img;
        this.u32 = new Uint32Array(img.data.buffer, 0, 256 * 256);
        this.changed = true;
    }

    // Überträgt das ImageData in den internen Canvas (ohne Skalierung)
    put(): void {
        if (this.changed) {
            this.ctx.putImageData(this.imgData, 0, 0);
            this.changed = false;
        }
    }

    setPixel(x: number, y: number, color: number): void {
        x -= this.ofsX;
        y -= this.ofsY;
        if (x < 0 || y < 0 || x >= 256 || y >= 256) return;
        const index = (y << 8) + x;
        if (this.u32[index] === color) return;
        this.u32[index] = color;
        this.changed = true;
    }

    getPixel(x: number, y: number): number {
        x -= this.ofsX;
        y -= this.ofsY;
        if (x < 0 || y < 0 || x >= 256 || y >= 256) return 0;
        return this.u32[(y << 8) + x]|0;
    }
}
