export interface HUDState {
    level: number;
    moves: number;
    totalMoves: number;
}

export class HUDView {
    private el: HTMLElement | null;
    private last = '';

    constructor(el: HTMLElement | null) {
        this.el = el;
    }

    set(state: HUDState) {
        if (!this.el) return;
        const text = `Level: ${state.level}  Moves: ${state.moves} / ${state.totalMoves}  |  Move: WASD/↑↓←→  Reset: R  Mark: Space  Center: Enter  Zoom: +/-, 0 fit`;
        if (text !== this.last) {
            this.el.textContent = text;
            this.last = text;
        }
    }
}
