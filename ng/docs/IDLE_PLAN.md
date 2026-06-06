# Idle-Konzept

Konzept und Umsetzungsstand für die Weiterentwicklung vom rein manuellen Labyrinth-Spiel
zum Idle-Game. Dieses Dokument ist die maßgebliche Referenz: es hält sowohl die Vision
als auch den tatsächlichen Stand der Implementierung fest. Zahlenwerte (Kosten, Faktoren)
sind weiterhin Vorschläge und vor dem finalen Balancing offen.

## Umsetzungsstand (Kurzfassung)

Das Fundament steht: Modus-Strategie (Idle/Endless), Bot, Coin-Ökonomie, Upgrade-Registry,
Shop-UI und ein konsolidierter IndexedDB-Save sind über klare Interfaces verdrahtet. Von den
11 definierten Upgrades wirken inzwischen `automover-random`, `automover-smart`,
`automover-smarter` (gestaffelt, Variante A) sowie `player-speed`. Offen sind noch Borderline
(Stufe 4/5), die Ratten-Kette, Drohnen, der Debug-Modus und der Soft-Schutz.

Status der Implementierungsreihenfolge (Details siehe unten):

| # | Schritt | Status |
| --- | --- | --- |
| 1 | Save-Refactor + Migration | Teilweise (IndexedDB statt JSON; kein mode-Feld; Migration/Abwärtskompatibilität bewusst bis zum ersten Release zurückgestellt) |
| 2 | Coin-Belohnung + Wiederholungs-Decay | Umgesetzt |
| 3 | Endless-Modus | Umgesetzt |
| 4 | Debug-Modus (Cheats-Panel, Timewarp) | Offen |
| 5 | Upgrade-Shop-UI | Umgesetzt (zusätzliches Level-5-Gate) |
| 6 | AutoMover-Random | Umgesetzt |
| 7 | AutoMover-Smart | Umgesetzt (gestaffelt über autoMoverTier) |
| 8 | AutoMover-Smarter | Umgesetzt (gestaffelt über autoMoverTier) |
| 9 | AutoMover-Borderline | Offen (fillBL/fillTR sind Dead Code) |
| 10 | AutoMover-Borderline-Speed | Offen |
| 11 | Spieler-Speed (als "AutoMover-Speed") | Umgesetzt |
| 12 | Ratten v1 | Offen |
| 13 | Ratten-Erweiterungen | Offen |
| 14 | Drohnen | Offen |
| - | Soft-Schutz / HMAC | Offen |

Bereits entschiedene/erledigte Punkte:

1. **AutoMover-Stufen (Variante A umgesetzt):** Stufe 1 (`random`) ist bewusst dumm; die
   Cleverness (Sackgassen-Meidung, Luftlinie) ist an die höheren Stufen gebunden. Details
   in der Upgrade-Kette AutoMover.
2. **Ganzzahlige Ökonomie:** Coins und Kosten sind `bigint`; Kosten werden exakt ganzzahlig
   und aufgerundet berechnet (kein Float, kein 2^32-Deckel, keine Float-Drift).
3. **Persistenz:** IndexedDB mit mehreren Stores pro Slot (die alte JSON-Skizze ist überholt).

Noch offen als Designentscheidung: wirkungslose Käufe der noch nicht implementierten
Upgrades (Borderline, Ratten, Drohnen) - vor einer Veröffentlichung ausblenden oder sperren.

## Vision

- Einstieg: Spieler löst die ersten Level vollständig von Hand und verdient dabei Coins.
  (Umgesetzt.)
- Übergang: Sobald genügend Coins angespart sind, werden Upgrades sichtbar und kaufbar.
  Das Spiel verlagert sich schrittweise vom aktiven Lösen hin zum Optimieren der
  Lösungs-Automatik. (Umgesetzt: Shop, Sichtbarkeitsregel, der gestaffelte AutoMover und
  AutoMover-Speed greifen.)
- Endgame: Mehrere Automatik-Schichten (AutoMover, Ratten, Drohnen) lösen Level
  parallel/schneller. Spieler kümmert sich um Upgrade-Strategie und Meta-Progression.
  (Teilweise: AutoMover-Schicht steht, Ratten/Drohnen offen.)

## Spielmodi

