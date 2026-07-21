# Idle Labyrinth (TypeScript + Vite)

Ein webbasiertes Idle-/Labyrinth-Spiel: erst löst man die Level von Hand, verdient dabei Coins und schaltet schrittweise eine Lösungs-Automatik (AutoMover) frei, die die Labyrinthe zunehmend selbst löst. Implementiert in TypeScript (strict), gebündelt mit Vite 6, Canvas-2D-Rendering, Spielstände in IndexedDB.

## Voraussetzungen

- Node.js >= 18
- Ein Paketmanager (`npm`, `yarn`, `pnpm`) - Beispiele unten nutzen `npm`.
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

## Spielmodi

Im Hauptmenü wählbar:

- **Idle** (Hauptmodus): inkrementeller Levelaufstieg. Jedes gelöste Level gibt Coins, mit Wiederholungs-Decay (mehrfaches Lösen desselben Levels zahlt absteigend). Ab Level 5 erscheint der **Shop** mit Upgrades - allen voran der **AutoMover** (Random -> Smart -> Smarter -> ...) und **AutoMover-Speed**. Per Leertaste schaltet man den gekauften AutoMover an/aus; er löst die Level dann selbst und verdient weiter Coins (auch bei offenem Shop). Der AutoMover ist pro Level deterministisch geseedet - gleiches Level bzw. Reset ergibt denselben Weg, also keine Zufallsvor-/-nachteile zwischen Spielern.
- **Endless**: reiner Handmodus ohne Coins/Upgrades. Levelsprünge folgen `Consts.largeLevels` (größere Schritte statt +1). Der Lösungsverlauf wird pro Level gespeichert und beim Wiedereintritt abgespielt; Bestwerte (Züge) landen in der Statistik und sind von dort einzeln wiederholbar.
- **Endurance**: Spielweise wie Endless (Verlauf, Undo-Punkte, Marker), aber jedes Level einzeln (+1 statt Sprüngen). Der Fortschritt im aktuellen Level wird gespeichert und beim Wiedereintritt fortgesetzt; beim Lösen wird der Level-Fortschritt verworfen (keine Bestwerte-Liste), in der Statistik zählt nur das aktuell erreichte Level - in Klammern dahinter die aufsummierten Schritte der bereits abgeschlossenen Level als `Pfadlänge / Gesamtschritte` (wie die Moves-Anzeige im HUD).
- **Statistik**: aktueller Stand pro Modus plus Endless-Bestwerte (mit Replay-Option).
- **Hard-Reset**: löscht nur den Idle-Spielstand (Endless und Endurance bleiben erhalten).

## Steuerung

