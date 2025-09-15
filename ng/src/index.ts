import './styles.css';

import {Game} from './game/Game';
import {LabyCache} from '@/lib/LabyCache';

async function bootstrap() {
    const canvas = document.getElementById('game') as HTMLCanvasElement | null;
    const status = document.getElementById('status');
    if (!canvas) throw new Error('Canvas #game nicht gefunden');
    if (status) status.textContent = 'bereit';

    // IndexedDB-Cache initialisieren, damit LabyCache.readLaby() synchron verwendbar ist
    try {
        if (status) status.textContent = 'lade Cache…';
        await LabyCache.init();
        if (status) status.textContent = 'bereit';
    } catch {
        if (status) status.textContent = 'bereit';
    }

    const game = new Game(canvas);
    game.start();

    // Debug-Hook (praktisch beim frühen Prototyping)
    // @ts-expect-error
    window.__game = game;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void bootstrap(); });
} else {
    void bootstrap();
}
