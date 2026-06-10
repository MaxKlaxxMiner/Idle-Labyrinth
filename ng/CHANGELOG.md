# Changelog

Dieses Projekt folgt dem Format von "Keep a Changelog" und SemVer (siehe VERSIONIERUNG.md).

## [Unreleased]
- Build: Wechsel von Webpack 5 auf Vite 6 (Dev-Server, Build, Preview).
- Spielmodi: Idle und Endless über Modus-Strategie (`src/game/modes/`); Hauptmenü mit Modus-Auswahl, Statistik-Ansicht und Hard-Reset (`src/menu/`).
- Ökonomie: Coin-Belohnung mit Wiederholungs-Decay als `bigint` (`src/idle/Coins.ts`).
- Upgrade-Shop: Registry und Kostenformel (`src/idle/Upgrades.ts`), Overlay mit klassenbasierter Sichtbarkeit und Preis-Sortierung (`src/idle/ShopView.ts`); Shop ab Level 5.
- AutoMover: deterministischer, geseedter Bot (`src/game/Bot.ts`) mit Stufen 1-3 (random/smart/smarter) sowie AutoMover-Speed.
- Cache: IndexedDB-basierter `LabyCache` für sehr große Labyrinth-Daten (Chunking).
- Performance: Folge-Level werden in Web Workern parallel vorab generiert (`src/lib/LabyPrefetch.ts`/`LabyWorker.ts`); Levelwechsel übernimmt das fertige Bitset ohne Frame-Hänger oder wartet asynchron auf die laufende Worker-Generierung (kein doppeltes Rechnen), synchron nur bei Kaltstart/Worker-Fehlern; überholte Aufträge und laufende Generierungen alter Level werden verworfen.
- Rendering: Chunked-1px-Bitmap (`PixBuffer256`, 256x256) mit skaliertem Blit; optionale 1px-Gaps zwischen Zellen.
- UI: HUD in eigenes DOM-Element `#hud` ausgelagert; Anzeige von Level, Coins (inkl. erwarteter Belohnung im Idle-Modus), Moves/Gesamt-Moves und Steuerhilfen.
- Steuerung: `Space` setzt im Endless einen Marker bzw. toggelt im Idle den AutoMover, `Enter` zentriert auf Spieler.
- Persistenz: konsolidierter IndexedDB-Save (`GameSave`, eine DB pro Modus-Slot, 6 Stores: state/histories/best/meta/upgrades/clears); Coins als `bigint`. Eingabespur `historyRaw` (`L/R/U/D/B/M`) nur im Endless pro Level, Autosave gedrosselt.
- Doku: Architekturübersicht (`docs/ARCHITEKTUR.md`) und Idle-Konzept (`docs/IDLE_PLAN.md`); `CLAUDE.md` als Mitarbeiterleitfaden.

## [0.1.0] - 2025-08-30
- Initiales Gerüst: TypeScript + Webpack 5 + DevServer.
- Canvas-Rendering (Maze, Spieler, Ziel, HUD).
- Seed-basierter Labyrinth-Generator (`Laby`).
- Diskrete Schrittsteuerung (WASD/Arrow), Zoom (+/-/0), Reset/Hardreset (R).
- Pfad-Historie (`L/R/U/D`) mit halbtransparentem Nachzeichnen, Undo pro Schritt via `Backspace`/`Entf`.
- Persistenz des Fortschritts via `localStorage`.

<!-- Tags/Links können bei Bedarf gepflegt werden
[Unreleased]: ./compare/v0.1.0...HEAD
[0.1.0]: ./releases/tag/v0.1.0
-->
