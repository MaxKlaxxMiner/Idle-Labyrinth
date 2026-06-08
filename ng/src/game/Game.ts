import {Laby} from '@/lib/Laby';
import {Input} from '@/input/Input';
import {Consts} from './Consts';
import {Level} from '@/view/Level';
import {Camera} from '@/view/Camera';
import {HUDView} from '@/ui/HUDView';
import {StringBuilder} from "@/lib/StringBuilder";
import {LabyCache} from "@/lib/LabyCache";
import {GameSave} from "@/lib/GameSave";
import {Bot, BotHost} from './Bot';
import {GameModeStrategy, ModeHost} from './modes/GameMode';
import {IdleMode} from './modes/IdleMode';
import {EndlessMode} from './modes/EndlessMode';
import {calculateLevelReward} from '@/idle/Coins';
import {ShopView, ShopHost} from '@/idle/ShopView';
import {UpgradeId} from '@/idle/Upgrades';

export type GameMode = 'idle' | 'endless';

export interface GameOptions {
    cache?: LabyCache | null;
    save?: GameSave | null;
    mode?: GameMode;
    onExit?: () => void;
    /**
     * Wenn gesetzt, startet das Spiel auf diesem (0-basierten) Level.
     * Nach erfolgreichem Lösen wird statt zum nächsten Level zum
     * im Save gespeicherten aktuellen Level zurückgesprungen.
     * Verwendet für Endless-Replay aus dem Stats-Panel.
     */
    replayLevel?: number;
}

function buildModeStrategy(mode: GameMode): GameModeStrategy {
    return mode === 'endless' ? new EndlessMode() : new IdleMode();
}

export class Game implements BotHost, ModeHost, ShopHost {
    private bgCanvas: HTMLCanvasElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private hud!: HUDView;
    private rafId: number | null = null;
    private bgTickId: ReturnType<typeof setInterval> | null = null;
    private disposed = false;
    // BotHost erwartet die Felder als readonly, intern werden sie bei initLevel neu zugewiesen.
    laby!: Laby;
    levelView!: Level;

    private needsRender = true;

    private camera = new Camera();
    private showGrid = true;

    // Eingabe und Spielerzustand
    readonly input = new Input();
    level = 0; // gameLevel beginnt bei 0
    readonly player = {x: 1, y: 1, r: 0.35};
    readonly goal = {x: 0, y: 0};
    moves = 0;       // "echte" Pfadlänge: zählt bei Undo wieder runter
    totalMoves = 0;  // Gesamtschritte inkl. Rückwärts (ohne Marker), nur aufwärts
    history = new StringBuilder();
    private historyRaw = new StringBuilder();   // wird nur im Endless-Modus benutzt (persistiert pro Level)
    private replaying = false;                  // aktiv während des Replays beim Level-Start (keine Persistierung)
    private lastHistorySaveAt = 0;              // Throttle-Zeitstempel für historyRaw-Persistenz
    private markers = new Set<number>();

    // Mouse-drag Panning (temporär, Kamera folgt erst nach Bewegung wieder)
    private dragging = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private dragStartCamX = 0;
    private dragStartCamY = 0;
    private dragMoved = false;
    private followPaused = false;

    private readonly cache: LabyCache | null;
    readonly save: GameSave | null;
    private readonly modeStrategy!: GameModeStrategy;
    private readonly onExit: (() => void) | null;
    private replayMode = false;
    private readonly bot!: Bot;
    private readonly shop!: ShopView | null;
    private botActive = false;
    private shopOpenLastFrame = false;

    // ModeHost-API
    getHistoryRaw(): string {
        return this.historyRaw.toString();
    }

    // ShopHost-API
    getCoins(): bigint {
        return this.save?.getCoins() ?? 0n;
    }

    getUpgradeLevel(id: UpgradeId): number {
        return this.save?.getUpgrade(id) ?? 0;
    }

