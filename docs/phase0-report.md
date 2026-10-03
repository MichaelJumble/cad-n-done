# Phase 0 — Machbarkeitsbericht

Alle vier Minimaltests wurden im echten Browser verifiziert (nicht nur Build/Typecheck),
über den VS-Code-Dev-Server-Zugriff.

## Zugriff auf den Dev-Server hinter Pfad-Proxy

Diese Coder-Umgebung ist über `https://<host>/proxy/<port>/` erreichbar; der Proxy leitet
nur Pfade unter diesem Präfix durch, **entfernt es aber**, bevor die Anfrage bei Vite ankommt.
Vite selbst braucht das Präfix trotzdem (via `base`), um im HTML/Modulgraph korrekte URLs zu
erzeugen. Lösung in `vite.config.ts`: `base: '/proxy/5173/'` plus ein kleines
`configureServer`-Plugin, das ein vom Proxy entferntes Präfix serverseitig wieder ergänzt,
bevor Vites eigenes Routing greift (siehe `restoreProxyPrefix()` in `vite.config.ts`).
Zusätzlich `server.allowedHosts: true`, da Vite 5+ unbekannte Host-Header sonst blockt.
**Wichtig:** Eigener Code, der WASM-Dateien lädt (z.B. `Parser.init({ locateFile })` in
`treeSitterTest.ts`), darf keine hartkodierten absoluten Pfade (`/foo.wasm`) verwenden,
sondern muss `import.meta.env.BASE_URL` voranstellen — sonst entsteht exakt derselbe
Root-Escape-Bug wie bei den Vite-eigenen Asset-Pfaden.

## 1. Blockly-Workspace ✅

`Blockly.inject('blockly-div', ...)` mit leerer Toolbox, Paket `blockly@12.5.1` (npm-Name
ist `blockly`, **nicht** `@blockly/core` — dieses Paket existiert nicht auf npm).
Rendert im Browser korrekt (bei leerer Toolbox nur als schmaler, leerer Flyout-Streifen
sichtbar — das ist bei einer leeren Toolbox erwartet, kein Bug).

## 2. openscad-wasm: cube → STL (Hauptthread) ✅

Es gibt kein offizielles npm-Paket vom Repo `openscad/openscad-wasm` selbst — das Repo
veröffentlicht nur GitHub-Release-Artefakte, keinen npm-Build. Verwendet wurde stattdessen
das Community-Paket `openscad-wasm@0.0.4` (Single-File-Emscripten-Build, WASM als Base64
eingebettet, `createOpenSCAD()` → `renderToStl(code)`). Im Browser erfolgreich getestet:
korrektes STL für `cube([1,1,1])`.

**Wichtiger Befund:** Dieses eine Modul ist ca. 13,9 MB groß und landet 1:1 im JS-Hauptbundle
(Produktionsbuild: `index-*.js` ≈ 15,2 MB / 4,9 MB gzip, siehe Build-Log). Für Phase 4 (Web
Worker) unbedingt per dynamischem `import()` im Worker laden, nicht im Hauptbundle.

## 3. Three.js + OrbitControls ✅

`three@0.185.1`. `OrbitControls` liegt unter `three/examples/jsm/controls/OrbitControls.js`
(kein `three/addons/*`-Alias in dieser Version). Rendert im Browser (leere Szene erscheint
erwartungsgemäß als schwarzes Feld, da nur Kamera/Licht ohne Geometrie vorhanden sind).

## 4. web-tree-sitter: OpenSCAD-Grammatik parsen ⚠️ dokumentierter Blocker

`web-tree-sitter@0.26.12` lädt seine Runtime-WASM (`Parser.init`) im Browser erfolgreich;
wird als `application/wasm` korrekt ausgeliefert.

**Blocker:** Es existiert **keine vorgebaute Browser-WASM-Grammatik** für OpenSCAD.

- `@openscad/tree-sitter-openscad` (offiziell) und `tree-sitter-openscad` (bollian) sind
  beide auf native Node-Bindings ausgelegt (`node-gyp` + `make`/`gcc`) — Build schlägt in
  dieser Sandbox fehl (`make` fehlt), und selbst bei Erfolg entstünde eine `.node`-Datei,
  keine `.wasm`.
- Sammel-Pakete mit vorgebauten Grammatik-WASMs (`tree-sitter-wasms`, u.a.) enthalten
  OpenSCAD **nicht**.
- Nötig: `tree-sitter build --wasm` auf einer Maschine mit Emscripten oder Docker ausführen
  (hier nicht verfügbar: kein `emcc`, `make`, `gcc`, `docker`) und die entstehende
  `tree-sitter-openscad.wasm` unter `public/grammars/` ablegen. Der Test-Code
  (`src/phase0/treeSitterTest.ts`) erwartet sie unter `/grammars/tree-sitter-openscad.wasm`
  und meldet aktuell diesen Blocker sauber ab, statt abzustürzen.

## Zusätzliche Beobachtungen

- `web-tree-sitter` nutzt intern direktes `eval()` (Build-Warnung) — für strikte CSP später
  relevant.
- Kein CORS-/MIME-Type-Problem beobachtet (soweit ohne echten Browser prüfbar).
