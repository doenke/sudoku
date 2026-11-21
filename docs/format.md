# Rätsel-Code (Teilen-Link und Bank)

Ein Rätsel steckt vollständig in einem kurzen Code, damit ein Link ohne
Server und unabhängig von der Bank funktioniert:

```
https://sudoku.kanonenwiese.de/#ECYigEgKJjOQgsjlpMAt…
```

Der Code ist ein Bitstrom (höchstwertiges Bit zuerst), geschrieben in
base64url (`A–Z a–z 0–9 - _`):

| Bits | Inhalt |
| --- | --- |
| 4 | Formatversion, derzeit `1` |
| 8 | Merkmale: `1` = Vorgaben, `2` = Käfige, `4` = Diagonalen (Sudoku X), Rest reserviert |
| 3 | Stufe: `0` unbekannt, `1` schwer, `2` extrem, `3` teuflisch |
| 81 + 4 je Vorgabe | nur mit Merkmal Vorgaben: Belegungsmaske, dann die Ziffern |
| 2 je Zelle | nur mit Merkmal Käfige: `0` neuer Käfig, `1` wie links, `2` wie oben, `3` Rückverweis, danach 6 Bit Käfignummer |
| 6 je Käfig | Summen in der Reihenfolge, in der die Käfige zuerst auftauchen |

Größen: ein klassisches Rätsel mit etwa 25 Vorgaben braucht rund 34
Zeichen, ein Killer ohne Vorgaben rund 60.

Die Variante ergibt sich aus den Merkmalen (Käfige → Killer, sonst
klassisch; mit Diagonalen später Sudoku X bzw. Killer X). Die Kodierung liegt
in [`js/core/codec.js`](../js/core/codec.js) und wird von App, Generator und
Tests gemeinsam benutzt.
