# Idle Labyrinth (TypeScript + Webpack)

Ein minimales Grundgerüst für ein webbasiertes Idle-Game mit Labyrinth-Fokus. Erstellt mit TypeScript, gebündelt via Webpack 5 und lokalem Dev-Server.

## Voraussetzungen

- Node.js >= 18
- Paketmanager Ihrer Wahl (`npm`, `yarn`, `pnpm`). Beispiele unten nutzen `npm`.
- GoLand: Projektordner öffnen, JavaScript/TypeScript-Unterstützung aktiv, `package.json` wird automatisch erkannt (Run/Debug über npm-Scripts).

## Entwicklung

1. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
2. Dev-Server starten (mit HMR):
   ```bash
   npm run dev
   ```
   Öffnet `http://localhost:5173`.
3. Production-Build erzeugen:
   ```bash
   npm run build
   ```
   Artefakte liegen in `dist/`.
4. Nur Typprüfung:
   ```bash
   npm run typecheck
   ```

## Struktur

- `src/` – TypeScript-Quellcode
  - `index.ts` – Einstiegspunkt (bootstrapt Spiel)
  - `lib/Game.ts` – Simple Game-Loop + Rendering
  - `lib/Maze.ts` – Platzhalter Maze-Generator
  - `styles.css` – Basistyle
- `public/index.html` – HTML-Template (HtmlWebpackPlugin)
- `webpack.config.js` – Webpack + Dev-Server Konfiguration
- `tsconfig.json` – TypeScript-Konfiguration
- `.gitignore` – übliche Ignorierungen

## Hinweise für GoLand

- Öffnen Sie den Projektordner. Unter „Run/Debug Configurations“ können Sie `npm run dev` und `npm run build` direkt anlegen.
- Der integrierte TypeScript-Service nutzt `tsconfig.json`. Webpack-Konfiguration (`webpack.config.js`) wird für Navigation/Refactorings erkannt.

## Nächste Schritte

- Maze-Algorithmus durch einen echten Generator ersetzen (z. B. DFS/Wilson/Sidewinder).
- Idle-Mechanik (Ressourcen, Upgrades, Offline-Fortschritt) modellieren.
- Rendering modularisieren (z. B. ECS oder einfache Scene/Layer-Struktur).
- Persistenz via `localStorage` oder IndexedDB.