1. **Story / Idle** (Hauptmodus, intern `mode: 'idle'`)
   - Inkrementeller Levelaufstieg, plus Coin-/Upgrade-System.
   - Verlauf wird nicht persistiert; jedes Level fängt frisch an.
   - Idle-Mechaniken werden hier freigeschaltet (Shop ab Level 5).
   - Bei offenem Shop pausiert nur die Spieler-Eingabe; die Simulation (Bot, Level-Solve,
     Coins) und das Rendering laufen im Hintergrund weiter.
   - Status: umgesetzt (Levelaufstieg, Coins, Shop, AutoMover Stufe 1-3, AutoMover-Speed).
2. **Endless** (intern `mode: 'endless'`, von Anfang an verfügbar)
   - Reiner Handmodus ohne Idle-Features, kein Coin-Verdienst.
   - Levelschritte folgen `Consts.largeLevels` (größere Sprünge), nicht inkrementell.
   - Eigener Save-Slot (`idle-laby-save-endless`); Verlauf wird pro Level persistiert,
     beim Lösen so getrimmt, dass man beim Wiedereintritt einen Schritt vor dem Ziel steht.
   - Bestwerte (moves, totalMoves) pro Level; Replay einzelner Level aus dem Stats-Menü.
   - Status: umgesetzt.
3. **Debug** (nur localhost, automatisch erkannt)
   - Alles aus Story + direkte Levelwahl, freie Upgrade-Schaltung, Scan-/Cheat-Tools.
   - **Cheats-Panel:** Button links oben öffnet ein Overlay mit allen Stellschrauben:
     Level direkt setzen, Coins frei eintragen, jedes Upgrade einzeln an-/abschalten oder
     Stufe wählen, Bot-Logik forcen, Speed-Slider.
   - **Timewarp:** Slider/Tasten x0.5 / x1 / x2 / x5 / x20 für Spielgeschwindigkeit
     (RAF-Tick-Multiplikator). Hauptzweck: Balancing-Tests über längere Zeit.
   - **Test-Workflows:** "1000 Coins +", "Alle Upgrades freischalten", "Bot starten",
     "Spielzeit überspringen".
   - Status: offen. Der Modus-Typ kennt aktuell nur `idle | endless`. Dieser Modus ist
     laut Reihenfolge das primäre Tuning-Tool für alle weiteren Upgrade-Stufen.

## Coin-Ökonomie

Status: umgesetzt (`src/idle/Coins.ts`, angewandt in `IdleMode.onLevelSolved`).

- Belohnung pro abgeschlossenem Level:
  - `nodes = ((w-3)/2) * ((h-3)/2)` mit den geschätzten Lab-Zellmaßen `w/h` aus
    `estimateLabyCells(level)` (Start 5x5, wachsen abwechselnd um 2 Richtung goldener Schnitt).
  - `reward = floor(nodes / repeatCount + 0.98)`, geliefert als `bigint`.
  - Beispielwerte erste Lösung: Level 1 = 1, Level 2 = 2, Level 3 = 3, Level 4 = 6,
    Level 5 = 8, Level 6 = 10, Level 7 = 15.
- Wiederholungs-Decay: das `n`-te Lösen zahlt rund `1/n` der Ursprungsbelohnung. Das `+0.98`
  garantiert mindestens 1 Coin, solange `nodes/n >= 0.02` (Level 1 ca. 50 Runden, Level 7
  ca. 750 Runden). Wiederholungszähler liegt pro Level im `clears`-Store.
- Ganzzahligkeit: Coins (Wallet) und Belohnung sind `bigint` - kein 2^32-Deckel, keine
  Float-Drift. Der früher skizzierte freie `factor` wurde durch die Knoten-Heuristik ersetzt
  (keine separate `factor`-Konstante).
- Persistenz: `coins` (meta-Store) und `clears[level]` (clears-Store), siehe Persistenz.
- Sichtbarkeit von Upgrades: klassenbasiert - ein Upgrade erscheint, sobald seine `requires`
  erfüllt sind und es nicht ausgemaxt ist (siehe Sichtbarkeits-/Freischaltlogik).

## Upgrade-System

Status: Registry, Sichtbarkeit und Kauf umgesetzt (`src/idle/Upgrades.ts`, `ShopView`,
`Game.purchase`). Wirksam sind AutoMover Stufe 1-3 und AutoMover-Speed; Borderline (4/5),
Ratten und Drohnen sind noch Registry-Einträge ohne Effekt.

