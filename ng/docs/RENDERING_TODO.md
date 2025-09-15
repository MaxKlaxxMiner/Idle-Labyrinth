# Rendering Leitfaden

Ziel: stabile, schnelle Darstellung sehr großer Level bei klarer Trennung von Hintergrund, Overlays und Kamera.

## Architekturüberblick
- Hintergrund als 1px-basierte Kachelkarte in 256x256 Chunks (`PixBuffer256`).
- Jeder Chunk hält ein `ImageData` und einen internen Canvas, 1px entspricht 1 Zelle.
- Anzeige per skaliertem `drawImage` auf den Hintergrund-Canvas. Smoothing ist deaktiviert.
- Overlays (Spieler, Ziel, Marker) liegen im Vordergrund-Canvas.
- Kamera liefert Offsets und aktuelle Kachelgröße. Gaps werden optional als 1px-Linien gezeichnet.

## Ist-Stand
- Chunks: Erstellung lazy beim ersten Bedarf, feste Größe 256x256.
- Farbwerte vorab in gepackten Uint32 abgelegt, direkte Pixelmanipulation über `PixBuffer256.u32`.
- Sichtbereich berechnet über Kamera-Offsets und Kachelgröße, nur sichtbare Chunks werden gezeichnet.
- Gaps: 1px-Linien werden über den Hintergrund gelegt, wenn die Kachelgröße einen Schwellwert erreicht.

## Offene Punkte
- Chunk-Lifecycle: Strategie zur Begrenzung von Speicherbedarf, einfache LRU oder Obergrenze je nach Gerätekategorie.
- Dirty-Region-Optimierung: kleine Bereiche zusammenfassen, um `putImageData`-Aufrufe zu reduzieren.
- Optional OffscreenCanvas: Evaluierung, ob `OffscreenCanvas` messbare Vorteile bringt.
- Debug-Ansichten: Umschalten für Chunk-Gitter, Chunk-IDs und Sichtfenster.
- Metriken: einfache Statistik über renderbare Chunks, `put`-Aufrufe, `drawImage`-Aufrufe pro Frame.
- Gaps-Variante evaluieren: Vorbacken der Gaps in den Chunk-Bitmapdaten als Alternative zum Überzeichnen.
- Integer-Ausrichtung: Offsets konsequent runden, um Subpixel und Artefakte zu vermeiden.

## Performance-Hinweise
- Kontexte mit `imageSmoothingEnabled = false` verwenden.
- Per-Frame-Allokationen vermeiden, Puffer wiederverwenden.
- Nur sichtbare Bereiche rendern, Clipping strikt halten.

## Testfälle
- Große Level mit schnellen Kamerabewegungen und Zoomwechseln.
- Häufige Pfadupdates entlang langer Routen.
- Unterschiedliche Gerätepixelraten und Fenstergrößen.

## Aufgabenliste
1. Speicherstrategie für Chunks implementieren und messen.
2. Debug-Overlay für Chunks und Sichtfenster hinzufügen.
3. Metrik-Logging für Renderkosten einbauen.
4. Optionale Dirty-Region-Zusammenfassung prototypisch testen.
5. Alternative Gaps-Strategie vorbacken und vergleichen.
