/**
 * Upgrade-Registry für den Idle-Modus.
 *
 * Die Kosten sind teils Platzhalter; das Balancing erfolgt später. Der Shop sortiert die
 * angezeigten Upgrades nach Preis (die Reihenfolge in UPGRADES ist nur die Quell-Reihenfolge).
 *
 * Siehe docs/IDLE_PLAN.md für das vollständige Konzept.
 */
import {Consts} from '@/game/Consts';

export type UpgradeId =
    | 'automover-random'
    | 'automover-smart'
    | 'automover-smarter'
    | 'automover-smarter-borderline'
    | 'automover-smarter-borderline-speed'
    | 'player-speed'
    | 'rat-count'
    | 'rat-speed'
    | 'rat-teleporter'
    | 'rat-borderline'
    | 'drone';

export interface UpgradeDef {
    id: UpgradeId;
    label: string;
    description: string;
    /** Kosten der ersten Stufe (ganzzahlig). Folgekosten siehe costGrowthPercent. */
    cost: number;
    /** Vorausgesetzte Upgrades (alle müssen besessen sein, damit sichtbar). */
    requires?: UpgradeId[];
    /** Falls Stufen-Upgrade: max. Stufe; ohne Angabe = einmalig (max 1). */
    maxLevel?: number;
    /** Ganzzahliger Preisaufschlag in Prozent je besessener Stufe (z. B. 50 = +50%); ohne Angabe konstant. */
    costGrowthPercent?: number;
    /** Optionale dynamische Beschreibung je nach aktueller Stufe (überschreibt description in der Anzeige). */
    describe?: (level: number) => string;
}

/**
 * Kosten der nächsten Stufe bei gegebenem aktuellem Stand (0 = noch nicht gekauft).
 * Rein ganzzahlig (bigint): Preis = aufgerundet(cost * (1 + p/100)^owned), exakt berechnet
 * über (100+p)^owned / 100^owned - kein Float, kein Präzisionsverlust.
 */
export function upgradeCost(def: UpgradeDef, ownedLevel: number): bigint {
    const base = BigInt(def.cost);
    const owned = ownedLevel > 0 ? ownedLevel : 0;
    const pct = def.costGrowthPercent ?? 0;
    if (pct <= 0 || owned === 0) return base;
    const n = BigInt(owned);
    const num = BigInt(100 + pct) ** n;
    const den = 100n ** n;
    // Aufrunden per Integer-Division: ceil(a/b) = (a + b - 1) / b.
    return (base * num + den - 1n) / den;
}

export const UPGRADES: ReadonlyArray<UpgradeDef> = [
    {
        id: 'automover-random',
        label: 'AutoMover (Random)',
        description: 'Bewegt sich zufällig - trifft irgendwann per Zufall das Ziel.',
        cost: 10,
    },
    {
        id: 'automover-smart',
        label: 'AutoMover (Smart)',
        description: 'Meidet rote Sackgassen und läuft nicht unnötig zurück.',
        cost: 500,
        requires: ['automover-random'],
    },
    {
        id: 'automover-smarter',
        label: 'AutoMover (Smarter)',
        description: 'Priorisiert die Luftlinie zum Ziel.',
        cost: 2000,
        requires: ['automover-smart'],
    },
    {
        id: 'automover-smarter-borderline',
        label: 'AutoMover (Borderline)',
        description: 'Markiert ganze Aussenbereiche als ungültig, wenn der Rand erreicht wird.',
        cost: 8000,
        requires: ['automover-smarter'],
    },
    {
        id: 'automover-smarter-borderline-speed',
        label: 'AutoMover (Speed)',
        description: 'Rückwege werden mit doppelter Geschwindigkeit gelaufen.',
        cost: 20000,
        requires: ['automover-smarter-borderline'],
    },
    {
        id: 'player-speed',
        label: 'AutoMover-Speed',
        description: 'Beschleunigt den AutoMover.',
        cost: 100,
        requires: ['automover-random'],
        maxLevel: Infinity,
        costGrowthPercent: 50,
        describe: (level) => {
            const sps = (lvl: number) =>
                1000 / (Consts.botStepIntervalMs * Math.pow(Consts.botStepSpeedupPerLevel, lvl));
            return `${sps(level).toFixed(1)} -> ${sps(level + 1).toFixed(1)} Schritte/s`;
        },
    },
    {
        id: 'rat-count',
        label: 'Ratten',
        description: 'Ratten laufen parallel zum Spieler und markieren Sackgassen.',
        cost: 10000,
        requires: ['automover-smarter'],
        maxLevel: 8,
    },
    {
        id: 'rat-speed',
        label: 'Ratten-Speed',
        description: 'Erhöht die Geschwindigkeit der Ratten.',
        cost: 5000,
        requires: ['rat-count'],
        maxLevel: Infinity,
        costGrowthPercent: 50,
    },
    {
        id: 'rat-teleporter',
        label: 'Ratten-Teleporter',
        description: 'Ratten teleportieren beim Rückweg zur letzten Verzweigung.',
        cost: 30000,
        requires: ['rat-count'],
    },
    {
        id: 'rat-borderline',
        label: 'Ratten-Borderline',
        description: 'Ratten markieren ganze Aussenbereiche als ungültig.',
        cost: 60000,
        requires: ['rat-count', 'automover-smarter-borderline'],
    },
    {
        id: 'drone',
        label: 'Drohnen',
        description: 'Fliegen frei über das Labyrinth und füllen Sackgassen im Sichtbereich.',
        cost: 150000,
        requires: ['rat-borderline'],
    },
];

/** Index für O(1)-Lookup. */
export const UPGRADES_BY_ID: Readonly<Record<UpgradeId, UpgradeDef>> = (() => {
    const map = Object.create(null) as Record<UpgradeId, UpgradeDef>;
    for (const u of UPGRADES) map[u.id] = u;
    return map;
})();
