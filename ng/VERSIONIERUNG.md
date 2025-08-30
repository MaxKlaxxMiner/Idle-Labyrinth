# Versionierung

Dieses Projekt verwendet Semantische Versionierung (SemVer): MAJOR.MINOR.PATCH

- MAJOR: Inkompatible API-/Datenänderungen oder größere Spielmechanikbrüche.
- MINOR: Abwärtskompatible Funktionserweiterungen, neue Inhalte/Features.
- PATCH: Abwärtskompatible Fehlerbehebungen, kleine Verbesserungen, reine Doku-Änderungen.

Aktuelle Version laut `package.json`: `0.1.0`.

## Release-Checkliste (manuell)

1. Changelog pflegen: Abschnitt „Unreleased“ in neue Version überführen und Datum setzen.
2. Version erhöhen:
   - Variante A (npm erledigt Commit/Tag automatisch):
     - `npm version patch` | `npm version minor` | `npm version major`
   - Variante B (manuell):
     - `package.json`-Version anpassen, committen
     - Optional: Tag setzen `git tag vX.Y.Z`
3. Build prüfen: `npm run build` (Artefakte unter `dist/`).
4. Push (inkl. Tags, falls verwendet): `git push` ggf. `git push --tags`.

## Richtlinien

- Kleine UI-/Doku-Änderungen: PATCH.
- Neue optionale Spielmechanik/Subsysteme (abwärtskompatibel): MINOR.
- Speicherformatbruch, Steuerungsänderungen ohne Rückwärtskompatibilität: MAJOR.
- Changelog immer zusammen mit der Version pflegen.

