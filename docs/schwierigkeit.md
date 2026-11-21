# Wie schwer ist schwer? – Die Stufen

Jedes Rätsel der Bank wird von einem Löser bewertet, der vorgeht wie ein
Mensch: Er probiert immer die leichteste Technik, die gerade weiterhilft, und
fängt nach jedem Fortschritt wieder unten an. Die **Stufe** eines Rätsels ist
die Stufe der schwersten Technik, die er dabei gebraucht hat.

Es gibt nur drei Stufen, und alle beginnen bei „schwer“:

| Stufe | Wann? |
| --- | --- |
| – (verworfen) | Lösbar nur mit Singles und einfachen Käfig-Kombinationen. Zu leicht für diese App. |
| **schwer** | Braucht mindestens eine Technik aus der Spalte „schwer“. |
| **extrem** | Braucht mindestens eine Technik aus der Spalte „extrem“. |
| **teuflisch** | Braucht Ketten. |
| – (verworfen) | Auch mit allen Techniken nicht lösbar, also nur durch Raten. |

## Techniken nach Stufe

Die Reihenfolge innerhalb einer Stufe ist die, in der der Löser sie
probiert ([`js/core/human/techniques.js`](../js/core/human/techniques.js)).

| Technik | Stufe | Gilt für | Kurz erklärt |
| --- | --- | --- | --- |
| Naked Single | Basis | alle | Eine Zelle hat nur noch einen Kandidaten. |
| Hidden Single | Basis | alle | Eine Ziffer hat in einer Zeile, Spalte oder einem Block nur noch einen Platz. |
| Käfig-Kombinationen | Basis | Killer | Zellen eines Käfigs behalten nur Ziffern, die in einer passenden Kombination vorkommen; die letzte freie Zelle ergibt sich aus der Summe; eine Ziffer, die jede Kombination braucht und nur einen Platz hat, steht fest. |
| Pointing / Box-Line | schwer | alle | Eine Ziffer liegt in einem Haus nur in der Schnittmenge mit einer anderen Einheit (Block/Zeile/Spalte, bei Killer auch Käfig) – sie fällt im Rest dieser Einheit weg. |
| Naked Pair, Triple, Quad | schwer | alle | n Zellen einer Einheit teilen sich genau n Kandidaten (auch in Käfigen). |
| Hidden Pair, Triple, Quad | schwer | alle | n Ziffern haben in einem Haus nur dieselben n Plätze. |
| Summen-Eliminierung | schwer | Killer | Ein Kandidat bleibt nur, wenn die übrigen Zellen des Käfigs die Summe noch mit verschiedenen Ziffern erreichen (Min/Max und mehr). |
| Käfig im Haus | schwer | Killer | Eine Ziffer, die jede Kombination eines Käfigs braucht, fällt in allen Zellen weg, die alle ihre möglichen Plätze im Käfig sehen. |
| 45er-Regel (ein Haus) | schwer | Killer | Zeile, Spalte oder Block ergeben 45: Innies bzw. Outies haben eine bekannte Summe. |
| X-Wing, Swordfish, Jellyfish | extrem | alle | Fisch-Muster einer Ziffer über 2, 3 oder 4 Zeilen bzw. Spalten. |
| XY-Wing, XYZ-Wing | extrem | alle | Drei Zellen mit zwei bzw. drei Kandidaten, die sich gegenseitig zwingen. |
| Unique Rectangle (Typ 1–4) | extrem | nur ohne Käfige | Ein Rechteck aus zwei Ziffern wäre tauschbar und damit nicht eindeutig. Bei Killer gilt das nicht, weil der Tausch eine Käfigsumme ändern kann – dort ist die Technik abgeschaltet. |
| Kombi-Konflikt mit Zeile/Spalte/Block | extrem | Killer | Eine Kombination fällt weg, weil ein Haus eine Ziffer in den Käfig zwingt, die ihr fehlt, oder weil sie sich mit jeder Kombination eines anderen Käfigs im selben Haus überschneidet. |
| Käfig-Teilung / Innie-Outie-Differenz | extrem | Killer | 45er-Regel über ein Haus, bei der Käfige an der Hausgrenze geteilt werden: Ein Teil steht als „Käfigsumme minus anderer Teil“ in der Rechnung (z. B. Innie − Outie = 3). |
| 45er-Regel über mehrere Häuser | extrem | Killer | Dieselbe Rechnung über zwei oder drei benachbarte Zeilen oder Spalten (90, 135) oder zwei Blöcke einer Reihe. |
| X-Chain | teuflisch | alle | Kette starker und schwacher Verbindungen einer einzigen Ziffer. |
| XY-Chain | teuflisch | alle | Kette über Zellen mit genau zwei Kandidaten. |
| AIC | teuflisch | alle | Alternierende Kette aus beliebigen starken und schwachen Verbindungen; bei Killer zählen Käfige mit einer Pflichtziffer an genau zwei Plätzen als starke Verbindung. |
| Forcing Chain | teuflisch | alle | Jede Möglichkeit einer Zelle (2–3 Kandidaten) oder jeder Platz einer Ziffer in einem Haus (2–3 Plätze) wird durchgespielt; was in allen Fällen gilt, steht fest, was zum Widerspruch führt, fällt weg. Weitergerechnet wird nur mit Singles und Käfig-Kombinationen – das bleibt Logik und wird kein verstecktes Raten. |

## Varianten

Regeln und Techniken arbeiten auf einem Constraint-Modell: Jede Zeile,
Spalte und jeder Block ist ein „Haus“ (alle Ziffern genau einmal), jeder
Käfig eine Einheit mit „alle verschieden“ plus Summe. Sudoku X oder Killer X
bekommen später zwei zusätzliche Häuser (die Diagonalen) – die Techniken oben
greifen dann automatisch auch dort. Eine Technik meldet selbst, wann sie
nicht gilt (wie Unique Rectangles bei Käfigen).

## Erzeugen und Prüfen

- `node tools/generate.mjs --variant killer --count 500` füllt die Bank auf
  (`data/<variante>-<stufe>.json`). Klassische Rätsel entstehen durch
  punktsymmetrisches Streichen aus einer zufälligen Lösung, Killer durch
  zufällige Käfige, die so lange geteilt werden, bis die Lösung eindeutig ist,
  und danach wieder zusammengelegt, solange sie eindeutig bleibt.
- `node tools/check-bank.mjs` prüft die ganze Bank: eindeutig, gleiche Stufe,
  gleiche schwerste Technik. Nach einer Änderung an den Techniken sortiert
  `--fix` Rätsel in die richtige Datei um.
- Im Test (`npm test`) wird eine Stichprobe jeder Datei geprüft.

## Format der Bank

```json
{"format":1,"variant":"killer","level":"teuflisch","puzzles":[
["ECYigEgK…","forcingChain"],
…
]}
```

Pro Rätsel: der Code (derselbe wie im Teilen-Link, siehe
[format.md](format.md)) und die schwerste nötige Technik. Die ID eines Rätsels
ist ein Hash des Codes ohne Stufe; sie steht deshalb nicht in der Datei, und
ein geteiltes Bankrätsel hat beim Empfänger dieselbe ID.
