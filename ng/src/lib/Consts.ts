export const Consts = {
    colors: {
        tileFree: '#0b0b0b',
        tileWall: '#1f2937',
        player: '#fde047',
        goal: '#38bdf8',
        hudText: '#eaeaea',
        trail: 'rgba(253, 224, 71, 0.2)',
        backtrack: 'rgba(148, 163, 184, 0.15)',
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
        minStartTileSize: 8,
    },
};
