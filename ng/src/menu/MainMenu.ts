import { MenuBackground } from "@/menu/MenuBackground";

export type MenuAction = 'idle' | 'endless' | 'stats' | 'hard-reset';

export interface MainMenuOptions {
	onSelect: (action: MenuAction) => void;
}

// Hauptmenü mit animiertem Labyrinth-Hintergrund.
// Erwartet im DOM einen leeren Container und ein eigenes Canvas für den Hintergrund.
export class MainMenu {
	private readonly root: HTMLElement;
	private readonly bgCanvas: HTMLCanvasElement;
	private bg: MenuBackground;
	private options: MainMenuOptions;
	private statsOverlay: HTMLElement | null = null;

	constructor(root: HTMLElement, bgCanvas: HTMLCanvasElement, options: MainMenuOptions) {
		this.root = root;
		this.bgCanvas = bgCanvas;
		this.options = options;
		this.bg = new MenuBackground(this.bgCanvas);
		this.build();
	}

	show() {
		this.root.style.display = '';
		this.bgCanvas.style.display = '';
		this.bg.start();
	}

	hide() {
		this.root.style.display = 'none';
		this.bgCanvas.style.display = 'none';
		this.bg.stop();
		this.closeStats();
	}

	dispose() {
		this.bg.dispose();
		this.closeStats();
	}

	showStats(
		data: {
			summary: Array<{ label: string; value: string }>;
			endlessLevels: Array<{ level: number; moves: number; totalMoves: number }>;
		},
		onReplay?: (level: number) => void,
	) {
		this.closeStats();
		const overlay = document.createElement('div');
		overlay.id = 'stats-overlay';
		overlay.innerHTML = `
            <div class="stats-panel">
                <h2>Stats</h2>
                <dl class="stats-summary"></dl>
                <h3 class="stats-section-title">Endless Bestwerte</h3>
                <div class="stats-list" role="table">
                    <div class="stats-list-head" role="row">
                        <span>Level</span><span>Moves</span><span>Total</span>
                    </div>
                    <div class="stats-list-body"></div>
                </div>
                <button class="stats-close" type="button">Schließen</button>
            </div>
        `;
		const dl = overlay.querySelector('.stats-summary') as HTMLElement;
		for (const e of data.summary) {
			const dt = document.createElement('dt');
			dt.textContent = e.label;
			const dd = document.createElement('dd');
			dd.textContent = e.value;
			dl.appendChild(dt);
			dl.appendChild(dd);
		}

		const body = overlay.querySelector('.stats-list-body') as HTMLElement;
		if (data.endlessLevels.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'stats-list-empty';
			empty.textContent = 'Noch keine Endless-Level gelöst.';
			body.appendChild(empty);
		} else {
			for (const e of data.endlessLevels) {
				const extra = Math.max(0, e.totalMoves - e.moves);
				const extraHtml = extra > 0 ? `<span class="stats-extra"> +${extra}</span>` : '';
				const replayable = !!onReplay;
				const levelHtml = replayable
					? `<span class="stats-level-link" data-level="${e.level}" role="button" title="Level ${e.level} erneut spielen" tabindex="0">${e.level}</span>`
					: `<span>${e.level}</span>`;
				const row = document.createElement('div');
				row.className = 'stats-list-row';
				row.setAttribute('role', 'row');
				row.innerHTML = `
                    ${levelHtml}
                    <span>${e.moves}</span>
                    <span>${e.totalMoves}${extraHtml}</span>
                `;
				body.appendChild(row);
			}
			if (onReplay) {
				body.querySelectorAll<HTMLElement>('.stats-level-link').forEach((el) => {
					const trigger = () => {
						const lv = Number(el.dataset.level);
						if (Number.isFinite(lv)) {
							this.closeStats();
							onReplay(lv);
						}
					};
					el.addEventListener('click', trigger);
					el.addEventListener('keydown', (ev: KeyboardEvent) => {
						if (ev.key === 'Enter' || ev.key === ' ') {
							ev.preventDefault();
							trigger();
						}
					});
				});
			}
		}

		overlay.querySelector('.stats-close')?.addEventListener('click', () => this.closeStats());
		overlay.addEventListener('click', (ev) => {
			if (ev.target === overlay) this.closeStats();
		});
		document.body.appendChild(overlay);
		this.statsOverlay = overlay;
	}

	private closeStats() {
		if (this.statsOverlay && this.statsOverlay.parentElement) {
			this.statsOverlay.parentElement.removeChild(this.statsOverlay);
		}
		this.statsOverlay = null;
	}

	private build() {
		this.root.innerHTML = `
            <div class="menu-panel fancy">
                <h1 class="menu-title">
                    Idle <span class="menu-title-accent">Labyrinth</span>
                    <span class="menu-version">v${__APP_VERSION__}</span>
                </h1>
                <div class="menu-buttons">
                    <button class="menu-btn" data-act="idle">Idle Mode</button>
                    <button class="menu-btn" data-act="endless">Endless Mode</button>
                    <button class="menu-btn" data-act="stats">Stats</button>
                    <button class="menu-btn menu-btn-danger" data-act="hard-reset">Reset Idle</button>
                </div>
            </div>
        `;
		this.root.querySelectorAll<HTMLButtonElement>('button.menu-btn').forEach((btn) => {
			btn.addEventListener('click', () => {
				const act = btn.dataset.act as MenuAction | undefined;
				if (act) this.options.onSelect(act);
			});
		});
	}
}
