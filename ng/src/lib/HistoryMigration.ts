/**
 * Einmalige Konvertierung alter Endless-Bewegungsspuren in das kürzbare Undo-Format.
 *
 * Alt-Format: rohe Eingaben 'L/R/U/D' (vorwärts oder Gegenrichtungs-Undo, wurde beim
 * Abspielen dynamisch erkannt), 'B' = Backspace, 'M' = Marker-Toggle an der
 * Spielerposition, 'X'/'E' = frühe Varianten des echten Undo (wie 'B' ein Schritt
 * zurück entlang des Pfads).
 *
 * Neu-Format: Großbuchstaben 'L/R/U/D' = Vorwärtsschritt, Kleinbuchstaben 'l/r/u/d' =
 * Rückschritt (das Zeichen benennt den zurückgenommenen Vorwärtsschritt); Marker liegen
 * als Koordinatenliste außerhalb der Spur.
 *
 * Die Konvertierung simuliert Pfad-Stack, Spielerposition und Marker (inkl. Auto-Abräumen
 * beim Betreten einer Marker-Zelle) - Wegbarkeits-Prüfungen sind unnötig, da die alte
 * Spur nur tatsächlich ausgeführte Züge enthält.
 */

import { Consts } from "@/game/Consts";

interface MigratedHistory {
	raw: string;
	redMarkers: number[];
	undoPoints: number;
}

const DELTAS: Record<string, [number, number]> = {
	L: [-1, 0],
	R: [1, 0],
	U: [0, -1],
	D: [0, 1],
};

const OPPOSITE: Record<string, string> = { L: 'R', R: 'L', U: 'D', D: 'U' };

export function migrateLegacyHistory(old: string): MigratedHistory {
	const stack: string[] = [];
	const out: string[] = [];
	const markers = new Set<number>();
	let x = 1;
	let y = 1;
	let forwardSteps = 0;
	const posKey = () => ((x & 0xffff) << 16) | (y & 0xffff);

	for (const c of old) {
		if (c === 'L' || c === 'R' || c === 'U' || c === 'D') {
			const [dx, dy] = DELTAS[c];
			const top = stack.length > 0 ? stack[stack.length - 1] : '';
			if (top === OPPOSITE[c]) {
				// Gegenrichtung gelaufen = Rückschritt des letzten Pfadschritts
				const h = stack.pop()!;
				out.push(h.toLowerCase());
			} else {
				stack.push(c);
				out.push(c);
				forwardSteps++;
			}
			x += dx * 2;
			y += dy * 2;
			markers.delete(posKey());
		} else if (c === 'B' || c === 'X' || c === 'E') {
			if (stack.length === 0) continue;
			const h = stack.pop()!;
			const [dx, dy] = DELTAS[h];
			out.push(h.toLowerCase());
			x -= dx * 2;
			y -= dy * 2;
			markers.delete(posKey());
		} else if (c === 'M') {
			const k = posKey();
			if (markers.has(k)) markers.delete(k);
			else markers.add(k);
		}
	}

	// Punkte-Gutschrift, als wäre die Spur mit dem Punktesystem gelaufen (ohne Verbrauch).
	return {
		raw: out.join(''),
		redMarkers: Array.from(markers),
		undoPoints: Math.floor(forwardSteps / Consts.endlessUndoPointEverySteps),
	};
}