    purchase(id: UpgradeId, newLevel: number, cost: bigint): void {
        if (!this.save) return;
        if (this.save.getCoins() < cost) return;
        this.save.addCoins(-cost);
        this.save.setUpgrade(id, newLevel);
        this.updateHud();
    }

    // BotHost-API: steuert, ob bot.tick() den Spieler bewegt.
    isBotActive(): boolean {
        return this.botActive;
    }

    // BotHost-API: höchste gekaufte AutoMover-Stufe der Kette (1=random ... 5=speed; 0=keine).
    autoMoverTier(): number {
        const s = this.save;
        if (!s) return 0;
        if (s.getUpgrade('automover-smarter-borderline-speed') >= 1) return 5;
        if (s.getUpgrade('automover-smarter-borderline') >= 1) return 4;
        if (s.getUpgrade('automover-smarter') >= 1) return 3;
        if (s.getUpgrade('automover-smart') >= 1) return 2;
        if (s.getUpgrade('automover-random') >= 1) return 1;
        return 0;
    }

    // BotHost-API: effektives Schrittintervall, durch 'player-speed' je Stufe um 10% verkürzt.
    botStepIntervalMs(): number {
        const level = this.save?.getUpgrade('player-speed') ?? 0;
        return Consts.botStepIntervalMs * Math.pow(Consts.botStepSpeedupPerLevel, level);
    }

    private isAutoMoverAvailable(): boolean {
        return this.modeStrategy.id === 'idle' && this.autoMoverTier() >= 1;
    }

    constructor(canvas: HTMLCanvasElement, opts?: GameOptions) {
        this.bgCanvas = canvas;
        this.cache = opts?.cache ?? null;
        this.save = opts?.save ?? null;
        this.modeStrategy = buildModeStrategy(opts?.mode ?? 'idle');
        this.onExit = opts?.onExit ?? null;
        this.replayMode = typeof opts?.replayLevel === 'number';
        this.bot = new Bot(this);

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
        // Shop nur im Idle-Modus; im Endless gibt es keine Coin-Oekonomie.
        const shopParent = this.bgCanvas.parentElement;
        this.shop = (this.modeStrategy.id === 'idle' && shopParent)
            ? new ShopView(shopParent, this)
            : null;

        // Replay: explizit angefordertes Level; sonst zuletzt erreichtes Level aus dem Save.
        if (typeof opts?.replayLevel === 'number' && opts.replayLevel >= 0) {
            this.level = opts.replayLevel >>> 0;
        } else {
            this.level = this.save ? this.save.getLevel() : 0;
        }

        // Zuerst Viewgröße initialisieren, damit Autofit korrekte Maße erhält
        this.onResize();

        this.initLevel();

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
        if (this.rafId != null || this.disposed) return;
        const loop = () => {
            // Guard: dispose() während eines vorherigen Frames könnte angefordert worden sein
            if (this.disposed) { this.rafId = null; return; }
            this.update();
            // update() kann via ESC -> onExit -> dispose() den Game bereits abgeräumt haben
            if (this.disposed) { this.rafId = null; return; }
            if (this.needsRender) {
                this.render();
                this.needsRender = false;
            }
            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
        // Hintergrund-Ticker: treibt die Simulation (ohne Render) weiter, solange der Tab
        // versteckt ist - dann pausiert requestAnimationFrame komplett. Browser drosseln solche
        // Timer auf >= 1s, was hier genügt (der Bot-Catch-up sammelt verpasste Schritte pro Tick).
        if (this.bgTickId == null) {
            this.bgTickId = setInterval(() => {
                if (this.disposed || !document.hidden) return;
                this.tickHidden();
            }, Consts.idleBackgroundTickMs);
        }
    }

    stop() {
        if (this.rafId != null) cancelAnimationFrame(this.rafId);
        this.rafId = null;
        if (this.bgTickId != null) clearInterval(this.bgTickId);
        this.bgTickId = null;
    }

    // Alle Ressourcen und DOM-Bindings sauber abräumen. Idempotent.
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        // Endless: ungesicherte history-Änderungen noch fest persistieren
        this.persistHistoryNow();
        this.stop();
        window.removeEventListener('resize', this.onResize);
        this.bgCanvas.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);
        this.bgCanvas.removeEventListener('wheel', this.onWheel);
        this.input.dispose();
        // FG-Canvas wurde im Constructor selbst angelegt -> wieder entfernen
        if (this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
        this.shop?.dispose();
    }

