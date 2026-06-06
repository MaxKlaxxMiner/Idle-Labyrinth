# CLAUDE.md

Kurzleitfaden für die Zusammenarbeit in diesem Projekt. Ersetzt das frühere AGENTS.md.

## Sprache
- Konversation: Deutsch.
- Code (Bezeichner, Implementierung): Englisch.
- Kommentare und Dokumentation (Readme, Docs, Code-Kommentare): Deutsch.
- Sprachspezifische Zeichen (ä, ö, ü, ß) sind explizit erwünscht.
- Gedankenstriche, Pfeile, typografische Anführungszeichen und besondere Unicode-Zeichen (z. B. Smileys) sind im Chat gerne erlaubt; in Code und Dokumentation stattdessen einfache Anführungszeichen, `->` als Pfeil und das normale Minus als Bindestrich verwenden. Ausnahme: Zeichen, die bewusst Teil des Spiels/der UI sind (z. B. die Pfeil-Glyphen im HUD).
- Kommentare neutral/zeitlos formulieren (keine Formulierungen wie "neu", "vorher", "nicht mehr").

## Arbeitsweise
- Änderungen klein und fokussiert halten; größere Aufgaben vorab planen, dann inkrementell umsetzen.
- Erst planen, dann implementieren; frühe Zwischenschritte bevorzugen, um Feedback zu ermöglichen.
- Nach Codeänderungen reicht `npm run typecheck`.
- Der Dev-Server läuft beim Maintainer (HMR via Vite, Port 5173) - kein Start nötig.
- Tooling: Wenn ein LSP-Tool verfügbar ist (TypeScript-LSP `plugin:typescript-lsp:typescript`), bei Code-Navigation/-Analyse bevorzugt nutzen (`hover`, `goToDefinition`, `findReferences`, `documentSymbol`, Call-Hierarchy) statt rein per Grep. Erster Aufruf kann verzögert sein (Server startet), danach reagiert er sofort.

## Git & Commits
- Branch: direkte lokale Commits auf `master` sind erlaubt. Keine Pushes.
- Commit-Prefix: jede Nachricht beginnt mit `laby: `.
- Zeitpunkt: erst committen, nachdem die stabile Funktionsweise direkt oder indirekt bestätigt wurde.
- Keine Änderungen an der Git-Repo-Konfiguration (Name/E-Mail).

## Projektüberblick
- Stack: TypeScript (strict) + Vite 6, Canvas-2D-Rendering, IndexedDB-Cache für Labyrinth-Daten.
- Pfad-Alias: `@/*` -> `src/*`.
- Module:
  - `src/index.ts` - Bootstrap, initialisiert `LabyCache` und startet `Game`.
  - `src/game/` - `Game`, `Consts` (Farben, Zoomstufen, Tilegrößen).
  - `src/view/` - `Camera`, `Level` (Chunked-Bitmap-Renderer), `PixBuffer256` (256x256-Chunk).
  - `src/ui/` - `HUDView` (DOM-Element `#hud`).
  - `src/input/` - `Input` (Tastatur, Edge/Pressed-Logik).
  - `src/lib/` - `Laby` (Generator + `isFree`), `LabyCache` (IndexedDB), `Random`, `StringBuilder`.

## Scripts
- `npm run dev` - Vite-Dev-Server (Port 5173, HMR, auto-open).
- `npm run build` - Production-Build nach `dist/`.
- `npm run preview` - Vorschau eines Builds.
- `npm run typecheck` - `tsc --noEmit`.

## Weiterführende Dokumente
- `README.md` - Steuerung, Schnellstart, Roadmap.
- `docs/ARCHITEKTUR.md` - Laufzeitarchitektur, Module, Erweiterungspunkte.
- `docs/IDLE_PLAN.md` - Konzept für die Idle-Game-Ausbaustufe (Coins, Upgrades, AutoMover, Ratten, Modi).
- `CHANGELOG.md`, `VERSIONIERUNG.md` - SemVer-Leitfaden und Verlauf.
