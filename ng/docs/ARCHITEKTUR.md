# Architektur und Entwicklerhinweise

Diese Datei beschreibt die aktuelle Struktur, Laufzeitlogik und sinnvolle Erweiterungspunkte des Projekts.

## Übersicht

- `src/index.ts`: Bootstrap, bindet Styles, sucht das Canvas `#game`, instanziert `Game` und startet die Schleife. Legt zu Debugzwecken `window.__game` ab.
- `src/lib/Game.ts`: Zentrale Spielklasse (Game-Loop, Eingabe, Level-/Renderlogik, Persistenz).
- `src/lib/Game.ts`: Zentrale Spielklasse (Game-Loop, Eingabe, Level-/Renderlogik, Persistenz, Pfad-Historie/Undo).
- `src/lib/Laby.ts`: Deterministischer, seed-basierter Labyrinth-Generator mit „expandiertem“ Grid und `isFree(x,y)`-Abfrage.
- `src/lib/Input.ts`: Tastatureingabe (gedebouncte Schrittsteuerung, Zoom, Reset).
- `src/lib/Random.ts`: Zufall (Mersenne Twister + schneller LCG).
- `public/index.html`: Template (via HtmlWebpackPlugin eingebunden).

## Laufzeitarchitektur

1) Bootstrap (`index.ts`)
- Lädt Styles, initialisiert `Game` nach `DOMContentLoaded`.
- Optional: Wenn ein `#status`-Element existiert, setzt es dessen Text (derzeit nicht verwendet, da Vollbild ohne Header).

2) Game-Loop und Zustände (`Game`)
- Start/Stop per `requestAnimationFrame`; `update(dt)` + bedarfsorientiertes `render()` (invalidate via `needsRender`).
- Eingabe: `Input.consumeStepDir()` liefert pro Tastendruck genau einen Schritt (Determinismus durch Prioritätsreihenfolge). `zoomDelta()` steuert Zoom; `consumeKey('r')` für Reset (Edge-getriggert). Zusätzlich Latch-Logik für gehaltenes „R“.
- Undo: `Backspace`/`Delete` macht den letzten Schritt rückgängig (Autorepeat funktioniert über wiederholte `keydown`-Events; `Input.consumeKey()` verarbeitet diese).
- Levelgröße wächst über eine einfache Heuristik (Start 5x5, Zuwachs um 2, Verhältnis nähert goldenen Schnitt an). Seed: `BASE_SEED + w + h + level`.
- Spawn/Goal: Sucht jeweils die nächste freie Innenzelle nahe (1,1) bzw. (pixWidth-2, pixHeight-2).
- Persistenz: Speichert `level` in `localStorage` unter `idle-laby-level`.
- Pfad-Historie: `history: string`, speichert Bewegungen als Zeichenfolge aus `L/R/U/D`. Beim Vorwärtsgehen wird ein Zeichen angehängt; beim Undo entfernt.

3) Rendering (Canvas 2D)
- Verwendet expandierte Maße aus `Laby`: `pixWidth = w*2-1`, `pixHeight = h*2-1` (Consumer rechnen nicht selbst, sondern lesen diese Properties).
- Kachelgröße aus Canvas-Dimensionen, Zoomfaktor und Padding bestimmt; Kamera folgt dem Spieler und wird bei kleinen Labyrinthen zentriert/geclamped.
- Wände/Durchgänge über `Laby.isFree(x,y)`: freie Flächen dunkel, Wände etwas heller; Ziel blau, Spieler gelb (Kreis). Gelaufener Weg wird aus `history` rekonstruiert (Startknoten, Kanten und Zielknoten je Schritt) und halbtransparent gelb übermalt.
- HUD (Level, Moves, Steuerhilfe) oben links.
- Resize passt Auflösung an `devicePixelRatio` (max. 2) an; `imageSmoothing` ist aus.

4) Labyrinth (`Laby`)
- Interne Repräsentation im Zellenraster (komprimiert), Ausgabe über expandiertes Raster (`pixWidth` x `pixHeight`, intern `w*2-1` x `h*2-1`).
- `isFree(x,y)` liefert für Knoten/Kanten/Zellen, ob begehbar ist; Intersections (gerade/gerade) sind Wände.
- Generator baut deterministisch anhand `seed` ein zusammenhängendes Labyrinth.

## Koordinaten und Bewegung

- Expandiertes Raster: Zellen liegen auf ungeraden Koordinaten, Wände/Kanten auf geraden/ungeraden Indizes.
- Schrittweite: immer 2 in Kardinalrichtung (von Knoten zu Knoten). Zwischenliegende Kante muss frei sein.
- Spieler, Spawn, Ziel arbeiten auf expandierten Koordinaten. Kollisionen via `isFree`.

## Erweiterungspunkte

- Labyrinth-Algorithmen: Alternative Generatoren (DFS, Wilson, Sidewinder) und Parameter (Korridorlänge, Verzweigungsgrad).
- Bewegungsmodell: Optional weiches, kontinuierliches Bewegen mit Kollision vs. aktuelles Diskretmodell.
- Idle-Subsystem: Ressourcenproduktion, Upgrades, Offline-Fortschritt, Metaprogression, Prestige.
- UI/HUD: Panels für Stats/Upgrades, eigene Layer für Partikel/Effekte.
- Saves: Versionierte Saves, Migrationspfad; ggf. IndexedDB bei größeren Datenmengen.
- Settings: Key-Rebinding, Zoom-Grenzen, Accessibility (Farben/Schriftgrößen).
- Tests: Unit-Tests für `Laby.isFree()`, Schrittlogik (`canStepTo`), Spawn/Goal-Auswahl.

## Entwicklungs-Workflow

- Scripts: `npm run dev`, `npm run build`, `npm run typecheck`.
- TypeScript: `strict` aktiv; Pfad-Alias `@/*` → `src/*`.
- Webpack DevServer: Port 5173, HMR; Source Maps in Dev (`eval-cheap-module-source-map`), in Prod `source-map`.
