import {Laby} from '@/lib/Laby';
import {Level} from '@/view/Level';
import {Input} from '@/input/Input';
import {StringBuilder} from '@/lib/StringBuilder';
import {RandomMersenne} from '@/lib/Random';
import {Consts} from '@/game/Consts';

/**
 * Minimal-Schnittstelle, die der Bot vom Spiel braucht. Die Felder werden bei jedem
 * Zugriff frisch gelesen, weshalb das hostende Game-Objekt sie als public-Properties
 * exponiert (sie ändern sich bei Level-Wechsel, der Bot soll immer die aktuelle Ref sehen).
 */
export interface BotHost {
	readonly player: {x: number; y: number; r: number};
	readonly goal: {x: number; y: number};
	readonly laby: Laby;
	readonly history: StringBuilder;
	readonly levelView: Level;
	readonly input: Input;
	updatePlayer(c: 'L' | 'R' | 'U' | 'D' | 'B' | 'M'): void;
	canStepTo(cx: number, cy: number, nx: number, ny: number): boolean;
	/** Bot läuft nur, wenn der Host ihn aktiviert hat (Idle-Modus, Space-Toggle). */
	isBotActive(): boolean;
	/** Höchste gekaufte AutoMover-Stufe (1=random, 2=smart, 3=smarter, 4=borderline, 5=speed; 0=keine). */
	autoMoverTier(): number;
	/** Effektiver Mindestabstand zwischen zwei Bot-Schritten in ms (inkl. Speed-Upgrades). */
	botStepIntervalMs(): number;
}

/**
 * Bot-Logik (AutoMover + Highlight-Filler).
 *
 * Aktivierung steuert der Host (siehe `BotHost.isBotActive`). Im Idle-Modus
 * toggelt der Spieler mit Space; ist der Bot aktiv, wird im Takt von
 * `BotHost.botStepIntervalMs()` ein Random-Step ausgeführt (mit Catch-up bei
 * verpassten Frames).
 */
export class Bot {
	// Obergrenze der pro Frame nachgeholten Schritte - reiner Runaway-Schutz. Reale Rückstände
	// (auch in gedrosselten/ausgetabbten Tabs) liegen weit darunter; >1 Mio. Schritte/Sek sind machbar.
	private static readonly MAX_CATCHUP_STEPS = 1048576;

	private readonly host: BotHost;
	// Zeitpunkt (performance.now), an dem der nächste Schritt fällig ist.
	private nextStepTime = 0;
	// Deterministischer RNG; wird pro Level (Start/Reset) levelabhängig in-place neu geseedet.
	private readonly rng = new RandomMersenne(0);

	// Fill-Highlight-Skip-Schwelle: letzte Position, an der gefüllt wurde
	private lastFillX = 0;
	private lastFillY = 0;

	constructor(host: BotHost) {
		this.host = host;
	}

	/** Setzt den Bot-Zustand auf Level-Start zurück; seedt den RNG levelabhängig (reproduzierbar). */
	resetForLevel(seed: number): void {
		this.rng.init(seed);
		this.lastFillX = 0;
		this.lastFillY = 0;
		this.armTimer();
	}

	/** Beim Aktivieren (Space-Toggle) aufrufen, damit der erste Schritt nicht instant wirkt. */
	onActivated(): void {
		this.armTimer();
	}

	/**
	 * Nach manuellem Eingriff aufrufen: der nächste Bot-Schritt folgt erst nach einem Cooldown.
	 * Der Cooldown ist mindestens `Consts.botManualCooldownMs`, damit der Bot bei hohen
	 * Speed-Stufen (sehr kleines Intervall) nicht sofort wieder übernimmt und manuelles
	 * Steuern spielbar bleibt.
	 */
	deferNextStep(): void {
		const cooldown = Math.max(this.host.botStepIntervalMs(), Consts.botManualCooldownMs);
		this.nextStepTime = performance.now() + cooldown;
	}

	/** Setzt die nächste Schritt-Deadline ein Intervall in die Zukunft (kein Schritt-Stau). */
	private armTimer(): void {
		this.nextStepTime = performance.now() + this.host.botStepIntervalMs();
	}

