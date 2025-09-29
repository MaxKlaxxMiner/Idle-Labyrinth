import {Laby} from '@/lib/Laby';
import {Input} from '@/input/Input';
import {Consts} from './Consts';
import {Level} from '@/view/Level';
import {Camera} from '@/view/Camera';
import {HUDView} from '@/ui/HUDView';

export class Game {
    private bgCanvas: HTMLCanvasElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private hud!: HUDView;
    private rafId: number | null = null;
    private laby!: Laby;
    private levelView!: Level;

    private needsRender = true;

    private fpsFrames = 0;
    private fpsLastTime = performance.now();
    private fpsValue = 0;

    // Rendermodus
    private turbo = false; // false=VSync (RAF), true=Turbo (ohne VSync)
    private fastTimer: number | null = null;

    private camera = new Camera();
    private showGrid = true;

    // Eingabe und Spielerzustand
    private input = new Input();
    private level = 0; // gameLevel beginnt bei 0
    private player = {x: 1, y: 1, r: 0.35};
    private goal = {x: 0, y: 0};
    private moves = 0;
    private resetLatch = false;
    private history = '';
    private historyRaw = '';
    private lastHistorySaveAt = 0;
    private lastSavedHistoryLen = 0;
    private markers = new Set<number>();
    private randomWalkHeld = false;
    private randomWalkRepeat = false;
    private randomWalkDelayUntil = 0;
    private randomWalkHoldStart = 0;
    private randomWalkMulti = 1;

    // Mouse-drag Panning (temporär, Kamera folgt erst nach Bewegung wieder)
    private dragging = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private dragStartCamX = 0;
    private dragStartCamY = 0;
    private dragMoved = false;
    private followPaused = false;

