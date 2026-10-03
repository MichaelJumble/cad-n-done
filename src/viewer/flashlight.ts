import * as THREE from 'three'

// Three.js (ab Version 0.155, "physically correct lights" ist hier die
// einzige/Standard-Betriebsart) laesst PointLight-Intensitaet mit dem
// Quadrat der Entfernung abfallen (Candela-Einheiten) - bei ca. 15-20
// Einheiten Abstand zur getroffenen Flaeche (siehe SURFACE_OFFSET) braucht
// es dafuer einen WESENTLICH hoeheren Intensitaetswert als bei
// Hemisphere-/Directional-Light (die nicht mit der Entfernung abfallen,
// siehe scene.ts) - 2-3 dort waeren hier praktisch unsichtbar.
const FLASHLIGHT_INTENSITY = 600
const FLASHLIGHT_DISTANCE = 300
// Trifft der Strahl kein Mesh (Maus ueber dem Gitter/Hintergrund), landet
// das Licht ersatzweise auf dieser Entfernung entlang des Sichtstrahls -
// rein kosmetisch, nur damit es nie "verschwindet".
const FALLBACK_DISTANCE = 150
// Abstand von der getroffenen Flaeche in Richtung Kamera - direkt AUF der
// Flaeche waere die Normale/Lichtrichtung an der Trefferstelle entartet
// (kaum sichtbarer Beleuchtungseffekt).
const SURFACE_OFFSET = 15

/** Taschenlampe: folgt bei aktivem Zustand dem Mauszeiger ueber der Canvas
 *  und beleuchtet die Stelle des Modells darunter zusaetzlich mit einem
 *  weissen Punktlicht - fuer Winkel/Ecken, die die normale Szenenbeleuchtung
 *  (siehe scene.ts) nicht gut erreicht. Rein optisch, ohne Einfluss auf den
 *  generierten Code oder Export. */
export class Flashlight {
  private readonly camera: THREE.Camera
  private readonly domElement: HTMLElement
  private readonly getTarget: () => THREE.Object3D | null
  private readonly light: THREE.PointLight
  private readonly raycaster = new THREE.Raycaster()
  private enabled = false
  private readonly handlePointerMove = (event: PointerEvent): void => this.onPointerMove(event)

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    domElement: HTMLElement,
    getTarget: () => THREE.Object3D | null,
  ) {
    this.camera = camera
    this.domElement = domElement
    this.getTarget = getTarget
    this.light = new THREE.PointLight(0xffffff, 0, FLASHLIGHT_DISTANCE)
    this.light.visible = false
    scene.add(this.light)
    this.domElement.addEventListener('pointermove', this.handlePointerMove)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.light.visible = enabled
    this.light.intensity = enabled ? FLASHLIGHT_INTENSITY : 0
  }

  isEnabled(): boolean {
    return this.enabled
  }

  dispose(): void {
    this.domElement.removeEventListener('pointermove', this.handlePointerMove)
    this.light.dispose()
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.enabled) return
    const rect = this.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, this.camera)

    const target = this.getTarget()
    const hit = target ? this.raycaster.intersectObject(target, true)[0] : undefined
    const point = hit
      ? hit.point.clone()
      : this.raycaster.ray.at(FALLBACK_DISTANCE, new THREE.Vector3())

    const towardsCamera = this.camera.position.clone().sub(point).normalize()
    this.light.position.copy(point).addScaledVector(towardsCamera, SURFACE_OFFSET)
  }
}
