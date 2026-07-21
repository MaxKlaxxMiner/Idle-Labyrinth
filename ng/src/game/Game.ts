import { LabyCache } from "@/lib/LabyCache";
import { GameSave } from "@/lib/GameSave";
import { GameModeStrategy, ModeHost } from "@/game/modes/GameMode";
import { EndlessMode } from "@/game/modes/EndlessMode";
import { EnduranceMode } from "@/game/modes/EnduranceMode";
import { IdleMode } from "@/game/modes/IdleMode";
import { Bot, BotHost } from "@/game/Bot";
import { ShopHost, ShopView } from "@/idle/ShopView";
import { HUDView } from "@/ui/HUDView";
import { Laby } from "@/lib/Laby";
import { LabyPrefetch } from "@/lib/LabyPrefetch";
import { labyParamsForLevel } from "@/game/LabyParams";
import { Level } from "@/view/Level";
import { Camera } from "@/view/Camera";
import { Input } from "@/input/Input";
import { StringBuilder } from "@/lib/StringBuilder";
import { UpgradeId } from "@/idle/Upgrades";
import { Consts } from "@/game/Consts";
import { calculateLevelReward } from "@/idle/Coins";

export type GameMode = 'idle' | 'endless' | 'endurance';

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
	if (mode === 'endless') return new EndlessMode();
	if (mode === 'endurance') return new EnduranceMode();
	return new IdleMode();
}

type MoveDir = 'L' | 'R' | 'U' | 'D';

// Gegenrichtung einer Bewegung (zum Abwickeln beim echten Undo).
function oppositeDir(d: MoveDir): MoveDir {
	if (d === 'L') return 'R';
	if (d === 'R') return 'L';
	if (d === 'U') return 'D';
	return 'U';
}

// Zellen-Delta einer Richtung (halbe Schrittweite, ein Schritt geht 2 Zellen weit).
function dirDelta(d: MoveDir): { dx: number; dy: number } {
	if (d === 'L') return { dx: -1, dy: 0 };
	if (d === 'R') return { dx: 1, dy: 0 };
	if (d === 'U') return { dx: 0, dy: -1 };
	return { dx: 0, dy: 1 };
}

export class Game implements BotHost, ModeHost, ShopHost {
	private readonly bgCanvas: HTMLCanvasElement;
	private readonly canvas: HTMLCanvasElement;
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
	readonly player = { x: 1, y: 1, r: 0.35 };
	readonly goal = { x: 0, y: 0 };
	moves = 0;       // "echte" Pfadlänge: zählt bei Undo wieder runter
	totalMoves = 0;  // Gesamtschritte inkl. Rückwärts (ohne Marker); nur echtes Undo (Entf) zählt runter
	// Undo-Punktekonto (Endless/Endurance): alle Consts.endlessUndoPointEverySteps Vorwärtsschritte
	// gibt es einen Punkt; Entf verbraucht pro echtem Rückgängig-Schritt einen Punkt.
	// Der Stand wird mit der History persistiert (aus der gekürzten Spur nicht rekonstruierbar).
	undoPoints = 0;
	private forwardSteps = 0;
	history = new StringBuilder();
	// Vollständige Bewegungsspur, nur in History-Modi (Endless/Endurance) geführt (persistiert pro Level).
	// Großbuchstaben L/R/U/D = Vorwärtsschritt, Kleinbuchstaben l/r/u/d = Rückschritt, der den
	// Vorwärtsschritt des großen Pendants zurücknahm (Backspace oder Gegenrichtung gelaufen).
	// Jedes Zeichen ist damit lokal invertierbar; das echte Undo (Entf) kürzt die Spur einfach
	// um ihr letztes Zeichen. Marker liegen bewusst nicht in der Spur (eigene Koordinatenliste).
	private historyRaw = new StringBuilder();
	private replaying = false;                  // aktiv während des Replays beim Level-Start (keine Persistierung)
	private lastHistorySaveAt = 0;              // Throttle-Zeitstempel für historyRaw-Persistenz
	// Rote Marker (per Space an der Spielerposition getoggelt); persistiert als Koordinatenliste
	// (GameSave.setRedMarkers), nicht in der Bewegungsspur (siehe historyRaw-Kommentar).
	private markers = new Set<number>();
	// Frei per Rechtsklick gesetzte Marker (Endless/Endurance): an beliebigen Zellen, auch auf
	// Wänden; persistiert als Koordinatenliste (GameSave.setGreenMarkers).
	private greenMarkers = new Set<number>();

