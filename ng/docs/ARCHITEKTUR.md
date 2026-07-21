# Architektur und Entwicklerhinweise

Diese Datei beschreibt die aktuelle Struktur, Laufzeitlogik und sinnvolle Erweiterungspunkte des Projekts.

## Übersicht

- `src/index.ts`: Bootstrap. Lädt Styles, initialisiert pro Modus einen `GameSave` (Slots `idle`/`endless`/`endurance`) und - für Endless und Endurance - je einen `LabyCache` (IndexedDB) parallel, zeigt das `MainMenu` und startet `Game` erst bei Modus-Auswahl mit `GameOptions` (`cache`/`save`/`mode`/`onExit`). Legt zu Debugzwecken `window.__game` ab.
- `src/game/Game.ts`: Zentrale Spielklasse (Game-Loop, Eingabe, Level-/Renderlogik, Persistenz, Pfad-Historie/Undo).
- `src/game/Consts.ts`: Zentrale Konstanten (Farben, Zoomstufen, Tile-/Pad-Größen, "large levels", Bot-Timing).
- `src/game/Bot.ts`: AutoMover (Verhalten gestaffelt nach gekaufter Upgrade-Stufe, deterministischer RNG je Level).
- `src/game/LabyParams.ts`: Reine Funktion `labyParamsForLevel(level)` -> `{width, height, seed}` (Größenheuristik + Seed-Formel, gemeinsam genutzt von Spiel und Vorab-Generierung).
- `src/game/modes/`: Modus-Strategie - `GameMode` (Interfaces `GameModeStrategy`/`ModeHost`), `IdleMode`, `EndlessMode`, `EnduranceMode` (wie Endless, aber Level +1; beim Lösen wird der Level-Fortschritt verworfen, keine Bestwerte).
- `src/idle/Coins.ts`: Coin-Belohnung (bigint) inkl. Wiederholungs-Decay.
- `src/idle/Upgrades.ts`: Upgrade-Registry und Kostenformel (ganzzahlig, bigint).
- `src/idle/ShopView.ts`: Shop-Overlay (klassenbasierte Sichtbarkeit, Preis-Sortierung, In-Place-Update).
- `src/menu/MainMenu.ts`: Hauptmenü (Modus-Auswahl, Statistik, Hard-Reset); `src/menu/MenuBackground.ts`: animierter Labyrinth-Hintergrund.
- `src/view/Camera.ts`: Kameraverwaltung mit Dead-Zone-Follow, Zoom (Index in `Consts.zoom.steps`) und Best-Fit-Initialisierung.
- `src/view/Level.ts`: Renderer auf einem Hintergrund-Canvas. Erzeugt ein 1px-Kachelbild aus 256x256-Chunks und blittet es skaliert mit `drawImage`. Zeichnet optional 1px-Gaps zwischen den Zellen.
- `src/view/PixBuffer256.ts`: Wrapper um ein 256x256-`ImageData` + Canvas für direkte Uint32-Pixelmanipulation.
- `src/ui/HUDView.ts`: Schreibt den HUD-Text in das DOM-Element `#hud`.
- `src/input/Input.ts`: Tastatureingabe (gedrückt/edge-getriggert). `consumeStepKey()` liefert pro Tastendruck genau eine Richtung `L/R/U/D` (deterministische Priorität); `consumeKey()` für Edge-Tasten, `isPressed()` für Halte-Logik.
- `src/lib/Laby.ts`: Deterministischer, seed-basierter Labyrinth-Generator. Stellt das "expandierte" Grid (`pixWidth` x `pixHeight`) sowie `isFree(x,y)` bereit; das fertige Labyrinth ist vollständig durch das gepackte Bitset `bits` (Uint32Array) repräsentiert und kann auch direkt aus vorab generierten Wanddaten entstehen (`bits`-Parameter).
- `src/lib/LabyCache.ts`: IndexedDB-Cache mit Chunking (8 MiB pro Chunk), hält das zuletzt generierte Level zusätzlich im RAM, damit `readLaby()` synchron nutzbar ist.
- `src/lib/LabyPrefetch.ts`: Vorab-Generierung der Folge-Level in einem Web-Worker-Pool (logische Cores - 1, gedeckelt über `Consts.labyPrefetchMaxWorkers`); vorgehalten werden `Consts.labyPrefetchDepth` Folge-Level als Bitsets in einer In-Memory-Map, abgeholt beim Levelwechsel per `take()` oder - wenn noch nicht fertig - asynchron per `acquire()`; `discardBelow()` räumt überholte Aufträge ab.
- `src/lib/LabyWorker.ts`: Worker-Entry der Generierung (empfängt `{level, width, height, seed}`, sendet das Bitset per Transferable zurück).
- `src/lib/GameSave.ts`: Spielstand in IndexedDB, eine DB pro Modus-Slot (`idle-laby-save-<slot>`, 6 Object-Stores).
- `src/lib/Random.ts`: Mersenne Twister + schneller LCG.
- `src/lib/StringBuilder.ts`: Effizienter String-Aufbau (für `history`/`historyRaw`).
- `index.html`: Vite-Entry mit `<div id="hud">` und `<canvas id="game">`.

