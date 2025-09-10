import {Laby} from './Laby';
import {Input} from './Input';
import {Consts} from './Consts';
import {Level} from './Level';
import {Camera} from './Camera';

export class Game {
    // Background bgCanvas is managed by Level
    private bgCanvas: HTMLCanvasElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
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

    // Camera mit Dead-Zone
    private camera = new Camera();

    // Input and player state
    private input = new Input();
    private level = 0; // gameLevel beginnt bei 0
    private player = {x: 1, y: 1, r: 0.35};
    private goal = {x: 0, y: 0};
    private moves = 0;
    private resetLatch = false;
    private history = '';
    // Vollständige Eingabe-Historie: behält alle Eingaben bei (L/R/U/D/B/M)
    // B = Backspace/Delete (Undo), M = Marker (Space)
    private historyRaw = '';
    // Throttle für Autosave der historyRaw
    private lastHistorySaveAt = 0;
    private lastSavedHistoryLen = 0;
    private markers = new Set<number>();

    // Mouse-drag Panning (temporär, bis Mouseup; danach re-centern)
    private dragging = false;
    private dragStartX = 0; // CSS-Pixel
    private dragStartY = 0; // CSS-Pixel
    private dragStartCamX = 0; // Weltpixel
    private dragStartCamY = 0; // Weltpixel