	/** Pro Frame in Game.update() aufgerufen. Bewegt den Spieler im Bot-Takt, sofern aktiv. */
	tick(): void {
		if (!this.host.isBotActive()) return;
		const interval = this.host.botStepIntervalMs();
		const now = performance.now();
		if (now < this.nextStepTime) return;
		// Alle fälligen Schritte nachholen (Idle-Fortschritt im gedrosselten/ausgetabbten Tab bleibt
		// erhalten). Die Deadline rückt um genau die gelaufenen Schritte vor (kein Drift); ein etwaiger
		// Rest über dem Cap wird in den Folge-Frames abgearbeitet.
		const pending = 1 + Math.floor((now - this.nextStepTime) / interval);
		const steps = pending < Bot.MAX_CATCHUP_STEPS ? pending : Bot.MAX_CATCHUP_STEPS;
		this.nextStepTime += steps * interval;
		this.performRandomStep(steps);
	}

	/**
	 * Nach jedem erfolgreichen Forward-Schritt in Game.updatePlayer(). Aktuell deaktiviert.
	 * Argumente: neue Spielerposition (nx, ny) sowie Lab-Dimensionen via this.host.laby.
	 */
	onForwardStep(_nx: number, _ny: number): void {
		// const {laby} = this.host;
		// if (_ny === 1 || _nx === laby.pixWidth - 2) this.fillTR();
		// if (_nx === 1 || _ny === laby.pixHeight - 2) this.fillBL();
	}

	private performRandomStep(count = 1): void {
		const {player, goal} = this.host;
		for (let i = 0; i < count; i++) {
			const step = this.getRandomStepDirection();
			if (!step) return;
			this.host.updatePlayer(step);
			if (player.x === goal.x && player.y === goal.y) return;
		}
	}

	private getRandomStepDirection(): 'L' | 'R' | 'U' | 'D' | 'B' | null {
		const {player, goal, levelView, history} = this.host;
		const tier = this.host.autoMoverTier();
		const cx = player.x;
		const cy = player.y;
		const options: Array<{dir: 'L' | 'R' | 'U' | 'D'; dx: number; dy: number}> = [
			{dir: 'L', dx: -2, dy: 0},
			{dir: 'R', dx: 2, dy: 0},
			{dir: 'U', dx: 0, dy: -2},
			{dir: 'D', dx: 0, dy: 2},
		];
		const valid: Array<'L' | 'R' | 'U' | 'D'> = [];
		for (const option of options) {
			const nx = cx + option.dx;
			const ny = cy + option.dy;
			if (!this.host.canStepTo(cx, cy, nx, ny)) continue;
			// Ziel direkt nehmen, sobald es einen Schritt entfernt und offen ist (ab 'smart').
			if (tier >= 2 && nx === goal.x && ny === goal.y) return option.dir;
			const targetColor = levelView.getPixel(nx, ny);
			const isDeadend = targetColor === levelView.deadendColor32;
			const isTrail = targetColor === levelView.trailColor32;
			if (tier >= 2) {
				// Stufe 'smart': markierte Sackgassen und Trails strikt meiden.
				if (isDeadend || isTrail) continue;
			} else {
				// Stufe 'random': nur grobe Laufrichtung - Sackgassen zu 75%, Trails zu 50% meiden.
				if (isDeadend && this.rng.next() < 0.75) continue;
				if (isTrail && this.rng.next() < 0.5) continue;
			}
			valid.push(option.dir);
		}
		// Sind keine Richtungen übrig, per 'B' aus der Sackgasse zurücklaufen (alle Stufen).
		if (valid.length === 0) return history.length() > 0 ? 'B' : null;

		if (tier >= 3) {
			// Stufe 'smarter': Richtung priorisieren, die per Luftlinie näher zum Ziel führt.
			// Start liegt oben-links, Ziel unten-rechts, daher Vergleich der Differenzen ohne Betrag.
			if (goal.x - player.x >= goal.y - player.y) {
				for (let i = 0; i < valid.length; i++) if (valid[i] === 'R') return 'R';
				for (let i = 0; i < valid.length; i++) if (valid[i] === 'D') return 'D';
			} else {
				for (let i = 0; i < valid.length; i++) if (valid[i] === 'D') return 'D';
				for (let i = 0; i < valid.length; i++) if (valid[i] === 'R') return 'R';
			}
		}

		const index = Math.floor(this.rng.next() * valid.length);
		return valid[index];
	}

	// ----- Border-Filler: markiert Sackgassen entlang des bisherigen Pfades -----