## Laufzeitarchitektur

1) Bootstrap (`index.ts`)
- Lädt Styles, initialisiert pro Modus einen `GameSave` (`idle`/`endless`/`endurance`) und - für Endless und Endurance - je einen `LabyCache` parallel und zeigt das `MainMenu`.
- `Game` wird erst bei Modus-Auswahl mit `GameOptions` (`{cache, save, mode, onExit, replayLevel?}`) instanziert und gestartet; `onExit` (returnToMenu) disposed das laufende `Game` und zeigt das Menü erneut.

2) Game-Loop und Zustände (`Game`)
- RAF-getriebene Loop (`requestAnimationFrame`); siehe `start()` in `src/game/Game.ts`.
- `update(dt)` + bedarfsorientiertes `render()` (invalidate via `needsRender`).
- Eingabe: `Input.consumeStepKey()` liefert pro Tastendruck eine Richtung als Zeichen `L/R/U/D`; `consumeKey('r')`/`consumeKey(' ')`/`consumeKey('Enter')` etc. für Edge-Trigger; Halten-Logik via `isPressed()`.
- Undo: `Backspace` macht den letzten Pfadschritt rückgängig und zählt als Zug (Autorepeat funktioniert über wiederholte `keydown`-Events). In Endless und Endurance ist `Delete` ein echtes Undo: es kürzt die Bewegungsspur um ihr letztes Zeichen und invertiert dessen Wirkung - ein Vorwärtsschritt wird ausgetragen (Trail-Zellen zurück auf Grundfarbe), ein Rückschritt wieder vorwärts aufgelöst; `totalMoves` sinkt immer um 1. Es verbraucht einen Undo-Punkt (alle `Consts.endlessUndoPointEverySteps` Vorwärtsschritte gibt es einen, Reset bei Levelstart); ohne Punkte keine Reaktion. Im Idle wirkt `Delete` wie `Backspace`.
- Marker: `Space` markiert die aktuelle Zelle (in `markers: Set<number>`).
- Levelgröße wächst über eine einfache Heuristik (Start 5x5, Zuwachs um 2, Verhältnis nähert goldenen Schnitt an). Seed: `Consts.labySeedBase + w + h + level`. Beides gekapselt in `labyParamsForLevel` (`src/game/LabyParams.ts`).
- Spawn/Goal: Sucht jeweils die nächste freie Innenzelle nahe (1,1) bzw. (pixWidth-2, pixHeight-2).
- Persistenz: `GameSave` (IndexedDB, eine DB pro Modus-Slot `idle-laby-save-<slot>`) hält das aktuelle `level` (Store `state`), Coins (bigint), gekaufte Upgrade-Stufen und Wiederholungszähler sowie - in Endless/Endurance - Verlauf und Marker pro Level; Bestwerte nur im Endless (Endurance verwirft den Fortschritt gelöster Level in `onLevelSolved` und summiert stattdessen deren Pfadlänge und Gesamtschritte im Store `meta` auf). Labyrinth-Daten werden nur in Endless/Endurance gecacht (`LabyCache`, Datenbank `idle-laby-cache-<slot>`); der Idle-Modus generiert jedes Level deterministisch neu (kein Labyrinth-Cache). Kein `localStorage`.
- Pfad-Historie: `history` als `StringBuilder` mit `L/R/U/D` (Vorwärtsschritt anhängen, Undo entfernen).
- Eingabe-Rohspur: `historyRaw` ist die vollständige Bewegungsspur - Großbuchstaben `L/R/U/D` für Vorwärtsschritte, Kleinbuchstaben `l/r/u/d` für Rückschritte (Backspace oder Gegenrichtung; das Zeichen benennt den zurückgenommenen Vorwärtsschritt). Jedes Zeichen ist lokal invertierbar, das echte Undo (Entf) kürzt die Spur daher einfach um ihr letztes Zeichen. Marker liegen nicht in der Spur (rote wie grüne werden als Koordinatenliste gespeichert, siehe unten). Wird beim Level-Reset geleert.
- Speicherung `historyRaw`: über `GameSave` im IndexedDB-Store `histories` (pro Level, als `{ raw, undoPoints }` - der Undo-Punktestand ist aus der kürzbaren Spur nicht rekonstruierbar und wird deshalb mitgespeichert). Nur in Modi mit `usesHistory()` (Endless und Endurance). Bei Levelwechsel/Restart wird sofort ein leerer Verlauf gespeichert. Während des Spiels Autosave höchstens alle 1s und nur bei Änderungen. Beim Start wird ein vorhandener Verlauf geladen und vollständig abgespielt (Rekonstruktion von Weg, Zählern und Trail-Farben); rote und grüne Marker kommen anschließend als Koordinatenlisten aus den Stores `redMarkers`/`greenMarkers`.

