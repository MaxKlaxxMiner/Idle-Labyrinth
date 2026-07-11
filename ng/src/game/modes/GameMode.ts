import { GameSave } from "@/lib/GameSave";

/**
 * Schnittstelle, die ein laufendes Spiel den Modus-Strategien anbietet.
 * Hier nur die Methoden/Felder, die Idle- bzw. Endless-Logik tatsächlich brauchen.
 */
export interface ModeHost {
	readonly level: number;
	readonly moves: number;
	readonly totalMoves: number;
	/** Verfügbare Undo-Punkte für das echte Rückgängig (Entf, Endless). */
	readonly undoPoints: number;
	readonly save: GameSave | null;

	/** Bewegungsspur als String (L/R/U/D vorwärts, l/r/u/d Rückschritt). */
	getHistoryRaw(): string;
}

/**
 * Eine Modus-Strategie kapselt das Verhalten, das sich zwischen Idle und Endless unterscheidet:
 * - wie das nächste Level gewählt wird (computeNextLevel)
 * - was beim Lösen passiert (onLevelSolved)
 * - ob der Bewegungsverlauf persistiert und beim Wiedereintritt replayed wird (usesHistory)
 *
 * Die Strategie ist stateless; sie liest und schreibt ausschließlich über den ModeHost.
 */
export interface GameModeStrategy {
	readonly id: 'idle' | 'endless';

	computeNextLevel(currentLevel: number): number;

	onLevelSolved(host: ModeHost): void;

	usesHistory(): boolean;
}
