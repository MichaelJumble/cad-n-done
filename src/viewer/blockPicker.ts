import * as THREE from 'three'

/** Immer aktiver Klick-Listener auf domElement: raycastet gegen das aktuell
 *  dargestellte Modell und liefert bei Treffer die blockId des Fragments,
 *  aus dem das getroffene Mesh entstanden ist (siehe mesh.userData.blockId,
 *  gesetzt in meshLoader.ts::setFromFragments()). Anders als MeasureTool
 *  (measure.ts) keine mehrschrittige Zustandsmaschine und kein eigenes
 *  Overlay - ein Klick loest sofort onPick aus. Bleibt waehrend einer
 *  laufenden Messung inaktiv (isSuppressed()), damit ein Mess-Klick nicht
 *  gleichzeitig auch noch zum zugehoerigen Block springt. Ein echtes
 *  DOM-'click'-Event feuert ohnehin nicht nach einem Drag (Kamera-Orbit),
 *  Klick-vs-Drag ist also bereits vom Browser abgedeckt (siehe measure.ts). */
export class BlockPicker {
  private readonly camera: THREE.Camera
  private readonly domElement: HTMLElement
  private readonly getTarget: () => THREE.Object3D | null
  private readonly isSuppressed: () => boolean
  private readonly onPick: (blockId: string) => void

  private readonly raycaster = new THREE.Raycaster()
  private readonly handleClick = (event: MouseEvent): void => this.onClick(event)

  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    getTarget: () => THREE.Object3D | null,
    isSuppressed: () => boolean,
    onPick: (blockId: string) => void,
  ) {
    this.camera = camera
    this.domElement = domElement
    this.getTarget = getTarget
    this.isSuppressed = isSuppressed
    this.onPick = onPick
    this.domElement.addEventListener('click', this.handleClick)
  }

  dispose(): void {
    this.domElement.removeEventListener('click', this.handleClick)
  }

  private onClick(event: MouseEvent): void {
    if (this.isSuppressed()) return
    const target = this.getTarget()
    if (!target) return
    const rect = this.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const [hit] = this.raycaster.intersectObject(target, true)
    const blockId = hit?.object.userData.blockId
    if (typeof blockId === 'string') this.onPick(blockId)
  }
}