3) Rendering
- Hintergrund-Canvas (`#game`): `Level` führt eine Chunked-Pixelkarte (1px = 1 Zelle), feste Chunkgröße 256x256, lazy erstellt beim ersten Bedarf. Farbwerte werden vorab als gepackte Uint32 abgelegt; Pixelmanipulation erfolgt direkt über `PixBuffer256.u32`.
- Sichtbarkeit: aus Kamera-Offsets und Tile-Größe wird der sichtbare Pixelbereich berechnet; es werden nur die schneidenden Chunks aktualisiert und per skaliertem `drawImage` geblittet (`imageSmoothingEnabled = false`).
- Gaps: Ab `tileSize >= Consts.sizes.gapThreshold` werden 1px-Linien in Hintergrundfarbe zwischen den Zellen gezeichnet (Overlay über den Blit).
- Vordergrund-Canvas (`#game-fg`, zur Laufzeit erstellt): zeichnet Spieler, Ziel und Effekte. `pointer-events: none`, liegt mit `z-index: 1` über dem Hintergrund.
- HUD: `HUDView` aktualisiert das DOM-Element `#hud` (Level, im Idle-Modus zusätzlich Coins inkl. erwarteter Belohnung, Moves/Gesamt-Moves sowie Steuerhilfen).
- Resize passt die Bitmap-Auflösung an `devicePixelRatio` (max. `Consts.display.dprMax`) an.

