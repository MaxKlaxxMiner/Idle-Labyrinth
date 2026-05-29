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

    const startEndless = (replayLevel?: number) => {
        menu.hide();
        appRoot.style.display = '';
        game = new Game(gameCanvas, {
            cache: endlessCache,
            save: endlessSave,
            mode: 'endless',
            onExit: returnToMenu,
            replayLevel,
        });
        game.start();
        (window as any).__game = game;
    };

    const menu = new MainMenu(menuRoot, bgCanvas, {
        onSelect: (act: MenuAction) => {
            if (act === 'idle') {
                menu.hide();
                appRoot.style.display = '';
                game = new Game(gameCanvas, {cache: idleCache, save: idleSave, mode: 'idle', onExit: returnToMenu});
                game.start();
                (window as any).__game = game;
            } else if (act === 'endless') {
                startEndless();
            } else if (act === 'stats') {
                menu.showStats(collectStats(), (displayedLevel: number) => {
                    // Anzeige ist 1-basiert, intern 0-basiert
                    const internal = Math.max(0, (displayedLevel | 0) - 1);
                    startEndless(internal);
                });
            } else if (act === 'hard-reset') {
                if (confirm('Idle-Spielstand löschen? Endless-Stand bleibt erhalten.')) {
                    clearIdleSaves();
                    location.reload();
                }
            }
        },
    });
    menu.show();
}

function collectStats() {
    // Save hält intern 0-basiertes Level, für die Anzeige +1
    return {
        summary: [
            {label: 'Idle Level', value: String(idleSave.getLevel() + 1)},
            {label: 'Endless Level', value: String(endlessSave.getLevel() + 1)},
        ],
        endlessLevels: endlessSave.listBests().map((b) => ({
            level: b.level + 1,
            moves: b.moves,
            totalMoves: b.totalMoves,
        })),
    };
}

function clearIdleSaves() {
    // Nur Idle-Slots verwerfen, Endless bleibt unangetastet.
    const dbs = ['idle-laby-cache-idle', 'idle-laby-save-idle'];
    for (const db of dbs) {
        try { indexedDB.deleteDatabase(db); } catch { /* ignorieren */ }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void bootstrap(); });
} else {
    void bootstrap();
}
