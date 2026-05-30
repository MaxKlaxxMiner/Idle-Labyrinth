# Idle-Konzept

Konzept und Umsetzungsstand fuer die Weiterentwicklung vom rein manuellen Labyrinth-Spiel
zum Idle-Game. Dieses Dokument ist die massgebliche Referenz: es haelt sowohl die Vision
als auch den tatsaechlichen Stand der Implementierung fest. Zahlenwerte (Kosten, Faktoren)
sind weiterhin Vorschlaege und vor dem finalen Balancing offen.

## Umsetzungsstand (Kurzfassung)

Das Fundament steht: Modus-Strategie (Idle/Endless), Bot, Coin-Oekonomie, Upgrade-Registry,
Shop-UI und ein konsolidierter IndexedDB-Save sind ueber klare Interfaces verdrahtet. Die
eigentliche Idle-Tiefe fehlt aber noch weitgehend: von 11 definierten Upgrades hat aktuell
nur `automover-random` eine spuerbare Wirkung; alle anderen sind kaufbare, persistierte
Registry-Eintraege ohne Effekt.

Status der Implementierungsreihenfolge (Details siehe unten):

| # | Schritt | Status |
| --- | --- | --- |
| 1 | Save-Refactor + Migration | Teilweise (IndexedDB statt JSON; kein mode/settings-Feld; Migration nur als Cleanup) |
| 2 | Coin-Belohnung + Wiederholungs-Decay | Umgesetzt |
| 3 | Endless-Modus | Umgesetzt |
| 4 | Debug-Modus (Cheats-Panel, Timewarp) | Offen |
| 5 | Upgrade-Shop-UI | Umgesetzt (zusaetzliches Level-5-Gate) |
| 6 | AutoMover-Random | Umgesetzt |
| 7 | AutoMover-Smart | Abweichend (Logik steckt bereits im Random-Bot) |
| 8 | AutoMover-Smarter | Abweichend (Logik steckt bereits im Random-Bot) |
| 9 | AutoMover-Borderline | Offen (fillBL/fillTR sind Dead Code) |
| 10 | AutoMover-Borderline-Speed | Offen |
| 11 | Spieler-Speed | Offen (Upgrade-Stufe wird nicht gelesen) |
| 12 | Ratten v1 | Offen |
| 13 | Ratten-Erweiterungen | Offen |
| 14 | Drohnen | Offen |
| - | Soft-Schutz / HMAC | Offen |

Drei zentrale Punkte, die vor dem Weiterbauen zu klaeren sind:

1. **Wirkungslose Kaeufe:** Nur `automover-random` wirkt. Spieler koennen `player-speed`,
   `automover-smart` etc. kaufen, ohne eine Aenderung zu bemerken (Coins werden abgezogen,
   Effekt null). Entscheidung noetig: nicht-implementierte Upgrades ausblenden oder als
   "in Arbeit" sperren.
2. **AutoMover-Stufen-Konflikt:** Der Random-Bot meidet bereits Sackgassen und priorisiert
   die Luftlinie - unabhaengig vom Upgrade. Damit sind die Plan-Stufen 1 bis 3 verhaltensgleich
   (siehe Upgrade-Kette AutoMover).
3. **Persistenz weicht vom Plan ab:** Statt eines konsolidierten JSON-Saves wird IndexedDB
   mit mehreren Stores pro Slot genutzt (siehe Persistenz). Die alte JSON-Skizze ist ueberholt.

## Vision

- Einstieg: Spieler loest die ersten Level vollstaendig von Hand und verdient dabei Coins.
  (Umgesetzt.)
- Uebergang: Sobald genuegend Coins angespart sind, werden Upgrades sichtbar und kaufbar.
  Das Spiel verlagert sich schrittweise vom aktiven Loesen hin zum Optimieren der
  Loesungs-Automatik. (Teilweise: Shop und Sichtbarkeitsregel umgesetzt, aber nur ein
  wirksames Automatik-Upgrade.)
- Endgame: Mehrere Automatik-Schichten (AutoMover, Ratten, Drohnen) loesen Level
  parallel/schneller. Spieler kuemmert sich um Upgrade-Strategie und Meta-Progression.
  (Offen.)

## Spielmodi

