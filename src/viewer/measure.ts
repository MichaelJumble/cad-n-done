import * as THREE from 'three'

const CROSSHAIR_COLOR = '#ff3b30'
const LINE_COLOR = 0xff3b30
// sizeAttenuation:false bei der Erzeugung des Sprite-Materials macht diesen
// Wert zu einer BILDSCHIRM-konstanten Groesse (unabhaengig vom Zoom/Abstand
// zur Kamera) - wie bei einem echten Kamera-Fadenkreuz, nicht wie ein
// 3D-Objekt, das beim Herauszoomen kleiner wirkt.
const CROSSHAIR_SCREEN_SIZE = 0.09

/** Zeichnet ein Fadenkreuz (vier kurze Striche um eine Luecke in der Mitte,
 *  damit der exakt getroffene Punkt selbst nicht verdeckt wird) auf ein
 *  Canvas und liefert es als Sprite-Textur - kein externes Bild-Asset noetig. */
function createCrosshairTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.strokeStyle = CROSSHAIR_COLOR
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  const center = size / 2
  const outer = size / 2 - 4
  const gap = 9
  ctx.beginPath()
  ctx.moveTo(center, center - outer)
  ctx.lineTo(center, center - gap)
  ctx.moveTo(center, center + gap)
  ctx.lineTo(center, center + outer)
  ctx.moveTo(center - outer, center)
  ctx.lineTo(center - gap, center)
  ctx.moveTo(center + gap, center)
  ctx.lineTo(center + outer, center)
  ctx.stroke()
  return new THREE.CanvasTexture(canvas)
}

export type MeasureMode = 'distance' | 'angle'

// Distanz braucht 2 Punkte (Anfang/Ende der Strecke), Winkel braucht 3
// (Scheitelpunkt + je ein Punkt auf jedem Schenkel).
const POINTS_NEEDED: Record<MeasureMode, number> = { distance: 2, angle: 3 }

export type MeasureStatus =
  | { state: 'waiting'; mode: MeasureMode; pointsSet: number; pointsNeeded: number }
  | { state: 'done'; mode: 'distance'; distance: number }
  | { state: 'done'; mode: 'angle'; angleDegrees: number }

/** Kapselt das Mess-Werkzeug: faengt Klicks auf das Modell per Raycasting ab,
 *  zeichnet Fadenkreuz-Marker + Verbindungslinien und meldet ueber `onChange`
 *  entweder den Abstand zweier Punkte oder den Winkel am ERSTEN der drei
 *  gesetzten Punkte (Scheitelpunkt) zwischen den beiden Schenkeln. Ein
 *  ueberzaehliger Klick (ueber die fuer den Modus noetige Punktzahl hinaus)
 *  beginnt eine neue Messung (loescht die alte). */
export class MeasureTool {
  private readonly camera: THREE.Camera
  private readonly domElement: HTMLElement
  private readonly getTarget: () => THREE.Object3D | null
  private readonly onChange: (status: MeasureStatus) => void

  private readonly raycaster = new THREE.Raycaster()
  private readonly overlay = new THREE.Group()
  private readonly crosshairTexture = createCrosshairTexture()
  private readonly markerMaterial = new THREE.SpriteMaterial({
    map: this.crosshairTexture,
    depthTest: false,
    sizeAttenuation: false,
  })
  private readonly lineMaterial = new THREE.LineBasicMaterial({
    color: LINE_COLOR,
    depthTest: false,
  })

