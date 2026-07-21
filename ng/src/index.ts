import './styles.css';

import { LabyCache } from "@/lib/LabyCache";
import { GameSave } from "@/lib/GameSave";
import { Game } from "@/game/Game";
import { MainMenu, MenuAction } from "@/menu/MainMenu";

// Save-Slot je Spielmodus. Labyrinth-Cache nur für Endless und Endurance (Resume großer Level);
// Idle generiert jedes Level deterministisch neu (Cache spart dort nichts).
const endlessCache = new LabyCache('endless');
const enduranceCache = new LabyCache('endurance');
const idleSave = new GameSave('idle');
const endlessSave = new GameSave('endless');
const enduranceSave = new GameSave('endurance');

async function bootstrap() {
	// Alle Slots parallel laden, damit der spätere Spielstart synchron lesen kann
	await Promise.all([
		endlessCache.init().catch(() => { /* ignorieren */ }),
		enduranceCache.init().catch(() => { /* ignorieren */ }),
		idleSave.init().catch(() => { /* ignorieren */ }),
		endlessSave.init().catch(() => { /* ignorieren */ }),
		enduranceSave.init().catch(() => { /* ignorieren */ }),
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

	const startEndurance = () => {
		menu.hide();
		appRoot.style.display = '';
		game = new Game(gameCanvas, {
			cache: enduranceCache,
			save: enduranceSave,
			mode: 'endurance',
			onExit: returnToMenu,
		});
		game.start();
		(window as any).__game = game;
	};

	const menu = new MainMenu(menuRoot, bgCanvas, {
		onSelect: (act: MenuAction) => {
			if (act === 'idle') {
				menu.hide();
				appRoot.style.display = '';
				game = new Game(gameCanvas, { save: idleSave, mode: 'idle', onExit: returnToMenu });
				game.start();
				(window as any).__game = game;
			} else if (act === 'endless') {
				startEndless();
			} else if (act === 'endurance') {
				startEndurance();
			} else if (act === 'stats') {
				menu.showStats(collectStats(), (displayedLevel: number) => {
					// Anzeige ist 1-basiert, intern 0-basiert
					const internal = Math.max(0, (displayedLevel | 0) - 1);
					startEndless(internal);
				});
			} else if (act === 'hard-reset') {
				if (confirm('Idle-Spielstand löschen? Endless- und Endurance-Stand bleiben erhalten.')) {
					clearIdleSaves();
					location.reload();
				}
			}
		},
	});
	menu.show();
}

function collectStats() {
	// Save hält intern 0-basiertes Level, für die Anzeige +1.
	// Endurance: in Klammern die aufsummierten Schritte bereits abgeschlossener Level
	// als 'Pfadlänge / Gesamtschritte' wie im HUD (der laufende Level zählt erst beim Lösen dazu).
	const enduranceMoves = enduranceSave.getCompletedMoves();
	const enduranceTotal = enduranceSave.getCompletedTotalMoves();
	const enduranceValue = String(enduranceSave.getLevel() + 1)
		+ (enduranceTotal > 0 ? ` (${enduranceMoves.toLocaleString('en-US')} / ${enduranceTotal.toLocaleString('en-US')})` : '');
	return {
		summary: [
			{ label: 'Idle Level', value: String(idleSave.getLevel() + 1) },
			{ label: 'Endless Level', value: String(endlessSave.getLevel() + 1) },
			{ label: 'Endurance Level', value: enduranceValue },
		],
		endlessLevels: endlessSave.listBests().map((b) => ({
			level: b.level + 1,
			moves: b.moves,
			totalMoves: b.totalMoves,
		})),
	};
}

function clearIdleSaves() {
	// Nur den Idle-Save verwerfen, Endless bleibt unangetastet. Idle hat keinen Laby-Cache.
	const dbs = ['idle-laby-save-idle'];
	for (const db of dbs) {
		try { indexedDB.deleteDatabase(db); } catch { /* ignorieren */ }
	}
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => { void bootstrap(); });
} else {
	void bootstrap();
}
