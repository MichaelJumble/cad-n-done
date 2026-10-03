import * as THREE from 'three'
import { createThickLineSegments } from './thickLines'

const AXIS_COLOURS = { x: '#e0483e', y: '#3e9d4c', z: '#3b6fe0' } as const
// In Bildschirm-Pixeln (siehe thickLines.ts) - deutlich staerker als die
// 1px-Standardlinie von AxesHelper, damit die Achsen auf einen Blick
// erkennbar bleiben.
const AXIS_LINEWIDTH_PX = 2.5

const AXIS_SPECS = [
  { color: AXIS_COLOURS.x, dir: new THREE.Vector3(1, 0, 0), label: 'X' },
  { color: AXIS_COLOURS.y, dir: new THREE.Vector3(0, 1, 0), label: 'Y' },
  { color: AXIS_COLOURS.z, dir: new THREE.Vector3(0, 0, 1), label: 'Z' },
] as const

function makeLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.font = 'bold 44px system-ui, sans-serif'
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 32, 34)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(8, 8, 1)
  return sprite
}

/** Farbige X/Y/Z-Achsen mit Buchstaben-Labels an den Enden (OpenSCAD-Koordinaten, Z = oben). */
export function createAxesGroup(length: number): THREE.Group {
  const group = new THREE.Group()
  group.add(new THREE.AxesHelper(length))

  for (const { color, dir, label } of AXIS_SPECS) {
    const end = dir.clone().multiplyScalar(length)
    // Ueberzeichnet AxesHelpers duenne Linie in dieselbe Richtung mit einer
    // dicken Variante in derselben Farbe (statt sie zu ersetzen) - einfacher
    // als AxesHelper selbst pro Achse abzuschalten.
    group.add(
      createThickLineSegments(
        new Float32Array([0, 0, 0, end.x, end.y, end.z]),
        color,
        AXIS_LINEWIDTH_PX,
      ),
    )

    // In die negative Richtung zeichnet AxesHelper gar nichts - als
    // GEPUNKTETE Linie ergaenzt: zeigt "es geht auch in die andere Richtung
    // weiter", optisch aber klar von der durchgezogenen positiven Haelfte
    // unterschieden.
    const negEnd = end.clone().negate()
    group.add(
      createThickLineSegments(
        new Float32Array([0, 0, 0, negEnd.x, negEnd.y, negEnd.z]),
        color,
        AXIS_LINEWIDTH_PX,
        { dashed: true, dashSize: 2, gapSize: 1.5 },
      ),
    )

    const labelPos = end.clone().addScaledVector(dir, 6)
    const sprite = makeLabel(label, color)
    sprite.position.copy(labelPos)
    group.add(sprite)
  }

  return group
}
