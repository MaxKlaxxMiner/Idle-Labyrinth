import { Consts } from "@/game/Consts";

/** Generator-Parameter eines Levels; deterministisch aus der Levelnummer ableitbar. */
export interface LabyParams {
	width: number;
	height: number;
	seed: number;
}

/**
 * Liefert die Labyrinth-Parameter für ein (0-basiertes) Level.
 * Größenentwicklung: w,h starten bei 5 und wachsen um 2,
 * gesteuert über das Verhältnis w/h zum goldenen Schnitt.
 */
export function labyParamsForLevel(gameLevel: number): LabyParams {
	let w = 5;
	let h = 5;
	for (let i = 0; i < gameLevel; i++) {
		if (w / h < 1.61803399) w += 2; else h += 2;
	}
	return { width: w, height: h, seed: Consts.labySeedBase + w + h + gameLevel };
}
