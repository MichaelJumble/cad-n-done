/** Ein einzeln zu renderndes OpenSCAD-Fragment mit Zielfarbe. */
export interface RenderCodeFragment {
  code: string
  /** Farbe (#rrggbb) fuer dieses Fragment oder null fuer die im Viewer
   *  manuell gewaehlte Standardfarbe. */
  color: string | null
  /** id des Top-Level-Blocks, aus dessen Kette dieses Fragment stammt (siehe
   *  codegen/colorFragments.ts) - fuer "Klick im Viewer springt zum Block"
   *  (viewer/blockPicker.ts). Optional/fehlt bei synthetischen Fragmenten
   *  ohne natuerliche Block-Identitaet (z.B. checkCollisions()'s
   *  Paar-Pruefungen in ui/viewerPanel.ts). */
  blockId?: string
  /** Fallback-Variante von `code`, hauchduenn extrudiert (siehe
   *  ui/viewerPanel.ts) - wird vom Render-Worker NUR probiert, wenn `code`
   *  als reine 2D-Flaeche fehlschlaegt (kein 3D-Objekt), rein damit im
   *  Viewer ueberhaupt etwas sichtbar ist. `code` selbst (und damit der
   *  generierte/exportierte OpenSCAD-Text) bleibt davon unberuehrt. */
  previewCode?: string
}

/** Eine SVG-Datei (aus einem os_import_svg-Block), die vor dem Rendern in
 *  jede frisch erzeugte openscad-wasm-Instanz geschrieben werden muss —
 *  siehe render/svgAssets.ts. */
export interface RenderSvgAsset {
  filename: string
  svg: string
}

/** Eine STL-Datei (aus einem os_import_stl-Block) — binaer, anders als SVG,
 *  daher Uint8Array statt string. Siehe render/stlAssets.ts. */
export interface RenderStlAsset {
  filename: string
  data: Uint8Array
}

/** Nachricht vom Main-Thread an den Render-Worker (openscad-wasm). */
export interface RenderRequest {
  requestId: string
  fragments: RenderCodeFragment[]
  svgAssets: RenderSvgAsset[]
  stlAssets: RenderStlAsset[]
}

/** Zwischennachricht vom Render-Worker, sobald EIN Fragment fertig ist (egal
 *  ob mit oder ohne Geometrie) - fuer eine fortlaufende Fortschrittsanzeige
 *  im Viewer (siehe ui/viewerPanel.ts), waehrend der Worker die restlichen
 *  Fragmente noch abarbeitet. Kein Ersatz fuer die abschliessende
 *  RenderResult-Nachricht, nur ein zusaetzliches Signal dazwischen. */
export interface RenderProgress {
  requestId: string
  kind: 'progress'
  /** 0-basierter Index des gerade fertiggestellten Fragments in der
   *  urspruenglich gesendeten `fragments`-Liste. */
  index: number
  total: number
  color: string | null
}

/** Nachricht vom Render-Worker zurueck an den Main-Thread. */
export type RenderResult = RenderSuccess | RenderError

export interface RenderedFragment {
  stl: ArrayBuffer
  color: string | null
  blockId?: string
}

export interface RenderSuccess {
  requestId: string
  status: 'success'
  /** STL-Binaerdaten je Farbfragment. */
  fragments: RenderedFragment[]
  renderTimeMs: number
}

export interface RenderError {
  requestId: string
  status: 'error'
  message: string
  /** Zeilennummer im OpenSCAD-Quelltext, falls vom Parser/Renderer bekannt. */
  line?: number
}
