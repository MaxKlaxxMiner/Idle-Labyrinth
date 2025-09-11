import {Laby} from '../lib/Laby';
import {Input} from '../input/Input';
import {Consts} from './Consts';
import {Level} from '../view/Level';
import {Camera} from '../view/Camera';
import {HUDView} from '../ui/HUDView';

export class Game {
    private bgCanvas: HTMLCanvasElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private hud!: HUDView;
    private rafId: number | null = null;
    private laby!: Laby;
    private levelView!: Level;
    private static readonly BASE_SEED = 123456;

    private needsRender = true;

    private fpsFrames = 0;
    private fpsLastTime = performance.now();
    private fpsValue = 0;

    private turbo = false;
    private fastTimer: number | null = null;

    private camera = new Camera();

    private input = new Input();
    private level = 0;
    private player = {x: 1, y: 1, r: 0.35};
    private goal = {x: 0, y: 0};
    private moves = 0;
    private resetLatch = false;
    private history = '';
    private historyRaw = '';
    private lastHistorySaveAt = 0;
    private lastSavedHistoryLen = 0;
    private markers = new Set<number>();

    private dragging = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private dragStartCamX = 0;
    private dragStartCamY = 0;

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

        const saved = this.loadLevel();
        this.level = Number.isFinite(saved) && saved! >= 0 ? saved! : 0;
        this.initLevel(false);
        this.loadHistoryRawAndReplay();

        this.onResize = this.onResize.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        window.addEventListener('resize', this.onResize);
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
            this.update();
            const minTime = performance.now() + 10;
            do {
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

        if (this.input.consumeKey(' ', 'Space')) this.updatePlayer('M');

        if (this.input.consumeKey('Backspace', 'Delete')) {
            this.updatePlayer('B');
        } else {
            const stepKey = this.input.consumeStepKey();
            if (stepKey) this.updatePlayer(stepKey);
        }

        if (!this.dragging) {
            if (this.camera.updateFollowPlayerTile(this.player.x, this.player.y)) this.needsRender = true;
        }

        if (this.input.consumeKey('Enter', 'NumpadEnter', 'Return')) {
            this.camera.centerOnPlayerTile(this.player.x, this.player.y);
            this.needsRender = true;
        }

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

        if (this.input.consumeKey('t', 'T')) {
            this.turbo = !this.turbo;
            setTimeout(() => {
                this.stop();
                this.start();
            }, 0);
            this.updateHud();
        }

        if (this.player.x === this.goal.x && this.player.y === this.goal.y) {
            if (this.isLocalhost()) {
                do {
                    this.level++;
                } while (!Consts.largeLevels.has(this.level + 1));
            } else {
                this.level++;
            }
            this.saveLevel(this.level);
            this.initLevel();
        }

        this.saveHistoryRaw();
    }

    private render() {
        const w = this.bgCanvas.width;
        const h = this.bgCanvas.height;
        this.ctx.clearRect(0, 0, w, h);

        const {ox, oy, tileSize: size} = this.camera.getOffsets();

        this.levelView.render(ox, oy, size);

        this.ctx.fillStyle = Consts.colors.goal;
        if (size < Consts.sizes.smallTileThreshold) {
            this.ctx.fillRect(ox + this.goal.x * size, oy + this.goal.y * size, size, size);
        } else {
            this.ctx.fillRect(ox + this.goal.x * size + size * 0.25, oy + this.goal.y * size + size * 0.25, size * 0.5, size * 0.5);
        }

        this.ctx.fillStyle = Consts.colors.player;
        if (size < Consts.sizes.smallTileThreshold) {
            this.ctx.fillRect(ox + this.player.x * size, oy + this.player.y * size, size, size);
        } else {
            this.ctx.beginPath();
            this.ctx.arc(ox + (this.player.x + 0.5) * size + 0.5, oy + (this.player.y + 0.5) * size + 0.5, this.player.r * size, 0, Math.PI * 2);
            this.ctx.fill();
        }

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
        this.hud.set({ level: this.level + 1, moves: this.moves, tileSize, mode: mode as ('Turbo'|'VSync'), fps: this.fpsValue });
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
            this.camera.setBestFitZoom();
            this.camera.centerOnPlayerTile(this.player.x, this.player.y);
        }
        this.needsRender = true;
    }

    private onMouseDown(e: MouseEvent) {
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
        const changed = this.camera.setCenter(this.dragStartCamX - dx, this.dragStartCamY - dy);
        if (changed) this.needsRender = true;
    }

    private onMouseUp(_e: MouseEvent) {
        if (!this.dragging) return;
        this.dragging = false;
        const {tileSize} = this.camera.getOffsets();
        const px = (this.player.x + 0.5) * tileSize;
        const py = (this.player.y + 0.5) * tileSize;
        this.camera.ensurePlayerInsideDeadZone(px, py);
        this.needsRender = true;
    }

    private createLabyForLevel(gameLevel: number): Laby {
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
        if (saveImmediate) this.saveHistoryRaw(true);
        this.player.x = 1;
        this.player.y = 1;
        this.goal.x = Math.max(1, this.laby.pixWidth - 2);
        this.goal.y = Math.max(1, this.laby.pixHeight - 2);
        this.markers.clear();
        this.levelView.setLaby(this.laby);
        this.levelView.clearHighlights();

        this.camera.setWorldSize(this.laby.pixWidth, this.laby.pixHeight);
        this.camera.setBestFitZoom();
        this.camera.centerOnPlayerTile(this.player.x, this.player.y);
        this.needsRender = true;
    }

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
        } catch {}
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

    private saveHistoryRaw(force = false) {
        try {
            const now = performance.now();
            if (!force) {
                if (this.historyRaw.length === this.lastSavedHistoryLen) return;
                if (now - this.lastHistorySaveAt < 3000) return;
            }
            localStorage.setItem('idle-laby-historyRaw', this.historyRaw);
            this.lastSavedHistoryLen = this.historyRaw.length;
            this.lastHistorySaveAt = now;
        } catch {}
    }

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
            this.camera.centerOnPlayerTile(this.player.x, this.player.y);
            this.needsRender = true;
        } catch {}
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