- Upgrades sind in Stufenketten organisiert: jedes hat optional `requires` (alle Vorgänger
  müssen besessen sein, sonst nicht sichtbar) und optional `maxLevel` (Stufen-Upgrade;
  `Infinity` = unbegrenzt, ohne Angabe = einmalig). Eine optionale `describe(level)`-Funktion
  liefert eine dynamische, stufenabhängige Beschreibung (z. B. Schritte/s bei AutoMover-Speed).
- Stufenkosten: optionales `costGrowthPercent` (ganzzahliger Aufschlag in Prozent je besessener
  Stufe). `upgradeCost(def, ownedLevel)` rechnet rein ganzzahlig und rundet auf:
  `ceil(cost * (100+p)^owned / 100^owned)` als `bigint`.
- Jeder Kauf reduziert `coins` um die Stufenkosten; gekaufte Stufen liegen im `upgrades`-Store.
- Globaler Hotkey-Slot "Automatik an/aus": Leertaste toggelt im Idle-Modus den AutoMover,
  sofern `automover-random` gekauft ist.

### Upgrade-Kette: AutoMover

| Stufe | Id | Kosten | requires | Verhalten | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | `automover-random` | 10 | - | Rein zufällig unter begehbaren Nachbarn; meidet Sackgassen zu 75%, Trails zu 50% (grobe Laufrichtung) | Umgesetzt |
| 2 | `automover-smart` | 500 | random | Meidet markierte Sackgassen/Trails strikt, nimmt das Ziel direkt wenn benachbart, läuft per `B` aus Sackgassen zurück | Umgesetzt |
| 3 | `automover-smarter` | 2000 | smart | Zusätzlich Luftlinien-Priorisierung Richtung Ziel | Umgesetzt |
| 4 | `automover-smarter-borderline` | 8000 | smarter | Markiert beim Erreichen des Rands ungültige Innenbereiche | Offen |
| 5 | `automover-smarter-borderline-speed` | 20000 | borderline | Rückwege mit doppelter Geschwindigkeit | Offen |

**Stufen-Staffelung (umgesetzt, Variante A):** Der Bot liest die höchste gekaufte
AutoMover-Stufe über `BotHost.autoMoverTier()` (1=random ... 5=speed). Stufe 1 ist bewusst
dumm: rein zufällige Wahl unter den begehbaren Nachbarn, mit nur grober Tendenz (Sackgassen
zu 75%, Trails zu 50% gemieden); läuft notfalls per `B` zurück. Ab Stufe 2 (`smart`) werden
markierte Sackgassen/Trails strikt gemieden und ein benachbartes Ziel direkt genommen, ab
Stufe 3 (`smarter`) kommt die Luftlinien-Priorisierung dazu. Die 75/50-Werte sind als
Konstanten in `Bot.getRandomStepDirection` justierbar.

**Bot-Takt:** Der Bot bewegt sich im Takt von `BotHost.botStepIntervalMs()` (Basis
`Consts.botStepIntervalMs` = 1000 ms, per AutoMover-Speed je Stufe x0.9). Die Tick-Logik ist
deadline-basiert: verpasste Schritte (z. B. gedrosselter/ausgetabbter Tab) werden nachgeholt
(Cap `Bot.MAX_CATCHUP_STEPS` = 1048576, ohne Fortschrittsverlust). Beim Aktivieren und bei
Level-Start wird der Takt frisch angesetzt, sodass der erste Schritt nicht instant wirkt.
Auch ein manueller Eingriff bei aktivem Bot (Richtungs-Step oder Undo) verschiebt den nächsten
Bot-Schritt um ein Intervall (`bot.deferNextStep()`), damit der Bot nicht direkt nachzuckt.

Die Borderline-Bausteine `fillBL`/`fillTR` existieren in `Bot.ts`, werden aber nicht
ausgeführt: Der Hook `onForwardStep` wird nach jedem Vorwärts-Schritt aus
`Game.updatePlayer` aufgerufen, sein Body ist jedoch auskommentiert (No-op). Damit ist die
Borderline-Logik (Stufe 4/5) aktuell Dead Code.

### Upgrade-Kette: AutoMover-Speed (`player-speed`)

- Id `player-speed`, Label "AutoMover-Speed", Basiskosten 100, requires `automover-random`,
  `costGrowthPercent` 50 (+50% je Stufe: 100, 150, 225, 338, 507, ...), **unbegrenzt**
  (`maxLevel: Infinity`).
