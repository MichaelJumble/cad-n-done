import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import type { MeshFragment } from '../types'
import { computeThicknessColors } from './wallThickness'

/** Liste der einzuschliessenden Farben (null = Fragmente ohne eigene Farbe,
 *  '#rrggbb' = Fragmente genau dieser Farbe) — mehrere Farben werden zu
 *  einem gemeinsamen Export zusammengefasst. */
export type ColorFilter = (string | null)[]

const loader = new STLLoader()
// Aktuell aktive Schnittebenen, auf alle Materialien angewendet (siehe
// setClippingPlanes) — leeres Array = keine Schnittebene aktiv.
let clippingPlanes: THREE.Plane[] = []
let wireframeEnabled = false

// Skaliert die Explosionsdistanz relativ zur Gesamtgroesse des Modells
// (siehe MeshManager.setExplosion) - rein empirisch wie weit ein Fragment
// bei voller Explosion (factor=1) auseinanderrueckt.
const EXPLOSION_DISTANCE_SCALE = 0.6

// "Von oben einfallen lassen"-Animation (siehe MeshManager.dropIn) nach dem
// Laden eines Projekts: Fallhoehe relativ zur Gesamtgroesse des Modells
// (analog zu EXPLOSION_DISTANCE_SCALE), damit sie bei kleinen wie grossen
// Modellen gleichermassen sinnvoll aussieht.
const DROP_HEIGHT_SCALE = 1.2
const DROP_DURATION_MS = 900

/** Robert Penners "easeOutBounce": faellt in abnehmenden Spruengen auf den
 *  Zielwert 1 zurueck (nie darueber hinaus) - genau der Effekt eines auf dem
 *  Boden aufsetzenden und ausschwingenden Balls. */
function easeOutBounce(t: number): number {
  const n1 = 7.5625
  const d1 = 2.75
  if (t < 1 / d1) return n1 * t * t
  if (t < 2 / d1) {
    const s = t - 1.5 / d1
    return n1 * s * s + 0.75
  }
  if (t < 2.5 / d1) {
    const s = t - 2.25 / d1
    return n1 * s * s + 0.9375
  }
  const s = t - 2.625 / d1
  return n1 * s * s + 0.984375
}

// Normale vs. "Studio"-Werte fuer Metallic/Rauheit (siehe setMetallic) - im
// Studio-Modus deutlich metallischer/glaenzender statt des sonst eher
// plastikartigen Standard-Looks.
// War 0.1/0.6 (recht matt/"plastikig") - zusammen mit der jetzt immer
// aktiven Umgebungsreflexion (siehe scene.ts::applyBackground) sorgt ein
// glatteres Standardmaterial fuer hellere Glanzlichter, naeher an BlockSCADs
// eigenem, deutlich glaenzenderem Viewer-Look (Nutzer-Vergleichsscreenshots).
const NORMAL_METALNESS = 0.15
const NORMAL_ROUGHNESS = 0.4
const STUDIO_METALNESS = 0.75
const STUDIO_ROUGHNESS = 0.25
let metallicEnabled = false

function currentMetalness(): number {
  return metallicEnabled ? STUDIO_METALNESS : NORMAL_METALNESS
}
function currentRoughness(): number {
  return metallicEnabled ? STUDIO_ROUGHNESS : NORMAL_ROUGHNESS
}

// Standard-Material fuer Fragmente ohne eigene Farbe (bewusst nicht pro Mesh
// neu erzeugt/entsorgt) — steuerbar ueber setMeshColor()/getMeshColor().
const defaultMaterial = new THREE.MeshStandardMaterial({
  color: 0x00ffff,
  metalness: NORMAL_METALNESS,
  roughness: NORMAL_ROUGHNESS,
  clippingPlanes,
  wireframe: wireframeEnabled,
})
// Materialien fuer per farbe()/farbe-HSV-Block eingefaerbte Fragmente,
// nach Hex-Wert zwischengespeichert statt bei jedem Render neu erzeugt.
const colouredMaterials = new Map<string, THREE.MeshStandardMaterial>()

