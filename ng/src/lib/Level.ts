import {Consts} from './Consts';
import {Laby} from './Laby';

export class Level {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    private laby!: Laby;

    // Highlight state managed by Level (store cells instead of edges)
    // We keep counts per cell so overlapping edges don't get lost on removal
    // Use numeric keys to avoid string parsing: key = (x << 16) | y
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
        return ((x & 0xffff) << 16) | (y & 0xffff);
    }

    private incCell(map: Map<number, number>, x: number, y: number) {
        const k = this.cellKey(x, y);
        map.set(k, (map.get(k) || 0) + 1);
    }

    private decCell(map: Map<number, number>, x: number, y: number) {
        const k = this.cellKey(x, y);
        const v = (map.get(k) || 0) - 1;
        if (v > 0) map.set(k, v); else map.delete(k);
    }

    // Draw labyrinth and overlays into background canvas
    render(ox: number, oy: number, tileSize: number) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        const cols = this.laby.width * 2 - 1;
        const rows = this.laby.height * 2 - 1;
        const size = tileSize;
        const drawSize = size >= Consts.sizes.gapThreshold ? (size - 1) : size;

        // Draw walls only, using a single fillStyle
        this.ctx.fillStyle = Consts.colors.wall;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (!this.laby.isFree(x, y)) {
                    this.ctx.fillRect(ox + x * size, oy + y * size, drawSize, drawSize);
                }
            }
        }

        // trail overlay from marked history cells
        this.ctx.fillStyle = Consts.colors.trail;
        for (const key of this.historyCells.keys()) {
            const tx = (key >>> 16) & 0xffff;
            const ty = key & 0xffff;
            this.ctx.fillRect(ox + tx * size, oy + ty * size, drawSize, drawSize);
        }

        // backtracked cells overlay
        this.ctx.fillStyle = Consts.colors.backtrack;
        for (const key of this.backtrackedCells.keys()) {
            const tx = (key >>> 16) & 0xffff;
            const ty = key & 0xffff;
            this.ctx.fillRect(ox + tx * size, oy + ty * size, drawSize, drawSize);
        }
    }
}
