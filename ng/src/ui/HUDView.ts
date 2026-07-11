export interface HUDState {
	level: number;
	/** Pixel-Maße des aktuellen Labyrinths (pixWidth x pixHeight), optional. */
	pixW?: number;
	pixH?: number;
	moves: number;
	totalMoves: number;
	/** Optional, nur im Endless: verfügbare Undo-Punkte für echtes Rückgängig (Entf). */
	undoPoints?: number;
	/** Optional, nur im Idle-Modus gesetzt. */
	coins?: bigint;
	/** Optional, erwartete Belohnung beim aktuellen Solve (nach Decay). */
	coinsPending?: bigint;
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
	private readonly el: HTMLElement | null;
	private last = '';

	constructor(el: HTMLElement | null) {
		this.el = el;
	}

	set(state: HUDState) {
		if (!this.el) return;
		const sizePart = (state.pixW !== undefined && state.pixH !== undefined)
			? ` (${state.pixW} x ${state.pixH})`
			: '';
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
		const undoPart = state.undoPoints !== undefined ? ` (${fmt(state.undoPoints)})` : '';
		const html = `Level: ${fmt(state.level)}${sizePart}${coinsPart}  Moves: ${fmt(state.moves)} / ${fmt(state.totalMoves)}${undoPart}  |  Move: WASD/↑↓←→  Reset: R${spacePart}  Center: Enter  Zoom: +/-, 0 fit`;
		if (html !== this.last) {
			this.el.innerHTML = html;
			this.last = html;
		}
	}
}

/** Zahl mit Tausendertrennzeichen (en-US: Komma). */
function fmt(n: number | bigint): string {
	return n.toLocaleString('en-US');
}
