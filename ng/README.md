# Idle Labyrinth (TypeScript + Vite)

Ein leichtgewichtiges Gerüst für ein webbasiertes Idle-/Labyrinth-Spiel. Implementiert in TypeScript, gebündelt mit Vite 6 und geliefert über den integrierten Dev-Server (HMR).

## Voraussetzungen

- Node.js >= 18
- Ein Paketmanager (`npm`, `yarn`, `pnpm`) – Beispiele unten nutzen `npm`.
- IDE/Editor nach Wahl. Hinweise für JetBrains (WebStorm/IntelliJ IDEA) und VS Code siehe unten.

## Schnellstart

1. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
2. Dev-Server starten (mit HMR):
   ```bash
   npm run dev
   ```
   Lokal erreichbar unter `http://localhost:5173` (Browser wird automatisch geöffnet).
3. Production-Build erstellen:
   ```bash
   npm run build
   ```
   Die gebauten Dateien liegen in `dist/` und können von jedem statischen Webserver bedient werden.
4. Build lokal vorschauen:
   ```bash
   npm run preview
   ```
5. Nur Typprüfung ausführen:
   ```bash
   npm run typecheck
   ```

## Steuerung & Spiellogik (aktuell)

- Bewegung: WASD oder Pfeiltasten; es wird in diskreten Schritten von Knoten zu Knoten bewegt (immer 2 Kacheln).
- Ziel: Das blaue Feld erreichen, um zum nächsten Level zu wechseln.
- Zoom: `+`/`-` zum stufenweisen Zoomen, `0` setzt auf Best-Fit.
- Reset: `R` setzt auf den Startpunkt zurück; wenn bereits am Start, fragt ein Hard-Reset (Spielstand auf Level 1) nach Bestätigung.
- Marker setzen: `Space` markiert die aktuelle Zelle.
- Auf Spieler zentrieren: `Enter`.
- Rendermodus: `T` schaltet zwischen VSync (RAF) und Turbo um.
- Pfad-Historie: Jeder Schritt wird als `L/R/U/D` gespeichert und als halbtransparenter, gelber Weg nachgezeichnet.
- Rückgängig: `Backspace`/`Entf` macht genau einen Schritt rückgängig (bei gedrückt halten Autorepeat).
- Fortschritt: Aktuelles Level wird in `localStorage` gespeichert (`idle-laby-level`), die Eingabespur unter `idle-laby-historyRaw`. Generierte Labyrinth-Daten landen in IndexedDB (`idle-laby-cache`).

## Projektstruktur

- `src/` – TypeScript-Quellcode
  - `index.ts` – Bootstrap (LabyCache init, Canvas finden, `Game` starten)
  - `game/Game.ts` – Game-Loop, Eingabe, Kamera/Zoom, Levellogik, Persistenz
  - `game/Consts.ts` – Farben, Zoomstufen, Größenkonstanten
  - `view/Camera.ts` – Kamerafolge mit Dead-Zone, Zoomverwaltung
  - `view/Level.ts` – Chunked-1px-Bitmap-Rendering mit skaliertem Blit
  - `view/PixBuffer256.ts` – 256x256 Pixelchunk (ImageData + Canvas)
  - `ui/HUDView.ts` – HUD-DOM-Element (`#hud`)
  - `input/Input.ts` – Tastatureingabe (Edge/Pressed/Schrittsteuerung)
  - `lib/Laby.ts` – Deterministischer Labyrinth-Generator, `isFree(x,y)`, `pixWidth`/`pixHeight`
  - `lib/LabyCache.ts` – IndexedDB-Cache (Chunking) für große Labyrinth-Daten
  - `lib/Random.ts` – Mersenne Twister und LCG
  - `lib/StringBuilder.ts` – effizienter String-Aufbau für History
  - `styles.css` – Basis-Styling für HUD/Canvas
- `index.html` – HTML-Template (Vite-Entry mit `<div id="hud">` und `<canvas id="game">`)
- `vite.config.ts` – Vite-Konfiguration (Port 5173, Alias `@/*`)
- `tsconfig.json` – TypeScript-Konfiguration (strict, Alias `@/*` → `src/*`)
- `.gitignore` – übliche Ignorierungen

## Technische Details

- Rendering: Hintergrund-Canvas zeigt eine 1px-Kachelkarte aus 256x256-Chunks, skaliert per `drawImage`. Overlays (Spieler, Ziel, Marker, Pfad-Highlights) liegen im Vordergrund-Canvas. Smoothing ist deaktiviert.
- Grid: Internes Zellenraster wird auf ein expandiertes Raster (`pixWidth` × `pixHeight`, intern `w*2-1` × `h*2-1`) abgebildet. `Laby` stellt `pixWidth`/`pixHeight` bereit; Consumer berechnen diese nicht selbst. `Laby.isFree(x,y)` signalisiert, ob Knoten/Kante/Zelle begehbar ist.
- Generator: `Laby` erzeugt per Seed deterministische Labyrinthe; Levelgröße wächst abhängig vom Verhältnis (nähert den goldenen Schnitt an).
- Cache: `LabyCache` speichert das zuletzt generierte Labyrinth in IndexedDB (Chunking in 8 MiB-Blöcken) und hält es zusätzlich im RAM für synchronen Zugriff.
- Eingabe: `Input.consumeStepKey()` liefert pro Tastendruck genau einen diskreten Schritt; `consumeKey()` und `isPressed()` decken Edge- und Halte-Logik ab.
- Persistenz: Aktuelles Level in `localStorage` (`idle-laby-level`), Eingabespur als `historyRaw` in `localStorage` (`idle-laby-historyRaw`), Labyrinth-Daten in IndexedDB.

## IDE/Editor-Hinweise

- JetBrains (WebStorm/IntelliJ IDEA): Projektordner öffnen, unter „Run/Debug Configurations" `npm run dev`/`build` anlegen. TypeScript nutzt `tsconfig.json`, Navigation/Refactorings erkennen `vite.config.ts` und den Pfad-Alias `@/*`.
- VS Code: Empfohlen sind die Erweiterungen „TypeScript TSServer" (bzw. integriert) und „npm Scripts"; Start der Scripts über das NPM-Panel.

## Weitere Dokumente

- Mitarbeiterleitfaden: `CLAUDE.md`
- Architekturüberblick: `docs/ARCHITEKTUR.md`
- Idle-Konzept: `docs/IDLE_PLAN.md`
- Changelog: `CHANGELOG.md`
- Versionierungsleitfaden: `VERSIONIERUNG.md`

## Deployment

- Mit `npm run build` erzeugte Artefakte aus `dist/` statisch ausliefern (z. B. `nginx`, GitHub Pages, Netlify). Kein Server-Side-Rendering nötig.

## Roadmap / Nächste Schritte

- Idle-Mechanik ausbauen: Coins, Upgrade-Shop, AutoMover, Ratten, Drohnen, getrennte Modi (Story/Endless/Debug). Detailkonzept in `docs/IDLE_PLAN.md`.
- Maze-Algorithmen vergleichen/variieren (z. B. DFS, Wilson, Sidewinder) und die Generator-Parameter exposed machen.
- Persistenz verbessern (Versionierte Saves, Migrationspfad).
- Tests für `Laby.isFree()` und Schrittlogik ergänzen.

## Lizenz

- Laut `package.json`: `UNLICENSED` (kein automatisches Nutzungsrecht). Bei Bedarf Lizenz ergänzen/anpassen.
