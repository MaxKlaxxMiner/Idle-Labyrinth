# Agents – Arbeitsleitfaden

Dieser Leitfaden beschreibt, wie Beiträge in diesem Projekt erfolgen sollen.

## Sprache
- Unterhaltung/Kommunikation: Deutsch.
- Code (Bezeichner, Implementierung): Englisch.
- Kommentare und Dokumentation (Readmes, Docs, Code-Kommentare): Deutsch.

## Entwickeln & Testen
- Nach Codeänderungen genügt ein einfacher Typecheck:
  - `npm run typecheck`
- Bei mir übernimmt der Webpack‑Dev‑Server automatisch Reload/Compile.

## Arbeitsweise
- Änderungen möglichst klein und fokussiert halten.
- Größere Aufgaben vorab aufteilen/planen (Schritte definieren), dann inkrementell umsetzen.
- Erst planen, dann implementieren; frühe Zwischenschritte bevorzugen, um Feedback zu ermöglichen.

## Git & Commits
- Branch: direkte lokale Commits auf `master` sind erlaubt.
- Push: keine Pushes (lokale Commits only).
- Autor: Username `codex`, E‑Mail: keine.
- Commit‑Nachrichten: müssen mit `laby: ` beginnen.
- Zeitpunkt: Commits erst, nachdem die stabile Funktionsweise der Anpassung direkt oder indirekt bestätigt wurde. Gut platzierte Commits sind dann jederzeit erlaubt.

### Identität/Authoring
- Es wird keine Git‑Repo‑Konfiguration für Name/E‑Mail gesetzt oder verändert.
- Agent‑Commits verwenden eine per‑Commit Identität, z. B.:
  - `git -c user.name="codex" -c user.email="" commit -m "laby: <message>" --author="codex <>"`
- Eigene Commits des Maintainers nutzen weiterhin dessen persönliche/Globale Git‑Konfiguration.