1. **Story / Idle** (Hauptmodus, intern `mode: 'idle'`)
   - Inkrementeller Levelaufstieg, plus Coin-/Upgrade-System.
   - Verlauf wird nicht persistiert; jedes Level faengt frisch an.
   - Idle-Mechaniken werden hier freigeschaltet (Shop ab Level 5).
   - Status: umgesetzt (Levelaufstieg, Coins, Shop, AutoMover-Random).
2. **Endless** (intern `mode: 'endless'`, von Anfang an verfuegbar)
   - Reiner Handmodus ohne Idle-Features, kein Coin-Verdienst.
   - Levelschritte folgen `Consts.largeLevels` (groessere Spruenge), nicht inkrementell.
   - Eigener Save-Slot (`idle-laby-save-endless`); Verlauf wird pro Level persistiert,
     beim Loesen so getrimmt, dass man beim Wiedereintritt einen Schritt vor dem Ziel steht.
   - Bestwerte (moves, totalMoves) pro Level; Replay einzelner Level aus dem Stats-Menue.
   - Status: umgesetzt.
3. **Debug** (nur localhost, automatisch erkannt)
   - Alles aus Story + direkte Levelwahl, freie Upgrade-Schaltung, Scan-/Cheat-Tools.
   - **Cheats-Panel:** Button links oben oeffnet ein Overlay mit allen Stellschrauben:
     Level direkt setzen, Coins frei eintragen, jedes Upgrade einzeln an-/abschalten oder
     Stufe waehlen, Bot-Logik forcen, Speed-Slider.
   - **Timewarp:** Slider/Tasten x0.5 / x1 / x2 / x5 / x20 fuer Spielgeschwindigkeit
     (RAF-Tick-Multiplikator). Hauptzweck: Balancing-Tests ueber laengere Zeit.
   - **Test-Workflows:** "1000 Coins +", "Alle Upgrades freischalten", "Bot starten",
     "Spielzeit ueberspringen".
   - Status: offen. Der Modus-Typ kennt aktuell nur `idle | endless`. Dieser Modus ist
     laut Reihenfolge das primaere Tuning-Tool fuer alle weiteren Upgrade-Stufen.

## Coin-Oekonomie

Status: umgesetzt (`src/idle/Coins.ts`, angewandt in `IdleMode.onLevelSolved`).

- Belohnung pro abgeschlossenem Level:
  - `nodes = ((w-3)/2) * ((h-3)/2)` mit den geschaetzten Lab-Zellmassen `w/h` aus
    `estimateLabyCells(level)` (Start 5x5, wachsen abwechselnd um 2 Richtung goldener Schnitt).
  - `reward = floor(nodes / repeatCount + 0.98)`.
  - Beispielwerte erste Loesung: Level 1 = 1, Level 2 = 2, Level 3 = 3, Level 4 = 6,
    Level 5 = 8, Level 6 = 10, Level 7 = 15.
- Wiederholungs-Decay: das `n`-te Loesen zahlt rund `1/n` der Ursprungsbelohnung. Das `+0.98`
  garantiert mindestens 1 Coin, solange `nodes/n >= 0.02` (Level 1 ca. 50 Runden, Level 7
  ca. 750 Runden). Wiederholungszaehler liegt pro Level im `clears`-Store.
- Hinweis zur Abweichung: Der frueher skizzierte freie `factor` wurde durch die direkte
  Knoten-Heuristik ersetzt; es gibt keine separate `factor`-Konstante.
- Persistenz: `coins` (meta-Store) und `clears[level]` (clears-Store), siehe Persistenz.
- Sichtbarkeit von Upgrades: ein Upgrade erscheint im Shop, sobald `coins >= cost * 0.25`
  (Viertel der noetigen Summe) und alle Vorbedingungen erfuellt sind.

## Upgrade-System

Status: Registry, Sichtbarkeit und Kauf umgesetzt (`src/idle/Upgrades.ts`, `ShopView`,
`Game.purchase`). Die Wirkung der einzelnen Upgrades ist bis auf `automover-random` offen.

- Upgrades sind in Stufenketten organisiert: jedes hat optional `requires` (alle Vorgaenger
  muessen besessen sein, sonst nicht sichtbar) und optional `maxLevel` (Stufen-Upgrade).
- Jeder Kauf reduziert `coins` um die Stufenkosten; gekaufte Stufen liegen im `upgrades`-Store.
- Globaler Hotkey-Slot "Automatik an/aus": Leertaste toggelt im Idle-Modus den AutoMover,
  sofern `automover-random` gekauft ist.

