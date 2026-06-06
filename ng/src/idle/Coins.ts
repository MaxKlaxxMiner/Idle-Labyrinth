/**
 * Coin-Ökonomie für den Idle-Modus.
 *
 * Belohnungs-Formel:
 *   nodes  = ((w-3)/2) * ((h-3)/2)
 *   reward = floor(nodes / repeatCount + 0.98)
 * - Beim ersten Lösen volle Anzahl Knoten (Level 1 = 1, Level 2 = 2, Level 3 = 3,
 *   Level 4 = 6, Level 5 = 8, Level 6 = 10, Level 7 = 15, ...).
 * - Wiederholungs-Decay: 1/n bei n-tem Lösen. Das +0.98 garantiert mindestens 1 Coin,
 *   solange nodes/n >= 0.02, also für höchstens 50*nodes Wiederholungen.
 *   (Beispiel: Level 1 = 50 Runden, Level 7 = 750 Runden, Level 26 = 8500 Runden.)
 *
 * Aktuell ohne genaue Balancing-Anpassung; Werte können in docs/IDLE_PLAN.md
 * weiter diskutiert werden.
 */

/**
 * Coin-Belohnung für ein gelöstes Level.
 * @param level 0-basierter Level-Index (für spätere kurven-basierte Anpassung verfügbar)
 * @param repeatCount Wievielmal das Level bereits gelöst wurde, inklusive der gerade abgeschlossenen Lösung (>= 1)
 */
export function calculateLevelReward(level: number, repeatCount: number): bigint {
    if (repeatCount < 1) return 0n;
    const nodes = estimateNodeCount(level);
    return BigInt(Math.max(0, Math.floor(nodes / repeatCount + 0.98)));
}

/** Anzahl spielbarer Lab-Knoten ohne Rand: ((w-3)/2) * ((h-3)/2). */
export function estimateNodeCount(level: number): number {
    const {w, h} = estimateLabyCells(level);
    return ((w - 3) / 2) * ((h - 3) / 2);
}

/**
 * Schätzt die Lab-Zellmaße (w/h) ohne den Generator laufen zu lassen.
 * Spiegelt die Heuristik aus Game.createLabyForLevel: w/h starten bei 5
 * und wachsen abwechselnd um 2, sodass das Verhältnis dem goldenen Schnitt zustrebt.
 * Hinweis: Laby halbiert w/h intern (width=(w+1)>>1) und bildet danach pixWidth=width*2-1;
 * da w/h hier stets ungerade sind, entspricht das tatsächliche Pixel-Raster genau w x h.
 */
export function estimateLabyCells(level: number): {w: number; h: number} {
    let w = 5;
    let h = 5;
    for (let i = 0; i < level; i++) {
        if (w / h < 1.61803399) w += 2;
        else h += 2;
    }
    return {w, h};
}
