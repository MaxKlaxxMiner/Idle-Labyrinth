import { GameModeStrategy, ModeHost } from "@/game/modes/GameMode";

/**
 * Endurance-Modus: Spielweise wie Endless (History-Persistierung mit Replay, Undo-Punkte,
 * Marker), aber inkrementeller Level-Aufstieg (+1) statt Sprüngen entlang Consts.largeLevels.
 * Beim Lösen wird der Fortschritt des Levels verworfen (Verlauf und Marker gelöscht, keine
 * Bestwerte) - es zählt allein das aktuell erreichte Level; Pfadlänge und Gesamtschritte
 * abgeschlossener Level fließen in Lebenszeit-Summen (Anzeige in den Stats).
 */
export class EnduranceMode implements GameModeStrategy {
	readonly id = 'endurance' as const;

	computeNextLevel(currentLevel: number): number {
		return currentLevel + 1;
	}

	onLevelSolved(host: ModeHost): void {
		if (!host.save) return;
		host.save.addCompletedMoves(host.moves, host.totalMoves);
		host.save.setHistory(host.level, '', 0);
		host.save.setRedMarkers(host.level, []);
		host.save.setGreenMarkers(host.level, []);
	}

	usesHistory(): boolean {
		return true;
	}

	// Kein Prefetch: Level werden von Hand gespielt (kein schneller Durchlauf wie im Idle),
	// die Generierung beim Levelwechsel genügt.
	usesPrefetch(): boolean {
		return false;
	}
}