### Upgrade-Kette: AutoMover

| Stufe | Id | Kosten | requires | Verhalten | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | `automover-random` | 10 | - | Zufallsbewegung, trifft per Zufall das Ziel | Umgesetzt |
| 2 | `automover-smart` | 500 | random | Markiert Sackgassen als rot und meidet sie | Stub |
| 3 | `automover-smarter` | 2000 | smart | Priorisiert die Luftlinie zum Ziel | Stub |
| 4 | `automover-smarter-borderline` | 8000 | smarter | Markiert beim Erreichen des Rands ungueltige Innenbereiche | Offen |
| 5 | `automover-smarter-borderline-speed` | 20000 | borderline | Rueckwege mit doppelter Geschwindigkeit | Offen |

**Stufen-Konflikt (offene Entscheidung):** Der reale Bot (`Bot.getRandomStepDirection`)
meidet bereits Sackgassen-/Trail-Farben und priorisiert die Luftlinie zum Ziel - und zwar
immer, unabhaengig vom gekauften Upgrade-Level. Damit sind die geplanten Stufen 1 bis 3
verhaltensgleich; ein Kauf von `automover-smart` oder `automover-smarter` aendert nichts.
Zwei Wege:

- (A) Plan-konform: Stufe 1 auf rein zufaellige Wahl zuruecknehmen und Sackgassen-Meidung
  (Stufe 2) sowie Luftlinien-Prioritaet (Stufe 3) an die Upgrade-Stufe binden.
- (B) Neu definieren: den jetzigen "guten" Bot als Stufe 1 belassen und fuer die Stufen 2/3
  andere, spuerbare Verbesserungen festlegen.

Die Borderline-Bausteine `fillBL`/`fillTR` existieren in `Bot.ts`, werden aber nicht
ausgefuehrt: Der Hook `onForwardStep` wird nach jedem Vorwaerts-Schritt aus
`Game.updatePlayer` aufgerufen, sein Body ist jedoch auskommentiert (No-op). Damit ist
die gesamte Borderline-Logik aktuell Dead Code.

### Upgrade-Kette: Spieler-Speed

- Id `player-speed`, Kosten 1000, requires `automover-random`, `maxLevel` 5.
- Wirken soll auf die Bewegungsgeschwindigkeit allgemein (Hand wie Automatik).
- Status: Stub. Die gekaufte Stufe wird nirgends gelesen; `Consts.botStepIntervalMs` ist
  konstant (2000 ms). Konkrete Stufenwerte offen.

### Upgrade-Kette: Ratten

- Id `rat-count`, Kosten 10000, requires `automover-smarter`, `maxLevel` 8.
- Jede Ratte soll selbststaendig nach `smart`-Logik laufen und parallel zum Spieler/AutoMover
  arbeiten; eigenes Sprite/Farbe, keine Kollision mit dem Spieler.
- Status: offen. Keine Ratten-Entity, kein Renderer, keine Parallel-Logik.

### Upgrade-Kette: Ratten-Speed

- Id `rat-speed`, Kosten 5000, requires `rat-count`, `maxLevel` 5. Analog Spieler-Speed,
  nur fuer Ratten. Status: offen.

### Upgrade: `rat-teleporter`

- Kosten 30000, requires `rat-count`.
- Mit Upgrade erfolgt der Rueckweg einer Ratte zur letzten Verzweigung praktisch instant
  (Teleport), auch wenn der aktuelle Bereich per Borderline-Logik als ungueltig markiert wird.
- Status: offen.

### Upgrade: `rat-borderline`

- Kosten 60000, requires `rat-count` + `automover-smarter-borderline`.
- Borderline-Logik analog zur AutoMover-Borderline, aber fuer Ratten.
- Status: offen.

### Upgrade: Drohnen

- Id `drone`, Kosten 150000, requires `rat-borderline`.
- Bewegen sich frei (nicht raster-/wandgebunden) in einem rechteckigen Radius und markieren
  noch nicht rote Sackgassen sowie Pfade, die nur in roten Sackgassen enden, im Sichtfenster.
- Status: offen (nur Idee/Registry-Eintrag). Reichweite, Anzahl, Update-Frequenz offen.

## Sichtbarkeits-/Freischaltlogik

Status: umgesetzt (`ShopView.collectDisplayed` / `isVisible`).

