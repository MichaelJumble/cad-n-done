/** Ein einzelnes Mesh-Fragment, das die Render-Schicht an den Three.js-Viewer
 *  uebergibt — mehrere Fragmente ergeben zusammen das dargestellte Modell,
 *  jedes mit seiner eigenen Farbe (null = manuell gewaehlte Standardfarbe). */
export interface MeshFragment {
  stl: ArrayBuffer
  color: string | null
  /** id des Blockly-Top-Level-Blocks, der dieses Mesh erzeugt hat - siehe
   *  meshLoader.ts (auf mesh.userData.blockId uebernommen) und
   *  viewer/blockPicker.ts (liest es beim Klick wieder aus). */
  blockId?: string
}
