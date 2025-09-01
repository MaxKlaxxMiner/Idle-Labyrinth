import {Laby} from './Laby';
import {Input} from './Input';
import {Consts} from './Consts';

export class Game {
    // Background canvas (bestehend)
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    // Foreground overlay (neu)
    private fgCanvas: HTMLCanvasElement;
    private fgCtx: CanvasRenderingContext2D;
    private rafId: number | null = null;
    private lastTime = 0;

    // Simple state for the idle loop
    private tickCount = 0;
    private laby!: Laby;
    private static readonly BASE_SEED = 123456;

    // Render invalidation
    private needsRender = true;

    // Input and player state
    private input = new Input();
    private level = 0; // gameLevel beginnt bei 0
    private player = {x: 1, y: 1, r: 0.35, speed: 4.0};
    private goal = {x: 0, y: 0};
    // Discrete zoom via tile sizes
    private tileSizeIndex = 0;
    private initialTileSizeIndex = 0;
    private spawn = {x: 1, y: 1};
    private moves = 0;
    private resetLatch = false;
    private trailColor = Consts.colors.trail; // sehr dezenter Gelb-Ton mit Alpha
    private backtrackColor = Consts.colors.backtrack; // blasseres Grau
    private history = '';
    private backtrackedEdges = new Set<string>(); // Kanten, die aktiv zurückgelaufen wurden

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D Context nicht verfügbar');
        this.ctx = ctx;

        // Foreground-Canvas erzeugen und überlagern
        const fg = document.createElement('canvas');
        fg.id = 'game-fg';
        fg.style.position = 'absolute';
        fg.style.left = '0';
        fg.style.top = '0';
        fg.style.zIndex = '1';
        fg.style.pointerEvents = 'none';
        (this.canvas.parentElement || document.body).appendChild(fg);
        const fgCtx = fg.getContext('2d');
        if (!fgCtx) throw new Error('Canvas 2D Context (fg) nicht verfügbar');
        this.fgCanvas = fg;
        this.fgCtx = fgCtx;

        this.onResize = this.onResize.bind(this);
        window.addEventListener('resize', this.onResize);
        this.onResize();

