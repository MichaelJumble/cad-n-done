# OpenSCAD-WASM (Manifold-Backend) — vendored

Diese drei Dateien sind **nicht** über npm bezogen (es gibt derzeit kein
publiziertes npm-Paket mit Manifold-Unterstützung — `openscad-wasm`/
`openscad-wasm-prebuilt` sind beide noch CGAL-only). Stattdessen wurden sie
per Netzwerk-Mitschnitt aus der live laufenden, öffentlichen Instanz von
Olivier Chafiks OpenSCAD-Playground-Fork entnommen:

- Quelle: https://ochafik.com/openscad2 (Build von https://github.com/ochafik/openscad-wasm, Zweig `editor-ochafik.com`)
- Entnommen: 2026-08-19
- Lizenz: GPL-2.0-or-later (wie OpenSCAD selbst — kompatibel mit dem Rest des Projekts)

Dateien:
- `11f7645f8a49daa8a9d6.wasm` — das eigentliche OpenSCAD-WASM-Modul (Dateiname enthält den von Webpack vergebenen Content-Hash, **nicht umbenennen** — `openscad-worker.js` referenziert ihn wörtlich)
- `openscad-worker.js` — Emscripten/Webpack-Glue-Code, **lokal gepatcht** (siehe unten)
- `browserfs.min.js` — wird von `openscad-worker.js` per `importScripts()` nachgeladen (Datei-System-Layer)

## Lokaler Patch

`openscad-worker.js` schreibt eingehende `inputs[].path`-Dateien direkt per
`FS.writeFile()`, OHNE vorher fehlende Elternverzeichnisse anzulegen (z.B.
`/etc/fonts/fonts.conf` schlägt fehl, wenn `/etc/fonts` noch nicht existiert
— das Original-Protokoll bietet keinen expliziten "mkdir"-Befehl). Da
Emscriptens FS-Objekt intern bereits eine rekursive `mkdirTree()`-Methode
mitbringt, wurde der Schreibvorgang minimal-invasiv gepatcht: vor jedem
`FS.writeFile(path, …)` wird jetzt `FS.mkdirTree(dirname(path))` aufgerufen
(no-op, falls das Verzeichnis schon existiert). Ohne diesen Patch schlagen
Font- und `/etc/fonts`-Setup fehl.

Falls diese Datei jemals neu aus der Quelle gezogen wird: nach
`f.FS.writeFile(t.path,await c(f.FS,t))` suchen und denselben Patch erneut
anwenden (siehe `git log`/Kommentare in `src/render/manifoldEngine.ts` für
den genauen Kontext).

## Protokoll (kurz)

`openscad-worker.js` ist ein klassischer (nicht ES-Modul-)Worker mit eigenem
`postMessage`-Protokoll (nicht kompatibel mit dem alten `openscad-wasm`-npm-
Paket, das eine direkte `createOpenSCAD()`-Funktion exportierte). Siehe
`src/render/manifoldEngine.ts` für die JS-seitige Kapselung.
