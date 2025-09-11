export type HUDMode = 'VSync' | 'Turbo';

export interface HUDState {
    level: number;
    moves: number;
    tileSize: number;
    mode: HUDMode;
    fps: number;
}

export class HUDView {
    private el: HTMLElement | null;
    private last = '';

    constructor(el: HTMLElement | null) {
        this.el = el;
    }

    set(state: HUDState) {
        if (!this.el) return;
        const text = `Level: ${state.level}  Moves: ${state.moves}  |  Tile: ${state.tileSize}px (+/- , 0 fit)  |  Move: WASD/↑↓←→  Reset: R  Mark: Space  Center: Enter  |  Mode: ${state.mode} (T)  |  FPS: ${state.fps}`;
        if (text !== this.last) {
            this.el.textContent = text;
            this.last = text;
        }
    }
}