        // Level aus LocalStorage laden (optional)
        const saved = this.loadLevel();
        this.level = Number.isFinite(saved) && saved! >= 0 ? saved! : 0;
        // Initial maze für Level
        this.laby = this.createLabyForLevel(this.level);
        this.placePlayerAndGoal();
        // Initial tile size selection (fit view, but not below minStartTileSize)
        this.initialTileSizeIndex = this.selectInitialTileSizeIndex();
        this.tileSizeIndex = this.initialTileSizeIndex;
        this.moves = 0;
        this.history = '';
        this.needsRender = true;
    }

    start() {
        if (this.rafId != null) return;
        this.lastTime = performance.now();
        const loop = (t: number) => {
            const dt = Math.min(1, (t - this.lastTime) / 1000);
            this.lastTime = t;
            this.update(dt);
            if (this.needsRender) {
                this.render();
                this.needsRender = false;
            }
            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
    }

    stop() {
        if (this.rafId != null) cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    private update(dt: number) {
        // Idle tick progression — expand later with resources, upgrades, etc.
        this.tickCount += 1;

        // Zoom controls
        const oldIndex = this.tileSizeIndex;
        if (this.input.consumeKey('0')) {
            // Recompute best-fit on demand to respect current canvas size
            this.initialTileSizeIndex = this.selectInitialTileSizeIndex();
            this.tileSizeIndex = this.initialTileSizeIndex;
        } else if (this.input.consumeKey('+', '=')) {
            this.tileSizeIndex = Math.min(Consts.zoom.steps.length - 1, this.tileSizeIndex + 1);
        } else if (this.input.consumeKey('-')) {
            this.tileSizeIndex = Math.max(0, this.tileSizeIndex - 1);
        }
        if (this.tileSizeIndex !== oldIndex) this.needsRender = true;

        // Undo: Backspace/Delete -> genau einen Schritt zurück (Autorepeat durch Keydown-Repeat)
        if (this.input.consumeKey('Backspace', 'Delete')) {
            if (this.history.length > 0) {
                const last = this.history.charAt(this.history.length - 1);
                this.history = this.history.slice(0, -1);
                let dx = 0, dy = 0;
                if (last === 'L') dx = 1;
                else if (last === 'R') dx = -1;
                else if (last === 'U') dy = 1;
                else if (last === 'D') dy = -1;
                const nx = this.player.x + dx * 2;
                const ny = this.player.y + dy * 2;
                if (this.canStepTo(this.player.x, this.player.y, nx, ny)) {
                    // Kante als zurückgelaufen markieren
                    this.markBacktrackedEdge(this.player.x, this.player.y, nx, ny);
                    this.player.x = nx;
                    this.player.y = ny;
                    this.moves = Math.max(0, this.moves - 1);
                    this.needsRender = true;
                }
            }
        } else {
            // Discretes Vorwärts-Stepping: pro Tastendruck 1 Knoten (2 Tiles)
            const step = this.input.consumeStepDir();
            if (step) {
                const sx = step.dx * 2;
                const sy = step.dy * 2;
                const prevX = this.player.x;
                const prevY = this.player.y;
                const nx = prevX + sx;
                const ny = prevY + sy;
                if (this.canStepTo(prevX, prevY, nx, ny)) {
                    this.player.x = nx;
                    this.player.y = ny;
                    // Schrittzeichen bestimmen (L/R/U/D)
                    let stepChar: 'L' | 'R' | 'U' | 'D';
                    if (step.dx === -1) stepChar = 'L';
                    else if (step.dx === 1) stepChar = 'R';
                    else if (step.dy === -1) stepChar = 'U';
                    else stepChar = 'D';

                    // Wenn der Schritt die genaue Umkehrung des letzten ist, dann backtracken
                    const last = this.history.charAt(this.history.length - 1);
                    const isUndo =
                        (last === 'L' && stepChar === 'R') ||
                        (last === 'R' && stepChar === 'L') ||
                        (last === 'U' && stepChar === 'D') ||
                        (last === 'D' && stepChar === 'U');
                    if (isUndo) {
                        // Kante als zurückgelaufen markieren (zwischen vorherigem und neuem Punkt)
                        this.markBacktrackedEdge(prevX, prevY, nx, ny);
                        this.history = this.history.slice(0, -1);
                        this.moves = Math.max(0, this.moves - 1);
                    } else {
                        // Falls diese Kante zuvor zurückgelaufen war: ausgrauung entfernen
                        this.clearBacktrackedEdge(prevX, prevY, nx, ny);
                        this.history += stepChar;
                        this.moves += 1;
                    }
                    this.needsRender = true;
                }
            }
        }

        // Reset / Hardreset per Taste 'R'
        // Detect reset: prefer edge, but allow first-hold fallback with latch
        const resetEdge = this.input.consumeKey('r', 'R');
        const resetHeld = !this.resetLatch && this.input.isPressed('r', 'R');
        if (resetEdge || resetHeld) {
            this.resetLatch = true;
            const atStart = this.player.x === this.spawn.x && this.player.y === this.spawn.y;
            if (!atStart) {
                if (confirm('Level zurücksetzen und zum Start zurückkehren?')) {
                    this.resetToStart();
                }
            } else {
                if (confirm('HARDRESET: gesamtes Spiel zurücksetzen (Level 1) ?')) {
                    this.hardReset();
                }
            }
        }
        if (!this.input.isPressed('r', 'R')) this.resetLatch = false;

        // Goal check
        const dx = (this.player.x + 0.5) - (this.goal.x + 0.5);
        const dy = (this.player.y + 0.5) - (this.goal.y + 0.5);
        if (Math.hypot(dx, dy) < 0.5) {
            this.level += 1;
            this.laby = this.createLabyForLevel(this.level);
            this.placePlayerAndGoal();
            // On level up, choose best-fit start zoom
            this.initialTileSizeIndex = this.selectInitialTileSizeIndex();
            this.tileSizeIndex = this.initialTileSizeIndex;
            this.moves = 0;
            this.history = '';
            this.backtrackedEdges.clear();
            this.saveLevel(this.level);
            this.needsRender = true;
        }
    }

    private render() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        // BG: Maze
        this.ctx.clearRect(0, 0, w, h);
        // FG: Overlays
        this.fgCtx.clearRect(0, 0, w, h);

        // Grid sizing + camera
        const cols = this.laby.width * 2 - 1;
        const rows = this.laby.height * 2 - 1;
        const basePad = Consts.sizes.basePad;
        const size = Consts.zoom.steps[this.tileSizeIndex] ?? 5;
        const drawSize = size >= Consts.sizes.gapThreshold ? (size - 1) : size;
        const worldW = cols * size;
        const worldH = rows * size;
        const playerPx = (this.player.x + 0.5) * size;
        const playerPy = (this.player.y + 0.5) * size;
        let ox = Math.floor(w / 2 - playerPx);
        let oy = Math.floor(h / 2 - playerPy);
        // Clamp camera if world smaller than canvas, center it; else constrain panning
        if (worldW <= w) ox = Math.floor((w - worldW) / 2);
        else ox = Math.max(w - worldW, Math.min(0, ox));
        if (worldH <= h) oy = Math.floor((h - worldH) / 2);
        else oy = Math.max(h - worldH, Math.min(0, oy));

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const free = this.laby.isFree(x, y);
                this.ctx.fillStyle = free ? Consts.colors.tileFree : Consts.colors.tileWall;
                this.ctx.fillRect(ox + x * size, oy + y * size, drawSize, drawSize);
            }
        }

        // Bereits zurückgelaufene Kanten dezent hervorheben (unter dem aktuellen Pfad)
        if (this.backtrackedEdges.size > 0) {
            this.ctx.save();
            this.ctx.fillStyle = this.backtrackColor;
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

        // Gelaufenen Weg halbtransparent nachzeichnen (aus Historie L/R/U/D vom Spawn aus)
        if (this.history.length > 0) {
            this.ctx.save();
            this.ctx.fillStyle = this.trailColor;
            let cx = this.spawn.x;
            let cy = this.spawn.y;
            // Startknoten hervorheben
            this.ctx.fillRect(ox + cx * size, oy + cy * size, drawSize, drawSize);
            for (let i = 0; i < this.history.length; i++) {
                const c = this.history.charAt(i);
                let dx = 0, dy = 0;
                if (c === 'L') dx = -1;
                else if (c === 'R') dx = 1;
                else if (c === 'U') dy = -1;
                else if (c === 'D') dy = 1;
                const mx = cx + Math.sign(dx);
                const my = cy + Math.sign(dy);
                const nx = cx + dx * 2;
                const ny = cy + dy * 2;
                // Kante und Zielknoten einfärben
                this.ctx.fillRect(ox + mx * size, oy + my * size, drawSize, drawSize);
                this.ctx.fillRect(ox + nx * size, oy + ny * size, drawSize, drawSize);
                cx = nx;
                cy = ny;
            }
            this.ctx.restore();
        }

        // Draw goal
        this.fgCtx.fillStyle = Consts.colors.goal;
        if (size < Consts.sizes.smallTileThreshold) {
            this.fgCtx.fillRect(ox + this.goal.x * size, oy + this.goal.y * size, size, size);
        } else {
            this.fgCtx.fillRect(ox + this.goal.x * size + size * 0.25, oy + this.goal.y * size + size * 0.25, size * 0.5, size * 0.5);
        }

        // Draw player (yellow circle)
        this.fgCtx.fillStyle = Consts.colors.player;
        if (size < Consts.sizes.smallTileThreshold) {
            this.fgCtx.fillRect(ox + this.player.x * size, oy + this.player.y * size, size, size);
        } else {
            this.fgCtx.beginPath();
            this.fgCtx.arc(ox + (this.player.x + 0.5) * size, oy + (this.player.y + 0.5) * size, this.player.r * size, 0, Math.PI * 2);
            this.fgCtx.fill();
        }

        // HUD (foreground)
        this.fgCtx.fillStyle = Consts.colors.hudText;
        this.fgCtx.font = Consts.sizes.hudFont;
        this.fgCtx.textBaseline = 'top';
        const lines = [
            `Level: ${this.level + 1}  Moves: ${this.moves}`,
            `Tile: ${size}px  (+ / - , 0 fit)`,
            `Move: WASD/↑↓←→  Ziel: Blaues Feld  Reset: R`,
        ];
        for (let i = 0; i < lines.length; i++) this.fgCtx.fillText(lines[i], 8, 8 + i * 14);
    }

    private onResize() {
        const dpr = Math.min(Consts.display.dprMax, window.devicePixelRatio || 1);
        const rect = this.canvas.getBoundingClientRect();
        const w = Math.max(320, Math.floor(rect.width * dpr));
        const h = Math.max(240, Math.floor(rect.height * dpr));
        this.canvas.width = w;
        this.canvas.height = h;
        this.fgCanvas.width = w;
        this.fgCanvas.height = h;
        this.ctx.imageSmoothingEnabled = false;
        this.fgCtx.imageSmoothingEnabled = false;
        // Refresh initial fit index for future '0' resets
        if (this.laby) {
            this.initialTileSizeIndex = this.selectInitialTileSizeIndex();
        }
        this.needsRender = true;
    }

    private selectInitialTileSizeIndex(): number {
        const steps = Consts.zoom.steps;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cols = this.laby.width * 2 - 1;
        const rows = this.laby.height * 2 - 1;
        const maxTileW = Math.floor((w - Consts.sizes.basePad * 2) / cols);
        const maxTileH = Math.floor((h - Consts.sizes.basePad * 2) / rows);
        const maxFit = Math.max(Consts.sizes.minTileSize, Math.min(maxTileW, maxTileH));
        const minStart = Consts.zoom.minStartTileSize;
        // Choose largest step <= maxFit, but not below minStart
        let idx = 0;
        for (let i = 0; i < steps.length; i++) {
            if (steps[i] <= maxFit) idx = i;
        }
        if (steps[idx] < minStart) {
            // enforce minimum start size (panning will handle overflow)
            for (let i = 0; i < steps.length; i++) {
                if (steps[i] >= minStart) {
                    idx = i;
                    break;
                }
            }
        }
        return idx;
    }

    private createLabyForLevel(gameLevel: number): Laby {
        // Größenentwicklung nach Schnipsel: w,h starten bei 5 und wachsen um 2,
        // gesteuert über das Verhältnis w/h zum goldenen Schnitt.
        let w = 5;
        let h = 5;
        for (let i = 0; i < gameLevel; i++) {
            if (w / h < 1.61803399) w += 2; else h += 2;
        }
        // Seed nach Vorgabe: BASE_SEED + w + h + gameLevel
        return new Laby(w, h, Game.BASE_SEED + w + h + gameLevel);
    }

    private placePlayerAndGoal() {
        // Start: suche erste freie Zelle nahe (1,1)
        const rows = this.laby.height * 2 - 1;
        const cols = this.laby.width * 2 - 1;
        const isFree = (x: number, y: number) => this.laby.isFree(x, y);
        // Start bevorzugt ungerade/ungerade (Innenraum)
        let sx = 1, sy = 1;
        if (!isFree(sx, sy)) {
            outer: for (let y = 1; y < rows; y += 2) {
                for (let x = 1; x < cols; x += 2) {
                    if (isFree(x, y)) {
                        sx = x;
                        sy = y;
                        break outer;
                    }
                }
            }
        }
        this.player.x = sx;
        this.player.y = sy;
        this.spawn.x = sx;
        this.spawn.y = sy;

        // Goal: suche freie Zelle nahe (cols-2, rows-2)
        let gx = Math.max(1, cols - 2), gy = Math.max(1, rows - 2);
        if (!isFree(gx, gy)) {
            outer2: for (let y = rows - 2; y >= 1; y -= 2) {
                for (let x = cols - 2; x >= 1; x -= 2) {
                    if (isFree(x, y)) {
                        gx = x;
                        gy = y;
                        break outer2;
                    }
                }
            }
        }
        this.goal.x = gx;
        this.goal.y = gy;
    }

    private canStepTo(cx: number, cy: number, nx: number, ny: number): boolean {
        const rows = this.laby.height * 2 - 1;
        const cols = this.laby.width * 2 - 1;
        if (nx < 1 || ny < 1 || nx >= cols - 1 || ny >= rows - 1) return false;
        // Ensure stepping by 2 in a cardinal direction
        const dx = nx - cx, dy = ny - cy;
        if (!((Math.abs(dx) === 2 && dy === 0) || (Math.abs(dy) === 2 && dx === 0))) return false;
        // Intermediate edge must be free and destination cell must be free
        const mx = cx + Math.sign(dx);
        const my = cy + Math.sign(dy);
        return this.laby.isFree(mx, my) && this.laby.isFree(nx, ny);
    }

    private resetToStart() {
        this.player.x = this.spawn.x;
        this.player.y = this.spawn.y;
        this.moves = 0;
        this.history = '';
        this.backtrackedEdges.clear();
        // On reset, choose best-fit start zoom
        this.initialTileSizeIndex = this.selectInitialTileSizeIndex();
        this.tileSizeIndex = this.initialTileSizeIndex;
        this.needsRender = true;
    }

    private hardReset() {
        this.level = 0;
        this.laby = this.createLabyForLevel(this.level);
        this.placePlayerAndGoal();
        // On hard reset, choose best-fit start zoom
        this.initialTileSizeIndex = this.selectInitialTileSizeIndex();
        this.tileSizeIndex = this.initialTileSizeIndex;
        this.moves = 0;
        this.history = '';
        this.backtrackedEdges.clear();
        this.saveLevel(this.level);
        this.needsRender = true;
    }

    private saveLevel(level: number) {
        try {
            localStorage.setItem('idle-laby-level', String(level));
        } catch {
        }
    }

    private loadLevel(): number | null {
        try {
            const v = localStorage.getItem('idle-laby-level');
            if (v == null) return null;
            const n = Number(v);
            return Number.isFinite(n) && n >= 0 ? n : null;
        } catch {
            return null;
        }
    }

    // Kanten-ID in kanonischer Form (unabhängig von Laufrichtung)
    private edgeKey(ax: number, ay: number, bx: number, by: number): string {
        if (bx < ax || (bx === ax && by < ay)) {
            return `${bx},${by}|${ax},${ay}`;
        }
        return `${ax},${ay}|${bx},${by}`;
    }

    private markBacktrackedEdge(ax: number, ay: number, bx: number, by: number) {
        this.backtrackedEdges.add(this.edgeKey(ax, ay, bx, by));
    }

    private clearBacktrackedEdge(ax: number, ay: number, bx: number, by: number) {
        this.backtrackedEdges.delete(this.edgeKey(ax, ay, bx, by));
    }
}
