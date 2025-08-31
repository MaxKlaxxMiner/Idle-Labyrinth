import {Laby} from './Laby';
import {Input} from './Input';

export class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
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
    private zoom = 1.0;
    private spawn = {x: 1, y: 1};
    private moves = 0;
    private resetLatch = false;
    private trailColor = 'rgba(253, 224, 71, 0.2)'; // sehr dezenter Gelb-Ton mit Alpha
    private history = '';

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D Context nicht verfügbar');
        this.ctx = ctx;

        this.onResize = this.onResize.bind(this);
        window.addEventListener('resize', this.onResize);
        this.onResize();

        // Level aus LocalStorage laden (optional)
        const saved = this.loadLevel();
        this.level = Number.isFinite(saved) && saved! >= 0 ? saved! : 0;
        // Initial maze für Level
        this.laby = this.createLabyForLevel(this.level);
        this.placePlayerAndGoal();
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
        const zd = this.input.zoomDelta();
        const oldZoom = this.zoom;
        if (!Number.isNaN(zd)) {
            if (zd > 0) this.zoom = Math.min(3, this.zoom + 0.02);
            if (zd < 0) this.zoom = Math.max(0.5, this.zoom - 0.02);
        } else {
            this.zoom = 1.0;
        }
        if (this.zoom !== oldZoom) this.needsRender = true;

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
                const nx = this.player.x + sx;
                const ny = this.player.y + sy;
                if (this.canStepTo(this.player.x, this.player.y, nx, ny)) {
                    this.player.x = nx;
                    this.player.y = ny;
                    // Historie aufzeichnen (L/R/U/D)
                    if (step.dx === -1) this.history += 'L';
                    else if (step.dx === 1) this.history += 'R';
                    else if (step.dy === -1) this.history += 'U';
                    else if (step.dy === 1) this.history += 'D';
                    this.moves += 1;
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
            this.moves = 0;
            this.history = '';
            this.saveLevel(this.level);
            this.needsRender = true;
        }
    }

    private render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Grid sizing + camera
        const cols = this.laby.width * 2 - 1;
        const rows = this.laby.height * 2 - 1;
        const basePad = 8;
        const cw = Math.floor((w - basePad * 2) / cols);
        const ch = Math.floor((h - basePad * 2) / rows);
        const sizeBase = Math.max(2, Math.min(cw, ch));
        const size = Math.max(2, Math.floor(sizeBase * this.zoom));
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
                ctx.fillStyle = free ? '#0b0b0b' : '#1f2937';
                ctx.fillRect(ox + x * size, oy + y * size, size - 1, size - 1);
            }
        }

        // Gelaufenen Weg halbtransparent nachzeichnen (aus Historie L/R/U/D vom Spawn aus)
        if (this.history.length > 0) {
            ctx.save();
            ctx.fillStyle = this.trailColor;
            let cx = this.spawn.x;
            let cy = this.spawn.y;
            // Startknoten hervorheben
            ctx.fillRect(ox + cx * size, oy + cy * size, size - 1, size - 1);
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
                ctx.fillRect(ox + mx * size, oy + my * size, size - 1, size - 1);
                ctx.fillRect(ox + nx * size, oy + ny * size, size - 1, size - 1);
                cx = nx; cy = ny;
            }
            ctx.restore();
        }

        // Draw goal
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(ox + this.goal.x * size + size * 0.25, oy + this.goal.y * size + size * 0.25, size * 0.5, size * 0.5);

        // Draw player (yellow circle)
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(ox + (this.player.x + 0.5) * size, oy + (this.player.y + 0.5) * size, this.player.r * size, 0, Math.PI * 2);
        ctx.fill();

        // HUD
        ctx.fillStyle = '#eaeaea';
        ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.textBaseline = 'top';
        const lines = [
            `Level: ${this.level + 1}  Moves: ${this.moves}`,
            `Zoom: ${this.zoom.toFixed(2)} (+= / - , 0 reset)`,
            `Move: WASD/↑↓←→  Ziel: Blaues Feld  Reset: R`,
        ];
        for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 8, 8 + i * 14);
    }

    private onResize() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = Math.max(320, Math.floor(rect.width * dpr));
        this.canvas.height = Math.max(240, Math.floor(rect.height * dpr));
        this.ctx.imageSmoothingEnabled = false;
        this.needsRender = true;
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
        this.needsRender = true;
    }

    private hardReset() {
        this.level = 0;
        this.laby = this.createLabyForLevel(this.level);
        this.placePlayerAndGoal();
        this.moves = 0;
        this.history = '';
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
}
