import {MenuBackground} from './MenuBackground';

export type MenuAction = 'idle' | 'endless' | 'stats' | 'hard-reset';

export interface MainMenuOptions {
    onSelect: (action: MenuAction) => void;
}

// Hauptmenü mit animiertem Labyrinth-Hintergrund.
// Erwartet im DOM einen leeren Container und ein eigenes Canvas für den Hintergrund.
export class MainMenu {
    private root: HTMLElement;
    private bgCanvas: HTMLCanvasElement;
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

    showStats(entries: Array<{label: string; value: string}>) {
        this.closeStats();
        const overlay = document.createElement('div');
        overlay.id = 'stats-overlay';
        overlay.innerHTML = `
            <div class="stats-panel">
                <h2>Stats</h2>
                <dl></dl>
                <button class="stats-close" type="button">Schließen</button>
            </div>
        `;
        const dl = overlay.querySelector('dl') as HTMLElement;
        for (const e of entries) {
            const dt = document.createElement('dt');
            dt.textContent = e.label;
            const dd = document.createElement('dd');
            dd.textContent = e.value;
            dl.appendChild(dt);
            dl.appendChild(dd);
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
            <div class="menu-panel">
                <h1 class="menu-title">
                    Idle <span class="menu-title-accent">Labyrinth</span>
                    <span class="menu-version">v${__APP_VERSION__}</span>
                </h1>
                <div class="menu-buttons">
                    <button class="menu-btn" data-act="idle">Idle Mode</button>
                    <button class="menu-btn" data-act="endless">Endless Mode</button>
                    <button class="menu-btn" data-act="stats">Stats</button>
                    <button class="menu-btn menu-btn-danger" data-act="hard-reset">Hard Reset</button>
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
