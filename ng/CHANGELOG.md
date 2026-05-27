# Changelog

Dieses Projekt folgt dem Format von „Keep a Changelog" und SemVer (siehe VERSIONIERUNG.md).

## [Unreleased]
- Build: Wechsel von Webpack 5 auf Vite 6 (Dev-Server, Build, Preview).
- Cache: IndexedDB-basierter `LabyCache` für sehr große Labyrinth-Daten (Chunking).
- Rendering: Chunked-1px-Bitmap (`PixBuffer256`, 256x256) mit skaliertem Blit; optionale 1px-Gaps zwischen Zellen.
- UI: HUD in eigenes DOM-Element `#hud` ausgelagert; Anzeige von Tile-Größe, Rendermodus und FPS.
- Steuerung: `Space` setzt Marker, `Enter` zentriert auf Spieler, `T` schaltet zwischen VSync und Turbo.
- Persistenz: Eingabespur `historyRaw` (`L/R/U/D/B/M`) in `localStorage`, Autosave gedrosselt.
- Doku: Architekturübersicht ergänzt (`docs/ARCHITEKTUR.md`), Rendering-Leitfaden (`docs/RENDERING_TODO.md`), `CLAUDE.md` als Mitarbeiterleitfaden.

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
