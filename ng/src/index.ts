import './styles.css';

import {Game} from './game/Game';
import {LabyCache} from '@/lib/LabyCache';
import {MainMenu, MenuAction} from '@/menu/MainMenu';

async function bootstrap() {
    // IndexedDB-Cache initialisieren, damit LabyCache.readLaby() synchron verwendbar ist
    try {
        await LabyCache.init();
    } catch {
        // ignorieren, Cache ist optional
    }

    const menuRoot = document.getElementById('menu') as HTMLElement | null;
    const bgCanvas = document.getElementById('menu-bg') as HTMLCanvasElement | null;
    const appRoot = document.getElementById('app') as HTMLElement | null;
    const gameCanvas = document.getElementById('game') as HTMLCanvasElement | null;
    if (!menuRoot || !bgCanvas || !appRoot || !gameCanvas) {
        throw new Error('Erwartete DOM-Elemente nicht gefunden (#menu, #menu-bg, #app, #game)');
    }

    let game: Game | null = null;

    const menu = new MainMenu(menuRoot, bgCanvas, {
        onSelect: (act: MenuAction) => {
            if (act === 'idle' || act === 'endless') {
                // Idle und Endless starten aktuell beide das bestehende Spiel.
                // Modus-Trennung kommt später (siehe docs/IDLE_PLAN.md).
                (window as any).__mode = act;
                menu.hide();
                appRoot.style.display = '';
                game = new Game(gameCanvas);
                game.start();
                (window as any).__game = game;
            } else if (act === 'stats') {
                menu.showStats(collectStats());
            } else if (act === 'hard-reset') {
                if (confirm('Spielstand komplett löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
                    clearAllSaves();
                    location.reload();
                }
            }
        },
    });
    menu.show();
}

function collectStats(): Array<{label: string; value: string}> {
    const level = localStorage.getItem('idle-laby-level');
    const historyRaw = localStorage.getItem('idle-laby-historyRaw') ?? '';
    const moves = (historyRaw.match(/[LRUD]/g) ?? []).length;
    const undos = (historyRaw.match(/B/g) ?? []).length;
    const markers = (historyRaw.match(/M/g) ?? []).length;
    return [
        {label: 'Level', value: level ?? '0'},
        {label: 'Moves', value: String(moves)},
        {label: 'Undo', value: String(undos)},
        {label: 'Marker', value: String(markers)},
        {label: 'Eingabespur', value: `${historyRaw.length} Zeichen`},
    ];
}

function clearAllSaves() {
    // Bekannte Keys gezielt entfernen, andere Daten unangetastet lassen
    for (const key of ['idle-laby-level', 'idle-laby-historyRaw']) {
        localStorage.removeItem(key);
    }
    // IndexedDB-Cache des Labys ebenfalls verwerfen
    try {
        indexedDB.deleteDatabase('idle-laby-cache');
    } catch {
        // ignorieren
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void bootstrap(); });
} else {
    void bootstrap();
}