- Wirkung: verkürzt das Bot-Schrittintervall je Stufe um 10%
  (`Consts.botStepSpeedupPerLevel` = 0.9): 900, 810, 729, 656, 590, ... ms.
- Anzeige: dynamische Beschreibung in Schritte/s (aktuell -> nächste), z. B. "1.00 -> 1.11
  Schritte/s"; das Label zeigt die zu kaufende Stufe ("(Stufe N)" = besessen + 1).
- Die Handbewegung bleibt bewusst unverändert (so schnell wie man tippt bzw. OS-Autorepeat).
- Status: umgesetzt (`Game.botStepIntervalMs()` liest die Stufe, der Bot nutzt sie im Tick).

### Upgrade-Kette: Ratten

- Id `rat-count`, Kosten 10000, requires `automover-smarter`, `maxLevel` 8.
- Jede Ratte soll selbstständig nach `smart`-Logik laufen und parallel zum Spieler/AutoMover
  arbeiten; eigenes Sprite/Farbe, keine Kollision mit dem Spieler.
- Status: offen. Keine Ratten-Entity, kein Renderer, keine Parallel-Logik.

### Upgrade-Kette: Ratten-Speed

- Id `rat-speed`, Basiskosten 5000, requires `rat-count`, `costGrowthPercent` 50, unbegrenzt
  (`maxLevel: Infinity`). Analog AutoMover-Speed, nur für Ratten. Status: offen (Stub).

### Upgrade: `rat-teleporter`

- Kosten 30000, requires `rat-count`.
- Mit Upgrade erfolgt der Rückweg einer Ratte zur letzten Verzweigung praktisch instant
  (Teleport), auch wenn der aktuelle Bereich per Borderline-Logik als ungültig markiert wird.
- Status: offen.

### Upgrade: `rat-borderline`

- Kosten 60000, requires `rat-count` + `automover-smarter-borderline`.
- Borderline-Logik analog zur AutoMover-Borderline, aber für Ratten.
- Status: offen.

### Upgrade: Drohnen

- Id `drone`, Kosten 150000, requires `rat-borderline`.
- Bewegen sich frei (nicht raster-/wandgebunden) in einem rechteckigen Radius und markieren
  noch nicht rote Sackgassen sowie Pfade, die nur in roten Sackgassen enden, im Sichtfenster.
- Status: offen (nur Idee/Registry-Eintrag). Reichweite, Anzahl, Update-Frequenz offen.

## Sichtbarkeits-/Freischaltlogik

Status: umgesetzt (`ShopView.collectDisplayed` / `isVisible`).

- Klassenbasiert: Ein Upgrade ist sichtbar, wenn alle `requires` erfüllt sind (Vorgänger
  besessen) und es nicht ausgemaxt ist. Bei linearen Ketten (AutoMover) also immer genau die
  nächste Stufe, bei Verzweigungen (Ratten nach `rat-count`) alle verfügbaren.
- Rein aus dem persistierten Besitzstand abgeleitet: stabil über Reloads, ohne Coin-Schwellwert
  und ohne erneutes Verstecken. (Die frühere 25%-Coin-Sichtbarkeitsregel wurde dadurch ersetzt.)
- Anzeige nach Preis der nächsten Stufe aufsteigend sortiert; Kosten exakt ganzzahlig per
  `upgradeCost(def, ownedLevel)` (siehe Upgrade-System).
- Zu teurer Eintrag wird mit deaktiviertem Kaufbutton (`shop-row-locked`) dargestellt. Das
  Overlay aktualisiert dynamische Teile (Coins, Kosten, Verfügbarkeit) in-place; ein DOM-Rebuild
  erfolgt nur bei geänderter Liste (kein Hover-Flackern bei laufendem Bot).
- Der Shop-Button erscheint erst ab Level 5 (`shop.setEnabled(level >= 4)`, intern 0-basiert) -
  eine bewusste Designentscheidung.

## Persistenz (Ist-Stand: IndexedDB)

Statt des früher skizzierten konsolidierten JSON-Saves nutzt `GameSave` IndexedDB mit
einer DB pro Slot. Diese Sektion beschreibt den realen Stand.

- Eine DB pro Spielmodus-Slot: `idle-laby-save-idle`, `idle-laby-save-endless` (DB-Version 3).
  Labyrinth-Daten werden nur im Endless gecacht (`idle-laby-cache-endless`, `LabyCache`); der
  Idle-Modus generiert jedes Level deterministisch neu und nutzt keinen Labyrinth-Cache.