4) Labyrinth (`Laby`)
- Interne Repräsentation im Zellenraster (komprimiert in `Uint32Array`, 2 Wandbits + 30 Bit Gruppen-ID pro Zelle); Ausgabe über das expandierte Raster (`pixWidth` x `pixHeight`, intern `w*2-1` x `h*2-1`).
- `isFree(x,y)` liefert für Knoten/Kanten/Zellen, ob begehbar ist; Intersections (gerade/gerade) sind Wände.
- Generator baut deterministisch anhand `seed` ein zusammenhängendes Labyrinth (Wand-Stürze + Restdurchläufe); Endlagen werden komprimiert (Bitset `bits`) und - sofern ein `LabyCache` übergeben wurde (Endless/Endurance) - dort gespeichert.
- Vorab-Generierung: nur in Modi mit `usesPrefetch()` (aktuell Idle - dort werden Level teils sehr schnell durchgespielt; Endless/Endurance generieren beim Levelwechsel direkt). `Game.initLevel` stößt über `LabyPrefetch` die nächsten `Consts.labyPrefetchDepth` Level (Folge aus `computeNextLevel`) in Web Workern an; der Pool umfasst logische Cores - 1 Worker, gedeckelt auf `Consts.labyPrefetchMaxWorkers`. Der Worker führt dieselbe Generierung aus und liefert das Bitset per Transferable; beim Levelwechsel übernimmt der `Laby`-Konstruktor es über den `bits`-Parameter (und legt es im Endless zusätzlich in den `LabyCache`). Ist das Ergebnis noch nicht da, wartet der Main-Thread asynchron auf die laufende Worker-Generierung (Simulation pausiert über `levelLoading`, der Bot-Takt beginnt im neuen Level frisch) - so wird kein Level doppelt gerechnet. Synchron generiert der Main-Thread nur beim Kaltstart, bei Worker-Fehlern oder ohne Worker-Unterstützung. Beim Levelwechsel verwirft `discardBelow()` überholte Aufträge und bricht laufende Generierungen älterer Level ab; ein erneuter Start desselben Levels (R-Reset) verwendet die vorhandene Laby-Instanz wieder. Speicher fällt im Wesentlichen nur während der Generierung an (transienter Puffer 4 Bytes pro Zelle im jeweiligen Worker); die gepufferten Bitsets selbst sind klein (2 Bits pro Zelle).

## Koordinaten und Bewegung

- Expandiertes Raster: Zellen liegen auf ungeraden Koordinaten, Wände/Kanten auf geraden/ungeraden Indizes.
- Schrittweite: immer 2 in Kardinalrichtung (von Knoten zu Knoten). Zwischenliegende Kante muss frei sein.
- Spieler, Spawn, Ziel arbeiten auf expandierten Koordinaten. Kollisionen via `isFree`.

## Erweiterungspunkte

- Bewegungsmodell: Optional weiches, kontinuierliches Bewegen mit Kollision vs. aktuelles Diskretmodell.
- Idle-Subsystem: Ressourcenproduktion, Upgrades, Offline-Fortschritt, Metaprogression, Prestige.
- UI/HUD: Panels für Stats/Upgrades, eigene Layer für Partikel/Effekte.
- Saves: Versionierte Saves, Migrationspfad; bei sehr großen Daten ggf. weiterer IndexedDB-Store.
- Settings: Key-Rebinding, Zoom-Grenzen, Accessibility (Farben/Schriftgrößen).
- Tests: Unit-Tests für `Laby.isFree()`, Schrittlogik, Spawn/Goal-Auswahl.

## Entwicklungs-Workflow

- Scripts: `npm run dev`, `npm run build`, `npm run preview`, `npm run typecheck`.
- TypeScript: `strict` aktiv; Pfad-Alias `@/*` -> `src/*`.
- Vite-Dev-Server: Port 5173, HMR, `open: true`. Production-Build erzeugt Sourcemaps.
- Toolchain-Bindung an Vite 6 (Rollup + esbuild): Unter einem MSYS2/MinGW-Node (GCC-Build, erkennbar an `process.config.variables.shlib_suffix === "dll.a"`) ist Vite 8 nicht lauffähig. Vite 8 ersetzt esbuild durch Rolldown (napi-rs); dessen Loader klassifiziert den Node als `win32-x64-gnu`, wofür kein natives Binding publiziert wird (nur `-msvc`, das gegen die GCC-`libnode.dll` nicht lädt). Die WASM-Variante (`@rolldown/binding-wasm32-wasi` + `NAPI_RS_FORCE_WASI`) lädt zwar, löst aber Windows-Absolutpfade nicht auf (`UNRESOLVED_ENTRY`). Bekanntes Ökosystem-Problem (rolldown#2030, vitejs/vite#20550, napi-rs#2001). Ein sauberes Full-Audit setzt offizielles MSVC-Node + Vite 8 voraus.
- Audit-Hinweis: Die esbuild-Warnung GHSA-gv7w-rqvm-qjhr (high) ist hier ohne praktisches Risiko - sie betrifft nur esbuilds Deno-Installationspfad mit feindlichem `NPM_CONFIG_REGISTRY`; esbuild ist reine devDependency und landet nicht in `dist/`. `npm audit --omit=dev` meldet 0.
