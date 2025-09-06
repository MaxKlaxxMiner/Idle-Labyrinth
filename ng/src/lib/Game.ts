import {Laby} from './Laby';
import {Input} from './Input';
import {Consts} from './Consts';
import {Level} from './Level';

export class Game {
    // Background canvas is managed by Level
    private canvas: HTMLCanvasElement;
    // Foreground overlay (neu)
    private fgCanvas: HTMLCanvasElement;
    private fgCtx: CanvasRenderingContext2D;
    private rafId: number | null = null;
    private laby!: Laby;
    private levelView!: Level;
    private static readonly BASE_SEED = 123456;

    // Render invalidation
    private needsRender = true;

    // FPS counter
    private fpsFrames = 0;
    private fpsLastTime = performance.now();
    private fpsValue = 0;

    // Render mode
    private turbo = false; // false=vsync (RAF), true=Turbo (no-vsync)
    private fastTimer: number | null = null;

    // Camera with dead-zone
    private camX = 0; // world pixels (center of view)
    private camY = 0; // world pixels (center of view)
    private deadFracX = 0.60; // fraction of screen width used as dead-zone
    private deadFracY = 0.70; // fraction of screen height used as dead-zone

    // Input and player state
    private input = new Input();
    private level = 0; // gameLevel beginnt bei 0
    private player = {x: 1, y: 1, r: 0.35};
    private goal = {x: 0, y: 0};
    // Discrete zoom via tile sizes
    private tileSizeIndex = 0;
    private moves = 0;
    private resetLatch = false;
    private history = '';

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;

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
        this.levelView = new Level(this.canvas);

        const saved = this.loadLevel();
        this.level = Number.isFinite(saved) && saved! >= 0 ? saved! : 0;
        this.initLevel();