// Fuer die Wandstaerken-Heatmap (siehe MeshManager.setWallThicknessHeatmap):
// EIN gemeinsames Material mit vertexColors statt eigener Farbe - ersetzt
// waehrend die Heatmap aktiv ist die normalen Fragment-Materialien, nimmt
// an denselben Wireframe/Schnittebenen/Metallic-Einstellungen teil wie
// diese (siehe die drei set*()-Funktionen unten).
const heatmapMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  metalness: NORMAL_METALNESS,
  roughness: NORMAL_ROUGHNESS,
  clippingPlanes,
  wireframe: wireframeEnabled,
})

// Berechnete Wandstaerken-Vertexfarben je Geometrie zwischengespeichert -
// jedes Fragment bekommt bei jedem Render eine NEUE Geometrie-Instanz
// (siehe setFromFragments()), daher haengt der Cache an der Geometrie
// selbst und muss nie explizit geleert werden (verschwindet mit ihr).
const thicknessColorsCache = new WeakMap<THREE.BufferGeometry, Float32Array>()

function ensureThicknessColors(geometry: THREE.BufferGeometry): void {
  let colors = thicknessColorsCache.get(geometry)
  if (!colors) {
    colors = computeThicknessColors(geometry).colors
    thicknessColorsCache.set(geometry, colors)
  }
  if (!geometry.getAttribute('color')) {
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  }
}

function materialFor(color: string | null): THREE.MeshStandardMaterial {
  if (!color) return defaultMaterial
  let material = colouredMaterials.get(color)
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      metalness: currentMetalness(),
      roughness: currentRoughness(),
      clippingPlanes,
      wireframe: wireframeEnabled,
    })
    colouredMaterials.set(color, material)
  }
  return material
}

/** Studio-Modus (siehe scene.ts::setStudioMode, ueber viewer/index.ts
 *  zusammengefuehrt): schaltet alle (auch schon vorhandenen) Materialien auf
 *  einen deutlich metallischeren/glaenzenderen Look um, statt des sonst eher
 *  plastikartigen Standard-Looks - zusammen mit dem Grauverlauf als
 *  Reflexionsquelle (scene.environment) ergibt das einen "poliertes
 *  Metall"-Eindruck. */
export function setMetallic(enabled: boolean): void {
  metallicEnabled = enabled
  const metalness = currentMetalness()
  const roughness = currentRoughness()
  defaultMaterial.metalness = metalness
  defaultMaterial.roughness = roughness
  heatmapMaterial.metalness = metalness
  heatmapMaterial.roughness = roughness
  for (const material of colouredMaterials.values()) {
    material.metalness = metalness
    material.roughness = roughness
  }
}

/** Blendet die Dreiecksvernetzung aller (auch schon vorhandenen) Materialien
 *  ein/aus — rein optisch, ohne Funktion, aber ein beliebter CAD-Viewer-Look. */
export function setWireframe(enabled: boolean): void {
  wireframeEnabled = enabled
  defaultMaterial.wireframe = enabled
  heatmapMaterial.wireframe = enabled
  for (const material of colouredMaterials.values()) material.wireframe = enabled
}

/** Setzt/entfernt die aktiven Schnittebenen fuer alle (auch schon
 *  vorhandenen) Materialien — leeres Array schaltet die Schnittebene aus. */
export function setClippingPlanes(planes: THREE.Plane[]): void {
  clippingPlanes = planes
  defaultMaterial.clippingPlanes = planes
  heatmapMaterial.clippingPlanes = planes
  for (const material of colouredMaterials.values()) material.clippingPlanes = planes
}

// Stencil-Buffer-Deckflaechen fuer die Schnittebene, nach der Technik aus
// Three.js' offiziellem "webgl_clipping_stencil"-Beispiel: zwei zusaetzliche
// unsichtbare Meshes (Rueck-/Vorderseiten) schreiben je Fragment in den
// Stencil-Puffer, eine grosse Ebene an der Schnittposition zeichnet dort,
// wo der Puffer ungleich 0 ist, die Deckflaeche in der Fragmentfarbe —
// dadurch wirkt der Schnitt als Vollkoerper statt als hohle Schale.
const CAP_SIZE = 400
const capGeometry = new THREE.PlaneGeometry(CAP_SIZE, CAP_SIZE)

interface StencilRig {
  backMaterial: THREE.MeshBasicMaterial
  frontMaterial: THREE.MeshBasicMaterial
  capMaterial: THREE.MeshStandardMaterial
  group: THREE.Group
  cap: THREE.Mesh
}

