import {Laby} from '@/lib/Laby';
import {Level} from '@/view/Level';
import {Consts} from '@/game/Consts';

// Vollbild-Hintergrund mit langsam rotierendem Labyrinth.
// Drehmittelpunkt liegt unten-links am Bildschirm, die Laby-Mitte sitzt auf diesem Punkt.
// Das Laby ist so groß skaliert, dass es bei jeder Rotation den ganzen Bildschirm voll abdeckt.
// Das eigentliche Zeichnen übernimmt der bestehende Level-Renderer (chunked Bitmap).
export class MenuBackground {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private laby: Laby;
    private level: Level;
    private rafId: number | null = null;
    private startTime = 0;
    private dpr = 1;

    // Konfiguration
    private readonly rotationRadPerSec = 0.025;  // langsam, ca. 1.4 deg/s
    private readonly labyCells = 511;            // 511x511 Zellen -> 1023x1023 expandierte Pixel
    private readonly bgSeed = 0x1ab1a5e;
    private readonly tileSize = 8;               // fester Tile-Wert; 1023 * 8 = 8184 Pixel Labygröße

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D Context (menu-bg) nicht verfügbar');
        this.ctx = ctx;

        this.laby = new Laby(this.labyCells, this.labyCells, this.bgSeed);
        this.level = new Level(this.canvas);
        this.level.setLaby(this.laby);
        this.level.setShowGrid(true);

        this.onResize = this.onResize.bind(this);
        window.addEventListener('resize', this.onResize);
        this.onResize();
    }

    start() {
        if (this.rafId !== null) return;
        this.startTime = performance.now();
        const loop = (t: number) => {
            this.rafId = requestAnimationFrame(loop);
            this.render(t);
        };
        this.rafId = requestAnimationFrame(loop);
    }

    stop() {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    dispose() {
        this.stop();
        window.removeEventListener('resize', this.onResize);
    }

    private onResize() {
        const dpr = Math.min(window.devicePixelRatio || 1, Consts.display.dprMax);
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.dpr = dpr;
        const cw = Math.max(1, Math.floor(w * dpr));
        const ch = Math.max(1, Math.floor(h * dpr));
        this.level.resize(cw, ch);
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
    }

    private render(time: number) {
        const ctx = this.ctx;
        const W = window.innerWidth;
        const H = window.innerHeight;
        const dpr = this.dpr;

        // Transform für CSS-Pixel-Operationen vorbereiten und Canvas leeren
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = Consts.colors.background;
        ctx.fillRect(0, 0, W, H);

        // Laby-Größe in Pixeln
        const pw = this.laby.pixWidth;
        const ph = this.laby.pixHeight;
        const tile = this.tileSize;
        const drawW = pw * tile;
        const drawH = ph * tile;

        // Drehmittelpunkt unten-links am Bildschirm, Laby-Mitte sitzt auf diesem Punkt
        const t = (time - this.startTime) / 1000;
        const angle = -this.rotationRadPerSec * t; // negativ = linksrum (CCW)

        ctx.save();
        ctx.translate(0, H);
        ctx.rotate(angle);
        // Im rotierten/transformierten System: Level-Renderer mit Offset so aufrufen,
        // dass (0,0) im aktuellen System der Laby-Mitte entspricht.
        const ox = -drawW / 2;
        const oy = -drawH / 2;
        this.level.render(ox, oy, tile, {clear: false, allChunks: true});
        ctx.restore();

        // Abdunkeln, damit das Menü vorne klar lesbar bleibt
        ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
        ctx.fillRect(0, 0, W, H);
    }
}