    private update() {
        // ESC -> offenen Shop schließen, sonst zurück zum Hauptmenü
        if (this.input.consumeKey('Escape')) {
            if (this.shop?.isOpen()) {
                this.shop.close();
            } else {
                this.onExit?.();
                return;
            }
        }

        const shopOpen = this.shop?.isOpen() ?? false;

        // Solange der Shop offen ist - und einmal im Frame nach dem Schließen - gepufferte
        // Tastendruck-Flanken verwerfen, damit währenddessen gedrückte Tasten (Space, WASD, ...)
        // nicht beim Schließen nachträglich ausgeführt werden.
        if (shopOpen || this.shopOpenLastFrame) {
            this.input.clearEdges();
        }
        this.shopOpenLastFrame = shopOpen;

        // Bei offenem Shop pausiert nur die Spieler-Eingabe; die Simulation (Bot, Level-Solve,
        // Coins) und das Rendering laufen im Hintergrund weiter.
        if (!shopOpen) {
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

            // Leertaste: im Endless setzt sie einen Marker, im Idle toggelt sie den AutoMover-Bot.
            if (this.input.consumeKey(' ', 'Space')) {
                if (this.modeStrategy.id === 'idle') {
                    if (this.isAutoMoverAvailable()) {
                        this.botActive = !this.botActive;
                        if (this.botActive) this.bot.onActivated();
                        this.updateHud();
                    }
                    // Ohne gekauften Bot bleibt Space im Idle wirkungslos (keine Marker).
                } else {
                    this.updatePlayer('M');
                }
            }

            // Undo: Backspace/Delete -> genau einen Schritt zurück (Autorepeat durch Keydown-Repeat)
            let manualMove = false;
            if (this.input.consumeKey('Backspace', 'Delete')) {
                this.updatePlayer('B');
                manualMove = true;
            } else {
                // Diskretes Vorwärts-Stepping: pro Tastendruck 1 Knoten (2 Tiles)
                const stepKey = this.input.consumeStepKey();
                if (stepKey) {
                    this.updatePlayer(stepKey);
                    manualMove = true;
                }
            }
            // Manueller Eingriff bei aktivem Bot: nächsten Bot-Schritt um ein Intervall verschieben.
            if (manualMove && this.botActive) this.bot.deferNextStep();

            // Sofort auf Spieler zentrieren (Enter/NumpadEnter)
            if (this.input.consumeKey('Enter', 'NumpadEnter', 'Return')) {
                this.camera.centerOnPlayerTile(this.player.x, this.player.y);
                this.followPaused = false;
                this.needsRender = true;
            }

            // Reset: aktuelles Level neu starten. Kein Hard-Reset mehr per Taste (geht nur über Hauptmenü).
            if (this.input.consumeKey('r', 'R')) {
                const atStart = this.player.x === 1 && this.player.y === 1;
                if (!atStart && confirm('Level zurücksetzen und zum Start zurückkehren?')) {
                    // Endless: gespeicherten Verlauf für dieses Level verwerfen
                    if (this.modeStrategy.usesHistory()) this.save?.setHistory(this.level, '');
                    this.initLevel();
                }
            }

            if (this.input.consumeKey('g', 'G')) {
                this.showGrid = !this.showGrid;
                this.levelView.setShowGrid(this.showGrid);
                this.needsRender = true;
            }
        }

        // AutoMover läuft unabhängig von der Eingabe weiter - auch bei offenem Shop.
        this.bot.tick();

        // Kamera-Follow mit Dead-Zone (bei Drag pausieren)
        if (!this.dragging && !this.followPaused) {
            if (this.camera.updateFollowPlayerTile(this.player.x, this.player.y)) this.needsRender = true;
        }

        this.handleSolveAndPersist();
    }

