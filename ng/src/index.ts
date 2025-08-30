import './styles.css';

import {Game} from './lib/Game';

function bootstrap() {
    const canvas = document.getElementById('game') as HTMLCanvasElement | null;
    const status = document.getElementById('status');
    if (!canvas) throw new Error('Canvas #game nicht gefunden');
    if (status) status.textContent = 'bereit';

    const game = new Game(canvas);
    game.start();

    // Debug global hook (convenient while early prototyping)
    // @ts-expect-error
    window.__game = game;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}

