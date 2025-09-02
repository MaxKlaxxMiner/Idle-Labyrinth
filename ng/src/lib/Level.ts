import {Consts} from './Consts';
import {Laby} from './Laby';

export class Level {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    private laby: Laby;

    // Highlight state managed by Level
    private historyEdges = new Set<string>();
    private backtrackedEdges = new Set<string>();

    constructor(canvas: HTMLCanvasElement, laby: Laby) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D Context (bg) nicht verfügbar');
        this.ctx = ctx;
        this.ctx.imageSmoothingEnabled = false;
        // Use the free-tile color as canvas background to avoid painting free tiles per frame
        this.canvas.style.backgroundColor = Consts.colors.background;
        this.laby = laby;
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
        this.historyEdges.clear();
        this.backtrackedEdges.clear();
    }
    markHistoryEdge(ax: number, ay: number, bx: number, by: number) {
        this.historyEdges.add(this.edgeKey(ax, ay, bx, by));
    }
    clearHistoryEdge(ax: number, ay: number, bx: number, by: number) {
        this.historyEdges.delete(this.edgeKey(ax, ay, bx, by));
    }
    markBacktrackedEdge(ax: number, ay: number, bx: number, by: number) {
        this.backtrackedEdges.add(this.edgeKey(ax, ay, bx, by));
    }
    clearBacktrackedEdge(ax: number, ay: number, bx: number, by: number) {
        this.backtrackedEdges.delete(this.edgeKey(ax, ay, bx, by));
    }

    // canonical undirected edge id
    private edgeKey(ax: number, ay: number, bx: number, by: number): string {
        if (bx < ax || (bx === ax && by < ay)) return `${bx},${by}|${ax},${ay}`;
        return `${ax},${ay}|${bx},${by}`;
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

        // backtracked edges overlay
        if (this.backtrackedEdges.size > 0) {
            this.ctx.save();
            this.ctx.fillStyle = Consts.colors.backtrack;
            const grayTiles = new Set<string>();
            for (const key of this.backtrackedEdges) {
                const [a, b] = key.split('|');
                const [ax, ay] = a.split(',').map(n => parseInt(n, 10));
                const [bx, by] = b.split(',').map(n => parseInt(n, 10));
                const mx = (ax + bx) >> 1;
                const my = (ay + by) >> 1;
                grayTiles.add(`${ax},${ay}`);
                grayTiles.add(`${mx},${my}`);
                grayTiles.add(`${bx},${by}`);
            }
            for (const tile of grayTiles) {
                const [tx, ty] = tile.split(',').map(n => parseInt(n, 10));
                this.ctx.fillRect(ox + tx * size, oy + ty * size, drawSize, drawSize);
            }
            this.ctx.restore();
        }

        // trail overlay from marked history edges
        if (this.historyEdges.size > 0) {
            this.ctx.save();
            this.ctx.fillStyle = Consts.colors.trail;
            const tiles = new Set<string>();
            for (const key of this.historyEdges) {
                const [a, b] = key.split('|');
                const [ax, ay] = a.split(',').map(n => parseInt(n, 10));
                const [bx, by] = b.split(',').map(n => parseInt(n, 10));
                const mx = (ax + bx) >> 1;
                const my = (ay + by) >> 1;
                tiles.add(`${ax},${ay}`);
                tiles.add(`${mx},${my}`);
                tiles.add(`${bx},${by}`);
            }
            for (const tile of tiles) {
                const [tx, ty] = tile.split(',').map(n => parseInt(n, 10));
                this.ctx.fillRect(ox + tx * size, oy + ty * size, drawSize, drawSize);
            }
            this.ctx.restore();
        }
    }
}