function buildStencilRig(
  geometry: THREE.BufferGeometry,
  capColor: string,
  plane: THREE.Plane,
  renderOrderBase: number,
): StencilRig {
  const backMaterial = new THREE.MeshBasicMaterial({
    depthWrite: false,
    depthTest: false,
    colorWrite: false,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    side: THREE.BackSide,
    // Fehlte hier zunaechst: ohne clippingPlanes bei der Konstruktion heben
    // sich Increment/Decrement fuer Rueck-/Vorderseite exakt auf (beide
    // sehen die volle, ungeschnittene Geometrie), die Deckflaeche blieb
    // beim allerersten Aktivieren unsichtbar, bis irgendein anderer Aufruf
    // (z.B. Regler bewegen) die Ebene nachtraeglich setzte.
    clippingPlanes: [plane],
    stencilFail: THREE.IncrementWrapStencilOp,
    stencilZFail: THREE.IncrementWrapStencilOp,
    stencilZPass: THREE.IncrementWrapStencilOp,
  })
  const frontMaterial = backMaterial.clone()
  frontMaterial.side = THREE.FrontSide
  frontMaterial.stencilFail = THREE.DecrementWrapStencilOp
  frontMaterial.stencilZFail = THREE.DecrementWrapStencilOp
  frontMaterial.stencilZPass = THREE.DecrementWrapStencilOp

  const backMesh = new THREE.Mesh(geometry, backMaterial)
  const frontMesh = new THREE.Mesh(geometry, frontMaterial)
  backMesh.renderOrder = renderOrderBase
  frontMesh.renderOrder = renderOrderBase
  const group = new THREE.Group()
  group.add(backMesh, frontMesh)

  const capMaterial = new THREE.MeshStandardMaterial({
    color: capColor,
    metalness: 0.1,
    roughness: 0.75,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  })
  const cap = new THREE.Mesh(capGeometry, capMaterial)
  cap.renderOrder = renderOrderBase + 1
  // Ohne diesen Reset wuerde der naechste Stencil-Rig (anderes Fragment)
  // auf dem hier hinterlassenen Stencil-Wert aufbauen.
  cap.onAfterRender = (r: THREE.WebGLRenderer) => r.clearStencil()

  return { backMaterial, frontMaterial, capMaterial, group, cap }
}

function positionCap(cap: THREE.Mesh, plane: THREE.Plane): void {
  plane.coplanarPoint(cap.position)
  cap.lookAt(
    cap.position.x - plane.normal.x,
    cap.position.y - plane.normal.y,
    cap.position.z - plane.normal.z,
  )
}

function disposeStencilRig(rig: StencilRig): void {
  rig.backMaterial.dispose()
  rig.frontMaterial.dispose()
  rig.capMaterial.dispose()
}

interface TrackedMesh {
  mesh: THREE.Mesh
  color: string | null
  stencilRig: StencilRig | null
  /** Mittelpunkt der UNVERSCHOBENEN Fragment-Geometrie (also bei
   *  mesh.position = 0,0,0, wie beim Laden) - einmalig beim Laden berechnet
   *  und danach unveraendert, damit setExplosion() bei jedem Aufruf von
   *  derselben Ausgangslage rechnet, statt sich mit einer bereits
   *  explodierten Zwischenposition zu verrechnen. */
  baseCenter: THREE.Vector3
}

/** Haelt die aktuell dargestellten Meshes (ein Fragment je Farbe) in einer
 *  gemeinsamen Gruppe und entsorgt die alten sauber vor dem Ersetzen. */
