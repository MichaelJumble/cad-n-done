import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'

// Ray-Ursprung leicht ins Modellinnere versetzt, um einen Selbsttreffer auf
// dem eigenen Startdreieck zu vermeiden (0-Abstand wuerde sonst faelschlich
// als Wandstaerke 0 gewertet).
const RAY_EPSILON = 1e-4

export interface ThicknessRange {
  min: number
  max: number
}

export interface ThicknessResult {
  /** Eine Farbe (RGB, je 0..1) je Vertex, direkt als "color"-BufferAttribute
   *  auf der Geometrie nutzbar. */
  colors: Float32Array
  /** null, wenn kein einziger Strahl etwas getroffen hat (z.B. eine
   *  komplett offene/nicht-mannigfaltige Flaeche). */
  range: ThicknessRange | null
}

/** Schiesst je Vertex einen Strahl entlang der invertierten Normalen ins
 *  Modellinnere (three-mesh-bvh-beschleunigt, sonst bei vielen Vertices zu
 *  langsam) und nimmt die Distanz zum ersten Treffer auf der
 *  gegenueberliegenden Wand als lokale Wandstaerke - trifft kein Strahl
 *  etwas (offene Kante, nicht-mannigfaltige Geometrie), bleibt die Stelle
 *  neutral grau. Die duennste/dickste gefundene Stelle im Modell spannt den
 *  Farbverlauf auf (rot = duenn, blau = dick), daher relativ zueinander,
 *  nicht an einer absoluten mm-Schwelle. */
export function computeThicknessColors(geometry: THREE.BufferGeometry): ThicknessResult {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const bvh = new MeshBVH(geometry)

  const thicknesses: (number | null)[] = new Array(position.count)
  let min = Infinity
  let max = -Infinity

  const origin = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const ray = new THREE.Ray()

  for (let i = 0; i < position.count; i++) {
    origin.fromBufferAttribute(position, i)
    direction.fromBufferAttribute(normal, i).normalize()
    // Kurz nach innen versetzen, dann in die (jetzt umgekehrte) Richtung
    // strahlen - trifft so garantiert nicht mehr das eigene Startdreieck.
    origin.addScaledVector(direction, -RAY_EPSILON)
    direction.negate()
    ray.origin.copy(origin)
    ray.direction.copy(direction)

    const hit = bvh.raycastFirst(ray, THREE.DoubleSide)
    const thickness = hit ? hit.distance : null
    thicknesses[i] = thickness
    if (thickness !== null) {
      if (thickness < min) min = thickness
      if (thickness > max) max = thickness
    }
  }

  const range: ThicknessRange | null = min <= max ? { min, max } : null
  const colors = new Float32Array(position.count * 3)
  const color = new THREE.Color()
  for (let i = 0; i < position.count; i++) {
    const thickness = thicknesses[i]
    if (thickness === null || !range || range.max === range.min) {
      color.setRGB(0.6, 0.6, 0.6)
    } else {
      const t = (thickness - range.min) / (range.max - range.min)
      // Farbton 0 (rot, duenn) bis 240 Grad (blau, dick) - ueber gelb/gruen.
      color.setHSL((t * 240) / 360, 1, 0.5)
    }
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }

  return { colors, range }
}
