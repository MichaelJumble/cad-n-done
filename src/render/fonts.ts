/** Schriften fuer OpenSCADs text() (siehe editor/blocks/blockHelpers.ts
 *  fontOptions() fuer die dazugehoerige Dropdown-Liste — Namen dort MUESSEN
 *  zu den hier hinterlegten Dateien passen). Der Manifold-Render-Worker
 *  (siehe manifoldEngine.ts) bringt selbst keine Schriften/Fontconfig mit,
 *  daher werden die .ttf-Dateien aus public/fonts als `url`-Eingaben
 *  mitgeschickt (der Worker holt sie sich selbst per fetch() — kein
 *  Vor-Laden der Bytes hier noetig). */
export const FONT_FILENAMES = [
  'LiberationSans-Regular.ttf',
  'LiberationSerif-Regular.ttf',
  'LiberationMono-Regular.ttf',
  'DejaVuSans.ttf',
  'DejaVuSansMono.ttf',
  'AllertaStencil-Regular.ttf',
  'BlackOpsOne-Regular.ttf',
]
