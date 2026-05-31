# Architektur und Entwicklerhinweise

Diese Datei beschreibt die aktuelle Struktur, Laufzeitlogik und sinnvolle Erweiterungspunkte des Projekts.

## Übersicht

- `src/index.ts`: Bootstrap. Lädt Styles, initialisiert `LabyCache` (IndexedDB), sucht das Canvas `#game`, instanziert `Game` und startet die Schleife. Legt zu Debugzwecken `window.__game` ab.
- `src/game/Game.ts`: Zentrale Spielklasse (Game-Loop, Eingabe, Level-/Renderlogik, Persistenz, Pfad-Historie/Undo).
- `src/game/Consts.ts`: Zentrale Konstanten (Farben, Zoomstufen, Tile-/Pad-Größen, "large levels").
- `src/view/Camera.ts`: Kameraverwaltung mit Dead-Zone-Follow, Zoom (Index in `Consts.zoom.steps`) und Best-Fit-Initialisierung.
- `src/view/Level.ts`: Renderer auf einem Hintergrund-Canvas. Erzeugt ein 1px-Kachelbild aus 256x256-Chunks und blittet es skaliert mit `drawImage`. Zeichnet optional 1px-Gaps zwischen den Zellen.
- `src/view/PixBuffer256.ts`: Wrapper um ein 256x256-`ImageData` + Canvas für direkte Uint32-Pixelmanipulation.
- `src/ui/HUDView.ts`: Schreibt den HUD-Text in das DOM-Element `#hud`.
- `src/input/Input.ts`: Tastatureingabe (gedrückt/edge-getriggert). `consumeStepKey()` liefert pro Tastendruck genau eine Richtung `L/R/U/D` (deterministische Priorität); `consumeKey()` für Edge-Tasten, `isPressed()` für Halte-Logik.
- `src/lib/Laby.ts`: Deterministischer, seed-basierter Labyrinth-Generator. Stellt das "expandierte" Grid (`pixWidth` x `pixHeight`) sowie `isFree(x,y)` bereit.
- `src/lib/LabyCache.ts`: IndexedDB-Cache mit Chunking (8 MiB pro Chunk), hält das zuletzt generierte Level zusätzlich im RAM, damit `readLaby()` synchron nutzbar ist.
- `src/lib/Random.ts`: Mersenne Twister + schneller LCG.
- `src/lib/StringBuilder.ts`: Effizienter String-Aufbau (für `history`/`historyRaw`).
- `index.html`: Vite-Entry mit `<div id="hud">` und `<canvas id="game">`.

## Laufzeitarchitektur

1) Bootstrap (`index.ts`)
- Lädt Styles, initialisiert `LabyCache` asynchron und ruft danach `new Game(canvas).start()` auf.
- Wenn ein `#status`-Element existiert, dient es lediglich als Lade-Hinweis bis zum Start.

2) Game-Loop und Zustände (`Game`)
- Zwei Modi: VSync (`requestAnimationFrame`) und Turbo (Timeout-basiert, ohne VSync). Umschalten über die Taste `T`.
- `update(dt)` + bedarfsorientiertes `render()` (invalidate via `needsRender`).
- Eingabe: `Input.consumeStepKey()` liefert pro Tastendruck eine Richtung als Zeichen `L/R/U/D`; `consumeKey('r')`/`consumeKey(' ')`/`consumeKey('Enter')` etc. für Edge-Trigger; Halten-Logik via `isPressed()`.
- Undo: `Backspace`/`Delete` macht den letzten Schritt rückgängig (Autorepeat funktioniert über wiederholte `keydown`-Events).
- Marker: `Space` markiert die aktuelle Zelle (in `markers: Set<number>`).
- Levelgröße wächst über eine einfache Heuristik (Start 5x5, Zuwachs um 2, Verhältnis nähert goldenen Schnitt an). Seed: `Consts.labySeedBase + w + h + level`.
- Spawn/Goal: Sucht jeweils die nächste freie Innenzelle nahe (1,1) bzw. (pixWidth-2, pixHeight-2).
- Persistenz: `level` in `localStorage` unter `idle-laby-level`. Labyrinth-Daten in IndexedDB via `LabyCache` (Datenbank `idle-laby-cache`).
- Pfad-Historie: `history` als `StringBuilder` mit `L/R/U/D` (Vorwärtsschritt anhängen, Undo entfernen).
- Eingabe-Rohspur: `historyRaw` behält alle Eingaben (`L/R/U/D`, `B` für Undo, `M` für Marker). Wird beim Level-Reset geleert.
- Speicherung `historyRaw`: Schlüssel `idle-laby-historyRaw`. Bei Levelwechsel/Restart wird sofort ein leerer Verlauf gespeichert. Während des Spiels Autosave höchstens alle 3s und nur bei Änderungen. Beim Start wird ein vorhandener Verlauf geladen und vollständig abgespielt (Rekonstruktion von Weg, Markern und Undo-Historie).

3) Rendering
- Hintergrund-Canvas (`#game`): `Level` führt eine Chunked-Pixelkarte (1px = 1 Zelle), feste Chunkgröße 256x256, lazy erstellt beim ersten Bedarf. Farbwerte werden vorab als gepackte Uint32 abgelegt; Pixelmanipulation erfolgt direkt über `PixBuffer256.u32`.
- Sichtbarkeit: aus Kamera-Offsets und Tile-Größe wird der sichtbare Pixelbereich berechnet; es werden nur die schneidenden Chunks aktualisiert und per skaliertem `drawImage` geblittet (`imageSmoothingEnabled = false`).
- Gaps: Ab `tileSize >= Consts.sizes.gapThreshold` werden 1px-Linien in Hintergrundfarbe zwischen den Zellen gezeichnet (Overlay über den Blit).
- Vordergrund-Canvas (`#game-fg`, zur Laufzeit erstellt): zeichnet Spieler, Ziel und Effekte. `pointer-events: none`, liegt mit `z-index: 1` über dem Hintergrund.
- HUD: `HUDView` aktualisiert das DOM-Element `#hud` (Level, Moves, Tile, Modus, FPS, Steuerhilfen).
- Resize passt die Bitmap-Auflösung an `devicePixelRatio` (max. `Consts.display.dprMax`) an.

4) Labyrinth (`Laby`)
- Interne Repräsentation im Zellenraster (komprimiert in `Uint32Array`, 2 Wandbits + 30 Bit Gruppen-ID pro Zelle); Ausgabe über das expandierte Raster (`pixWidth` x `pixHeight`, intern `w*2-1` x `h*2-1`).
- `isFree(x,y)` liefert für Knoten/Kanten/Zellen, ob begehbar ist; Intersections (gerade/gerade) sind Wände.
- Generator baut deterministisch anhand `seed` ein zusammenhängendes Labyrinth (Wand-Stürze + Restdurchläufe), Endlagen werden komprimiert und in `LabyCache` gespeichert.

## Koordinaten und Bewegung

- Expandiertes Raster: Zellen liegen auf ungeraden Koordinaten, Wände/Kanten auf geraden/ungeraden Indizes.
- Schrittweite: immer 2 in Kardinalrichtung (von Knoten zu Knoten). Zwischenliegende Kante muss frei sein.
- Spieler, Spawn, Ziel arbeiten auf expandierten Koordinaten. Kollisionen via `isFree`.

## Erweiterungspunkte

- Labyrinth-Algorithmen: Alternative Generatoren (DFS, Wilson, Sidewinder) und Parameter (Korridorlänge, Verzweigungsgrad).
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