	// Mouse-drag Panning (temporär, Kamera folgt erst nach Bewegung wieder)
	private dragging = false;
	private dragStartX = 0;
	private dragStartY = 0;
	private dragStartCamX = 0;
	private dragStartCamY = 0;
	private dragMoved = false;
	private followPaused = false;

	private readonly cache: LabyCache | null;
	private readonly prefetch: LabyPrefetch | null;
	readonly save: GameSave | null;
	private readonly modeStrategy!: GameModeStrategy;
	private readonly onExit: (() => void) | null;
	private replayMode = false;
	// Async-Levelwechsel: solange ein Worker das Laby liefert, pausiert die Simulation.
	private hasLevel = false;
	private levelLoading = false;
	private initLevelToken = 0;
	private labyLevel = -1;
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
		// Prefetch nur im Idle-Modus (Level werden dort teils sehr schnell durchgespielt).
		// Endless springt entlang Consts.largeLevels (Vorab-Generierung riesiger Labyrinthe
		// würde Worker und Speicher blockieren), Endurance wird von Hand gespielt - beiden
		// genügt die Generierung beim Levelwechsel.
		this.prefetch = this.modeStrategy.usesPrefetch()
			? new LabyPrefetch(Consts.labyPrefetchDepth, Consts.labyPrefetchMaxWorkers)
			: null;
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
		this.onContextMenu = this.onContextMenu.bind(this);
		window.addEventListener('resize', this.onResize);
		// Maus-Eingaben auf dem BG-Canvas abgreifen (FG hat pointer-events: none)
		this.bgCanvas.addEventListener('mousedown', this.onMouseDown);
		window.addEventListener('mousemove', this.onMouseMove);
		window.addEventListener('mouseup', this.onMouseUp);
		this.bgCanvas.addEventListener('wheel', this.onWheel, { passive: false });
		// Rechtsklick: grünen Marker setzen/entfernen (Endless); unterdrückt das Browser-Kontextmenü.
		this.bgCanvas.addEventListener('contextmenu', this.onContextMenu);
	}

	start() {
		if (this.rafId != null || this.disposed) return;
		const loop = () => {
			// Guard: dispose() während eines vorherigen Frames könnte angefordert worden sein
			if (this.disposed) {
				this.rafId = null;
				return;
			}
			this.update();
			// update() kann via ESC -> onExit -> dispose() den Game bereits abgeräumt haben
			if (this.disposed) {
				this.rafId = null;
				return;
			}
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
		// History-Modi: ungesicherte history-Änderungen noch fest persistieren
		this.persistHistoryNow();
		this.stop();
		window.removeEventListener('resize', this.onResize);
		this.bgCanvas.removeEventListener('mousedown', this.onMouseDown);
		window.removeEventListener('mousemove', this.onMouseMove);
		window.removeEventListener('mouseup', this.onMouseUp);
		this.bgCanvas.removeEventListener('wheel', this.onWheel);
		this.bgCanvas.removeEventListener('contextmenu', this.onContextMenu);
		this.input.dispose();
		// FG-Canvas wurde im Constructor selbst angelegt -> wieder entfernen
		if (this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
		this.shop?.dispose();
		// Laufende Worker-Generierungen beenden (eine Generierung ist nicht unterbrechbar)
		this.prefetch?.dispose();
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
		// Während eines asynchronen Levelwechsels (levelLoading) pausiert die Spielsteuerung ebenfalls.
		if (!shopOpen && !this.levelLoading) {
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

			// Undo: Backspace -> ein Schritt zurück (zählt als Zug); Entf in History-Modi
			// (Endless/Endurance) -> echtes Rückgängig gegen Undo-Punkte. Im Idle wirkt Entf
			// wie Backspace.
			let manualMove = false;
			if (this.input.consumeKey('Backspace')) {
				this.updatePlayer('B');
				manualMove = true;
			} else if (this.input.consumeKey('Delete')) {
				this.updatePlayer(this.modeStrategy.usesHistory() ? 'X' : 'B');
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
					// History-Modi: gespeicherten Verlauf und Marker für dieses Level verwerfen
					if (this.modeStrategy.usesHistory()) {
						this.save?.setHistory(this.level, '', 0);
						this.save?.setRedMarkers(this.level, []);
						this.save?.setGreenMarkers(this.level, []);
					}
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
		// Während eines asynchronen Levelwechsels ruht die Simulation; der Bot-Takt beginnt im neuen Level frisch.
		if (!this.levelLoading) this.bot.tick();

		// Kamera-Follow mit Dead-Zone (bei Drag pausieren)
		if (!this.dragging && !this.followPaused) {
			if (this.camera.updateFollowPlayerTile(this.player.x, this.player.y)) this.needsRender = true;
		}

		if (!this.levelLoading) this.handleSolveAndPersist();
	}

	/**
	 * Bot-Tick + Solve/Persist ohne Eingabe/Render. Wird vom Hintergrund-Ticker aufgerufen,
	 * solange der Tab versteckt ist (requestAnimationFrame pausiert dann). Verhalten wie im
	 * sichtbaren Frame: pro Tick wird das aktuelle Level fertig gelöst und das nächste begonnen
	 * (kein Mehr-Level-Sprung), der Bot sammelt dabei verpasste Schritte (Catch-up) auf.
	 */
	private tickHidden() {
		if (this.levelLoading) return;
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
		// Während eines asynchronen Levelwechsels gehört historyRaw noch zum alten Level - nicht unter dem neuen Key speichern (die getrimmte Spur hat onLevelSolved bereits persistiert).
		if (this.levelLoading) return;
		if (!this.modeStrategy.usesHistory() || !this.save) return;
		this.save.setHistory(this.level, this.historyRaw.toString(), this.undoPoints);
	}

	private render() {
		const w = this.bgCanvas.width;
		const h = this.bgCanvas.height;
		this.ctx.clearRect(0, 0, w, h);

		const { ox, oy, tileSize: size } = this.camera.getOffsets();

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

		// Grüne Marker zeichnen (frei per Rechtsklick gesetzt, auch auf Wänden)
		this.ctx.fillStyle = Consts.colors.markerGreen;
		for (const key of this.greenMarkers) {
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
		// Während eines asynchronen Levelwechsels zeigt das HUD weiter das sichtbare (alte) Level, this.level ist dann bereits das kommende.
		const displayLevel = this.levelLoading ? this.labyLevel : this.level;
		let coins: bigint | undefined;
		let coinsPending: bigint | undefined;
		let spaceAction: 'mark' | 'available' | 'active' | undefined;
		let undoPoints: number | undefined;
		if (this.modeStrategy.id === 'idle') {
			coins = this.save?.getCoins() ?? 0n;
			const clears = this.save?.getLevelClears(displayLevel) ?? 0;
			coinsPending = calculateLevelReward(displayLevel, clears + 1);
			if (this.isAutoMoverAvailable()) {
				spaceAction = this.botActive ? 'active' : 'available';
			}
		} else {
			spaceAction = 'mark';
			undoPoints = this.undoPoints;
		}
		this.hud.set({
			level: displayLevel + 1,
			pixW: this.laby.pixWidth,
			pixH: this.laby.pixHeight,
			moves: this.moves,
			totalMoves: this.totalMoves,
			undoPoints,
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
		const { ox, oy, tileSize } = this.camera.getOffsets();
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

	// Rechtsklick: grünen Marker an der geklickten Zelle setzen/entfernen.
	// preventDefault unterdrückt das Browser-Kontextmenü über dem Spielfeld in jedem Modus;
	// gesetzt werden grüne Marker aber nur in History-Modi (Endless/Endurance,
	// Persistierung pro Level).
	private onContextMenu(e: MouseEvent) {
		e.preventDefault();
		if (!this.modeStrategy.usesHistory()) return;
		// Während eines asynchronen Levelwechsels gehört this.level schon zum neuen Level,
		// die sichtbare Geometrie aber noch zum alten -> keine Marker setzen.
		if (this.levelLoading || !this.hasLevel) return;
		const rect = this.bgCanvas.getBoundingClientRect();
		const dpr = Math.min(Consts.display.dprMax, window.devicePixelRatio || 1);
		const canvasX = (e.clientX - rect.left) * dpr;
		const canvasY = (e.clientY - rect.top) * dpr;
		const { ox, oy, tileSize } = this.camera.getOffsets();
		if (tileSize <= 0) return;
		const tileX = Math.floor((canvasX - ox) / tileSize);
		const tileY = Math.floor((canvasY - oy) / tileSize);
		// Nur innerhalb des Labyrinths; Wege wie Wände sind erlaubt.
		if (tileX < 0 || tileY < 0 || tileX >= this.laby.pixWidth || tileY >= this.laby.pixHeight) return;
		this.toggleGreenMarkerAt(tileX, tileY);
	}

	/** Stößt die Vorab-Generierung der nächsten Consts.labyPrefetchDepth Level in Workern an. */
	private prefetchUpcomingLevels() {
		// Kein Prefetch-Pool (Endless-Modus) -> nichts vorzubereiten.
		const prefetch = this.prefetch;
		if (!prefetch) return;
		// Replay springt nach dem Lösen zum gespeicherten Level zurück - die Folge-Level
		// aus computeNextLevel wären hier falsch.
		if (this.replayMode) return;
		let next = this.level;
		for (let i = 0; i < Consts.labyPrefetchDepth; i++) {
			next = this.modeStrategy.computeNextLevel(next);
			const p = labyParamsForLevel(next);
			prefetch.request(next, p.width, p.height, p.seed);
		}
	}

	canStepTo(cx: number, cy: number, nx: number, ny: number): boolean {
		if (nx < 1 || ny < 1 || nx >= this.laby.pixWidth - 1 || ny >= this.laby.pixHeight - 1) return false;
		const dx = nx - cx, dy = ny - cy;
		if (!((Math.abs(dx) === 2 && dy === 0) || (Math.abs(dy) === 2 && dx === 0))) return false;
		const mx = cx + Math.sign(dx);
		const my = cy + Math.sign(dy);
		return this.laby.isFree(mx, my);
	}

	private applyBacktrackHighlight(x: number, y: number, dx: number, dy: number, mode: 'backtrack' | 'deadend' | 'clear') {
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
		this.initLevelToken++;
		// Überholte Worker-Arbeit verwerfen (im Replay liegen eingereihte Level bewusst höher)
		// Ohne Prefetch-Pool (Endless) ist nichts zu verwerfen.
		if (!this.replayMode) this.prefetch?.discardBelow(this.level);

		// Erneuter Start desselben Levels (R-Reset, Replay-Rücksprung): Laby ist deterministisch, die vorhandene Instanz kann direkt wiederverwendet werden.
		if (this.hasLevel && this.labyLevel === this.level) {
			this.finishInitLevel(this.laby);
			return;
		}

		const p = labyParamsForLevel(this.level);
		const buffered = this.prefetch?.take(this.level) ?? null;
		if (buffered) {
			this.prefetchUpcomingLevels();
			this.finishInitLevel(new Laby(p.width, p.height, p.seed, this.cache, buffered));
			return;
		}

		// Kaltstart (noch kein Laby vorhanden): synchron generieren, damit Loop und HUD sofort ein Level haben; die Worker füllen den Puffer parallel.
		if (!this.hasLevel) {
			this.prefetchUpcomingLevels();
			this.finishInitLevel(new Laby(p.width, p.height, p.seed, this.cache));
			return;
		}

		// Auf die (meist schon laufende) Worker-Generierung warten statt doppelt zu rechnen.
		// Die Simulation pausiert derweil (levelLoading); der Bot-Takt beginnt im neuen Level frisch.
		// Ohne Worker bzw. ohne Prefetch-Pool (Endless) liefert acquire() null -> synchroner Pfad.
		const wait = this.prefetch?.acquire(this.level, p.width, p.height, p.seed) ?? null;
		if (!wait) {
			this.prefetchUpcomingLevels();
			this.finishInitLevel(new Laby(p.width, p.height, p.seed, this.cache));
			return;
		}
		this.prefetchUpcomingLevels();
		this.levelLoading = true;
		console.log(`Laby: wait (worker)`);
		const token = this.initLevelToken;
		void wait.then((bits) => {
			if (this.disposed || token !== this.initLevelToken) return;
			// bits = null bedeutet Worker-Fehler; der Laby-Konstruktor generiert dann selbst.
			this.finishInitLevel(new Laby(p.width, p.height, p.seed, this.cache, bits));
		});
	}

	private finishInitLevel(laby: Laby) {
		this.levelLoading = false;
		// Während der Wartezeit gepufferte Tastendruck-Flanken verwerfen, damit sie nicht ins frische Level feuern.
		this.input.clearEdges();
		this.laby = laby;
		this.labyLevel = this.level;
		this.hasLevel = true;

		this.moves = 0;
		this.totalMoves = 0;
		this.undoPoints = 0;
		this.forwardSteps = 0;
		this.history = new StringBuilder();
		this.historyRaw = new StringBuilder();
		this.lastHistorySaveAt = 0;
		this.player.x = 1;
		this.player.y = 1;
		this.goal.x = Math.max(1, this.laby.pixWidth - 2);
		this.goal.y = Math.max(1, this.laby.pixHeight - 2);
		this.markers.clear();
		// Grüne Marker des Levels aus dem Save übernehmen (rote ergeben sich aus dem History-Replay).
		this.greenMarkers.clear();
		if (this.modeStrategy.usesHistory() && this.save) {
			for (const k of this.save.getGreenMarkers(this.level)) this.greenMarkers.add(k);
		}
		this.levelView.setLaby(this.laby);
		// Bot-RNG levelabhängig seeden: gleiches Level/Reset -> gleiche Zufallsfolge (fair, reproduzierbar).
		this.bot.resetForLevel(Consts.labySeedBase + this.level);

		// Camera: Weltmaße setzen, Best-Fit und zentrieren. Beim Levelwechsel eine bereits weiter
		// herausgezoomte Stufe des Vorlevels beibehalten (statt wieder auf minStartTileSize hineinzuspringen).
		this.camera.setWorldSize(this.laby.pixWidth, this.laby.pixHeight);
		this.camera.setBestFitZoom(true);
		this.camera.centerOnPlayerTile(this.player.x, this.player.y);
		this.followPaused = false;
		this.needsRender = true;

		// Endless / History-Modi: gespeicherten Verlauf einspielen
		this.replayHistoryIfAny();
		// Rote Marker erst nach dem Replay laden: gespeichert ist ihr Endzustand; würden sie
		// vorher geladen, räumte das abgespielte Betreten der Zellen sie fälschlich wieder ab.
		if (this.modeStrategy.usesHistory() && this.save) {
			for (const k of this.save.getRedMarkers(this.level)) this.markers.add(k);
		}
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
				if (c === 'L' || c === 'R' || c === 'U' || c === 'D'
					|| c === 'l' || c === 'r' || c === 'u' || c === 'd') {
					this.updatePlayer(c);
				}
			}
		} finally {
			this.replaying = false;
		}
		// Nach Replay HistoryRaw mit dem geladenen Stand synchronisieren; der Undo-Punktestand
		// kommt aus dem Save (das Abspielen vergibt Punkte, kennt aber die verbrauchten nicht).
		this.historyRaw = new StringBuilder();
		this.historyRaw.append(raw);
		this.undoPoints = this.save.getHistoryUndoPoints(this.level);
		this.camera.centerOnPlayerTile(this.player.x, this.player.y);
		this.followPaused = false;
		this.needsRender = true;
	}

	// Verarbeitet Spieler-relevante Eingaben:
	// 'L','R','U','D' = Bewegungen; 'B' = Backspace/Undo (letzter Pfadschritt);
	// 'l','r','u','d' = Rückschritt-Rohcodes aus der Spur (nur Replay);
	// 'X' = Entf/echtes Undo (Endless, kürzt die Spur); 'M' = Marker toggle
	updatePlayer(inputKey: 'L' | 'R' | 'U' | 'D' | 'B' | 'X' | 'M' | 'l' | 'r' | 'u' | 'd') {
		this.followPaused = false;
		if (inputKey === 'M') {
			// Marker-Toggle zählt bewusst NICHT als Zug (weder moves noch totalMoves).
			this.toggleMarkerAt(this.player.x, this.player.y);
			return;
		}

		if (inputKey === 'X') {
			// Echtes Rückgängig (Endless): macht die letzte Bewegung ungeschehen - einen
			// Vorwärtsschritt ebenso wie einen Rückschritt (Backspace/Gegenrichtung); Marker
			// sind ausgenommen. Kostet einen Undo-Punkt; ohne Punkte keine Reaktion.
			// Statt eines eigenen Spur-Zeichens wird die Spur um ihr letztes Zeichen gekürzt.
			if (this.undoPoints <= 0) return;
			if (this.historyRaw.length() === 0) return;
			const z = this.historyRaw.lastChar();
			const upper = z.toUpperCase() as MoveDir;
			const wasForward = z === upper;
			// Vorwärtsschritt -> zurücklaufen; Rückschritt -> wieder vorlaufen.
			const moveDir = wasForward ? oppositeDir(upper) : upper;
			const { dx, dy } = dirDelta(moveDir);
			const prevX = this.player.x;
			const prevY = this.player.y;
			const nx = prevX + dx * 2;
			const ny = prevY + dy * 2;
			if (!this.canStepTo(prevX, prevY, nx, ny)) return;
			this.historyRaw.removeLastChar();
			this.undoPoints--;
			this.totalMoves = Math.max(0, this.totalMoves - 1);
			if (wasForward) {
				// Gelegten Vorwärtsschritt austragen: Trail-Zellen zurück auf Grundfarbe.
				this.applyBacktrackHighlight(prevX, prevY, dx, dy, 'clear');
				this.moves = Math.max(0, this.moves - 1);
				this.forwardSteps = Math.max(0, this.forwardSteps - 1);
				this.history.removeLastChar();
				this.bot.onBacktrack(nx, ny);
			} else {
				// Rückschritt austragen: wieder vorgehen, der Weg zählt erneut zum aktiven Pfad.
				this.levelView.markCell(prevX + dx, prevY + dy, 'trail');
				this.levelView.markCell(nx, ny, 'trail');
				this.moves += 1;
				this.history.append(upper);
				this.bot.onForwardStep(nx, ny);
			}
			this.player.x = nx;
			this.player.y = ny;
			this.autoClearMarkerAt(nx, ny);
			this.needsRender = true;
			return;
		}

		if (inputKey === 'B' || inputKey === 'l' || inputKey === 'r' || inputKey === 'u' || inputKey === 'd') {
			if (this.history.length() === 0) return;
			// Zurückzunehmender Pfadschritt: bei 'B' der letzte, im Replay durch das Zeichen vorgegeben.
			const h = (inputKey === 'B' ? this.history.lastChar() : inputKey.toUpperCase()) as MoveDir;
			if (this.history.lastChar() !== h) return;
			// Der Rückschritt läuft entgegen dem Pfadschritt.
			const backDir = oppositeDir(h);
			const { dx, dy } = dirDelta(backDir);
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
			this.recordRawInput(h.toLowerCase() as 'l' | 'r' | 'u' | 'd');
			this.autoClearMarkerAt(this.player.x, this.player.y);
			this.needsRender = true;
			this.history.removeLastChar();
			this.bot.onBacktrack(this.player.x, this.player.y);
			return;
		}

		// Bewegungen
		const { dx, dy } = dirDelta(inputKey);

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
			this.bot.onBacktrack(this.player.x, this.player.y);
			this.moves = Math.max(0, this.moves - 1);
			this.totalMoves++;
			// In der Spur als Rückschritt des zurückgenommenen Pfadschritts kodieren.
			this.recordRawInput(oppositeDir(inputKey).toLowerCase() as 'l' | 'r' | 'u' | 'd');
		} else {
			this.levelView.markCell(nx - cx, ny - cy, 'trail');
			this.levelView.markCell(nx, ny, 'trail');
			this.history.append(inputKey);
			this.moves += 1;
			this.totalMoves++;
			this.recordRawInput(inputKey);
			// History-Modi (Endless/Endurance): gelegte Vorwärtsschritte füllen das Undo-Punktekonto;
			// das echte Undo (Entf) nimmt den Fortschritt wieder zurück, Backspace/Gegenrichtung
			// dagegen nicht.
			if (this.modeStrategy.usesHistory()) {
				this.forwardSteps++;
				if (this.forwardSteps % Consts.endlessUndoPointEverySteps === 0) this.undoPoints++;
			}
			// Bot-Hook für Borderline-Filler (markiert beim Erreichen des Rands ungültige Bereiche)
			this.bot.onForwardStep(nx, ny);
		}
		this.autoClearMarkerAt(this.player.x, this.player.y);
		this.needsRender = true;
	}

	// Hängt einen Roh-Input an die historyRaw an (nur in Modi mit History-Persistierung).
	private recordRawInput(c: 'L' | 'R' | 'U' | 'D' | 'l' | 'r' | 'u' | 'd') {
		if (this.replaying) return;
		if (!this.modeStrategy.usesHistory()) return;
		this.historyRaw.append(c);
	}

	private toggleMarkerAt(x: number, y: number) {
		const k = ((x & 0xffff) << 16) | (y & 0xffff);
		if (this.markers.has(k)) this.markers.delete(k); else this.markers.add(k);
		this.persistRedMarkers();
		this.needsRender = true;
	}

	private autoClearMarkerAt(x: number, y: number) {
		const k = ((x & 0xffff) << 16) | (y & 0xffff);
		if (this.markers.delete(k)) {
			this.persistRedMarkers();
			this.needsRender = true;
		}
	}

	// Rote Marker als Endzustand persistieren. Sie liegen nicht in der Bewegungsspur, weil das
	// echte Undo (Entf) die Spur kürzt und positionsgebundene 'M'-Zeichen dabei verrutschen würden.
	private persistRedMarkers() {
		if (this.replaying || this.levelLoading) return;
		if (!this.modeStrategy.usesHistory() || !this.save) return;
		this.save.setRedMarkers(this.level, Array.from(this.markers));
	}

	private toggleGreenMarkerAt(x: number, y: number) {
		const k = ((x & 0xffff) << 16) | (y & 0xffff);
		if (this.greenMarkers.has(k)) this.greenMarkers.delete(k); else this.greenMarkers.add(k);
		this.persistGreenMarkers();
		this.needsRender = true;
	}

	// Grüne Marker direkt persistieren (Rechtsklicks sind selten -> kein Throttling nötig).
	private persistGreenMarkers() {
		if (this.levelLoading) return;
		if (!this.modeStrategy.usesHistory() || !this.save) return;
		this.save.setGreenMarkers(this.level, Array.from(this.greenMarkers));
	}

}
