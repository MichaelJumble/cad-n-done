import * as THREE from 'three'
import { tracePathData } from '../editor/blocks/tracePhoto'
import type { PhotoProjection } from './photoProjectionData'

interface OverlayEntry {
  mesh: THREE.Mesh
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

/** Laedt das Foto einer Projektion und baut daraus eine Textur, die
 *  AUSSERHALB der nachgezeichneten Kontur transparent bleibt - das Foto wird
 *  auf ein Offscreen-Canvas gezeichnet, das VORHER auf den Pfad aus
 *  tracePathData() geclippt wurde (dieselbe Funktion, die auch die
 *  Live-Vorschau im Nachzeichnen-Dialog nutzt, kann also nie von dort
 *  abweichen). Das Canvas wird bewusst auf die Pixel-Bounding-Box der KONTUR
 *  (pxMinX/pxMinY/pxMaxX/pxMaxY, NICHT die volle Fotogroesse) zugeschnitten.
 *  DABEI WIRD Y GESPIEGELT (ctx.translate/scale unten): empirisch verifiziert
 *  (Puppeteer-Test: reale, von OpenSCAD gerenderte Mesh-Vertices gegen die
 *  aus den Punkten berechnete Position abgeglichen), dass OpenSCADs
 *  SVG-Importer die Y-Achse beim Import invertiert (kleine Foto-Y-Pixel ->
 *  GROSSE Welt-Y). Ohne diese Spiegelung stimmt zwar die Bounding-Box
 *  (symmetrisch, daher unauffaellig), aber die Kontur selbst liegt bei einer
 *  oben/unten nicht symmetrischen Form (wie einem echten Fotoausschnitt)
 *  spiegelverkehrt auf der 3D-Flaeche - sichtbar als Luecke entlang genau der
 *  Kanten, die keine Symmetrie-Entsprechung haben. `flipY = false` bleibt
 *  gesetzt, da die Canvas-Zeilenreihenfolge (nach dieser Spiegelung: Zeile 0
 *  = pxMaxY) direkt als V-Koordinate verwendet wird (siehe UV-Berechnung in
 *  buildOverlayMesh) - Three.js' eingebauter Y-Flip wuerde das sonst ein
 *  zweites Mal umdrehen. */
async function buildMaskedTexture(
  projection: PhotoProjection,
): Promise<THREE.CanvasTexture | null> {
  const d = tracePathData(projection.points, projection.closed, projection.closingControl)
  if (!d) return null

  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Foto fuer Projektion konnte nicht geladen werden'))
      image.src = projection.photoDataUrl
    })
  } catch (err) {
    console.warn('[photoProjection]', err)
    return null
  }

  const cropWidth = projection.pxMaxX - projection.pxMinX
  const cropHeight = projection.pxMaxY - projection.pxMinY
  if (cropWidth <= 0 || cropHeight <= 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = cropWidth
  canvas.height = cropHeight
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.translate(-projection.pxMinX, projection.pxMaxY)
  ctx.scale(1, -1)
  ctx.clip(new Path2D(d))
  ctx.drawImage(image, 0, 0)
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  return texture
}

function boundsOverlap(mesh: THREE.Mesh, projection: PhotoProjection): boolean {
  const geometry = mesh.geometry
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const box = geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)
  return (
    box.max.x >= projection.boundsMinX &&
    box.min.x <= projection.boundsMaxX &&
    box.max.y >= projection.boundsMinY &&
    box.min.y <= projection.boundsMaxY
  )
}

/** Klont die Geometrie der echten Modell-Mesh und stempelt ein eigenes
 *  UV-Attribut drauf (reine Draufsicht-Projektion: u/v ergeben sich direkt
 *  aus der WELT-X/Y-Position jedes Vertex relativ zur Millimeter-Bounding-Box
 *  des Fotos) - die Original-Geometrie bleibt dabei unangetastet (Export/
 *  Kollisionscheck/andere Projektionen duerfen sie weiter unveraendert
 *  nutzen). Bekommt ein FRISCHES Material statt materialFor()s
 *  farb-gecachtem: das ist ueber mehrere Fragmente/Bloecke hinweg geteilt,
 *  ein Foto betrifft aber gezielt nur EIN Fragment. */