    constructor(canvas: HTMLCanvasElement) {
        this.bgCanvas = canvas;

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
        this.hud = new HUDView(document.getElementById('hud') as HTMLElement | null);
        this.levelView = new Level(this.bgCanvas);
        this.levelView.setShowGrid(this.showGrid);

        const saved = this.loadLevel();
        this.level = Number.isFinite(saved) && saved! >= 0 ? saved! : 0;

        // Zuerst Viewgröße initialisieren, damit Autofit korrekte Maße erhält
        this.onResize();

        // Initial: Level setzen, aber historyRaw erst nach optionalem Replay speichern
        this.initLevel(false);
        this.loadHistoryRawAndReplay();

        // Event-Handler binden und registrieren
        this.onResize = this.onResize.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onWheel = this.onWheel.bind(this);
        window.addEventListener('resize', this.onResize);
        // Maus-Eingaben auf dem BG-Canvas abgreifen (FG hat pointer-events: none)
        this.bgCanvas.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.onMouseUp);
        this.bgCanvas.addEventListener('wheel', this.onWheel, {passive: false});
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
            this.fpsFrames++;
            const now = performance.now();
            const dt = now - this.fpsLastTime;
            if (dt >= 1000) {
                this.fpsValue = Math.round((this.fpsFrames * 1000) / dt);
                this.fpsFrames = 0;
                this.fpsLastTime = now;
                this.updateHud();
            }
            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
    }

    private startTurboLoop() {
        const loop = () => {
            // Burst-Rendering bis mindestens 10 ms vergangen sind (Speed-Test)
            const minTime = performance.now() + 10;
            do {
                this.update();
                this.render();
                this.fpsFrames++;
            } while (performance.now() < minTime);
            const now = performance.now();
            const dt = now - this.fpsLastTime;
            if (dt >= 1000) {
                this.fpsValue = Math.round((this.fpsFrames * 1000) / dt);
                this.fpsFrames = 0;
                this.fpsLastTime = now;
                this.updateHud();
            }
        };
        this.fastTimer = window.setInterval(loop, 0);
        loop();
    }

    private update() {
        // Zoom-Steuerung (über Camera)
        let zoomChanged = false;
        if (this.input.consumeKey('0')) {
            this.camera.setBestFitZoom();
            this.camera.centerOnPlayerTile(this.player.x, this.player.y);
            this.followPaused = false;
            zoomChanged = true;
        } else if (this.input.consumeKey('+', '=')) {
            zoomChanged = this.camera.zoom(1, this.player.x, this.player.y);
        } else if (this.input.consumeKey('-')) {
            zoomChanged = this.camera.zoom(-1, this.player.x, this.player.y);
        }
        if (zoomChanged) this.needsRender = true;

        // Marker an aktueller Position toggeln (Leertaste)
        if (this.input.consumeKey(' ', 'Space')) this.updatePlayer('M');

        // Undo: Backspace/Delete -> genau einen Schritt zurück (Autorepeat durch Keydown-Repeat)
        if (this.input.consumeKey('Backspace', 'Delete')) {
            this.updatePlayer('B');
        } else {
            // Diskretes Vorwärts-Stepping: pro Tastendruck 1 Knoten (2 Tiles)
            const stepKey = this.input.consumeStepKey();
            if (stepKey) {
                this.updatePlayer(stepKey);
            } else {
                this.handleRandomWalk();
            }
        }

        // Kamera-Follow mit Dead-Zone (bei Drag pausieren)
        if (!this.dragging && !this.followPaused) {
            if (this.camera.updateFollowPlayerTile(this.player.x, this.player.y)) this.needsRender = true;
        }

        // Sofort auf Spieler zentrieren (Enter/NumpadEnter)
        if (this.input.consumeKey('Enter', 'NumpadEnter', 'Return')) {
            this.camera.centerOnPlayerTile(this.player.x, this.player.y);
            this.followPaused = false;
            this.needsRender = true;
        }

        // Reset/Hardreset per Taste 'R'
        // Reset-Erkennung: bevorzugt Edge; Fallback bei gehaltenem Key via Latch
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

        // Turbo (ohne VSync) umschalten per Taste 'T'
        if (this.input.consumeKey('t', 'T')) {
            this.turbo = !this.turbo;
            // sanfter Loop-Wechsel
            setTimeout(() => {
                this.stop();
                this.start();
            }, 0);
            this.updateHud();
        }

        if (this.input.consumeKey('g', 'G')) {
            this.showGrid = !this.showGrid;
            this.levelView.setShowGrid(this.showGrid);
            this.needsRender = true;
        }

        // Ziel erreicht?
        if (this.player.x === this.goal.x && this.player.y === this.goal.y) {
            if (this.isLocalhost()) {
                // Entwicklung: schneller vorwärts
                do {
                    this.level++;
                } while (!Consts.largeLevels.has(this.level + 1));
            } else {
                // Normal: inkrementell
                this.level++;
            }
            this.saveLevel(this.level);
            this.initLevel();
        }

        // Periodischer Autosave der historyRaw (alle 3 s, nur bei Änderungen)
        this.saveHistoryRaw();
    }

    private render() {
        const w = this.bgCanvas.width;
        const h = this.bgCanvas.height;
        this.ctx.clearRect(0, 0, w, h);

        const {ox, oy, tileSize: size} = this.camera.getOffsets();

        // BG: Labyrinth + Overlays über Level
        this.levelView.render(ox, oy, size);

        // Ziel zeichnen
        this.ctx.fillStyle = Consts.colors.goal;
        if (size < Consts.sizes.smallTileThreshold) {
            this.ctx.fillRect(ox + this.goal.x * size, oy + this.goal.y * size, size, size);
        } else {
            this.ctx.fillRect(ox + this.goal.x * size + size * 0.25, oy + this.goal.y * size + size * 0.25, size * 0.5, size * 0.5);
        }

        // Spieler zeichnen (gelber Kreis)
        this.ctx.fillStyle = Consts.colors.player;
        if (size < Consts.sizes.smallTileThreshold) {
            this.ctx.fillRect(ox + this.player.x * size, oy + this.player.y * size, size, size);
        } else {
            this.ctx.beginPath();
            this.ctx.arc(ox + (this.player.x + 0.5) * size + 0.5, oy + (this.player.y + 0.5) * size + 0.5, this.player.r * size, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Marker zeichnen (rote Kreise) - über dem Spieler
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

        this.updateHud();
    }

    private updateHud() {
        const {tileSize} = this.camera.getOffsets();
        const mode = this.turbo ? 'Turbo' : 'VSync';
        this.hud.set({level: this.level + 1, moves: this.moves, tileSize, mode: mode as ('Turbo' | 'VSync'), fps: this.fpsValue});
    }

    private onResize() {
        const dpr = Math.min(Consts.display.dprMax, window.devicePixelRatio || 1);
        const rect = this.bgCanvas.getBoundingClientRect();
        const w = Math.max(320, Math.floor(rect.width * dpr));
        const h = Math.max(240, Math.floor(rect.height * dpr));
        this.levelView.resize(w, h);
        this.canvas.width = w;
        this.canvas.height = h;
        this.ctx.imageSmoothingEnabled = false;
        this.camera.setViewSize(w, h);
        if (this.laby) {
            // Kamera an neue Viewgröße begrenzen
            const c = this.camera.getCenter();
            this.camera.setCenter(c.camX, c.camY);
        }
        this.needsRender = true;
    }

    // Mouse drag handlers: temporäres Panning mit pausierter Nachführung
    private onMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        this.dragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        const c = this.camera.getCenter();
        this.dragStartCamX = c.camX;
        this.dragStartCamY = c.camY;
        this.dragMoved = false;
    }

    private onMouseMove(e: MouseEvent) {
        if (!this.dragging) return;
        const dpr = Math.min(Consts.display.dprMax, window.devicePixelRatio || 1);
        const dxCss = e.clientX - this.dragStartX;
        const dyCss = e.clientY - this.dragStartY;
        const dx = dxCss * dpr;
        const dy = dyCss * dpr;
        const changed = this.camera.setCenter(this.dragStartCamX - dx, this.dragStartCamY - dy);
        if (changed) {
            this.dragMoved = true;
            this.needsRender = true;
        }
    }

    private onMouseUp(_e: MouseEvent) {
        if (!this.dragging) return;
        this.dragging = false;
        const hadMovement = this.dragMoved;
        this.dragMoved = false;
        if (hadMovement) {
            this.followPaused = true;
        }
    }

    private onWheel(e: WheelEvent) {
        if (e.deltaY === 0) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1 : -1;
        const rect = this.bgCanvas.getBoundingClientRect();
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;
        const dpr = Math.min(Consts.display.dprMax, window.devicePixelRatio || 1);
        const canvasX = cssX * dpr;
        const canvasY = cssY * dpr;
        const {ox, oy, tileSize} = this.camera.getOffsets();
        if (tileSize <= 0) return;
        const focusPx = canvasX - ox;
        const focusPy = canvasY - oy;
        const focusTileX = focusPx / tileSize - 0.5;
        const focusTileY = focusPy / tileSize - 0.5;
        const zoomChanged = this.camera.zoom(delta, focusTileX, focusTileY);
        if (zoomChanged) {
            this.followPaused = true;
            this.needsRender = true;
        }
    }

    private createLabyForLevel(gameLevel: number): Laby {
        // Größenentwicklung nach Schnipsel: w,h starten bei 5 und wachsen um 2,
        // gesteuert über das Verhältnis w/h zum goldenen Schnitt.
        let w = 5;
        let h = 5;
        for (let i = 0; i < gameLevel; i++) {
            if (w / h < 1.61803399) w += 2; else h += 2;
        }
        return new Laby(w, h, Consts.labySeedBase + w + h + gameLevel);
    }

    private canStepTo(cx: number, cy: number, nx: number, ny: number): boolean {
        if (nx < 1 || ny < 1 || nx >= this.laby.pixWidth - 1 || ny >= this.laby.pixHeight - 1) return false;
        const dx = nx - cx, dy = ny - cy;
        if (!((Math.abs(dx) === 2 && dy === 0) || (Math.abs(dy) === 2 && dx === 0))) return false;
        const mx = cx + Math.sign(dx);
        const my = cy + Math.sign(dy);
        return this.laby.isFree(mx, my);
    }

    private applyBacktrackHighlight(x: number, y: number, dx: number, dy: number, mode: 'backtrack' | 'deadend') {
        this.levelView.markCell(x, y, mode);
        if (dx !== 0 || dy !== 0) {
            this.levelView.markCell(x + dx, y + dy, mode);
        }
    }

    private getBacktrackHighlightMode(x: number, y: number): 'backtrack' | 'deadend' {
        return this.isDeadEndCell(x, y) ? 'deadend' : 'backtrack';
    }

    // Prüft, ob eine Zelle nur einen offenen Weg besitzt (rosa zählt als geschlossen).
    private isDeadEndCell(x: number, y: number): boolean {
        if ((x & 1) === 0 || (y & 1) === 0) return false;
        let open = 0;
        const dirs: ReadonlyArray<[number, number]> = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ];
        for (const [dx, dy] of dirs) {
            const midX = x + dx;
            const midY = y + dy;
            if (!this.laby.isFree(midX, midY)) continue;
            const targetX = x + dx * 2;
            const targetY = y + dy * 2;
            if (!this.laby.isFree(targetX, targetY)) continue;
            const midColor = this.levelView.getPixel(midX, midY);
            if (midColor === this.levelView.deadendColor32) continue;
            const targetColor = this.levelView.getPixel(targetX, targetY);
            if (targetColor === this.levelView.deadendColor32) continue;
            open++;
            if (open > 1) return false;
        }
        return open <= 1;
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

        // Camera: Weltmaße setzen, Best-Fit und zentrieren
        this.camera.setWorldSize(this.laby.pixWidth, this.laby.pixHeight);
        this.camera.setBestFitZoom();
        this.camera.centerOnPlayerTile(this.player.x, this.player.y);
        this.followPaused = false;
        this.needsRender = true;
    }

    // Verarbeitet Spieler-relevante Eingaben (Rohcodes):
    // 'L','R','U','D' = Bewegungen; 'B' = Backspace/Undo; 'M' = Marker toggle
    private updatePlayer(inputKey: 'L' | 'R' | 'U' | 'D' | 'B' | 'M') {
        this.followPaused = false;
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
            const prevX = this.player.x;
            const prevY = this.player.y;
            const highlightMode = this.getBacktrackHighlightMode(prevX, prevY);
            this.applyBacktrackHighlight(prevX, prevY, dx, dy, highlightMode);
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

        const cx = dx;
        const cy = dy;

        if (isUndo) {
            const highlightMode = this.getBacktrackHighlightMode(prevX, prevY);
            this.applyBacktrackHighlight(prevX, prevY, cx, cy, highlightMode);
            this.history = this.history.slice(0, -1);
            this.moves = Math.max(0, this.moves - 1);
        } else {
            this.levelView.markCell(nx - cx, ny - cy, 'trail');
            this.levelView.markCell(nx, ny, 'trail');
            this.history += inputKey;
            this.moves += 1;
        }
        this.autoClearMarkerAt(this.player.x, this.player.y);
        this.needsRender = true;
    }

    private handleRandomWalk() {
        const now = performance.now();
        const mPressed = this.input.isPressed('m', 'M');
        const mEdge = this.input.consumeKey('m', 'M');

        if (!mPressed) {
            this.randomWalkHeld = false;
            this.randomWalkRepeat = false;
            this.randomWalkDelayUntil = 0;
            this.randomWalkHoldStart = 0;
            this.randomWalkMulti = 1;
            return;
        }

        if (!this.randomWalkHeld) {
            this.randomWalkHeld = true;
            this.randomWalkRepeat = false;
            this.randomWalkHoldStart = now;
            this.randomWalkDelayUntil = now + Consts.randomWalkRepeatDelayMs;
            this.randomWalkMulti = 1;
        }

        if (!this.randomWalkRepeat) {
            if (mEdge) this.performRandomStep();
            if (now >= this.randomWalkDelayUntil) this.randomWalkRepeat = true;
            return;
        }

        const holdDuration = now - this.randomWalkHoldStart;
        if (holdDuration >= Consts.randomWalkRepeatDelayMs * 2) {
            this.randomWalkHoldStart += Consts.randomWalkRepeatDelayMs / 8;
            this.randomWalkMulti += 1 + (this.randomWalkMulti * 1.01 >> 1);
            if (this.randomWalkMulti > 4096) this.randomWalkMulti = 4096;
        }
        this.performRandomStep(this.randomWalkMulti);
    }

    private performRandomStep(count = 1) {
        for (let i = 0; i < count; i++) {
            const step = this.getRandomStepDirection();
            if (!step) return;
            this.updatePlayer(step);
            if (this.player.x === this.goal.x && this.player.y === this.goal.y) return;
        }
    }

    private getRandomStepDirection(): 'L' | 'R' | 'U' | 'D' | 'B' | null {
        const cx = this.player.x;
        const cy = this.player.y;
        const options: Array<{ dir: 'L' | 'R' | 'U' | 'D'; dx: number; dy: number }> = [
            {dir: 'L', dx: -2, dy: 0},
            {dir: 'R', dx: 2, dy: 0},
            {dir: 'U', dx: 0, dy: -2},
            {dir: 'D', dx: 0, dy: 2},
        ];
        const valid: Array<'L' | 'R' | 'U' | 'D'> = [];
        for (const option of options) {
            const nx = cx + option.dx;
            const ny = cy + option.dy;
            if (!this.canStepTo(cx, cy, nx, ny)) continue;
            if (nx === this.goal.x && ny === this.goal.y) return null;
            const targetColor = this.levelView.getPixel(nx, ny);
            if (targetColor === this.levelView.deadendColor32 || targetColor === this.levelView.trailColor32) continue;
            valid.push(option.dir);
        }
        if (valid.length === 0) return this.history.length > 0 ? 'B' : null;

        // --- rechts/unten bevorzugen (je nach Position zum Ziel) ---
        if (this.goal.x - this.player.x >= this.goal.y - this.player.y) {
            for (let i = 0; i < valid.length; i++) if (valid[i] == 'R') return 'R';
            for (let i = 0; i < valid.length; i++) if (valid[i] == 'D') return 'D';
        } else {
            for (let i = 0; i < valid.length; i++) if (valid[i] == 'D') return 'D';
            for (let i = 0; i < valid.length; i++) if (valid[i] == 'R') return 'R';
        }

        // --- Rest: zufällige Wahl ---
        const index = Math.floor(Math.random() * valid.length);
        return valid[index];
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
                if (this.historyRaw.length === this.lastSavedHistoryLen) return;
                if (now - this.lastHistorySaveAt < 3000) return;
            }
            if (this.historyRaw.length > 2000000) {
                console.log("Game: Reduce History: " + this.historyRaw.length + " -> " + this.history.length);
                this.historyRaw = this.history;
            }
            //console.log("Game: Save History: " + this.historyRaw.length);
            localStorage.setItem('idle-laby-historyRaw', this.historyRaw);
            this.lastSavedHistoryLen = this.historyRaw.length;
            this.lastHistorySaveAt = now;
        } catch {
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
            this.followPaused = false;
            this.needsRender = true;
        } catch {
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
