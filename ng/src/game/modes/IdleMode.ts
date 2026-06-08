import { GameModeStrategy, ModeHost } from "@/game/modes/GameMode";
import { calculateLevelReward } from "@/idle/Coins";

/**
 * Idle-Modus: inkrementeller Level-Aufstieg, Coin-Belohnung pro Lösung.
 * Verlauf wird nicht persistiert (jedes Level fängt frisch an).
 */
export class IdleMode implements GameModeStrategy {
	readonly id = 'idle' as const;

	computeNextLevel(currentLevel: number): number {
		return currentLevel + 1;
	}

	onLevelSolved(host: ModeHost): void {
		if (!host.save) return;
		// Wiederholungszähler hochzählen und Coin-Belohnung gutschreiben.
		const repeats = host.save.incrementLevelClears(host.level);
		const reward = calculateLevelReward(host.level, repeats);
		if (reward > 0n) host.save.addCoins(reward);
	}

	usesHistory(): boolean {
		return false;
	}
}