    constructor(canvas: HTMLCanvasElement) {
        this.bgCanvas = canvas;

        // Foreground-Canvas erzeugen und überlagern
        const fg = document.createElement('canvas');
        fg.id = 'game-fg';
        fg.style.position = 'absolute';
        fg.style.left = '0';
        fg.style.top = '0';
        fg.style.zIndex = '1';
        fg.style.pointerEvents = 'none';
        (this.bgCanvas.parentElement || document.body).appendChild(fg);
        const ctx = fg.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D Context (fg) nicht verfügbar');
        this.canvas = fg;
        this.ctx = ctx;
        this.levelView = new Level(this.bgCanvas);

        const saved = this.loadLevel();
        this.level = Number.isFinite(saved) && saved! >= 0 ? saved! : 0;
        // Initial: Level setzen, aber historyRaw erst nach optionalem Replay speichern
        this.initLevel(false);
        this.loadHistoryRawAndReplay();

        this.onResize = this.onResize.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        window.addEventListener('resize', this.onResize);
        // Maus-Eingaben auf dem BG-Canvas abgreifen (FG hat pointer-events: none)
        this.bgCanvas.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.onMouseUp);
        this.onResize();
    }

    start() {
        if (this.rafId != null || this.fastTimer != null) return;
        if (this.turbo) this.startTurboLoop(); else this.startRafLoop();
    }

    stop() {
        if (this.rafId != null) cancelAnimationFrame(this.rafId);
        this.rafId = null;
        if (this.fastTimer != null) {
            clearTimeout(this.fastTimer);
            clearInterval(this.fastTimer);
        }
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
        // Zoom controls (über Camera)
        let zoomChanged = false;
        if (this.input.consumeKey('0')) {
            this.camera.setBestFitZoom();
            this.camera.centerOnPlayerTile(this.player.x, this.player.y);
            zoomChanged = true;
        } else if (this.input.consumeKey('+', '=')) {
            zoomChanged = this.camera.zoomIn();
        } else if (this.input.consumeKey('-')) {
            zoomChanged = this.camera.zoomOut();
        }
        if (zoomChanged) this.needsRender = true;

        // Marker an aktueller Position toggeln (Leertaste)
        if (this.input.consumeKey(' ', 'Space')) this.updatePlayer('M');

        // Undo: Backspace/Delete -> genau einen Schritt zurück (Autorepeat durch Keydown-Repeat)
        if (this.input.consumeKey('Backspace', 'Delete')) {
            this.updatePlayer('B');
        } else {
            // Discretes Vorwärts-Stepping: pro Tastendruck 1 Knoten (2 Tiles)
            const stepKey = this.input.consumeStepKey();
            if (stepKey) this.updatePlayer(stepKey);
        }

        // Camera dead-zone follow (bei Drag pausieren)
        if (!this.dragging) {
            if (this.camera.updateFollowPlayerTile(this.player.x, this.player.y)) this.needsRender = true;
        }

        // Sofortige Zentrierung auf den Spieler per Enter/NumpadEnter
        if (this.input.consumeKey('Enter', 'NumpadEnter', 'Return')) {
            this.camera.centerOnPlayerTile(this.player.x, this.player.y);
            this.needsRender = true;
        }

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
            setTimeout(() => {
                this.stop();
                this.start();
            }, 0);
            this.needsRender = true;
        }

        // Goal check
        if (this.player.x === this.goal.x && this.player.y === this.goal.y) {
            if (this.isLocalhost()) {
                // Debug/Entwicklung: schneller vorwärts
                do {
                    this.level++;
                } while (!this.largeLevels.has(this.level + 1));
            } else {
                // Normal: inkrementell
                this.level++;
            }
            this.saveLevel(this.level);
            this.initLevel();
        }

        // Periodischer Autosave der historyRaw (alle 3s, nur bei Änderungen)
        this.saveHistoryRaw();
    }

    private largeLevels = new Set<number>([
        1, 2, 4, 6, 8, 11, 15, 20, 26, 33, 42, 54, 69, 88,
        114, 145, 185, 236, 300, 382, 486, 618, 786, 1000,
        1272, 1618, 2059, 2620, 3333, 4240, 5394, 6861,
        8728, 11103, 14123, 17965, 22852, 29068, 36975, 47033, 59827, 999999
    ]);

    private render() {
        const w = this.bgCanvas.width;
        const h = this.bgCanvas.height;
        // FG: Overlays
        this.ctx.clearRect(0, 0, w, h);

        const {ox, oy, tileSize: size} = this.camera.getOffsets();

        // BG: labyrinth and overlays via Level (uses its edge sets)
        this.levelView.render(ox, oy, size);

        // Draw goal
        this.ctx.fillStyle = Consts.colors.goal;
        if (size < Consts.sizes.smallTileThreshold) {
            this.ctx.fillRect(ox + this.goal.x * size, oy + this.goal.y * size, size, size);
        } else {
            this.ctx.fillRect(ox + this.goal.x * size + size * 0.25, oy + this.goal.y * size + size * 0.25, size * 0.5, size * 0.5);
        }

        // Draw player (yellow circle)
        this.ctx.fillStyle = Consts.colors.player;
        if (size < Consts.sizes.smallTileThreshold) {
            this.ctx.fillRect(ox + this.player.x * size, oy + this.player.y * size, size, size);
        } else {
            this.ctx.beginPath();
            // Subpixel-Shift um 0.5px für optische Zentrierung
            this.ctx.arc(ox + (this.player.x + 0.5) * size + 0.5, oy + (this.player.y + 0.5) * size + 0.5, this.player.r * size, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Marker zeichnen (rote Kreise) – über dem Spieler
        this.ctx.fillStyle = Consts.colors.marker;
        for (const key of this.markers) {
            const mx = (key >>> 16) & 0xffff;
            const my = key & 0xffff;
            if (size < Consts.sizes.smallTileThreshold) {
                this.ctx.fillRect(ox + mx * size, oy + my * size, size, size);
            } else {
                this.ctx.beginPath();
                this.ctx.arc(ox + (mx + 0.5) * size + 0.5, oy + (my + 0.5) * size + 0.5, Math.max(1, 0.28 * size), 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // HUD (foreground) - single line
        this.ctx.fillStyle = Consts.colors.hudText;
        this.ctx.font = Consts.sizes.hudFont;
        this.ctx.textBaseline = 'top';
        const mode = this.turbo ? 'Turbo' : 'VSync';
        const hudLine = `Level: ${this.level + 1}  Moves: ${this.moves}  |  Tile: ${size}px (+/- , 0 fit)  |  Move: WASD/↑↓←→  Reset: R  Mark: Space  Center: Enter  |  Mode: ${mode} (T)  |  FPS: ${this.fpsValue}`;
        this.ctx.fillText(hudLine, 8, 8);
    }

    private onResize() {
        const dpr = Math.min(Consts.display.dprMax, window.devicePixelRatio || 1);
        const rect = this.bgCanvas.getBoundingClientRect();
        const w = Math.max(320, Math.floor(rect.width * dpr));
        const h = Math.max(240, Math.floor(rect.height * dpr));
        // Resize BG via Level
        this.levelView.resize(w, h);
        this.canvas.width = w;
        this.canvas.height = h;
        this.ctx.imageSmoothingEnabled = false;
        // Camera über neue View informieren
        this.camera.setViewSize(w, h);
        // Adjust zoom to best fit on resize
        if (this.laby) {
            this.camera.setBestFitZoom();
            this.camera.centerOnPlayerTile(this.player.x, this.player.y);
        }
        this.needsRender = true;
    }

    // Mouse drag handlers: temporäres Panning, danach re-center
    private onMouseDown(e: MouseEvent) {
        // Nur linker Button
        if (e.button !== 0) return;
        this.dragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        const c = this.camera.getCenter();
        this.dragStartCamX = c.camX;
        this.dragStartCamY = c.camY;
    }

    private onMouseMove(e: MouseEvent) {
        if (!this.dragging) return;
        const dpr = Math.min(Consts.display.dprMax, window.devicePixelRatio || 1);
        const dxCss = e.clientX - this.dragStartX;
        const dyCss = e.clientY - this.dragStartY;
        const dx = dxCss * dpr;
        const dy = dyCss * dpr;
        // Drag nach rechts verschiebt Kamera nach links (invertiertes Vorzeichen)
        const changed = this.camera.setCenter(this.dragStartCamX - dx, this.dragStartCamY - dy);
        if (changed) this.needsRender = true;
    }

    private onMouseUp(_e: MouseEvent) {
        if (!this.dragging) return;
        this.dragging = false;
        // Nach Loslassen: nur soweit schieben, dass Spieler wieder in Dead-Zone ist
        const {tileSize} = this.camera.getOffsets();
        const px = (this.player.x + 0.5) * tileSize;
        const py = (this.player.y + 0.5) * tileSize;
        this.camera.ensurePlayerInsideDeadZone(px, py);
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
        return new Laby(w, h, Game.BASE_SEED + w + h + gameLevel);
    }

    private canStepTo(cx: number, cy: number, nx: number, ny: number): boolean {
        if (nx < 1 || ny < 1 || nx >= this.laby.pixWidth - 1 || ny >= this.laby.pixHeight - 1) return false;
        const dx = nx - cx, dy = ny - cy;
        if (!((Math.abs(dx) === 2 && dy === 0) || (Math.abs(dy) === 2 && dx === 0))) return false;
        const mx = cx + Math.sign(dx);
        const my = cy + Math.sign(dy);
        return this.laby.isFree(mx, my);
    }

    private initLevel(saveImmediate: boolean = true) {
        this.laby = this.createLabyForLevel(this.level);

        this.moves = 0;
        this.history = '';
        this.historyRaw = '';
        // Sofort speichern bei Restart/Levelwechsel (leerer Verlauf)
        if (saveImmediate) this.saveHistoryRaw(true);
        this.player.x = 1;
        this.player.y = 1;
        this.goal.x = Math.max(1, this.laby.pixWidth - 2);
        this.goal.y = Math.max(1, this.laby.pixHeight - 2);
        this.markers.clear();
        this.levelView.setLaby(this.laby);
        this.levelView.clearHighlights();

        // Camera: Weltmaße setzen, Best-Fit und zentrieren
        this.camera.setWorldSize(this.laby.pixWidth, this.laby.pixHeight);
        this.camera.setBestFitZoom();
        this.camera.centerOnPlayerTile(this.player.x, this.player.y);
        this.needsRender = true;
    }

    // Verarbeitet Spieler-relevante Eingaben (Rohcodes):
    // 'L','R','U','D' = Bewegungen; 'B' = Backspace/Undo; 'M' = Marker toggle
    private updatePlayer(inputKey: 'L' | 'R' | 'U' | 'D' | 'B' | 'M') {
        if (inputKey === 'M') {
            this.historyRaw += 'M';
            this.toggleMarkerAt(this.player.x, this.player.y);
            return;
        }

        if (inputKey === 'B') {
            this.historyRaw += 'B';
            if (this.history.length === 0) return;
            const last = this.history.charAt(this.history.length - 1);
            let dx = 0, dy = 0;
            if (last === 'L') dx = 1;
            else if (last === 'R') dx = -1;
            else if (last === 'U') dy = 1;
            else if (last === 'D') dy = -1;
            const nx = this.player.x + dx * 2;
            const ny = this.player.y + dy * 2;
            if (!this.canStepTo(this.player.x, this.player.y, nx, ny)) return;
            this.levelView.clearCell(nx - dx * 2, ny - dy * 2, true);
            this.levelView.clearCell(nx - dx, ny - dy, true);
            this.levelView.markCell(nx - dx * 2, ny - dy * 2, false);
            this.levelView.markCell(nx - dx, ny - dy, false);
            this.player.x = nx;
            this.player.y = ny;
            this.moves = Math.max(0, this.moves - 1);
            this.autoClearMarkerAt(this.player.x, this.player.y);
            this.needsRender = true;
            this.history = this.history.slice(0, -1);
            return;
        }

        // Bewegungen
        let dx = 0, dy = 0;
        if (inputKey === 'L') dx = -1;
        else if (inputKey === 'R') dx = 1;
        else if (inputKey === 'U') dy = -1;
        else if (inputKey === 'D') dy = 1;

        const prevX = this.player.x;
        const prevY = this.player.y;
        const nx = prevX + dx * 2;
        const ny = prevY + dy * 2;
        if (!this.canStepTo(prevX, prevY, nx, ny)) return;

        this.player.x = nx;
        this.player.y = ny;

        this.historyRaw += inputKey;

        const last = this.history.charAt(this.history.length - 1);
        const isUndo =
            (last === 'L' && inputKey === 'R') ||
            (last === 'R' && inputKey === 'L') ||
            (last === 'U' && inputKey === 'D') ||
            (last === 'D' && inputKey === 'U');

        // dx,dy are -1/0/1; cells to update need +/-1 positions
        const cx = dx; // center step delta (±1 on axis)
        const cy = dy;

        if (isUndo) {
            this.levelView.clearCell(nx - cx, ny - cy, true);
            this.levelView.clearCell(prevX, prevY, true);
            this.levelView.markCell(nx - cx, ny - cy, false);
            this.levelView.markCell(prevX, prevY, false);
            this.history = this.history.slice(0, -1);
            this.moves = Math.max(0, this.moves - 1);
        } else {
            this.levelView.clearCell(nx - cx, ny - cy, false);
            this.levelView.clearCell(nx, ny, false);
            this.levelView.markCell(nx - cx, ny - cy, true);
            this.levelView.markCell(nx, ny, true);
            this.history += inputKey;
            this.moves += 1;
        }
        this.autoClearMarkerAt(this.player.x, this.player.y);
        this.needsRender = true;
    }

    private hardReset() {
        this.level = 0;
        this.saveLevel(this.level);
        this.initLevel();
    }

    private toggleMarkerAt(x: number, y: number) {
        const k = ((x & 0xffff) << 16) | (y & 0xffff);
        if (this.markers.has(k)) this.markers.delete(k); else this.markers.add(k);
        this.needsRender = true;
    }

    private autoClearMarkerAt(x: number, y: number) {
        const k = ((x & 0xffff) << 16) | (y & 0xffff);
        if (this.markers.delete(k)) this.needsRender = true;
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

    // Speichert historyRaw throttled (>=3s Abstand) oder erzwungen sofort
    private saveHistoryRaw(force = false) {
        try {
            const now = performance.now();
            if (!force) {
                if (this.historyRaw.length === this.lastSavedHistoryLen) return; // keine Änderung
                if (now - this.lastHistorySaveAt < 3000) return; // Throttle 3s
            }
            localStorage.setItem('idle-laby-historyRaw', this.historyRaw);
            this.lastSavedHistoryLen = this.historyRaw.length;
            this.lastHistorySaveAt = now;
        } catch {
            // ignorieren (z. B. Storage deaktiviert)
        }
    }

    // Lädt ggf. gespeicherte historyRaw und spielt sie mittels updatePlayer() ab
    private loadHistoryRawAndReplay() {
        try {
            const raw = localStorage.getItem('idle-laby-historyRaw');
            if (!raw) return;
            for (let i = 0; i < raw.length; i++) {
                const c = raw.charAt(i);
                if (c === 'L' || c === 'R' || c === 'U' || c === 'D' || c === 'B' || c === 'M') {
                    this.updatePlayer(c);
                }
            }
            // Nach Replay Kamera auf Spieler zentrieren, Render anstoßen
            this.camera.centerOnPlayerTile(this.player.x, this.player.y);
            this.needsRender = true;
        } catch {
            // ignorieren
        }
    }

    private isLocalhost(): boolean {
        try {
            const h = window.location.hostname;
            return h === 'localhost' || h === '127.0.0.1' || h === '::1';
        } catch {
            return false;
        }
    }
}
