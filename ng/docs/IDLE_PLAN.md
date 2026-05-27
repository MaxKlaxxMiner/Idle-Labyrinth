# Idle-Konzept

Grober Umriss für die Weiterentwicklung vom rein manuellen Labyrinth-Spiel zum Idle-Game. Alle Namen und Zahlenwerte sind Vorschläge und ausdrücklich offen.

## Vision

- Einstieg: Spieler löst die ersten Level vollständig von Hand und verdient dabei Coins.
- Übergang: Sobald genügend Coins angespart sind, werden Upgrades sichtbar und kaufbar. Das Spiel verlagert sich schrittweise vom aktiven Lösen hin zum Optimieren der Lösungs-Automatik.
- Endgame: Mehrere Automatik-Schichten (AutoMover, Ratten, Drohnen) lösen Level parallel/schneller. Spieler kümmert sich um Upgrade-Strategie und Meta-Progression.

## Spielmodi

1. **Story** (Hauptmodus, Default)
   - Inkrementeller Levelaufstieg wie aktuell, plus Coin-/Upgrade-System.
   - Idle-Mechaniken werden hier freigeschaltet.
2. **Endless** (von Anfang an verfügbar)
   - Reiner Handmodus ohne Idle-Features.
   - Levelschritte folgen `Consts.largeLevels` (also größere Sprünge), nicht inkrementell.
   - Kein Coin-Verdienst, getrennter Save-Slot oder klar markiert als „nur Hand".
3. **Debug** (nur localhost)
   - Alles aus Story + direkte Levelwahl, freie Upgrade-Schaltung, vermutlich auch alle bisherigen Scan-/Cheat-Tools.
   - Bestehende „Cheat"-/Scan-Tools wandern aus Story in diesen Modus.

## Coin-Ökonomie

- Belohnung pro abgeschlossenem Level: `coins = (width * height) / factor` (Vorschlag: `factor` so wählen, dass ein erstes Level wenige Coins gibt, größere Level deutlich mehr).
- Wiederholungs-Decay: das `n`-te Lösen desselben Levels zahlt `1/n` der Ursprungsbelohnung (also 100%, 50%, 33%, 25%, …, bei 100. Mal noch 1%). Erfordert pro Level einen Wiederholungszähler im Save.
- Persistenz: `coinsTotal`, `levelClears[level] = n` in `localStorage` (oder konsolidiertem JSON-Save). Migration vom aktuellen `idle-laby-level`/`idle-laby-historyRaw` muss bedacht werden.
- Sichtbarkeit von Upgrades: ein Upgrade erscheint im Shop, sobald `coinsTotal >= upgrade.cost * 0.25` (Viertel der nötigen Summe). Vorher nicht sichtbar.

## Upgrade-System

- Upgrades sind in Stufenketten organisiert (Vorgänger muss gekauft sein, sonst kein Sichtbarkeitstrigger).
- Jeder Kauf reduziert `coinsTotal` um die Stufenkosten; gekaufte Stufen bleiben im Save.
- Globaler Hotkey-Slot „Automatik an/aus", den der Spieler je nach gekauften Upgrades belegt (mind. AutoMover). Spätere Stufen toggeln gestaffelt oder ersetzen einander.

### Upgrade-Kette: AutoMover

| Stufe | Name (Vorschlag) | Verhalten |
| --- | --- | --- |
| 1 | `automover-random` | Wählt an jedem Knoten gleichmäßig zufällig eine begehbare Nachbarkante. Stößt irgendwann zufällig auf das Ziel. |
| 2 | `automover-smart` | Markiert Sackgassen als rot (so wie der Spieler heute manuell) und betritt sie nicht erneut. An echten Verzweigungen weiter zufällig. |
| 3 | `automover-smarter` | Wie `smart`, bei Verzweigungen aber Priorisierung nach Luftlinien-Diagonale zum Ziel (Logik existiert bereits im Scan-Tool und kann übernommen werden). |
| 4 | `automover-smarter-borderline` | Wie `smarter`. Zusätzlich: beim Erreichen des Außenrands wird der zurückgelegte Pfad analysiert und die innere Seite, die das Ziel nicht mehr erreichen kann, an allen Eingängen künstlich mit roten Markern blockiert. |
| 5 | `automover-smarter-borderline-speed` | Wie davor, Rückwege (bereits begangene Pfade) laufen mit doppelter Geschwindigkeit. |

### Upgrade-Kette: Spieler-Speed

- Voraussetzung: irgendein AutoMover gekauft.
- Mehrere Stufen (z. B. ×1.25, ×1.5, ×2, ×3, …), wirken auf die Bewegungsgeschwindigkeit allgemein (Hand wie Automatik). Konkrete Stufenwerte offen.

### Upgrade-Kette: Ratten

- Voraussetzung: `automover-smarter` gekauft + ausreichende Coins.
- Verhalten: jede Ratte läuft selbständig nach `smart`-Logik (Sackgassen markieren) und arbeitet parallel zum Spieler/AutoMover.
- Kaufbare Anzahl steigerbar (1, 2, 3, …). Sinnvolle Obergrenze offen.
- Sichtbarkeit auf dem Brett: eigenes Sprite/Farbe, keine Kollision mit Spieler.

