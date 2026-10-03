import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

// Knalliges Warn-Pink statt einer "normalen" Modellfarbe - muss auf den
// ersten Blick als Hinweis erkennbar sein, nicht als Teil des eigentlichen
// Designs. Die eigentliche Ueberschneidung liegt fast immer INNERHALB der
// beteiligten (opaken) Teile und waere hinter deren Oberflaeche unsichtbar -
// depthTest:false zeichnet das Overlay deshalb bewusst immer obenauf
// (roentgenbild-artig), depthWrite:false verhindert dabei zusaetzlich, dass
// es selbst den Tiefenpuffer fuer nachfolgend gezeichnete Geometrie verfaelscht.
const HIGHLIGHT_COLOR = 0xff2d78
const PULSE_PERIOD_MS = 900
const PULSE_MIN_OPACITY = 0.35
const PULSE_MAX_OPACITY = 0.9

/** Zeigt das Ergebnis eines Kollisions-Checks (siehe viewerPanel.ts:
 *  checkCollisions()) als blinkende Warn-Geometrie im Viewer an - je STL ein
 *  Mesh, alle mit demselben pulsierenden Material. Rein visuelles Overlay,
 *  komplett unabhaengig von MeshManager (nicht Teil des exportierbaren
 *  Modells, kein Farbfilter/Explosion o.ae. dafuer noetig). */
export class CollisionHighlighter {
  private readonly group = new THREE.Group()
  private readonly loader = new STLLoader()
  private readonly material = new THREE.MeshStandardMaterial({
    color: HIGHLIGHT_COLOR,
    emissive: HIGHLIGHT_COLOR,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: PULSE_MAX_OPACITY,
    depthWrite: false,
    depthTest: false,
  })
  private rafId: number | null = null

  constructor(scene: THREE.Scene) {
    // Ueber dem normalen Modell (renderOrder 0), aber unter dem Mess-Overlay
    // (999, siehe measure.ts) - eine laufende Messung soll auch bei
    // gleichzeitig sichtbarer Kollisionswarnung vorne bleiben.
    this.group.renderOrder = 998
    scene.add(this.group)
  }

  /** Ersetzt eine evtl. vorherige Anzeige durch die neuen Kollisions-STLs
   *  (leeres Array = nur aufraeumen, z.B. wenn keine Kollision gefunden wurde). */
  show(stls: ArrayBuffer[]): void {
    this.clear()
    for (const buffer of stls) {
      const geometry = this.loader.parse(buffer)
      geometry.computeVertexNormals()
      this.group.add(new THREE.Mesh(geometry, this.material))
    }
    if (this.group.children.length > 0) this.startPulse()
  }

  clear(): void {
    this.stopPulse()
    for (const child of this.group.children) {
      if (child instanceof THREE.Mesh) child.geometry.dispose()
    }
    this.group.clear()
  }

  dispose(): void {
    this.clear()
    this.material.dispose()
    this.group.removeFromParent()
  }

  private startPulse(): void {
    const start = performance.now()
    const tick = (): void => {
      const phase =
        (((performance.now() - start) % PULSE_PERIOD_MS) / PULSE_PERIOD_MS) * Math.PI * 2
      const t = (Math.sin(phase) + 1) / 2
      this.material.opacity = PULSE_MIN_OPACITY + t * (PULSE_MAX_OPACITY - PULSE_MIN_OPACITY)
      this.rafId = requestAnimationFrame(tick)
    }
    tick()
  }

  private stopPulse(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }
}