export class MeshManager {
  private readonly scene: THREE.Scene
  /** Nur die "echten" Meshes — das ist bewusst die einzige Gruppe, die
   *  getObject()/withFilteredObject() fuer Export nach aussen geben, damit
   *  die Stencil-Hilfsobjekte (unsichtbar/Deckflaechen) nie mit exportiert
   *  werden. */
  private readonly group: THREE.Group
  private readonly stencilOverlay: THREE.Group
  private tracked: TrackedMesh[] = []
  private activePlane: THREE.Plane | null = null
  private explosionFactor = 0
  private heatmapEnabled = false
  // Einzeln (per Klick im Viewer, siehe viewerPanel.ts) ausgewaehlte Bloecke,
  // die transparent dargestellt werden sollen, plus der dafuer aktuell
  // eingestellte Reglerwert (siehe setTransparencySelection). Pro Mesh ein
  // eigenes Klon-Material statt das gemeinsame Farb-/Heatmap-Material zu
  // aendern - sonst waeren ALLE gleichfarbigen Fragmente betroffen.
  private transparentBlockIds = new Set<string>()
  private transparencyOpacity = 0.5
  private readonly transparencyOverrides = new Map<THREE.Mesh, THREE.MeshStandardMaterial>()
  // Zusaetzliches Rueckseiten-Mesh (gleiche Geometrie, side: BackSide) je
  // transparent geschaltetem Fragment: ohne echte Tiefensortierung zeichnet
  // WebGL die Dreiecke eines (insbesondere hohlen) Meshes in Speicher-
  // reihenfolge, nicht nach Blickrichtung - dadurch wirkte die Transparenz
  // vorher nur aus manchen Blickwinkeln (Aussen-/Innenwand vertauscht). Das
  // Rueckseiten-Mesh zeichnet zuerst (renderOrder), die Vorderseite danach
  // darueber - macht das Ergebnis blickwinkelunabhaengig konsistent.
  private readonly backfaceMeshes = new Map<THREE.Mesh, THREE.Mesh>()
  private readonly backfaceOverrides = new Map<THREE.Mesh, THREE.MeshStandardMaterial>()
  // Erhoeht bei jedem neuen dropIn()-Aufruf und von clear() - eine noch
  // laufende rAF-Schleife einer AELTEREN Animation erkennt daran, dass sie
  // ueberholt wurde, und beendet sich selbst (siehe dropIn()).
  private dropGeneration = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.group = new THREE.Group()
    this.stencilOverlay = new THREE.Group()
    this.scene.add(this.group, this.stencilOverlay)
  }

  /** `dropIn`: die neu gesetzten Fragmente sollen sichtbar von oben in ihre
   *  Zielposition fallen (siehe dropIn()) - fuer den Effekt nach dem Laden
   *  eines Projekts, nicht fuer jede kleine Bearbeitung. */
  setFromFragments(fragments: MeshFragment[], dropIn = false): THREE.Object3D | null {
    this.clear()
    for (const fragment of fragments) {
      const geometry = loader.parse(fragment.stl)
      geometry.computeVertexNormals()
      geometry.computeBoundingBox()
      const baseCenter = geometry.boundingBox!.getCenter(new THREE.Vector3())
      const mesh = new THREE.Mesh(geometry, materialFor(fragment.color))
      mesh.castShadow = true
      mesh.receiveShadow = true
      // Fuer "Klick im Viewer springt zum erzeugenden Block" (siehe
      // viewer/blockPicker.ts, liest das beim Raycast-Treffer wieder aus).
      mesh.userData.blockId = fragment.blockId ?? null
      this.group.add(mesh)
      this.tracked.push({ mesh, color: fragment.color, stencilRig: null, baseCenter })
    }
    if (this.explosionFactor !== 0) this.setExplosion(this.explosionFactor)
    if (this.activePlane) this.setClipping(this.activePlane)
    if (this.heatmapEnabled) this.setWallThicknessHeatmap(true)
    if (this.transparentBlockIds.size > 0) this.applyTransparencySelection()
    // Erst NACH Explosion/Schnittebene starten - die Animation baut auf der
    // dann bereits korrekten Ruheposition auf (siehe dropIn()).
    if (dropIn) this.dropIn()
    return this.tracked.length ? this.group : null
  }

  /** Schaltet die per Klick im Viewer ausgewaehlten Bloecke (siehe
   *  viewerPanel.ts::handleTransparencyPick) transparent, alle anderen
   *  zurueck auf ihr normales Material - `opacity` gilt fuer ALLE aktuell
   *  ausgewaehlten Bloecke gemeinsam (ein Regler fuer alle). Wird bei jeder
   *  Aenderung der Auswahl/des Reglerwerts erneut aufgerufen, und automatisch
   *  nach jedem neuen setFromFragments() (siehe oben) - eine bereits
   *  getroffene Auswahl bleibt so ueber einen Re-Render hinweg erhalten. */
  setTransparencySelection(blockIds: ReadonlySet<string>, opacity: number): void {
    this.transparentBlockIds = new Set(blockIds)
    this.transparencyOpacity = opacity
    this.applyTransparencySelection()
  }

  private applyTransparencySelection(): void {
    for (const t of this.tracked) {
      const blockId = t.mesh.userData.blockId as string | null | undefined
      const selected = typeof blockId === 'string' && this.transparentBlockIds.has(blockId)
      if (selected) this.enableTransparency(t)
      else this.disableTransparency(t)
    }
  }

  private enableTransparency(t: TrackedMesh): void {
    const base = this.heatmapEnabled ? heatmapMaterial : materialFor(t.color)

    let front = this.transparencyOverrides.get(t.mesh)
    if (!front) {
      front = base.clone()
      this.transparencyOverrides.set(t.mesh, front)
    } else {
      front.copy(base)
    }
    front.side = THREE.FrontSide
    front.transparent = true
    front.depthWrite = true
    front.opacity = this.transparencyOpacity
    t.mesh.material = front

    let back = this.backfaceOverrides.get(t.mesh)
    let backMesh = this.backfaceMeshes.get(t.mesh)
    if (!back || !backMesh) {
      back = base.clone()
      backMesh = new THREE.Mesh(t.mesh.geometry, back)
      backMesh.userData.blockId = t.mesh.userData.blockId
      backMesh.renderOrder = t.mesh.renderOrder - 1
      t.mesh.add(backMesh)
      this.backfaceOverrides.set(t.mesh, back)
      this.backfaceMeshes.set(t.mesh, backMesh)
    } else {
      back.copy(base)
    }
    back.side = THREE.BackSide
    back.transparent = true
    back.depthWrite = true
    back.opacity = this.transparencyOpacity
  }

  private disableTransparency(t: TrackedMesh): void {
    const front = this.transparencyOverrides.get(t.mesh)
    if (front) {
      t.mesh.material = this.heatmapEnabled ? heatmapMaterial : materialFor(t.color)
      front.dispose()
      this.transparencyOverrides.delete(t.mesh)
    }
    const backMesh = this.backfaceMeshes.get(t.mesh)
    if (backMesh) {
      t.mesh.remove(backMesh)
      this.backfaceMeshes.delete(t.mesh)
    }
    const back = this.backfaceOverrides.get(t.mesh)
    if (back) {
      back.dispose()
      this.backfaceOverrides.delete(t.mesh)
    }
  }

  /** Ersetzt (bei enabled=true) das normale Fragment-Material aller Meshes
   *  durch ein gemeinsames vertexColors-Material, dessen Vertexfarben die
   *  lokale Wandstaerke codieren (siehe wallThickness.ts) - rot=duenn,
   *  blau=dick, relativ zur duennsten/dicksten Stelle DIESES Modells. Ersetzt
   *  damit voruebergehend die normalen Teile-Farben; setWallThicknessHeatmap
   *  (false) stellt sie wieder her. Wird nach jedem neuen setFromFragments()
   *  automatisch erneut angewendet, falls die Heatmap gerade aktiv ist
   *  (analog zu Explosion/Schnittebene oben). */
  setWallThicknessHeatmap(enabled: boolean): void {
    this.heatmapEnabled = enabled
    for (const t of this.tracked) {
      if (enabled) {
        ensureThicknessColors(t.mesh.geometry)
        t.mesh.material = heatmapMaterial
      } else {
        t.mesh.material = materialFor(t.color)
      }
    }
    // Transparent geschaltete Fragmente muessen ihre Basis (normale Farbe vs.
    // Heatmap-Material) neu uebernehmen, sonst zeigen sie nach dem Umschalten
    // weiter die jeweils VORHERIGE Basis.
    if (this.transparentBlockIds.size > 0) this.applyTransparencySelection()
  }

  /** Laesst alle aktuell dargestellten Fragmente sichtbar von oben in ihre
   *  Zielposition fallen und dort ausschwingen (siehe easeOutBounce()) - der
   *  "Ueberraschungseffekt" nach dem Laden eines Projekts. Baut auf der
   *  jeweils schon korrekten Ruheposition jedes Mesh auf (inkl. evtl. aktiver
   *  Explosionsansicht), verschiebt also nur zusaetzlich in Z. */
  private dropIn(): void {
    if (this.tracked.length === 0) return
    const overallBox = new THREE.Box3()
    for (const t of this.tracked) {
      if (t.mesh.geometry.boundingBox) overallBox.union(t.mesh.geometry.boundingBox)
    }
    const overallSize = overallBox.isEmpty() ? 10 : overallBox.getSize(new THREE.Vector3()).length()
    const dropHeight = overallSize * DROP_HEIGHT_SCALE

    const restZ = this.tracked.map((t) => t.mesh.position.z)
    for (const t of this.tracked) t.mesh.position.z += dropHeight

    const generation = ++this.dropGeneration
    const start = performance.now()
    const step = (): void => {
      if (generation !== this.dropGeneration) return
      const elapsed = performance.now() - start
      const progress = Math.min(elapsed / DROP_DURATION_MS, 1)
      const offset = dropHeight * (1 - easeOutBounce(progress))
      this.tracked.forEach((t, index) => (t.mesh.position.z = restZ[index] + offset))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  /** Schiebt jedes Farb-Fragment radial vom gemeinsamen Mittelpunkt aller
   *  Fragmente weg - `factor` 0 = Ausgangslage, 1 = volle Explosion. Die
   *  Explosionsdistanz orientiert sich an der Gesamtgroesse des Modells
   *  (EXPLOSION_DISTANCE_SCALE * Bounding-Box-Diagonale), damit sie bei
   *  kleinen wie grossen Modellen gleichermassen sinnvoll aussieht, statt
   *  ein fixer Wert in Weltkoordinaten zu sein. Ein Fragment, dessen
   *  Mittelpunkt (fast) exakt auf dem Gesamt-Mittelpunkt liegt, hat keine
   *  sinnvolle Richtung und bleibt an Ort und Stelle. */
  setExplosion(factor: number): void {
    this.explosionFactor = factor
    if (this.tracked.length === 0) return

    const overallCenter = new THREE.Vector3()
    for (const t of this.tracked) overallCenter.add(t.baseCenter)
    overallCenter.divideScalar(this.tracked.length)

    const overallBox = new THREE.Box3()
    for (const t of this.tracked) {
      if (t.mesh.geometry.boundingBox) overallBox.union(t.mesh.geometry.boundingBox)
    }
    const overallSize = overallBox.isEmpty() ? 0 : overallBox.getSize(new THREE.Vector3()).length()

    for (const t of this.tracked) {
      const direction = t.baseCenter.clone().sub(overallCenter)
      if (direction.lengthSq() < 1e-6) {
        t.mesh.position.set(0, 0, 0)
      } else {
        direction.normalize().multiplyScalar(factor * overallSize * EXPLOSION_DISTANCE_SCALE)
        t.mesh.position.copy(direction)
      }
      // Die Stencil-Berechnung (back-/frontMesh, siehe buildStencilRig) muss
      // der Explosions-Position folgen, damit der Schnitt weiterhin zur
      // tatsaechlichen (verschobenen) Geometrie passt - sie sitzt als
      // eigenstaendige Gruppe im stencilOverlay, kein Kind des Mesh, folgt
      // also nicht von selbst. Die Deckflaeche (cap) selbst bleibt dagegen
      // bewusst UNVERSCHOBEN: sie liegt als grosse, gemeinsame Flaeche fest
      // auf der Schnittebene (positionCap() haengt nicht vom einzelnen
      // Fragment ab) - nur WELCHER Teil der Flaeche sichtbar wird, aendert
      // sich durch den verschobenen Stencil-Buffer-Inhalt oben.
      if (t.stencilRig) t.stencilRig.group.position.copy(t.mesh.position)
    }
  }

  clear(): void {
    // Stoppt eine evtl. noch laufende dropIn()-Animation, damit deren naechster
    // Frame nicht auf gleich entsorgte Meshes zugreift.
    this.dropGeneration++
    for (const t of this.tracked) {
      this.group.remove(t.mesh)
      t.mesh.geometry.dispose()
      this.teardownStencilRig(t)
      this.transparencyOverrides.get(t.mesh)?.dispose()
      this.backfaceOverrides.get(t.mesh)?.dispose()
    }
    this.transparencyOverrides.clear()
    this.backfaceOverrides.clear()
    this.backfaceMeshes.clear()
    this.tracked = []
  }

  getObject(): THREE.Object3D | null {
    return this.tracked.length ? this.group : null
  }

  /** Lesender Zugriff auf die einzelnen Fragment-Meshes fuer
   *  PhotoProjectionManager (photoProjection.ts) - der braucht pro Fragment
   *  dessen eigene Geometrie/Transform, um darauf abgestimmte
   *  Overlay-Meshes mit projizierten UVs aufzubauen. */
  getTrackedMeshes(): readonly { mesh: THREE.Mesh }[] {
    return this.tracked
  }

  /** Aktuell dargestellte Farben in Reihenfolge des ersten Auftretens. */
  getAvailableColors(): (string | null)[] {
    const seen: (string | null)[] = []
    for (const { color } of this.tracked) {
      if (!seen.includes(color)) seen.push(color)
    }
    return seen
  }

  /** Aktiviert/deaktiviert die Schnittebene inkl. Vollkoerper-Deckflaeche
   *  (siehe Kommentar bei buildStencilRig). Ohne Argument bzw. bei null wird
   *  die Schnittebene deaktiviert. */
  setClipping(plane: THREE.Plane | null): void {
    this.activePlane = plane
    if (!plane) {
      for (const t of this.tracked) {
        this.teardownStencilRig(t)
        t.mesh.renderOrder = 0
      }
      setClippingPlanes([])
      return
    }
    setClippingPlanes([plane])
    this.tracked.forEach((t, index) => {
      const orderBase = (index + 1) * 10
      if (!t.stencilRig) {
        const capColor = t.color ?? getMeshColor()
        t.stencilRig = buildStencilRig(t.mesh.geometry, capColor, plane, orderBase)
        this.stencilOverlay.add(t.stencilRig.group, t.stencilRig.cap)
        t.mesh.renderOrder = orderBase + 2
      } else {
        t.stencilRig.backMaterial.clippingPlanes = [plane]
        t.stencilRig.frontMaterial.clippingPlanes = [plane]
      }
      positionCap(t.stencilRig.cap, plane)
    })
  }

  /** Deckflaechen ohne eigene Farbe folgen der manuell gewaehlten
   *  Standardfarbe live nach (siehe setMeshColor()). */
  syncDefaultCapColor(hex: string): void {
    for (const t of this.tracked) {
      if (t.color === null && t.stencilRig) t.stencilRig.capMaterial.color.set(hex)
    }
  }

  private teardownStencilRig(t: TrackedMesh): void {
    if (!t.stencilRig) return
    this.stencilOverlay.remove(t.stencilRig.group, t.stencilRig.cap)
    disposeStencilRig(t.stencilRig)
    t.stencilRig = null
  }

  /** Ruft `run` mit einem Object3D auf, das nur Meshes enthaelt, deren Farbe
   *  in `filter` vorkommt (mehrere Farben werden zusammengefasst). Nicht
   *  passende Meshes werden dafuer kurzzeitig aus der Szene entfernt und
   *  danach garantiert wieder eingehaengt — STLExporter beachtet anders als
   *  GLTFExporter kein `.visible`, daher dieser Ansatz statt Sichtbarkeit
   *  umzuschalten. `run` wird abgewartet, bevor wieder eingehaengt wird:
   *  GLTFExporter traversiert asynchron, ein sofortiges Wiedereinhaengen
   *  wuerde die gefilterten Meshes sonst noch vor dem eigentlichen Export
   *  zurueckbringen. */
  async withFilteredObject(
    filter: ColorFilter,
    run: (object: THREE.Object3D) => unknown,
  ): Promise<void> {
    const excluded = this.tracked.filter(({ color }) => !filter.includes(color))
    excluded.forEach(({ mesh }) => this.group.remove(mesh))
    try {
      if (this.group.children.length) await run(this.group)
    } finally {
      excluded.forEach(({ mesh }) => this.group.add(mesh))
    }
  }
}

/** Setzt die Farbe des Standard-Materials (Fragmente ohne eigene farbe()). */
export function setMeshColor(hex: string): void {
  defaultMaterial.color.set(hex)
}

export function getMeshColor(): string {
  return `#${defaultMaterial.color.getHexString()}`
}