- Sechs Object-Stores je Save-DB:

  | Store | Inhalt | Genutzt von |
  | --- | --- | --- |
  | `state` | `{ level: number }` unter Key `save` | beide Modi |
  | `histories` | `{ [level]: string }` (Eingabespur LRUD/B/M) | Endless |
  | `best` | `{ [level]: { moves, totalMoves } }` | Endless |
  | `meta` | `{ coins: bigint }` unter Key `meta` | Idle |
  | `upgrades` | `{ [upgradeId]: level }` | Idle |
  | `clears` | `{ [level]: count }` (Wiederholungszähler) | Idle |

- Alle Daten werden bei `init()` in den RAM geladen; Lese-Ops sind synchron, Schreib-Ops
  aktualisieren den RAM sofort und persistieren asynchron im Hintergrund.
- Level ist intern 0-basiert und wird in der Anzeige mit `+1` dargestellt (HUD, Stats).
- Coins werden als `bigint` gespeichert (IndexedDB structured clone unterstützt das nativ).
- Speed-Stufen liegen im `upgrades`-Store (`player-speed`), ein separater `settings`-Block ist
  dafür nicht nötig.
- Noch nicht abgedeckt (gegenüber dem Konzept): Der **Modus** wird nicht persistiert, sondern
  kommt als Constructor-Option (`mode: 'idle' | 'endless'`). Es gibt keine Datenformat-Version
  auf Datenebene (nur die IDB-Schema-Version) - relevant erst, falls Soft-Schutz/Signaturen folgen.

### Reset und Abwärtskompatibilität

- Pre-Release: Es gibt bewusst KEINE Migration/Abwärtskompatibilität. Ändern sich
  Datenstrukturen, werden die IndexedDB-DBs lokal manuell gelöscht. Auf Kompatibilität
  (Datenübernahme, Datenformat-Version) wird erst ab dem ersten Release geachtet. Die
  frühere Bootstrap-Aufräumlogik (alte DB/localStorage-Keys) wurde entfernt.
- Hard-Reset (Menü): löscht `idle-laby-save-idle` (nur der Idle-Slot; Idle hat keinen
  Labyrinth-Cache), Endless bleibt erhalten. Coins/Clears/Upgrades gehen dabei verloren.
- Reset im Spiel (Taste R): setzt nur das aktuelle Level/den aktuellen Verlauf zurück;
  Coins, Clears und Upgrades bleiben.

## Implementierungsreihenfolge (mit Status)

1. **Save-Refactor** - Teilweise: IndexedDB-Multi-Store statt JSON-Blob, Wallet-Anzeige im
   HUD vorhanden. Offen (bewusst bis zum ersten Release zurückgestellt): persistiertes
   `mode`-Feld, Datenübernahme/Abwärtskompatibilität, Datenformat-Version.
2. **Coin-Belohnung** inkl. Wiederholungs-Decay - Umgesetzt (bigint).
3. **Endless-Modus** - Umgesetzt.
4. **Debug-Modus** - Offen. localhost-Check, Cheats-Panel, Timewarp, Test-Workflows fehlen.
5. **Upgrade-Shop-UI** - Umgesetzt (Floating-Button, Overlay, Kaufbutton, klassenbasierte
   Sichtbarkeit + Preis-Sortierung, In-Place-Refresh, Level-5-Gate).
6. **AutoMover-Random** - Umgesetzt (Leertaste-Toggle, deadline-getriebener Tick mit Catch-up).
7. **AutoMover-Smart** - Umgesetzt: ab Stufe 2 strikte Sackgassen-/Trail-Meidung, Ziel-Grab,
   `B`-Backtrack (über `autoMoverTier` gestaffelt).
8. **AutoMover-Smarter** - Umgesetzt: ab Stufe 3 zusätzlich Luftlinien-Priorisierung.
9. **AutoMover-Borderline** - Offen: `fillBL`/`fillTR` vorhanden, aber nicht aktiviert.
10. **AutoMover-Borderline-Speed** - Offen.
11. **AutoMover-Speed** (`player-speed`) - Umgesetzt: Bot-Intervall x0.9 je Stufe (Anzeige in
    Schritte/s), Kosten +50% je Stufe, unbegrenzt; Handbewegung unverändert.
12. **Ratten v1** - Offen.
13. **Ratten-Erweiterungen** (Anzahl, Speed, Teleporter, Borderline) - Offen.
14. **Drohnen** (optional) - Offen.

