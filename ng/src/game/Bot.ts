import {Consts} from '@/game/Consts';
import {Laby} from '@/lib/Laby';
import {Level} from '@/view/Level';
import {Input} from '@/input/Input';
import {StringBuilder} from '@/lib/StringBuilder';

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
}

/**
 * Bot-Logik (AutoMover + Highlight-Filler).
 *
 * Aktivierung steuert der Host (siehe `BotHost.isBotActive`). Im Idle-Modus
 * toggelt der Spieler mit Space; ist der Bot aktiv, läuft pro Frame ein
 * Random-Step alle `Consts.botStepIntervalMs` Millisekunden.
 */
export class Bot {
    private readonly host: BotHost;
    private lastStepTime = 0;

    // Fill-Highlight-Skip-Schwelle: letzte Position, an der gefüllt wurde
    private lastFillX = 0;
    private lastFillY = 0;

    constructor(host: BotHost) {
        this.host = host;
    }

    /** Setzt den Bot-Zustand auf Level-Start zurück. */
    resetForLevel(): void {
        this.lastStepTime = 0;
        this.lastFillX = 0;
        this.lastFillY = 0;
    }

    /** Pro Frame in Game.update() aufgerufen. Bewegt den Spieler einen Schritt, sofern aktiv. */
    tick(): void {
        if (!this.host.isBotActive()) return;
        const now = performance.now();
        if (now - this.lastStepTime < Consts.botStepIntervalMs) return;
        this.lastStepTime = now;
        this.performRandomStep();
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
            // Ziel direkt nehmen, sobald es in Reichweite ist (sonst stoppt der Bot davor).
            if (nx === goal.x && ny === goal.y) return option.dir;
            const targetColor = levelView.getPixel(nx, ny);
            if (targetColor === levelView.deadendColor32 || targetColor === levelView.trailColor32) continue;
            valid.push(option.dir);
        }
        if (valid.length === 0) return history.length() > 0 ? 'B' : null;

        // Richtung priorisieren, die per Luftlinie näher zum Ziel führt
        if (goal.x - player.x >= goal.y - player.y) {
            for (let i = 0; i < valid.length; i++) if (valid[i] === 'R') return 'R';
            for (let i = 0; i < valid.length; i++) if (valid[i] === 'D') return 'D';
        } else {
            for (let i = 0; i < valid.length; i++) if (valid[i] === 'D') return 'D';
            for (let i = 0; i < valid.length; i++) if (valid[i] === 'R') return 'R';
        }

        const index = Math.floor(Math.random() * valid.length);
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