	private fillBL(): void {
		const {player, history, levelView} = this.host;
		if (Math.abs(this.lastFillX - player.x) + Math.abs(this.lastFillY - player.y) < history.length() / 256) return;
		this.lastFillX = player.x;
		this.lastFillY = player.y;
		const moves = history.toString();
		let px = 1;
		let py = 1;
		let pix = 0 | 0;
		for (let i = 0; i < moves.length; i++) {
			switch (moves[i]) {
				case 'L':
					pix = levelView.getPixel(px, py - 1);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px, py - 1, levelView.deadendColor32);
						levelView.setPixel(px, py - 2, levelView.deadendColor32);
					}
					px -= 2;
					pix = levelView.getPixel(px, py - 1);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px, py - 1, levelView.deadendColor32);
						levelView.setPixel(px, py - 2, levelView.deadendColor32);
					}
					break;
				case 'R':
					pix = levelView.getPixel(px, py + 1);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px, py + 1, levelView.deadendColor32);
						levelView.setPixel(px, py + 2, levelView.deadendColor32);
					}
					px += 2;
					pix = levelView.getPixel(px, py + 1);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px, py + 1, levelView.deadendColor32);
						levelView.setPixel(px, py + 2, levelView.deadendColor32);
					}
					break;
				case 'U':
					pix = levelView.getPixel(px + 1, py);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px + 1, py, levelView.deadendColor32);
						levelView.setPixel(px + 2, py, levelView.deadendColor32);
					}
					py -= 2;
					pix = levelView.getPixel(px + 1, py);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px + 1, py, levelView.deadendColor32);
						levelView.setPixel(px + 2, py, levelView.deadendColor32);
					}
					break;
				case 'D':
					pix = levelView.getPixel(px - 1, py);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px - 1, py, levelView.deadendColor32);
						levelView.setPixel(px - 2, py, levelView.deadendColor32);
					}
					py += 2;
					pix = levelView.getPixel(px - 1, py);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px - 1, py, levelView.deadendColor32);
						levelView.setPixel(px - 2, py, levelView.deadendColor32);
					}
					break;
			}
		}
	}

	private fillTR(): void {
		const {player, history, levelView} = this.host;
		if (Math.abs(this.lastFillX - player.x) + Math.abs(this.lastFillY - player.y) < history.length() / 256) return;
		this.lastFillX = player.x;
		this.lastFillY = player.y;
		const moves = history.toString();
		let px = 1;
		let py = 1;
		let pix = 0 | 0;
		for (let i = 0; i < moves.length; i++) {
			switch (moves[i]) {
				case 'L':
					pix = levelView.getPixel(px, py + 1);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px, py + 1, levelView.deadendColor32);
						levelView.setPixel(px, py + 2, levelView.deadendColor32);
					}
					px -= 2;
					pix = levelView.getPixel(px, py + 1);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px, py + 1, levelView.deadendColor32);
						levelView.setPixel(px, py + 2, levelView.deadendColor32);
					}
					break;
				case 'R':
					pix = levelView.getPixel(px, py - 1);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px, py - 1, levelView.deadendColor32);
						levelView.setPixel(px, py - 2, levelView.deadendColor32);
					}
					px += 2;
					pix = levelView.getPixel(px, py - 1);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px, py - 1, levelView.deadendColor32);
						levelView.setPixel(px, py - 2, levelView.deadendColor32);
					}
					break;
				case 'U':
					pix = levelView.getPixel(px - 1, py);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px - 1, py, levelView.deadendColor32);
						levelView.setPixel(px - 2, py, levelView.deadendColor32);
					}
					py -= 2;
					pix = levelView.getPixel(px - 1, py);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px - 1, py, levelView.deadendColor32);
						levelView.setPixel(px - 2, py, levelView.deadendColor32);
					}
					break;
				case 'D':
					pix = levelView.getPixel(px + 1, py);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px + 1, py, levelView.deadendColor32);
						levelView.setPixel(px + 2, py, levelView.deadendColor32);
					}
					py += 2;
					pix = levelView.getPixel(px + 1, py);
					if (pix === levelView.bgColor32 || pix === levelView.backtrackColor32) {
						levelView.setPixel(px + 1, py, levelView.deadendColor32);
						levelView.setPixel(px + 2, py, levelView.deadendColor32);
					}
					break;
			}
		}
	}
}
