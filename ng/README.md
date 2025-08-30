# Idle Labyrinth (TypeScript + Webpack)

Ein leichtgewichtiges Gerüst für ein webbasiertes Idle-/Labyrinth-Spiel. Implementiert in TypeScript, gebündelt mit Webpack 5 und geliefert über den integrierten Dev-Server (HMR).

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
   Lokal erreichbar unter `http://localhost:5173` (automatisches Öffnen ist deaktiviert).
3. Production-Build erstellen:
   ```bash
   npm run build
   ```
   Die gebauten Dateien liegen in `dist/` und können von jedem statischen Webserver bedient werden.
4. Nur Typprüfung ausführen:
   ```bash
   npm run typecheck
   ```

## Steuerung & Spiellogik (aktuell)

- Bewegung: WASD oder Pfeiltasten; es wird in diskreten Schritten von Knoten zu Knoten bewegt (immer 2 Kacheln).
- Ziel: Das blaue Feld erreichen, um zum nächsten Level zu wechseln.
- Zoom: `+`/`-` zum stufenweisen Zoomen, `0` setzt den Zoom zurück.
- Reset: `R` setzt auf den Startpunkt zurück; wenn bereits am Start, fragt ein Hard-Reset (Spielstand auf Level 1) nach Bestätigung.
- Fortschritt: Das aktuelle Level wird in `localStorage` gespeichert (`idle-laby-level`).

## Projektstruktur

- `src/` – TypeScript-Quellcode
  - `index.ts` – Bootstrapping (Canvas finden, `Game` starten)
  - `lib/Game.ts` – Game-Loop, Eingabe, Kamera/Zoom, Rendering, Level-Logik
  - `lib/Laby.ts` – Labyrinth-Generator (deterministisch, seed-basiert), sowie `isFree(x,y)`-Abfrage im expandierten Grid
  - `lib/Input.ts` – Tastatureingaben (gedebouncte Richtungs-Schritte, Zoom, Reset)
  - `lib/Random.ts` – Zufallshelfer (Mersenne Twister / leichter LCG)
  - `styles.css` – Basis-Styling für HUD/Canvas
- `public/index.html` – HTML-Template (via HtmlWebpackPlugin eingebunden)
- `webpack.config.js` – Webpack- und Dev-Server-Konfiguration (Port 5173, HMR)
- `tsconfig.json` – TypeScript-Konfiguration (Alias `@/*` auf `src/*`)
- `.gitignore` – übliche Ignorierungen

## Technische Details

- Rendering: 2D-Canvas mit einfacher Kachel-/Kantenzeichnung; Kamera folgt dem Spieler, Clamping bei kleinen Labyrinthen.
- Grid: Internes Zellenraster wird auf ein „expandiertes“ Raster (`w*2-1` x `h*2-1`) abgebildet. `Laby.isFree(x,y)` signalisiert, ob eine Zelle/ Kante begehbar ist.
- Generator: `Laby` erzeugt per seed deterministische Labyrinthe; Levelgröße wächst abhängig vom Verhältnis (nähert den goldenen Schnitt an).
- Eingabe: `Input.consumeStepDir()` liefert pro Tastendruck genau einen diskreten Schritt; `zoomDelta()` und `consumeKey()` steuern Zoom/Reset.
- Persistenz: Aktuelles Level wird in `localStorage` gesichert; Hard-Reset setzt den Eintrag zurück.
- Build: Production-Bundle mit Content-Hashing, `source-map` aktiv; Dev nutzt `eval-cheap-module-source-map`.

## IDE/Editor-Hinweise

- JetBrains (WebStorm/IntelliJ IDEA): Projektordner öffnen, unter „Run/Debug Configurations“ `npm run dev`/`build` anlegen. TypeScript nutzt `tsconfig.json`, Navigation/Refactorings erkennen `webpack.config.js` und den Pfad-Alias `@/*`.
- VS Code: Empfohlen sind die Erweiterungen „TypeScript TSServer“ (bzw. integriert), „ESLint“ (falls später hinzugefügt) und „npm Scripts“; Start der Scripts über das NPM-Panel.

## Weitere Dokumente

- Architekturüberblick: `docs/ARCHITEKTUR.md`
- Changelog: `CHANGELOG.md`
- Versionierungsleitfaden: `VERSIONIERUNG.md`

## Deployment

- Mit `npm run build` erzeugte Artefakte aus `dist/` statisch ausliefern (z. B. `nginx`, GitHub Pages, Netlify). Kein Server-Side-Rendering nötig.

## Roadmap / Nächste Schritte

- Maze-Algorithmen vergleichen/variieren (z. B. DFS, Wilson, Sidewinder) und die Generator-Parameter exposed machen.
- Idle-Mechanik ausbauen (Ressourcen, Upgrades, Offline-Fortschritt, Metaprogression).
- Rendering modularisieren (z. B. einfache Scene-/Layer-Struktur oder ECS-Light).
- Persistenz verbessern (Migrationspfad, ggf. IndexedDB für größere Saves).
- Tests für `Laby.isFree()` und Schrittlogik ergänzen.

## Lizenz

- Laut `package.json`: `UNLICENSED` (kein automatisches Nutzungsrecht). Bei Bedarf Lizenz ergänzen/anpassen.
