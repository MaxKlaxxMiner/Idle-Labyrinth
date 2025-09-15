// Kapselt den 1px-basierten Pixelpuffer samt Offscreen-Canvas
// Zweck: vereinfachte Weiterentwicklung hin zu 256x256-Chunks

export class PixBuffer {
    // Öffentliche, schreibbare Sicht auf die Pixel (gepackte RGBA-Uint32-Werte)
    readonly u32: Uint32Array;
    readonly imgData: ImageData;
    readonly canvas: HTMLCanvasElement;
    readonly ctx: CanvasRenderingContext2D;
    readonly width: number;
    readonly height: number;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const pctx = c.getContext('2d');
        if (!pctx) throw new Error('Canvas 2D Context (pix) nicht verfügbar');
        pctx.imageSmoothingEnabled = false;
        this.canvas = c;
        this.ctx = pctx;
        const img = pctx.createImageData(width, height);
        this.imgData = img;
        this.u32 = new Uint32Array(img.data.buffer, 0, width * height);
    }

    // Überträgt das ImageData in den internen Canvas (ohne Skalierung)
    put(): void {
        this.ctx.putImageData(this.imgData, 0, 0);
    }

    // Zeichnet den internen Canvas skaliert/versetzt in einen Ziel-Context
    drawTo(
        dst: CanvasRenderingContext2D,
        sx: number, sy: number, sw: number, sh: number,
        dx: number, dy: number, dw: number, dh: number,
    ): void {
        dst.drawImage(this.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    // Liefert linearen Index für (x,y) innerhalb des Puffers, oder -1 wenn außerhalb
    index(x: number, y: number): number {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
        return y * this.width + x;
    }
}