- Ein Upgrade ist sichtbar, wenn alle `requires` erfuellt sind (Vorgaenger besessen) und
  `coins >= cost * 0.25`.
- Faellt kein Upgrade unter diese Regel, wird als Fallback das guenstigste angezeigt.
- Sichtbarer, aber zu teurer Eintrag wird mit deaktiviertem Kaufbutton dargestellt.
- Abweichung/Erweiterung: Der Shop-Button selbst erscheint erst ab Level 5
  (`shop.setEnabled(level >= 4)`, intern 0-basiert). Dieses Level-Gate steht nicht im
  urspruenglichen Konzept und ist eine bewusste Designentscheidung.

## Persistenz (Ist-Stand: IndexedDB)

Statt des frueher skizzierten konsolidierten JSON-Saves nutzt `GameSave` IndexedDB mit
einer DB pro Slot. Diese Sektion beschreibt den realen Stand.

- Eine DB pro Spielmodus-Slot: `idle-laby-save-idle`, `idle-laby-save-endless` (DB-Version 3).
  Labyrinth-Daten liegen getrennt in `idle-laby-cache-<slot>` (`LabyCache`).
- Sechs Object-Stores je Save-DB:

  | Store | Inhalt | Genutzt von |
  | --- | --- | --- |
  | `state` | `{ level: number }` unter Key `save` | beide Modi |
  | `histories` | `{ [level]: string }` (Eingabespur LRUD/B/M) | Endless |
  | `best` | `{ [level]: { moves, totalMoves } }` | Endless |
  | `meta` | `{ coins: number }` unter Key `meta` | Idle |
  | `upgrades` | `{ [upgradeId]: level }` | Idle |
  | `clears` | `{ [level]: count }` (Wiederholungszaehler) | Idle |

- Alle Daten werden bei `init()` in den RAM geladen; Lese-Ops sind synchron, Schreib-Ops
  aktualisieren den RAM sofort und persistieren asynchron im Hintergrund.
- Level ist intern 0-basiert und wird in der Anzeige mit `+1` dargestellt (HUD, Stats).
- Noch nicht abgedeckt (gegenueber dem Konzept): Der **Modus** wird nicht persistiert,
  sondern kommt als Constructor-Option (`mode: 'idle' | 'endless'`). Es gibt keinen
  `settings`-Block (z. B. `speedTier`, `ratSpeedTier`) und keine Datenformat-Version auf
  Datenebene (nur die IDB-Schema-Version). Diese Felder waeren noetig, falls Speed-Upgrades
  oder ein Soft-Schutz folgen.

### Migration und Reset

- Migration: `bootstrap()` raeumt einmalig die alte DB `idle-laby-cache` sowie die
  localStorage-Keys `idle-laby-level` und `idle-laby-historyRaw` weg. Eine inhaltliche
  Uebernahme alter Werte findet nicht statt (nur Cleanup).
- Hard-Reset (Menue): loescht `idle-laby-cache-idle` und `idle-laby-save-idle` (nur der
  Idle-Slot), Endless bleibt erhalten. Coins/Clears/Upgrades gehen dabei verloren.
- Reset im Spiel (Taste R): setzt nur das aktuelle Level/den aktuellen Verlauf zurueck;
  Coins, Clears und Upgrades bleiben.

## Implementierungsreihenfolge (mit Status)

1. **Save-Refactor** - Teilweise: IndexedDB-Multi-Store statt JSON-Blob, Wallet-Anzeige im
   HUD vorhanden. Offen: persistiertes `mode`/`settings`-Feld, echte Datenuebernahme bei
   Migration, Datenformat-Version.
2. **Coin-Belohnung** inkl. Wiederholungs-Decay - Umgesetzt.
3. **Endless-Modus** - Umgesetzt.
4. **Debug-Modus** - Offen. localhost-Check, Cheats-Panel, Timewarp, Test-Workflows fehlen.
5. **Upgrade-Shop-UI** - Umgesetzt (Floating-Button, Overlay, Kaufbutton, 25%-Regel,
   zusaetzliches Level-5-Gate).
6. **AutoMover-Random** - Umgesetzt (Leertaste-Toggle, Tick-getriebene Bewegung).
7. **AutoMover-Smart** - Abweichend: Sackgassen-Meidung steckt generisch im Random-Bot,
   ist nicht an das Upgrade gebunden.
