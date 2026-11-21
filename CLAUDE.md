# Sudoku – Hinweise für Claude

Killer- und klassisches Sudoku als statische PWA (HTML/CSS/JS mit
ES-Modulen, kein Build, kein Backend, keine Benutzer), online unter
https://sudoku.kanonenwiese.de/.

## Arbeitsweise

- Alles, was Nutzer sehen (UI, Meldungen, README, docs/), ist **Deutsch**.
  Code, Bezeichner und Kommentare sind **Englisch**. Commits auf Deutsch.
- Es gibt nur `main`. Jeder Push auf `main` lässt die Tests laufen und spiegelt
  das Repo per SFTP auf den Webspace – mit Löschen
  (`.github/workflows/deploy.yml`, Details in `DEPLOYMENT.md`).
- Vor dem Push: `npm test` muss grün sein. Bei Änderungen an der Oberfläche die
  App im Browser ansehen (Handy- und Laptop-Breite, hell und dunkel).
- **README bei jeder Funktionsänderung mitpflegen** (Stil: duzen, aus Sicht der
  Nutzer, Abschnitte wie bisher). Neue oder geänderte Techniken auch in
  `docs/schwierigkeit.md`.
- Nichts von fremden Servern laden. Schriften liegen unter `fonts/`.
- `localStorage`-Schlüssel immer mit Präfix `sudoku:` (`game`, `settings`,
  `stats`, `played`, `last`).

## Versionierung x.yy.zzz

- `x` von Hand in `versions.json` (`major`); bei neuer Hauptversion `since` auf
  den Tag setzen.
- `yy` = Tage mit Änderungen an den App-Dateien (`paths` in `versions.json`)
  seit `since`, gezählt von `scripts/version.mjs` aus der Git-Historie.
- `zzz` = CI-Lauf. Lokal `node scripts/version.mjs app` → `1.yy.0`.
- Der Deploy stempelt die Version in alle `.js` mit `__VERSION__` (`sw.js`,
  `js/ui/app.js` – sichtbar in den Einstellungen). Neue App-Ordner in
  `paths` ergänzen. Nach einem Push die Version aus der CI-Zusammenfassung
  nennen.

## Aufbau

- `js/core/` ist der gemeinsame Kern für Browser, Generator und Tests. Er darf
  nichts aus `js/ui/` oder Node importieren.
  - `model.js`: Constraint-Modell. Häuser (`full: true`) und Käfige sind
    Alldiff-Einheiten. **Neue Varianten** nur über `variants.js` (Hausarten,
    Käfige) – kein Umbau der Löser.
  - `human/`: Techniken (`find(grid) → step`), Reihenfolge, Stufe und Gewicht
    in `techniques.js`. Eine Technik, die für eine Variante nicht gilt, meldet
    das über `applies(model)` (Beispiel Unique Rectangle bei Käfigen).
  - `codec.js`: Rätsel-Code (Format in `docs/format.md`). Nicht inkompatibel
    ändern – Bank, geteilte Links und gespeicherte Spielstände hängen daran;
    bei Bedarf neue Formatversion.
- `js/ui/`: `app.js` (Steuerung, Dialoge, Tastatur), `board.js` (DOM-Zellen +
  SVG für Linien und Käfige), `game.js` (Spielstand, Undo/Redo),
  `bank.js`, `stats.js`, `settings.js`, `store.js`.
- `data/<variante>-<stufe>.json`: Rätselbank, eine Zeile pro Rätsel
  `[code, schwerste Technik]`. Die CI erzeugt nichts.
- `tools/`: `generate.mjs` (Bank auffüllen, worker_threads),
  `check-bank.mjs` (ganze Bank prüfen, `--fix` sortiert nach
  Technik-Änderungen um). Werden nicht hochgeladen.
- `sw.js`: Cache `sudoku-<Version>`, Vorlade-Liste `/*__FILES__*/` füllt der
  Deploy mit allen hochgeladenen Dateien (inklusive Bank). Netz zuerst, Cache
  nur offline oder nach 4 s. Updates still – keine „Neue Version“-Meldung.

## Regeln der App (mit dem Nutzer abgestimmt)

- Drei Stufen: schwer, extrem, teuflisch. Rätsel nur mit Basis-Techniken oder
  nur durch Raten lösbar kommen nicht in die Bank.
- Hilfen alle einzeln abschaltbar; Standard: Notizen an, Fehleranzeige „Aus“,
  alles andere aus. Keine Hinweis- oder Löse-Funktion.
- „Gegen die Lösung“ oder „alle Kandidaten ausfüllen“ → Rätsel zählt in der
  Statistik getrennt (`assisted`). „Regelkonflikte“ zählt normal.
- „Prüfen“ (nur bei Fehleranzeige „Aus“) markiert falsche Ziffern bis zum
  nächsten Zug und zählt normal.
- Serie: gelöste Rätsel in Folge je Variante und Stufe; ein angefangenes
  Rätsel abzubrechen setzt sie zurück.
- Nicht bauen: Konten, Sync, Server-Code, Hinweise, Tagesrätsel, Werbung.