  private points: THREE.Vector3[] = []
  private active = false
  private mode: MeasureMode = 'distance'
  private readonly handleClick = (event: MouseEvent): void => this.onClick(event)

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    domElement: HTMLElement,
    getTarget: () => THREE.Object3D | null,
    onChange: (status: MeasureStatus) => void,
  ) {
    this.camera = camera
    this.domElement = domElement
    this.getTarget = getTarget
    this.onChange = onChange
    // Immer obenauf zeichnen (depthTest:false + hohe renderOrder), damit
    // Markierungen nicht von der eigentlichen Modellgeometrie verdeckt werden
    // - sie sollen als Messhilfe immer sichtbar sein, nicht als Teil des Modells.
    this.overlay.renderOrder = 999
    scene.add(this.overlay)
  }

  /** Aktiviert/deaktiviert das Werkzeug. `mode` wechselt bei bereits aktivem
   *  Werkzeug auch den Modus und beginnt eine neue Messung - ein Umschalten
   *  von Abstand auf Winkel (oder umgekehrt) waehrend eine Messung laeuft,
   *  soll nicht deren (fuer den neuen Modus falsche) Punktzahl behalten. */
  setActive(active: boolean, mode: MeasureMode = this.mode): void {
    const modeChanged = mode !== this.mode
    this.mode = mode
    if (this.active === active && !modeChanged) return
    this.active = active
    if (active) {
      this.domElement.addEventListener('click', this.handleClick)
      this.domElement.style.cursor = 'crosshair'
      this.reset()
    } else {
      this.domElement.removeEventListener('click', this.handleClick)
      this.domElement.style.cursor = ''
      this.reset()
    }
  }

  isActive(): boolean {
    return this.active
  }

  getMode(): MeasureMode {
    return this.mode
  }

  reset(): void {
    this.points = []
    this.clearOverlay()
    this.onChange({
      state: 'waiting',
      mode: this.mode,
      pointsSet: 0,
      pointsNeeded: POINTS_NEEDED[this.mode],
    })
  }

  dispose(): void {
    this.setActive(false)
    this.clearOverlay()
    this.overlay.removeFromParent()
    this.crosshairTexture.dispose()
    this.markerMaterial.dispose()
    this.lineMaterial.dispose()
  }

  /** Entfernt alle Marker/Linien der aktuellen Messung. Die Linien-Geometrie
   *  wird individuell pro Messung erzeugt (im Gegensatz zu Sprite-Geometrie/
   *  -Textur, die Three.js intern fuer alle Sprites teilt) und muss daher
   *  hier explizit entsorgt werden, sonst haeufen sich bei wiederholten
   *  Messungen verwaiste WebGL-Buffer an. */
  private clearOverlay(): void {
    for (const child of this.overlay.children) {
      if (child instanceof THREE.Line) child.geometry.dispose()
    }
    this.overlay.clear()
  }

  private onClick(event: MouseEvent): void {
    const target = this.getTarget()
    if (!target) return

    const rect = this.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const [hit] = this.raycaster.intersectObject(target, true)
    if (!hit) return

    const needed = POINTS_NEEDED[this.mode]
    // Ein ueberzaehliger Klick beginnt eine neue Messung, statt einen
    // weiteren Punkt an eine bereits vollstaendige Messung anzuhaengen.
    if (this.points.length >= needed) {
      this.points = []
      this.clearOverlay()
    }

    const point = event.shiftKey ? this.snapToNearestVertex(hit) : hit.point
    this.points.push(point.clone())
    this.overlay.add(this.createMarker(point))

    if (this.points.length < needed) {
      this.onChange({
        state: 'waiting',
        mode: this.mode,
        pointsSet: this.points.length,
        pointsNeeded: needed,
      })
      return
    }

    if (this.mode === 'distance') {
      const [a, b] = this.points
      this.overlay.add(this.createLine(a, b))
      this.onChange({ state: 'done', mode: 'distance', distance: a.distanceTo(b) })
    } else {
      // Winkel am ERSTEN Punkt (Scheitelpunkt) zwischen den Vektoren zu den
      // beiden anderen (Schenkel-)Punkten - Vector3.angleTo() liefert das
      // direkt in Radiant, unabhaengig von den Vektorlaengen.
      const [vertex, legA, legB] = this.points
      this.overlay.add(this.createLine(vertex, legA), this.createLine(vertex, legB))
      const angleRad = legA.clone().sub(vertex).angleTo(legB.clone().sub(vertex))
      this.onChange({ state: 'done', mode: 'angle', angleDegrees: (angleRad * 180) / Math.PI })
    }
  }

  /** Bei gehaltener Shift-Taste (siehe onClick): statt des exakten, oft
   *  "irgendwo auf der Flaeche" liegenden Raycast-Trefferpunkts die naeheste
   *  der drei Ecken des GETROFFENEN Dreiecks verwenden - reicht fuer die
   *  meisten CAD-typischen Formen (Wuerfel, Kanten, Ecken) voellig aus, ohne
   *  das gesamte Mesh nach dem naechsten Vertex durchsuchen zu muessen. */
  private snapToNearestVertex(hit: THREE.Intersection): THREE.Vector3 {
    const face = hit.face
    if (!face || !(hit.object instanceof THREE.Mesh)) return hit.point
    const mesh = hit.object
    const position = mesh.geometry.attributes.position
    const candidates = [face.a, face.b, face.c].map((index) =>
      mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(position, index)),
    )
    candidates.sort((a, b) => a.distanceTo(hit.point) - b.distanceTo(hit.point))
    return candidates[0]
  }

  private createMarker(position: THREE.Vector3): THREE.Sprite {
    const marker = new THREE.Sprite(this.markerMaterial)
    marker.position.copy(position)
    marker.scale.set(CROSSHAIR_SCREEN_SIZE, CROSSHAIR_SCREEN_SIZE, 1)
    marker.renderOrder = 999
    return marker
  }

  private createLine(a: THREE.Vector3, b: THREE.Vector3): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints([a, b])
    const line = new THREE.Line(geometry, this.lineMaterial)
    line.renderOrder = 999
    return line
  }
}
