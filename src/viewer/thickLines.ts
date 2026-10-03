import * as THREE from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

/** Baut Liniensegmente mit echter, einstellbarer Breite in Bildschirm-Pixel.
 *  THREE.LineBasicMaterial (von GridHelper/AxesHelper genutzt) ignoriert
 *  sein `linewidth` in praktisch jedem Browser (WebGL-Kernprofil erlaubt nur
 *  1px, unabhaengig vom gesetzten Wert) - LineMaterial/LineSegments2 zeichnen
 *  stattdessen kamera-ausgerichtete Quads und umgehen die Beschraenkung.
 *  `positions` ist ein Vielfaches von 6 Zahlen (x1,y1,z1, x2,y2,z2, ...) -
 *  ein Segment pro Sechsergruppe, unabhaengig von anderen Segmenten (nicht
 *  wie bei Line2 zu einem durchgehenden Pfad verbunden). resolution wird von
 *  LineSegments2 selbst bei jedem Render aus dem Renderer aktualisiert
 *  (onBeforeRender), kein manuelles Nachziehen bei Resize noetig. */
export interface ThickLineOptions {
  /** Gestrichelt statt durchgezogen - dashSize/gapSize in denselben
   *  Welteinheiten wie `positions` (analog zu THREE.LineDashedMaterial). */
  dashed?: boolean
  dashSize?: number
  gapSize?: number
}

export function createThickLineSegments(
  positions: Float32Array,
  color: THREE.ColorRepresentation,
  linewidthPx: number,
  options: ThickLineOptions = {},
): LineSegments2 {
  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(positions)
  const material = new LineMaterial({ color, linewidth: linewidthPx })
  // Die Quads je Segment werden im Shader kameraseitig ausgerichtet - deren
  // Dreieck-Wicklung kann sich dabei, je nachdem von welcher Seite einer
  // flachen Flaeche (z.B. eines am Boden liegenden Gitters) aus zugesehen
  // wird, umkehren. Mit dem Standard "FrontSide" verschwinden dann genau die
  // Segmente, deren Wicklung gerade als rueckseitig gilt - von oben
  // unsichtbar, von unten sichtbar (oder umgekehrt). DoubleSide schaltet das
  // Backface-Culling dafuer komplett ab.
  material.side = THREE.DoubleSide
  if (options.dashed) {
    material.dashed = true
    material.dashSize = options.dashSize ?? 1
    material.gapSize = options.gapSize ?? 1
  }
  const line = new LineSegments2(geometry, material)
  // Analog zu THREE.Line.computeLineDistances() bei LineDashedMaterial -
  // ohne das bleiben die fuer die Strichelung noetigen Distanzwerte je
  // Vertex leer, die Linie erschiene komplett durchgezogen oder gar nicht.
  if (options.dashed) line.computeLineDistances()
  return line
}