        this.onResize = this.onResize.bind(this);
        window.addEventListener('resize', this.onResize);
        this.onResize();
    }

    start() {
        if (this.rafId != null || this.fastTimer != null) return;
        if (this.turbo) this.startTurboLoop(); else this.startRafLoop();
    }

    stop() {
        if (this.rafId != null) cancelAnimationFrame(this.rafId);
        this.rafId = null;
        if (this.fastTimer != null) { clearTimeout(this.fastTimer); clearInterval(this.fastTimer); }
        this.fastTimer = null;
    }

    private startRafLoop() {
        const loop = () => {
            this.update();
            // VSync-Modus: nur rendern, wenn invalidiert
            if (this.needsRender) {
                this.render();
                this.needsRender = false;
            }
            // FPS accounting
            this.fpsFrames++;
            const now = performance.now();
            const dt = now - this.fpsLastTime;
            if (dt >= 1000) {
                this.fpsValue = Math.round((this.fpsFrames * 1000) / dt);
                this.fpsFrames = 0;
                this.fpsLastTime = now;
                this.needsRender = true; // HUD-Aktualisierung
            }
            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
    }

    private startTurboLoop() {
        const loop = () => {
            // Einmal Game-Update pro Intervall-Tick
            this.update();
            // Burst‑Rendering bis mindestens 10 ms vergangen sind (Speed‑Test)
            const minTime = performance.now() + 10;
            do {
                this.render();
                this.fpsFrames++;
            } while (performance.now() < minTime);
            // FPS accounting
            const now = performance.now();
            const dt = now - this.fpsLastTime;
            if (dt >= 1000) {
                this.fpsValue = Math.round((this.fpsFrames * 1000) / dt);
                this.fpsFrames = 0;
                this.fpsLastTime = now;
            }
        };
        // setInterval ausprobieren (kann in einigen Situationen weniger geclamped sein)
        this.fastTimer = window.setInterval(loop, 0);
        // Sofort einen Tick ausführen, damit es direkt losgeht
        loop();
    }

    private update() {
        // Zoom controls (managed here)
        const oldIndex = this.tileSizeIndex;
        if (this.input.consumeKey('0')) {
            // Recompute best-fit on demand to respect current canvas size
            this.applyBestFitZoom();
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
                    this.levelView.clearCell(nx - dx * 2, ny - dy * 2, true);
                    this.levelView.clearCell(nx - dx, ny - dy, true);
                    this.levelView.markCell(nx - dx * 2, ny - dy * 2, false);
                    this.levelView.markCell(nx - dx, ny - dy, false);
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
                        this.levelView.clearCell(nx - step.dx, ny - step.dy, true);
                        this.levelView.clearCell(prevX, prevY, true);
                        this.levelView.markCell(nx - step.dx, ny - step.dy, false);
                        this.levelView.markCell(prevX, prevY, false);
                        this.history = this.history.slice(0, -1);
                        this.moves = Math.max(0, this.moves - 1);
                    } else {
                        this.levelView.clearCell(nx - step.dx, ny - step.dy, false);
                        this.levelView.clearCell(nx, ny, false);
                        this.levelView.markCell(nx - step.dx, ny - step.dy, true);
                        this.levelView.markCell(nx, ny, true);
                        this.history += stepChar;
                        this.moves += 1;
                    }
                    this.needsRender = true;
                }
            }
        }

        // Camera dead-zone follow (integer-snapped offsets in render)
        const size = Consts.zoom.steps[this.tileSizeIndex] ?? 5;
        this.updateCamera(size);

        // Reset / Hardreset per Taste 'R'
        // Detect reset: prefer edge, but allow first-hold fallback with latch
        const resetEdge = this.input.consumeKey('r', 'R');
        const resetHeld = !this.resetLatch && this.input.isPressed('r', 'R');
        if (resetEdge || resetHeld) {
            this.resetLatch = true;
            const atStart = this.player.x === 1 && this.player.y === 1;
            if (!atStart) {
                if (confirm('Level zurücksetzen und zum Start zurückkehren?')) {
                    this.initLevel();
                }
            } else {
                if (confirm('HARDRESET: gesamtes Spiel zurücksetzen (Level 1) ?')) {
                    this.hardReset();
                }
            }
        }
        if (!this.input.isPressed('r', 'R')) this.resetLatch = false;

        // Toggle Turbo (no-vsync) per Taste 'T'
        if (this.input.consumeKey('t', 'T')) {
            this.turbo = !this.turbo;
            // sanfter Loop-Wechsel
            setTimeout(() => { this.stop(); this.start(); }, 0);
            this.needsRender = true;
        }

        // Goal check
        if (this.player.x === this.goal.x && this.player.y === this.goal.y) {
            this.level += 1;
            this.saveLevel(this.level);
            this.initLevel();
        }
    }

    private render() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        // FG: Overlays
        this.fgCtx.clearRect(0, 0, w, h);

        // Grid sizing + camera (computed here)
        const cols = this.laby.width * 2 - 1;
        const rows = this.laby.height * 2 - 1;
        const size = Consts.zoom.steps[this.tileSizeIndex] ?? 5;
        const worldW = cols * size;
        const worldH = rows * size;
        let ox: number;
        let oy: number;
        if (worldW <= w) ox = Math.floor((w - worldW) / 2);
        else ox = Math.floor(w / 2 - this.camX);
        if (worldH <= h) oy = Math.floor((h - worldH) / 2);
        else oy = Math.floor(h / 2 - this.camY);

        // BG: labyrinth and overlays via Level (uses its edge sets)
        this.levelView.render(ox, oy, size);

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

        // HUD (foreground) - single line
        this.fgCtx.fillStyle = Consts.colors.hudText;
        this.fgCtx.font = Consts.sizes.hudFont;
        this.fgCtx.textBaseline = 'top';
        const mode = this.turbo ? 'Turbo' : 'VSync';
        const hudLine = `Level: ${this.level + 1}  Moves: ${this.moves}  |  Tile: ${size}px (+/- , 0 fit)  |  Move: WASD/↑↓←→  Reset: R  |  Mode: ${mode} (T)  |  FPS: ${this.fpsValue}`;
        this.fgCtx.fillText(hudLine, 8, 8);
    }

    private onResize() {
        const dpr = Math.min(Consts.display.dprMax, window.devicePixelRatio || 1);
        const rect = this.canvas.getBoundingClientRect();
        const w = Math.max(320, Math.floor(rect.width * dpr));
        const h = Math.max(240, Math.floor(rect.height * dpr));
        // Resize BG via Level
        this.levelView.resize(w, h);
        this.fgCanvas.width = w;
        this.fgCanvas.height = h;
        this.fgCtx.imageSmoothingEnabled = false;
        // Adjust zoom to best fit on resize
        if (this.laby) this.applyBestFitZoom();
        this.needsRender = true;
    }

    private applyBestFitZoom() {
        const steps = Consts.zoom.steps;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cols = this.laby.width * 2 - 1;
        const rows = this.laby.height * 2 - 1;
        const maxTileW = Math.floor((w - Consts.sizes.basePad * 2) / cols);
        const maxTileH = Math.floor((h - Consts.sizes.basePad * 2) / rows);
        const maxFit = Math.max(Consts.sizes.minTileSize, Math.min(maxTileW, maxTileH));
        const minStart = Consts.zoom.minStartTileSize;
        let idx = 0;
        for (let i = 0; i < steps.length; i++) if (steps[i] <= maxFit) idx = i;
        if (steps[idx] < minStart) {
            for (let i = 0; i < steps.length; i++) {
                if (steps[i] >= minStart) {
                    idx = i;
                    break;
                }
            }
        }
        this.tileSizeIndex = idx;
        // Center camera on player for this zoom
        const size = Consts.zoom.steps[this.tileSizeIndex] ?? 5;
        this.centerCamera(size);
    }

    private createLabyForLevel(gameLevel: number): Laby {
        // Größenentwicklung nach Schnipsel: w,h starten bei 5 und wachsen um 2,
        // gesteuert über das Verhältnis w/h zum goldenen Schnitt.
        let w = 5;
        let h = 5;
        for (let i = 0; i < gameLevel; i++) {
            if (w / h < 1.61803399) w += 2; else h += 2;
        }
        return new Laby(w, h, Game.BASE_SEED + w + h + gameLevel);
    }

    private canStepTo(cx: number, cy: number, nx: number, ny: number): boolean {
        const rows = this.laby.height * 2 - 1;
        const cols = this.laby.width * 2 - 1;
        if (nx < 1 || ny < 1 || nx >= cols - 1 || ny >= rows - 1) return false;
        // Ensure stepping by 2 in a cardinal direction
        const dx = nx - cx, dy = ny - cy;
        if (!((Math.abs(dx) === 2 && dy === 0) || (Math.abs(dy) === 2 && dx === 0))) return false;
        // Intermediate edge must be free
        const mx = cx + Math.sign(dx);
        const my = cy + Math.sign(dy);
        return this.laby.isFree(mx, my);
    }

    private initLevel() {
        this.laby = this.createLabyForLevel(this.level);

        this.moves = 0;
        this.history = '';
        this.player.x = 1;
        this.player.y = 1;
        this.goal.x = Math.max(1, this.laby.width * 2 - 3);
        this.goal.y = Math.max(1, this.laby.height * 2 - 3);

        this.levelView.setLaby(this.laby);
        this.levelView.clearHighlights();
        this.applyBestFitZoom();
        this.needsRender = true;
    }

    private hardReset() {
        this.level = 0;
        this.saveLevel(this.level);
        this.initLevel();
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

    // Camera helpers
    private centerCamera(size: number) {
        const cols = this.laby.width * 2 - 1;
        const rows = this.laby.height * 2 - 1;
        const worldW = cols * size;
        const worldH = rows * size;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const playerPx = (this.player.x + 0.5) * size;
        const playerPy = (this.player.y + 0.5) * size;
        if (worldW <= w) this.camX = worldW / 2; else this.camX = Math.max(w / 2, Math.min(worldW - w / 2, playerPx));
        if (worldH <= h) this.camY = worldH / 2; else this.camY = Math.max(h / 2, Math.min(worldH - h / 2, playerPy));
    }

    private updateCamera(size: number) {
        const cols = this.laby.width * 2 - 1;
        const rows = this.laby.height * 2 - 1;
        const worldW = cols * size;
        const worldH = rows * size;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const playerPx = (this.player.x + 0.5) * size;
        const playerPy = (this.player.y + 0.5) * size;
        let changed = false;
        let targetCamX = this.camX;
        let targetCamY = this.camY;
        // Horizontal
        if (worldW <= w) {
            targetCamX = worldW / 2;
        } else {
            const halfDZx = (w * this.deadFracX) / 2;
            const left = this.camX - halfDZx;
            const right = this.camX + halfDZx;
            if (playerPx < left || playerPx > right) {
                // Größerer Sprung: auf Achse zentrieren
                targetCamX = playerPx;
            }
            const minX = w / 2, maxX = worldW - w / 2;
            targetCamX = Math.max(minX, Math.min(maxX, targetCamX));
        }
        // Vertical
        if (worldH <= h) {
            targetCamY = worldH / 2;
        } else {
            const halfDZy = (h * this.deadFracY) / 2;
            const top = this.camY - halfDZy;
            const bottom = this.camY + halfDZy;
            if (playerPy < top || playerPy > bottom) {
                // Größerer Sprung: auf Achse zentrieren
                targetCamY = playerPy;
            }
            const minY = h / 2, maxY = worldH - h / 2;
            targetCamY = Math.max(minY, Math.min(maxY, targetCamY));
        }
        if (targetCamX !== this.camX) { this.camX = targetCamX; changed = true; }
        if (targetCamY !== this.camY) { this.camY = targetCamY; changed = true; }
        if (changed) this.needsRender = true;
    }
}
