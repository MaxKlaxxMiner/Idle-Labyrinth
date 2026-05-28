import './styles.css';

import {Game} from './game/Game';
import {LabyCache} from '@/lib/LabyCache';
import {GameSave} from '@/lib/GameSave';
import {MainMenu, MenuAction} from '@/menu/MainMenu';

// Pro Spielmodus ein eigener Cache- und Save-Slot. BG-Laby läuft ohne Cache.
const idleCache = new LabyCache('idle');
const endlessCache = new LabyCache('endless');
const idleSave = new GameSave('idle');
const endlessSave = new GameSave('endless');

async function bootstrap() {
    // Alte (vor-Slot) DBs einmalig wegräumen, damit keine Leichen zurückbleiben
    for (const db of ['idle-laby-cache']) {
        try { indexedDB.deleteDatabase(db); } catch { /* ignorieren */ }
    }
    // Bisherige localStorage-Keys aus der Vor-Save-Ära aufräumen
    for (const key of ['idle-laby-level', 'idle-laby-historyRaw']) {
        try { localStorage.removeItem(key); } catch { /* ignorieren */ }
    }

    // Alle Slots parallel laden, damit der spätere Spielstart synchron lesen kann
    await Promise.all([
        idleCache.init().catch(() => { /* ignorieren */ }),
        endlessCache.init().catch(() => { /* ignorieren */ }),
        idleSave.init().catch(() => { /* ignorieren */ }),
        endlessSave.init().catch(() => { /* ignorieren */ }),
    ]);

    const menuRoot = document.getElementById('menu') as HTMLElement | null;
    const bgCanvas = document.getElementById('menu-bg') as HTMLCanvasElement | null;
    const appRoot = document.getElementById('app') as HTMLElement | null;
    const gameCanvas = document.getElementById('game') as HTMLCanvasElement | null;
    if (!menuRoot || !bgCanvas || !appRoot || !gameCanvas) {
        throw new Error('Erwartete DOM-Elemente nicht gefunden (#menu, #menu-bg, #app, #game)');
    }

    let game: Game | null = null;

    const returnToMenu = () => {
        if (game) {
            game.dispose();
            game = null;
            (window as any).__game = null;
        }
        appRoot.style.display = 'none';
        menu.show();
    };

    const menu = new MainMenu(menuRoot, bgCanvas, {
        onSelect: (act: MenuAction) => {
            if (act === 'idle' || act === 'endless') {
                menu.hide();
                appRoot.style.display = '';
                const cache = act === 'endless' ? endlessCache : idleCache;
                const save = act === 'endless' ? endlessSave : idleSave;
                game = new Game(gameCanvas, {cache, save, mode: act, onExit: returnToMenu});
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
    // Save hält intern 0-basiertes Level, für die Anzeige +1
    return [
        {label: 'Idle Level', value: String(idleSave.getLevel() + 1)},
        {label: 'Endless Level', value: String(endlessSave.getLevel() + 1)},
    ];
}

function clearAllSaves() {
    // Alle Modi-Caches/Saves sowie etwaige Alt-DBs verwerfen
    const dbs = [
        'idle-laby-cache', 'idle-laby-cache-idle', 'idle-laby-cache-endless',
        'idle-laby-save-idle', 'idle-laby-save-endless',
    ];
    for (const db of dbs) {
        try { indexedDB.deleteDatabase(db); } catch { /* ignorieren */ }
    }
    // localStorage-Reste der Vor-Save-Ära ebenfalls löschen
    for (const key of ['idle-laby-level', 'idle-laby-historyRaw']) {
        try { localStorage.removeItem(key); } catch { /* ignorieren */ }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void bootstrap(); });
} else {
    void bootstrap();
}