    /**
     * Bot-Tick + Solve/Persist ohne Eingabe/Render. Wird vom Hintergrund-Ticker aufgerufen,
     * solange der Tab versteckt ist (requestAnimationFrame pausiert dann). Verhalten wie im
     * sichtbaren Frame: pro Tick wird das aktuelle Level fertig gelöst und das nächste begonnen
     * (kein Mehr-Level-Sprung), der Bot sammelt dabei verpasste Schritte (Catch-up) auf.
     */
    private tickHidden() {
        this.bot.tick();
        this.handleSolveAndPersist();
    }

    /** Bei erreichtem Ziel Level-Aufstieg/Reward, sonst gedrosselte historyRaw-Persistenz. */
    private handleSolveAndPersist() {
        // Ziel erreicht?
        if (this.player.x === this.goal.x && this.player.y === this.goal.y) {
            this.modeStrategy.onLevelSolved(this);
            if (this.replayMode) {
                // Replay: zurück zum zuletzt erreichten/höchsten Level.
                // Save bleibt unverändert (kein Aufstieg), nur historyRaw/Best wurden aktualisiert.
                this.replayMode = false;
                const current = this.save?.getLevel() ?? this.level;
                this.level = Math.max(current, this.level);
            } else {
                this.level = this.modeStrategy.computeNextLevel(this.level);
                this.save?.setLevel(this.level);
            }
            this.initLevel();
        } else if (this.modeStrategy.usesHistory()) {
            // Throttled historyRaw-Persistenz (max 1x pro Sekunde)
            const now = performance.now();
            if (now - this.lastHistorySaveAt >= 1000) {
                this.persistHistoryNow();
                this.lastHistorySaveAt = now;
            }
        }
    }

    private persistHistoryNow() {
        if (!this.modeStrategy.usesHistory() || !this.save) return;
        this.save.setHistory(this.level, this.historyRaw.toString());
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
        let coins: bigint | undefined;
        let coinsPending: bigint | undefined;
        let spaceAction: 'mark' | 'available' | 'active' | undefined;
        if (this.modeStrategy.id === 'idle') {
            coins = this.save?.getCoins() ?? 0n;
            const clears = this.save?.getLevelClears(this.level) ?? 0;
            coinsPending = calculateLevelReward(this.level, clears + 1);
            if (this.isAutoMoverAvailable()) {
                spaceAction = this.botActive ? 'active' : 'available';
            }
        } else {
            spaceAction = 'mark';
        }
        this.hud.set({
            level: this.level + 1,
            pixW: this.laby.pixWidth,
            pixH: this.laby.pixHeight,
            moves: this.moves,
            totalMoves: this.totalMoves,
            coins,
            coinsPending,
            spaceAction,
        });
        // Shop-Button erst ab Level 5 (intern 0-basiert: level >= 4) einblenden;
        // bei offenem Shop den dargestellten Coin-Stand und Verfügbarkeiten aktualisieren.
        if (this.shop) {
            this.shop.setEnabled(this.level >= 4);
            if (this.shop.isOpen()) this.shop.refresh();
        }
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
        return new Laby(w, h, Consts.labySeedBase + w + h + gameLevel, this.cache);
    }

