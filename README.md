# CAD N'Done

🇬🇧 English · 🇩🇪 [Deutsch](README.de.md)

Blockly-based editor for OpenSCAD models with live code generation,
rendering in a web worker (openscad-wasm), and an interactive 3D preview (Three.js).

<p align="center">
  <img src=".github/screenshots/editor-overview.png" width="800" alt="Blockly editor with live 3D preview">
</p>

## Screenshots

| | |
|---|---|
| ![Wall-thickness heatmap](.github/screenshots/wandstaerken-heatmap.png) <br>Wall-thickness heatmap | ![Cross section](.github/screenshots/querschnitt.png) <br>Cross-section view |
| ![Collision detection](.github/screenshots/kollisionserkennung.png) <br>Collision detection | ![Customizer](.github/screenshots/customizer.png) <br>Customizer with sliders |
| ![Dark theme](.github/screenshots/dark-theme.png) <br>Dark theme & multilingual UI | |

## Status

Phases 0–5 of the master prompt are implemented: setup, scaffolding, the
Blockly editor with custom OpenSCAD blocks, code generation, the render
pipeline in a web worker, and the 3D viewer including export. Details on
phase 0: `docs/phase0-report.md`.

## Setup

```bash
npm install
npm run dev
```

Starts the Vite dev server: `/` shows the landing page (index.html), the
editor itself lives at `/startcadndone.html` - snap blocks together there
(left/center), optionally show the code preview, 3D preview on the right
(renders automatically or manually).

`phase0.html` stays reachable as a reference: four isolated feasibility
tests (Blockly workspace, openscad-wasm → STL, Three.js scene,
web-tree-sitter).

## Other commands

```bash
npm run build     # Typecheck (app + worker) + production build (index.html + startcadndone.html + phase0.html)
npm run preview   # View the production build locally
npm run lint      # ESLint
npm run format    # Prettier (writes changes)
```

## Architecture

Each layer only communicates through defined interfaces (see `src/types/`):

```
src/
├── editor/    Blockly setup, custom block definitions, zoom/minimap cluster
├── codegen/   Blocks -> OpenSCAD generator
├── render/    Web worker, openscad-wasm integration
├── viewer/    Three.js scene, loaders, export (STL/GLB/screenshot)
├── parser/    OpenSCAD -> AST (tree-sitter) -> blocks (phase 6, currently on hold)
├── types/     shared TypeScript interfaces between the layers
├── i18n/      multilingual support (German/English)
├── ui/        app layout, panels, themes
├── phase0/    feasibility tests from phase 0 (see docs/phase0-report.md)
└── main.ts    app entry point
```

Details on the proxy setup, the bundling issues that were resolved, and the
open tree-sitter grammar blocker: `docs/phase0-report.md`.
