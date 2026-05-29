export interface HUDState {
    level: number;
    moves: number;
    totalMoves: number;
    /** Optional, nur im Idle-Modus gesetzt. */
    coins?: number;
    /** Optional, erwartete Belohnung beim aktuellen Solve (nach Decay). */
    coinsPending?: number;
    /**
     * Was Space im aktuellen Kontext tut.
     * - 'mark'      : Endless-Default (Marker setzen, neutrale Farbe)
     * - 'available' : Idle, Bot gekauft aber inaktiv (gelb)
     * - 'active'    : Idle, Bot läuft (grün)
     * - undefined   : kein Space-Hinweis
     */
    spaceAction?: 'mark' | 'available' | 'active';
}

export class HUDView {
    private el: HTMLElement | null;
    private last = '';

    constructor(el: HTMLElement | null) {
        this.el = el;
    }

    set(state: HUDState) {
        if (!this.el) return;
        let coinsPart = '';
        if (state.coins !== undefined) {
            const pending = state.coinsPending !== undefined ? ` (+${fmt(state.coinsPending)})` : '';
            coinsPart = `  Coins: ${fmt(state.coins)}${pending}`;
        }
        let spacePart = '';
        if (state.spaceAction === 'mark') {
            spacePart = '  Mark: Space';
        } else if (state.spaceAction === 'available') {
            spacePart = '  <span class="hud-bot">AutoMover: Space</span>';
        } else if (state.spaceAction === 'active') {
            spacePart = '  <span class="hud-bot hud-bot-on">AutoMover: Space (running)</span>';
        }
        const html = `Level: ${fmt(state.level)}${coinsPart}  Moves: ${fmt(state.moves)} / ${fmt(state.totalMoves)}  |  Move: WASD/↑↓←→  Reset: R${spacePart}  Center: Enter  Zoom: +/-, 0 fit`;
        if (html !== this.last) {
            this.el.innerHTML = html;
            this.last = html;
        }
    }
}

/** Zahl mit Tausendertrennzeichen (en-US: Komma). */
function fmt(n: number): string {
    return n.toLocaleString('en-US');
}