    canStepTo(cx: number, cy: number, nx: number, ny: number): boolean {
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

    private initLevel() {
        this.laby = this.createLabyForLevel(this.level);

        this.moves = 0;
        this.totalMoves = 0;
        this.history = new StringBuilder();
        this.historyRaw = new StringBuilder();
        this.lastHistorySaveAt = 0;
        this.player.x = 1;
        this.player.y = 1;
        this.goal.x = Math.max(1, this.laby.pixWidth - 2);
        this.goal.y = Math.max(1, this.laby.pixHeight - 2);
        this.markers.clear();
        this.levelView.setLaby(this.laby);
        // Bot-RNG levelabhängig seeden: gleiches Level/Reset -> gleiche Zufallsfolge (fair, reproduzierbar).
        this.bot.resetForLevel(Consts.labySeedBase + this.level);

        // Camera: Weltmaße setzen, Best-Fit und zentrieren
        this.camera.setWorldSize(this.laby.pixWidth, this.laby.pixHeight);
        this.camera.setBestFitZoom();
        this.camera.centerOnPlayerTile(this.player.x, this.player.y);
        this.followPaused = false;
        this.needsRender = true;

        // Endless / History-Modi: gespeicherten Verlauf einspielen
        this.replayHistoryIfAny();
    }

    // Spielt einen gespeicherten historyRaw (Endless) Zeichen für Zeichen ab,
    // sodass der Spielzustand exakt wie vor dem letzten Speichern aussieht.
    private replayHistoryIfAny() {
        if (!this.modeStrategy.usesHistory() || !this.save) return;
        const raw = this.save.getHistory(this.level);
        if (!raw) return;
        this.replaying = true;
        try {
            for (let i = 0; i < raw.length; i++) {
                const c = raw.charAt(i);
                if (c === 'L' || c === 'R' || c === 'U' || c === 'D' || c === 'B' || c === 'M') {
                    this.updatePlayer(c);
                }
            }
        } finally {
            this.replaying = false;
        }
        // Nach Replay HistoryRaw mit dem geladenen Stand synchronisieren
        this.historyRaw = new StringBuilder();
        this.historyRaw.append(raw);
        this.camera.centerOnPlayerTile(this.player.x, this.player.y);
        this.followPaused = false;
        this.needsRender = true;
    }

    // Verarbeitet Spieler-relevante Eingaben (Rohcodes):
    // 'L','R','U','D' = Bewegungen; 'B' = Backspace/Undo; 'M' = Marker toggle
    updatePlayer(inputKey: 'L' | 'R' | 'U' | 'D' | 'B' | 'M') {
        this.followPaused = false;
        if (inputKey === 'M') {
            // Marker-Toggle zählt bewusst NICHT als Zug (weder moves noch totalMoves).
            this.toggleMarkerAt(this.player.x, this.player.y);
            this.recordRawInput('M');
            return;
        }

        if (inputKey === 'B') {
            if (this.history.length() === 0) return;
            const last = this.history.lastChar();
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
            this.totalMoves++;
            this.recordRawInput('B');
            this.autoClearMarkerAt(this.player.x, this.player.y);
            this.needsRender = true;
            this.history.removeLastChar();
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

        const last = this.history.lastChar();
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
            this.history.removeLastChar();
            this.moves = Math.max(0, this.moves - 1);
            this.totalMoves++;
        } else {
            this.levelView.markCell(nx - cx, ny - cy, 'trail');
            this.levelView.markCell(nx, ny, 'trail');
            this.history.append(inputKey);
            this.moves += 1;
            this.totalMoves++;
            // Bot-Hook für Borderline-Filler (aktuell no-op)
            this.bot.onForwardStep(nx, ny);
        }
        this.recordRawInput(inputKey);
        this.autoClearMarkerAt(this.player.x, this.player.y);
        this.needsRender = true;
    }

    // Hängt einen Roh-Input an die historyRaw an (nur in Modi mit History-Persistierung).
    private recordRawInput(c: 'L' | 'R' | 'U' | 'D' | 'B' | 'M') {
        if (this.replaying) return;
        if (!this.modeStrategy.usesHistory()) return;
        this.historyRaw.append(c);
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

}
