/**
 * Upgrade-Registry für den Idle-Modus.
 *
 * Aktueller Stand: nur Definitionen (Stubs). Die Kosten sind Platzhalter,
 * das Balancing erfolgt später. Die Reihenfolge in UPGRADES legt die
 * Anzeige-Reihenfolge im Shop fest.
 *
 * Siehe docs/IDLE_PLAN.md für das vollständige Konzept.
 */

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
    cost: number;
    /** Vorausgesetzte Upgrades (alle müssen besessen sein, damit sichtbar). */
    requires?: UpgradeId[];
    /** Falls Stufen-Upgrade: max. Stufe; ohne Angabe = einmalig (max 1). */
    maxLevel?: number;
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
        description: 'Markiert Sackgassen als rot und meidet sie.',
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
        label: 'Spieler-Speed',
        description: 'Erhöht die Bewegungsgeschwindigkeit.',
        cost: 1000,
        requires: ['automover-random'],
        maxLevel: 5,
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
        maxLevel: 5,
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
