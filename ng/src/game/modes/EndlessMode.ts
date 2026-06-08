import {Consts} from '@/game/Consts';
import {GameModeStrategy, ModeHost} from './GameMode';

/**
 * Endless-Modus: Sprünge entlang Consts.largeLevels. Verlauf wird pro Level
 * persistiert (für exakten Replay beim Wiederöffnen) und beim Lösen so getrimmt,
 * dass der Spieler beim nächsten Aufruf einen Schritt vor dem Ziel steht.
 */
export class EndlessMode implements GameModeStrategy {
	readonly id = 'endless' as const;

	computeNextLevel(currentLevel: number): number {
		// Obergrenze: nicht über den höchsten largeLevels-Eintrag hinaus zählen,
		// sonst liefe die Schleife (kein passender Folgewert mehr im Set) endlos.
		const max = Math.max(...Consts.largeLevels);
		let next = currentLevel + 1;
		while (next + 1 <= max && !Consts.largeLevels.has(next + 1)) next++;
		return next;
	}

	onLevelSolved(host: ModeHost): void {
		if (!host.save) return;
		host.save.recordBest(host.level, host.moves, host.totalMoves);
		const trimmed = trimToBeforeLastLrud(host.getHistoryRaw());
		host.save.setHistory(host.level, trimmed);
	}

	usesHistory(): boolean {
		return true;
	}
}

/**
 * Schneidet den historyRaw-String beim letzten LRUD-Zeichen ab (inkl. dieser Position
 * und allem danach). Resultat: nach dem Replay steht der Spieler genau einen Schritt
 * vor seinem zuletzt gemachten Zug. Marker/Undo nach dem letzten Schritt fallen weg.
 */
export function trimToBeforeLastLrud(raw: string): string {
	for (let i = raw.length - 1; i >= 0; i--) {
		const c = raw.charCodeAt(i);
		// L=76, R=82, U=85, D=68
		if (c === 76 || c === 82 || c === 85 || c === 68) {
			return raw.slice(0, i);
		}
	}
	return raw;
}