- Bewegung: `WASD` oder Pfeiltasten - diskrete Schritte von Knoten zu Knoten (je 2 Kacheln).
- Ziel: das blaue Feld erreichen, um ins nächste Level zu wechseln.
- Rückgängig: `Backspace` - genau ein Schritt zurück, zählt als Zug (Autorepeat beim Halten).
- Echtes Rückgängig (nur **Endless**/**Endurance**): `Entf` - macht die letzte Bewegung komplett ungeschehen: ein Vorwärtsschritt wird ausgetragen (samt gelbem Weg), ein Rückschritt (`Backspace`/Gegenrichtung) wird wieder vorwärts aufgelöst; nur Marker sind ausgenommen. Total sinkt dabei immer um 1. Kostet einen Undo-Punkt; alle 10 gelegten Vorwärtsschritte gibt es einen Punkt (Anzeige in Klammern hinter den Moves, Reset bei Levelstart). Ohne Punkte reagiert `Entf` nicht. Im **Idle** wirkt `Entf` wie `Backspace`.
- Leertaste: im **Idle** AutoMover an/aus (sobald gekauft), im **Endless**/**Endurance** roter Marker auf der aktuellen Zelle.
- Rechtsklick (nur **Endless**/**Endurance**): grüner Marker auf einer beliebigen Zelle (Weg oder Wand), erneuter Rechtsklick entfernt ihn wieder.
- Zoom: `+` / `-` stufenweise, `0` = Best-Fit.
- Auf Spieler zentrieren: `Enter`.
- Level zurücksetzen: `R` (fragt nach, wenn man nicht am Start steht).
- Grid umschalten: `G`.
- Shop / Menü: Shop-Button oben links (Idle, ab Level 5); `Esc` schließt den Shop bzw. führt zurück ins Hauptmenü.

## Projektstruktur

- `src/` - TypeScript-Quellcode
  - `index.ts` - Bootstrap: Caches/Saves initialisieren, Hauptmenü, `Game` je Modus starten
  - `game/Game.ts` - Game-Loop, Eingabe, Kamera/Zoom, Level-/Solve-Logik; implementiert `BotHost`/`ModeHost`/`ShopHost`
  - `game/Consts.ts` - Farben, Zoomstufen, Tilegrößen, `largeLevels`, Bot-Timing
  - `game/Bot.ts` - AutoMover (Verhalten gestaffelt nach gekaufter Stufe), deterministischer RNG je Level
  - `game/modes/` - `GameMode` (Strategy-Interface), `IdleMode`, `EndlessMode`, `EnduranceMode`
  - `idle/Coins.ts` - Coin-Belohnung (bigint) inkl. Decay
  - `idle/Upgrades.ts` - Upgrade-Registry und Kostenformel (ganzzahlig, bigint)
  - `idle/ShopView.ts` - Shop-Overlay (klassenbasierte Sichtbarkeit, Preis-Sortierung, In-Place-Update)
  - `view/Camera.ts` - Kamerafolge mit Dead-Zone, Zoomverwaltung
  - `view/Level.ts` - Chunked-1px-Bitmap-Rendering mit skaliertem Blit
  - `view/PixBuffer256.ts` - 256x256 Pixelchunk (ImageData + Canvas)
  - `ui/HUDView.ts` - HUD-DOM-Element (`#hud`)
  - `input/Input.ts` - Tastatureingabe (Edge/Pressed/Schrittsteuerung)
  - `menu/MainMenu.ts` - Hauptmenü (Modus-Auswahl, Statistik); `menu/MenuBackground.ts` - animierter Hintergrund
  - `lib/Laby.ts` - Deterministischer Labyrinth-Generator, `isFree(x,y)`, `pixWidth`/`pixHeight`
  - `lib/LabyCache.ts` - IndexedDB-Cache (Chunking) für große Labyrinth-Daten
  - `lib/GameSave.ts` - Spielstand in IndexedDB, eine DB pro Modus-Slot
  - `lib/Random.ts` - Mersenne Twister und LCG
  - `lib/StringBuilder.ts` - effizienter String-Aufbau für History
  - `styles.css` - Basis-Styling für HUD/Canvas/Menü/Shop
- `index.html` - HTML-Template (Vite-Entry)
- `vite.config.ts` - Vite-Konfiguration (Port 5173, Alias `@/*`)
- `tsconfig.json` - TypeScript-Konfiguration (strict, Alias `@/*` -> `src/*`)
- `.gitignore` - übliche Ignorierungen

## Technische Details

- Rendering: Hintergrund-Canvas zeigt eine 1px-Kachelkarte aus 256x256-Chunks, skaliert per `drawImage`. Overlays (Spieler, Ziel, Marker, Pfad-Highlights) liegen im Vordergrund-Canvas. Smoothing ist deaktiviert.
- Grid: Internes Zellenraster wird auf ein expandiertes Raster (`pixWidth` x `pixHeight`, intern `w*2-1` x `h*2-1`) abgebildet. `Laby` stellt `pixWidth`/`pixHeight` bereit; `Laby.isFree(x,y)` signalisiert, ob Knoten/Kante/Zelle begehbar ist.
- Generator: `Laby` erzeugt per Seed deterministische Labyrinthe; die Levelgröße wächst abhängig vom Verhältnis (nähert den goldenen Schnitt an).
- Cache: In den Modi Endless und Endurance speichert `LabyCache` das zuletzt generierte Labyrinth in IndexedDB (Chunking) und hält es zusätzlich im RAM für synchronen Zugriff (Resume großer Level). Der Idle-Modus nutzt keinen Labyrinth-Cache und generiert jedes Level deterministisch neu.
- Persistenz: `GameSave` nutzt IndexedDB mit einer DB pro Modus-Slot (`idle-laby-save-idle`, `idle-laby-save-endless`, `idle-laby-save-endurance`): aktuelles Level, Coins (bigint), gekaufte Upgrade-Stufen, Wiederholungszähler sowie - in Endless/Endurance - Verlauf und Marker pro Level, Bestwerte nur im Endless.
- AutoMover: pro Level deterministisch geseedet (`RandomMersenne`); bewegt sich im festen Takt (`Consts.botStepIntervalMs`, per AutoMover-Speed verkürzt) und holt verpasste Schritte nach (Catch-up im ausgetabbten/gedrosselten Tab).
- Eingabe: `Input.consumeStepKey()` liefert pro Tastendruck genau einen diskreten Schritt; `consumeKey()`/`isPressed()` decken Edge- und Halte-Logik ab.

## IDE/Editor-Hinweise

- JetBrains (WebStorm/IntelliJ IDEA): Projektordner öffnen, unter "Run/Debug Configurations" `npm run dev`/`build` anlegen. TypeScript nutzt `tsconfig.json`, Navigation/Refactorings erkennen `vite.config.ts` und den Pfad-Alias `@/*`.
- VS Code: Empfohlen sind die Erweiterungen "TypeScript TSServer" (bzw. integriert) und "npm Scripts"; Start der Scripts über das NPM-Panel.

## Weitere Dokumente

- Mitarbeiterleitfaden: `CLAUDE.md`
- Architekturüberblick: `docs/ARCHITEKTUR.md`
- Idle-Konzept und Umsetzungsstand: `docs/IDLE_PLAN.md`
- Changelog: `CHANGELOG.md`
- Versionierungsleitfaden: `VERSIONIERUNG.md`

## Deployment

- Mit `npm run build` erzeugte Artefakte aus `dist/` statisch ausliefern (z. B. `nginx`, GitHub Pages, Netlify). Kein Server-Side-Rendering nötig.

## Roadmap / Nächste Schritte

Umgesetzt: Modi (Idle/Endless/Endurance), Coins + Wiederholungs-Decay, Upgrade-Shop, AutoMover Stufe 1-3 sowie AutoMover-Speed, IndexedDB-Spielstände (bigint). Detaillierter Stand in `docs/IDLE_PLAN.md`.

Als Nächstes:

- AutoMover-Borderline (Stufe 4/5), Ratten und Drohnen (siehe `docs/IDLE_PLAN.md`).
- Debug-Modus (Cheats-Panel, Timewarp) als Balancing-Werkzeug.
- Soft-Schutz / Save-Signatur sowie Save-Versionierung und Migrationspfad.
- Tests für `Laby.isFree()` und die Schrittlogik ergänzen.

## Lizenz

- Laut `package.json`: `UNLICENSED` (kein automatisches Nutzungsrecht). Bei Bedarf Lizenz ergänzen/anpassen.