## Soft-Schutz / GitHub-Stern-Easter-Egg

Status: offen (kein Code vorhanden). Da das Spiel Opensource ist und client-seitig läuft,
gibt es keinen echten Cheat-Schutz - alles ist "security by friendliness".

- HMAC-Signatur an alle wichtigen Save-Felder (coins, upgrades, level, bestStats).
  Schlüssel = `BASE_SECRET` plus `location.hostname`, sodass Saves nur auf der
  Original-Domain valide sind.
- Friendly-Hosts-Whitelist akzeptiert die produktive Domain (idle-laby.itch.io etc.) und
  localhost. Itch.io nutzt CDN-Subdomains (z. B. `html-classic.itch.zone`), die mit hinein müssen.
- Auf der Original-Domain: bei manipuliertem Save freundlicher Hinweis, dass lokales Klonen
  zum Cheaten erlaubt ist und ein GitHub-Stern willkommen ist.
- Auf localhost: Cheats explizit erlaubt (Debug-Modus), dezenter Banner.
- Auf unbekannter Domain (Fork): Save als "forked instance" markieren.
- Wichtig: kein Lockout. Manipulierte Saves werden weiterhin geladen, aber als
  `legitimate: false` markiert. Voraussetzung dafür wären Signatur-/Marker-Felder im Save.

## Offene Punkte / Entscheidungen

- **Noch wirkungslose Upgrades:** `automover-smarter-borderline`(+ -speed), die Ratten-Kette
  und `drone` sind kaufbar, aber ohne Effekt. Vor einer Veröffentlichung ausblenden oder als
  "in Arbeit" sperren, bis implementiert.
- **Persistenz-Modell:** Bleibt IndexedDB-Multi-Store + bigint. Offen: persistiertes `mode`-Feld
  und eine Datenformat-Version für künftige Migrationen.
- **Balancing:** Konkrete Kosten/Stufenwerte erst nach erster Spielbarkeit kalibrierbar. Das
  Debug-Cheats-Panel ist dafür das vorgesehene Tuning-Tool (noch offen). Tunbare Konstanten:
  75/50-Tendenz im Bot, `botStepSpeedupPerLevel` (0.9), `costGrowthPercent` je Upgrade.
- **Hotkey-Belegung:** Leertaste belegt "Automatik an/aus" (Idle). Weitere Tasten T, R, G,
  +/-/0 sind bereits vergeben - neue Aktionen brauchen freie Slots.
- **Reset-Verhalten:** Hard-Reset löscht aktuell alle Idle-Daten (Coins/Clears weg).
  Bewusst so, oder Coins/Decay teilweise behalten?
- **Player/Bot-Synchronisation (umgesetzt):** Bei aktivem Bot bleibt manuelle Eingabe bewusst
  möglich - beide bewegen denselben Spieler. Ein manueller Step (Richtung oder Undo) verschiebt
  den nächsten Bot-Schritt um ein Intervall, sodass der Bot nicht direkt nachzuckt. Bei offenem
  Shop läuft der Bot im Hintergrund weiter; gepufferte Eingabe-Flanken werden dabei verworfen,
  damit sie beim Schließen nicht nachfeuern.
- **Offline-/Idle-Fortschritt:** Der Bot holt verpasste Schritte des aktuellen Levels nach
  (Catch-up). Ein beschleunigter Mehr-Level-Fortschritt während langer Abwesenheit ist nicht
  implementiert - der Level-Aufstieg passiert maximal einmal pro Frame.
- **Ratten bei Borderline-Markierung:** Verlassen Ratten einen ungültig markierten Bereich
  automatisch? (Erst relevant, sobald Ratten existieren.)
- **Drohnen-Mechanik:** Reichweite, Anzahl, Update-Tick, "durch Wände sehen" oder nicht.
- **Soft-Schutz/HMAC:** Weiter zurückstellen oder die Save-Struktur frühzeitig auf
  Signatur-/`legitimate`-Felder vorbereiten?
- **Bot-Luftlinie bei anderen Layouts:** Der Vergleich `goal.x - player.x >= goal.y - player.y`
  ist bewusst vorzeichenbasiert (Start oben-links, Ziel unten-rechts) und im Code so kommentiert.
  Für künftige Layouts mit Ziel oben/links wäre eine richtungsbewusste Wahl nötig.