8. **AutoMover-Smarter** - Abweichend: Luftlinien-Prioritaet laeuft bereits in Stufe 1.
9. **AutoMover-Borderline** - Offen: `fillBL`/`fillTR` vorhanden, aber nicht aktiviert.
10. **AutoMover-Borderline-Speed** - Offen.
11. **Spieler-Speed-Upgrades** - Offen: Stufe wird nicht gelesen, Tick konstant.
12. **Ratten v1** - Offen.
13. **Ratten-Erweiterungen** (Anzahl, Speed, Teleporter, Borderline) - Offen.
14. **Drohnen** (optional) - Offen.

## Soft-Schutz / GitHub-Stern-Easter-Egg

Status: offen (kein Code vorhanden). Da das Spiel Opensource ist und client-seitig laeuft,
gibt es keinen echten Cheat-Schutz - alles ist "security by friendliness".

- HMAC-Signatur an alle wichtigen Save-Felder (coins, upgrades, level, bestStats).
  Schluessel = `BASE_SECRET` plus `location.hostname`, sodass Saves nur auf der
  Original-Domain valide sind.
- Friendly-Hosts-Whitelist akzeptiert die produktive Domain (idle-laby.itch.io etc.) und
  localhost. Itch.io nutzt CDN-Subdomains (z. B. `html-classic.itch.zone`), die mit hinein muessen.
- Auf der Original-Domain: bei manipuliertem Save freundlicher Hinweis, dass lokales Klonen
  zum Cheaten erlaubt ist und ein GitHub-Stern willkommen ist.
- Auf localhost: Cheats explizit erlaubt (Debug-Modus), dezenter Banner.
- Auf unbekannter Domain (Fork): Save als "forked instance" markieren.
- Wichtig: kein Lockout. Manipulierte Saves werden weiterhin geladen, aber als
  `legitimate: false` markiert. Voraussetzung dafuer waeren Signatur-/Marker-Felder im Save.

## Offene Punkte / Entscheidungen

- **Wirkungslose Upgrades:** Nicht-implementierte Upgrades vorerst ausblenden oder als
  "in Arbeit" sperren, damit keine Coins ohne Effekt ausgegeben werden.
- **AutoMover-Stufen:** Variante A (rein-zufaellige Stufe 1, Logik an Stufen binden) oder
  Variante B (jetzigen Bot als Stufe 1, Stufen 2/3 neu definieren). Siehe AutoMover-Kette.
- **Persistenz-Modell:** Beim IndexedDB-Multi-Store bleiben (Plan-JSON ist ueberholt). Falls
  ja: persistiertes `mode`-Feld und `settings` (speedTier, ratSpeedTier) ergaenzen?
  Datenformat-Version fuer kuenftige Migrationen festlegen.
- **Balancing:** Konkrete Kosten und Stufenwerte erst nach erster Spielbarkeit kalibrierbar.
  Das Debug-Cheats-Panel ist dafuer das vorgesehene Tuning-Tool (noch offen).
- **Hotkey-Belegung:** Leertaste belegt "Automatik an/aus" (Idle). Weitere Tasten T, R, G,
  +/-/0 sind bereits vergeben - neue Aktionen brauchen freie Slots.
- **Reset-Verhalten:** Hard-Reset loescht aktuell alle Idle-Daten (Coins/Clears weg).
  Bewusst so, oder Coins/Decay teilweise behalten?
- **Player/Bot-Synchronisation:** Bei aktivem Bot ist manuelle Eingabe nicht gesperrt -
  beide bewegen denselben Spieler. Sperren oder bewusst parallel lassen?
- **Ratten bei Borderline-Markierung:** Verlassen Ratten einen ungueltig markierten Bereich
  automatisch? (Erst relevant, sobald Ratten existieren.)
- **Drohnen-Mechanik:** Reichweite, Anzahl, Update-Tick, "durch Waende sehen" oder nicht.
- **Soft-Schutz/HMAC:** Weiter zurueckstellen oder die Save-Struktur fruehzeitig auf
  Signatur-/`legitimate`-Felder vorbereiten?
- **Kleiner Robustheits-Fix:** Bot-Luftlinienvergleich nutzt vorzeichenbehaftete Differenzen
  (`goal.x - player.x >= goal.y - player.y`). Funktioniert nur, weil Start oben-links und Ziel
  unten-rechts liegen; `Math.abs` waere fuer kuenftige Layouts robuster.