### Upgrade-Kette: Ratten-Speed

- Analog zu Spieler-Speed, gilt nur für Ratten.

### Upgrade: `rats-teleporter`

- Standardverhalten: Sobald eine Ratte eine Sackgasse erreicht, läuft sie den ganzen Weg zurück zur letzten unbekannten Abzweigung.
- Mit Upgrade: dieser Rückweg erfolgt praktisch instant (Teleport zur letzten Abzweigung).
- Auch sofortiger Teleport, wenn der Spieler oder eine andere Ratte den aktuellen Bereich der Ratte per Borderline-Logik als ungültig markiert (die Ratte „weiß", dass sie hier nichts mehr findet).

### Upgrade: `rats-borderline`

- Borderline-Logik analog zur AutoMover-Borderline, aber für Ratten.
- Erlaubt es Ratten, ganze ungültige Bereiche zu blockieren, was die Suche der gesamten Gruppe beschleunigt.

### Idee: Drohnen

- Status: nur Idee, später konkretisieren.
- Bewegen sich frei (nicht raster-/wandgebunden) in einem rechteckigen Radius um den Spieler/das Ziel.
- Wirken auf die Karte, indem sie noch nicht rot markierte Sackgassen sowie Pfade, die nur in roten Sackgassen enden, automatisch als rot markieren (innerhalb des Sichtfensters).
- Offen: Reichweite, Anzahl, Update-Frequenz, ob sich Drohnen die Karte selbst erschließen müssen oder „durch Wände sehen".

## Sichtbarkeits-/Freischaltlogik (Vorschlag-Regel)

- Ein Upgrade ist `visible`, wenn:
  - alle Vorbedingungen erfüllt sind (Vorgängerstufe gekauft, ggf. weitere Feature-Gates), und
  - `coinsTotal >= cost * 0.25`.
- Sichtbarer, aber zu teurer Eintrag wird im Shop ausgegraut/preisangezeigt.
- Gekaufte Upgrades bleiben im Shop als „besessen" markiert (oder verschwinden in eine „Inventory"-Sektion).

## Persistenz-Skizze

Konsolidiertes Save-Objekt unter z. B. `idle-laby-save`:

```json
{
  "version": 1,
  "mode": "story",
  "coinsTotal": 0,
  "levelClears": {"5": 2, "6": 1},
  "upgrades": {
    "automover-random": true,
    "automover-smart": false,
    "rat-count": 0
  },
  "settings": {"speedTier": 0, "ratSpeedTier": 0}
}
```

Migration aus `idle-laby-level` und `idle-laby-historyRaw` muss beim ersten Start mit dem neuen Format laufen.

## Vorschlag für eine Implementierungsreihenfolge

1. **Save-Refactor:** konsolidiertes JSON-Save inkl. Migration; Wallet-Anzeige im HUD.
2. **Coin-Belohnung:** Coins bei Level-Abschluss inkl. Wiederholungs-Decay.
3. **Endless-Modus:** Modus-Schalter im Save, Levelpfad auf `largeLevels` umstellen, keine Coins; bestehende Hand-Spiellogik bleibt unverändert.
4. **Debug-Modus:** localhost-Check + vorhandene Cheat-/Scan-Tools dorthin verschieben (aus Story rausnehmen).
5. **Upgrade-Shop-UI:** Minimalpanel (Liste, Kosten, Kaufbutton, Sichtbarkeitsregel 25%).
6. **AutoMover-Random:** Hotkey + Tick-getriebene Zufallsbewegung.
7. **AutoMover-Smart:** Sackgassen-Markierung wiederverwenden (existiert im Scan-Tool).
8. **AutoMover-Smarter:** Luftlinien-Priorisierung aus Scan-Tool übernehmen.
9. **AutoMover-Borderline:** Rand-Erkennung + Markierung ungültiger Innenbereiche.
10. **AutoMover-Borderline-Speed:** Speed-Modifikator auf Rückwegen.
11. **Spieler-Speed-Upgrades.**
12. **Ratten v1:** eine Ratte, `smart`-Logik, separater Renderer.
13. **Ratten-Erweiterungen:** Anzahl, Speed, Teleporter, Borderline.
14. **Drohnen (optional):** sobald die anderen Schichten stabil laufen.

## Offene Punkte

- Konkreter `factor` für Coin-Belohnung und Balancing der Upgrade-Kosten (erst nach erster Spielbarkeit kalibrierbar).
- Genaue Hotkey-Belegung (aktuell sind viele Buchstaben/Sondertasten schon belegt – T, R, G, Space, Enter, +/-/0).
- UI-Konzept für den Shop (Modal, Sidebar, Overlay?). Aktuelles HUD ist sehr kompakt.
- Verhalten beim Reset (R): Coins behalten? Wiederholungs-Decay beim Hard-Reset?
- Synchronisation zwischen Spieler und Automatik (z. B. wenn der Spieler mitten in einer AutoMover-Bewegung manuell eingreift).
- Wie verhalten sich Ratten, wenn der Spieler bereits eine Borderline-Markierung gesetzt hat? Verlassen sie ihren ungültigen Bereich automatisch?
- Drohnen-Mechanik schärfen (Reichweite, Anzahl, Update-Tick).
- Save-Versionierung und Migrationspfad festlegen.