function buildOverlayMesh(
  mesh: THREE.Mesh,
  projection: PhotoProjection,
  texture: THREE.CanvasTexture,
): THREE.Mesh | null {
  const widthMm = projection.boundsMaxX - projection.boundsMinX
  const heightMm = projection.boundsMaxY - projection.boundsMinY
  if (widthMm <= 0 || heightMm <= 0) return null

  const geometry = mesh.geometry.clone()
  const position = geometry.attributes.position
  const uv = new Float32Array(position.count * 2)
  const worldPoint = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    worldPoint.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
    uv[i * 2] = (worldPoint.x - projection.boundsMinX) / widthMm
    uv[i * 2 + 1] = (worldPoint.y - projection.boundsMinY) / heightMm
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    // Verhindert Z-Fighting mit der identischen Original-Geometrie darunter
    // (Standardtechnik fuer eine Zweitschicht ueber derselben Flaeche, siehe
    // auch buildStencilRig() in meshLoader.ts fuer ein verwandtes Muster).
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })

  const overlayMesh = new THREE.Mesh(geometry, material)
  // Direkte Matrix-Kopie statt position/quaternion/scale einzeln zu
  // kopieren: robust auch bei einer evtl. spaeter hinzukommenden
  // Elter-Transformation der Original-Mesh (aktuell identisch, da
  // MeshManager.group ohne eigene Transformation direkt an der Szene haengt).
  overlayMesh.matrix.copy(mesh.matrixWorld)
  overlayMesh.matrixAutoUpdate = false
  overlayMesh.renderOrder = mesh.renderOrder + 1
  return overlayMesh
}

/** Zeigt nachgezeichnete Fotos (mit aktivierter "auf Objekt
 *  projizieren"-Checkbox) als Draufsicht-Textur auf der TATSAECHLICHEN
 *  Modell-Geometrie an - eine reine Zusatzschicht in einer eigenen Gruppe
 *  (wie coordinateHelpers/shadowCatcher in scene.ts direkt an der Szene),
 *  daher automatisch von Klick-Auswahl (blockPicker.ts raycastet nur gegen
 *  MeshManager.getObject()), Export und Kollisionscheck ausgeschlossen. */
export class PhotoProjectionManager {
  private readonly scene: THREE.Scene
  private readonly group: THREE.Group
  private overlays: OverlayEntry[] = []
  private textures: THREE.CanvasTexture[] = []

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.group = new THREE.Group()
    this.scene.add(this.group)
  }

  async update(
    projections: PhotoProjection[],
    trackedMeshes: readonly { mesh: THREE.Mesh }[],
  ): Promise<void> {
    this.clear()
    if (projections.length === 0 || trackedMeshes.length === 0) return
    this.scene.updateMatrixWorld(true)

    for (const projection of projections) {
      const texture = await buildMaskedTexture(projection)
      if (!texture) continue
      this.textures.push(texture)
      for (const { mesh } of trackedMeshes) {
        if (!boundsOverlap(mesh, projection)) continue
        const overlayMesh = buildOverlayMesh(mesh, projection, texture)
        if (!overlayMesh) continue
        this.group.add(overlayMesh)
        this.overlays.push({
          mesh: overlayMesh,
          geometry: overlayMesh.geometry,
          material: overlayMesh.material as THREE.Material,
        })
      }
    }
  }

  clear(): void {
    for (const { mesh, geometry, material } of this.overlays) {
      this.group.remove(mesh)
      geometry.dispose()
      material.dispose()
    }
    this.overlays = []
    for (const texture of this.textures) texture.dispose()
    this.textures = []
  }

  dispose(): void {
    this.clear()
    this.scene.remove(this.group)
  }
}
