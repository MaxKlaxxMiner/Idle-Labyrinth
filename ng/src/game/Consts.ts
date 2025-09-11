export const Consts = {
    colors: {
        background: '#0b0b0b',
        wall: '#1f2937',
        player: '#fde047',
        goal: '#38bdf8',
        hudText: '#eaeaea',
        trail: 'rgba(253, 224, 71, 0.2)',
        backtrack: 'rgba(148, 163, 184, 0.15)',
        marker: '#ef4444',
    },
    sizes: {
        basePad: 8,
        minTileSize: 1,
        gapThreshold: 8,
        smallTileThreshold: 5,
        hudFont: '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    },
    display: {
        dprMax: 2,
    },
    zoom: {
        steps: [1, 2, 3, 4, 5, 6, 8, 10, 13, 16, 21, 26, 34, 42, 55, 68, 89, 110, 144],
        minStartTileSize: 10,
    },
    largeLevels: new Set<number>([
        1, 2, 4, 6, 8, 11, 15, 20, 26, 33, 42, 54, 69, 88,
        114, 145, 185, 236, 300, 382, 486, 618, 786, 1000,
        1272, 1618, 2059, 2620, 3333, 4240, 5394, 6861,
        8728, 11103, 14123, 17965, 22852, 29068, 36975, 47033, 59827, 999999
    ]),
};

