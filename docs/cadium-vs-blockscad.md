# CAD N'Done

CAD N'Done ist ein browserbasierter, visueller Editor für OpenSCAD-Modelle: 3D-Objekte
werden per Blockly (Google) durch Zusammenstecken von Bausteinen konstruiert statt
Code zu tippen. Im Hintergrund erzeugt CAD N'Done daraus laufend echten OpenSCAD-Code,
rendert ihn direkt im Browser über eine WebAssembly-Portierung von OpenSCAD
(openscad-wasm, in einem Web Worker) und zeigt das Ergebnis in einer interaktiven
3D-Vorschau auf Basis von Three.js. Es läuft komplett clientseitig — kein Server,
keine Installation, kein Account.

Konzeptionell ist CAD N'Done an [BlockSCAD](https://www.blockscad3d.com/) angelehnt
(demselben Grundprinzip: Blockly + OpenSCAD), wurde aber als eigenständige,
moderne Neuentwicklung umgesetzt. Alle Angaben unten beziehen sich auf den
allgemein bekannten Funktionsumfang von BlockSCAD und sind nach bestem Wissen
zusammengestellt — kein Anspruch auf einen lückenlosen, tagesaktuellen Diff
gegen BlockSCAD.

## Funktionen, die es in BlockSCAD nicht (oder nicht in dieser Form) gibt

### Import & Export

- **SVG-Import**: 2D-Vektordateien (z.B. aus Inkscape) direkt als Block einlesen
  und per `extrudiere` zu einem 3D-Körper machen (`import()` + `linear_extrude()`
  von OpenSCAD). BlockSCAD kennt nur die eingebauten 2D-Grundformen.
- **STL-Import**: fertige STL-Dateien als Block einbinden und mit anderen
  3D-Bausteinen kombinieren (z.B. Boolesche Operationen mit einem gescannten Modell).
- **Import aus BlockSCAD**: bestehende BlockSCAD-Projektdateien lassen sich direkt
  in CAD N'Done importieren (Migrationspfad), inkl. Warnhinweis, welche Blocktypen
  dabei nicht 1:1 übernommen werden konnten.
- **GLB-Export**: zusätzlich zu STL auch Export als glTF/GLB (Farben/Materialien
  bleiben erhalten, z.B. für Web/AR-Weiterverwendung) — mit Auswahl, welche
  Farben/Teile mit exportiert werden.
- **PNG-Export des Blockly-Designs**: der Bausteine-Workspace selbst (nicht die
  3D-Ansicht) lässt sich als hochauflösendes PNG exportieren — z.B. für
  Dokumentation oder zum Teilen des Aufbaus.
- **Zwei Bildexporte der 3D-Vorschau**: ein normaler Screenshot der aktuellen
  Kameraansicht, sowie ein separater "Ganzes Bild"-Export, der die Kamera vorher
  automatisch so einrahmt, dass das komplette Modell sichtbar ist — unabhängig
  vom aktuellen Zoom/Schwenk-Zustand, und in deutlich höherer Auflösung als der
  Bildschirm selbst.
- Dateinamen von Speichern/PNG-Exporten enthalten automatisch Projektname und
  Versions-/Zählernummer.

### 3D-Vorschau

- **Schnittebene (Cross-Section)**: das Modell entlang X/Y/Z aufschneiden
  (inkl. Umkehren der Seite) — um das Innenleben eines Modells zu prüfen, ohne
  den Code zu ändern.
- **Wireframe-Ansicht** umschaltbar.
- **Schatten** umschaltbar (inkl. eigenem Schattenempfänger-Boden).
- **Licht-Werkzeuge**: Helligkeit, Winkel per Slider, automatische Rotation des
  Lichts mit einstellbarer Geschwindigkeit.
- **Render-Qualität** wählbar (niedrig/mittel/hoch) — Kompromiss zwischen
  Geschwindigkeit und Detailgrad der Kurven/Rundungen.
- **Vordefinierte Ansichten** (vorne/hinten/links/rechts/oben/unten/diagonal)
  per Dropdown.
- **Auto-Render umschaltbar**: wahlweise rendert jede Blockänderung sofort neu,
  oder man löst das Rendern manuell per Button aus (z.B. bei großen/komplexen
  Modellen).
- **3D-Vorschau als eigenes Fenster auslagern** (Popout) — z.B. für einen zweiten
  Bildschirm.
- **Farbfilter beim Export**: STL/GLB lassen sich gezielt nur mit bestimmten
  Farben/Teilen exportieren, einzelne Farben lassen sich zur Kontrolle auch nur
  in der Vorschau aus-/einblenden.

### Editor & Workspace

- **Mehrsprachig** (Deutsch/Englisch umschaltbar) — BlockSCAD ist rein englisch.
- **Mehrere Farbschemata** (Hell, Dunkel, Kontrast).
- **Workspace-Suche** über die Bausteine.
- **Minimap** zur Übersicht bei großen Bausteine-Bäumen.
- **Ein-/ausklappbare Toolbox** mit farblich abgesetzten, modernisierten
  Kategorien (statt der klassischen Blockly-Standardoptik).
- **"Blöcke ausrichten"**: alle losen Bausteine mit einem Klick sauber in einer
  Spalte anordnen.
- **Zoom/Fit-to-View** direkt am Workspace, inkl. größerer, leichter erreichbarer
  Bedienelemente.
- Zusätzliche Bausteine ohne BlockSCAD-Entsprechung, u.a.: Ring/Torus, Resize,
  Rotieren/Spiegeln um einen frei wählbaren Vektor, min_angle/min_size als
  größenunabhängige Alternative zu "sides" ($fa/$fs statt nur $fn), HSV-Farbe,
  sowie ein "Roher OpenSCAD-Code"-Baustein als Escape-Hatch für alles, wofür es
  (noch) keinen eigenen Block gibt.

### Projektverwaltung & Sonstiges

- **Undo/Redo** über eigene Tastatur-/Button-Steuerung.
- **Löschen mit Bestätigungsdialog**, **Laden mit Warnhinweis** bei ungespeicherten
  Änderungen.
- **Projektname + laufende Versionsnummer** im Header, fließen automatisch in
  alle Dateinamen (Speichern, PNG-Exporte) ein.
- **Info-Dialog** mit Versionsangabe, Lizenz-/Copyright-Hinweisen zu den
  verwendeten Open-Source-Bausteinen (Blockly, openscad-wasm, Three.js) sowie
  Autor und Nutzungshinweis.

## Technische Basis

| Bereich            | Technologie                              |
| ------------------ | ---------------------------------------- |
| Bausteine-Editor   | Blockly 12 (Google, Apache-2.0)          |
| OpenSCAD-Rendering | openscad-wasm im Web Worker (GNU GPL v2) |
| 3D-Vorschau        | Three.js (MIT)                           |
| Build/Dev-Server   | Vite                                     |
| Sprache            | TypeScript                               |
