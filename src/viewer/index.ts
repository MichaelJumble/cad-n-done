import * as THREE from 'three'
import { createScene, type ViewPreset } from './scene'
import {
  MeshManager,
  setMeshColor,
  getMeshColor,
  setWireframe,
  setMetallic,
  type ColorFilter,
} from './meshLoader'
import { exportObjectAsStl, exportObjectAsStlBytes, exportObjectAsGlb } from './exporter'
import { downloadScreenshot } from './screenshot'
import { createCanvasRecorder } from './recorder'
import { MeasureTool, type MeasureStatus, type MeasureMode } from './measure'
import { BlockPicker } from './blockPicker'
import { Flashlight } from './flashlight'
import { CollisionHighlighter } from './collisionCheck'
import { PhotoProjectionManager } from './photoProjection'
import type { PhotoProjection } from './photoProjectionData'
import type { MeshFragment } from '../types'

export type { MeasureStatus, MeasureMode }

export type { ViewPreset, ColorFilter }

export { collectPhotoProjections } from './photoProjectionData'
export type { PhotoProjection } from './photoProjectionData'

export type ClipAxis = 'x' | 'y' | 'z'

const CLIP_NORMALS: Record<ClipAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

export interface ViewerHandle {
  /** dropIn: die Fragmente sollen sichtbar von oben in ihre Zielposition
   *  fallen und dort ausschwingen (siehe MeshManager.dropIn) - fuer den
   *  Effekt nach dem Laden eines Projekts, nicht bei jeder Bearbeitung. */
  showMesh(fragments: MeshFragment[], dropIn?: boolean): void
  clear(): void
  exportStl(filter?: ColorFilter, filename?: string): void
  exportGlb(filter?: ColorFilter, filename?: string): Promise<void>
  /** Wie exportStl(), aber ohne Datei-Download - liefert die rohen STL-Bytes
   *  direkt zurueck (siehe ui/viewerPanel.ts: Modell als os_import_stl-Block
   *  ins Projekt einbetten). null, wenn gerade nichts sichtbar ist. */
  getStlBytes(filter?: ColorFilter): Promise<Uint8Array | null>
  getAvailableColors(): (string | null)[]
  screenshot(filename?: string): void
  /** Exportiert das komplette Modell als PNG in hoeherer Aufloesung als der
   *  Bildschirm, unabhaengig vom aktuellen Zoom-/Schwenk-Zustand: rahmt die
   *  Kamera vorher automatisch aufs ganze Modell ein (Blickrichtung bleibt
   *  erhalten), im Gegensatz zu screenshot(), das nur die aktuell sichtbare
   *  Ansicht in Bildschirmaufloesung festhaelt. */
  exportFullImage(filename?: string): void
  zoomIn(): void
  zoomOut(): void
  resetView(): void
  setView(preset: ViewPreset): void
  setAxesVisible(visible: boolean): void
  setShadowsEnabled(enabled: boolean): void
  /** "Studio"-Look: Grauverlauf-Hintergrund (auch als Reflexionsquelle,
   *  siehe scene.ts) statt Theme-Hintergrund, Gitter/Achsen ausgeblendet,
   *  Materialien deutlich metallischer/glaenzender (siehe
   *  meshLoader.ts::setMetallic). Schatten werden separat ueber
   *  setShadowsEnabled orchestriert, siehe viewerPanel.ts. */
  setStudioMode(enabled: boolean): void
  setWireframe(enabled: boolean): void
  /** Schaltet genau die per blockId benannten Fragmente transparent (alle
   *  anderen zurueck auf normal), gemeinsamer Deckkraft-Wert (0-1, siehe
   *  meshLoader.ts::MeshManager.setTransparencySelection) fuer alle davon
   *  betroffenen Bloecke. Leeres Set schaltet Transparenz komplett aus. */
  setTransparencySelection(blockIds: ReadonlySet<string>, opacity: number): void
  /** Wandstaerken-Heatmap: ersetzt voruebergehend die normalen Teile-Farben
   *  durch eine rot(duenn)-bis-blau(dick)-Einfaerbung je Vertex (siehe
   *  meshLoader.ts::MeshManager.setWallThicknessHeatmap/wallThickness.ts). */
  setWallThicknessHeatmap(enabled: boolean): void
  /** Blendet alles jenseits von `position` auf der `axis`-Achse aus (bzw. bei
   *  invert=true alles diesseits davon), oder deaktiviert die Schnittebene
   *  (enabled=false). */
  setClipping(enabled: boolean, axis: ClipAxis, position: number, invert?: boolean): void
  /** Explosionsansicht: verschiebt jedes Farbfragment radial vom gemeinsamen
   *  Mittelpunkt weg. factor=0 stellt die Originalposition wieder her. */
  setExplosion(factor: number): void
  setLightAngle(degrees: number): void
  setLightIntensity(intensity: number): void
  setLightAutoRotate(enabled: boolean, speedDegPerSec?: number): void
  setMeshColor(hex: string): void
  getMeshColor(): string
  /** Aktiviert/deaktiviert das Messwerkzeug (Abstand oder Winkel, siehe
   *  `mode`). Waehrend aktiv ist die Kamera-Rotation gesperrt (siehe
   *  measure.ts) - ein Klick auf das Modell setzt sonst leicht ungewollt
   *  gleichzeitig einen Messpunkt UND verdreht die Ansicht. Ergebnisse kommen
   *  ueber den bei createViewer() registrierten onMeasureChange-Callback,
   *  nicht als Rueckgabewert hier. Ein Aufruf mit einem ANDEREN `mode` als
   *  zuletzt beginnt eine neue Messung, auch wenn bereits aktiv. */
  setMeasureMode(enabled: boolean, mode?: MeasureMode): void
  isMeasureModeActive(): boolean
  getMeasureMode(): MeasureMode
  /** Schaltet "Klick auf ein Teil im Viewer springt zum erzeugenden Block"
   *  (siehe blockPicker.ts) ein/aus - unabhaengig vom Mess-Werkzeug, das
   *  Klicks ohnehin schon fuer sich beansprucht (siehe isSuppressed unten). */
  setBlockPickEnabled(enabled: boolean): void
  /** Taschenlampe: solange aktiv, folgt ein weisses Punktlicht dem
   *  Mauszeiger ueber der Canvas und beleuchtet die Stelle des Modells
   *  darunter zusaetzlich (siehe flashlight.ts) - fuer Winkel, die die
   *  normale Szenenbeleuchtung nicht gut erreicht. Rein optisch. */
  setFlashlightEnabled(enabled: boolean): void
  isFlashlightEnabled(): boolean
  /** Liefert Min/Mitte/Max der WELT-Bounding-Box des per blockId
   *  identifizierten Fragments entlang `axis` (fuer das Ausrichten-Werkzeug,
   *  siehe viewerPanel.ts) - null, wenn dieser Block gerade kein sichtbares
   *  Fragment hat (z.B. Render noch nicht abgeschlossen, oder Block erzeugt
   *  keine Geometrie). Nutzt bewusst die WELT-Matrix (nicht die
   *  unverschobene Basisgeometrie), damit eine aktive Explosionsansicht
   *  automatisch mit einfliesst statt separat beruecksichtigt werden zu
   *  muessen. */
  getAxisRange(blockId: string, axis: ClipAxis): { min: number; mid: number; max: number } | null
  /** Zeigt das Ergebnis eines Kollisions-Checks (siehe checkCollisions() in
   *  viewerPanel.ts) als blinkende Warn-Geometrie an - je STL-Puffer ein
   *  Mesh. Leeres Array raeumt eine evtl. vorherige Anzeige nur auf. */
  showCollisions(stls: ArrayBuffer[]): void
  clearCollisions(): void
  /** Zeigt nachgezeichnete Fotos mit aktivierter "auf Objekt projizieren"-
   *  Checkbox als Draufsicht-Textur auf der tatsaechlichen Modell-Geometrie
   *  (siehe photoProjection.ts) - unabhaengig vom eigentlichen Mesh-Render,
   *  da die Checkbox den generierten OpenSCAD-Code nicht aendert. Leere Liste
   *  raeumt eine evtl. vorherige Anzeige nur auf. */
  setPhotoProjections(projections: PhotoProjection[]): Promise<void>
  /** Startet die Videoaufnahme des Viewer-Canvas (jede Kamerabewegung/
   *  Interaktion, die waehrend der Aufnahme passiert, landet im Video).
   *  micEnabled fuegt eine Mikrofon-Tonspur hinzu (siehe requestMicTrack()
   *  in viewer/recorder.ts). */
  startRecording(micEnabled?: boolean): Promise<void>
  isRecording(): boolean
  isRecordingPaused(): boolean
  pauseRecording(): void
  resumeRecording(): void
  /** Stoppt die Aufnahme und liefert das fertige Video (webm) als Blob,
   *  oder null, wenn gerade keine Aufnahme lief. */
  stopRecording(): Promise<Blob | null>
  resize(): void
  restartAnimation(): void
  /** Baut Renderer/Szene/Mesh-Verwaltung komplett neu auf (frischer WebGL-
   *  Kontext, frisches Canvas) - fuer den seltenen Fall, dass die Three.js-
   *  Darstellung haengen bleibt (z.B. nach einem GPU-/Treiber-Aussetzer) und
   *  sich anders nicht mehr erholt. Das aktuelle Modell ist danach WEG (leere
   *  Szene) - der Aufrufer muss anschliessend selbst neu rendern (z.B. per
   *  triggerRender()), was dank Render-Cache i.d.R. ohne neuen Worker-Aufruf
   *  sofort aus dem Cache kommt. */
  reload(): void
  dispose(): void
}

const ZOOM_STEP = 0.85
// Vielfaches der Bildschirmaufloesung fuer den "ganzes Bild"-Export, da die
// Viewer-Canvas im Layout oft recht klein ist.
const FULL_IMAGE_EXPORT_SCALE = 4

/** Baut den 3D-Viewer (Szene + Mesh-Verwaltung + Export + Kamera-Werkzeuge) in
 *  `container` auf. */
export function createViewer(
  container: HTMLElement,
  onMeasureChange?: (status: MeasureStatus) => void,
  onBlockPick?: (blockId: string) => void,
): ViewerHandle {
  // Diese vier werden bei reload() komplett verworfen und frisch aufgebaut
  // (siehe unten) - deshalb `let` statt `const`. Alle Methoden lesen sie ueber
  // den Closure-Namen bei JEDEM Aufruf neu, sehen also automatisch den
  // jeweils aktuellen Stand, ohne selbst angepasst werden zu muessen.
  let sceneHandle = createScene(container)
  let meshManager = new MeshManager(sceneHandle.scene)
  let measureTool = new MeasureTool(
    sceneHandle.scene,
    sceneHandle.camera,
    sceneHandle.renderer.domElement,
    () => meshManager.getObject(),
    (status) => onMeasureChange?.(status),
  )
  // Vom Nutzer per Umschalter (siehe viewerPanel.ts) ein-/ausschaltbar -
  // standardmaessig AUS (ungewolltes Herumspringen zwischen Bloecken beim
  // blossen Betrachten des Modells soll nicht die Vorgabe sein). `let` statt
  // `const`, da performReload() den BlockPicker komplett neu aufbaut
  // (frischer WebGL-Kontext), der eingestellte Wert aber ueber einen Reload
  // hinweg erhalten bleiben soll.
  let blockPickEnabled = false
  // Bleibt waehrend einer laufenden Messung inaktiv (siehe blockPicker.ts) -
  // sonst wuerde derselbe Klick, der einen Messpunkt setzt, gleichzeitig auch
  // noch zum zugehoerigen Block springen.
  let blockPicker = new BlockPicker(
    sceneHandle.camera,
    sceneHandle.renderer.domElement,
    () => meshManager.getObject(),
    () => measureTool.isActive() || !blockPickEnabled,
    (blockId) => onBlockPick?.(blockId),
  )
  let recorder = createCanvasRecorder(sceneHandle.renderer.domElement)
  let collisionHighlighter = new CollisionHighlighter(sceneHandle.scene)
  let photoProjectionManager = new PhotoProjectionManager(sceneHandle.scene)
  let flashlight = new Flashlight(
    sceneHandle.scene,
    sceneHandle.camera,
    sceneHandle.renderer.domElement,
    () => meshManager.getObject(),
  )

  /** Kompletter Neuaufbau von Renderer/Szene/Mesh-Verwaltung (frischer WebGL-
   *  Kontext) - fuer den manuellen "Neu laden"-Button (siehe reload() unten). */
  function performReload(): void {
    if (recorder.isRecording()) void recorder.stop()
    const flashlightWasEnabled = flashlight.isEnabled()
    measureTool.dispose()
    blockPicker.dispose()
    collisionHighlighter.dispose()
    photoProjectionManager.dispose()
    flashlight.dispose()
    meshManager.clear()
    sceneHandle.dispose()
    sceneHandle = createScene(container)
    meshManager = new MeshManager(sceneHandle.scene)
    measureTool = new MeasureTool(
      sceneHandle.scene,
      sceneHandle.camera,
      sceneHandle.renderer.domElement,
      () => meshManager.getObject(),
      (status) => onMeasureChange?.(status),
    )
    blockPicker = new BlockPicker(
      sceneHandle.camera,
      sceneHandle.renderer.domElement,
      () => meshManager.getObject(),
      () => measureTool.isActive() || !blockPickEnabled,
      (blockId) => onBlockPick?.(blockId),
    )
    recorder = createCanvasRecorder(sceneHandle.renderer.domElement)
    collisionHighlighter = new CollisionHighlighter(sceneHandle.scene)
    photoProjectionManager = new PhotoProjectionManager(sceneHandle.scene)
    flashlight = new Flashlight(
      sceneHandle.scene,
      sceneHandle.camera,
      sceneHandle.renderer.domElement,
      () => meshManager.getObject(),
    )
    flashlight.setEnabled(flashlightWasEnabled)
  }

  return {
    showMesh(fragments: MeshFragment[], dropIn = false): void {
      meshManager.setFromFragments(fragments, dropIn)
    },
    clear(): void {
      meshManager.clear()
    },
    exportStl(filter: ColorFilter = meshManager.getAvailableColors(), filename?: string): void {
      void meshManager.withFilteredObject(filter, (object) => exportObjectAsStl(object, filename))
    },
    async getStlBytes(
      filter: ColorFilter = meshManager.getAvailableColors(),
    ): Promise<Uint8Array | null> {
      let bytes: Uint8Array | null = null
      await meshManager.withFilteredObject(filter, (object) => {
        bytes = exportObjectAsStlBytes(object)
      })
      return bytes
    },
    exportGlb(
      filter: ColorFilter = meshManager.getAvailableColors(),
      filename?: string,
    ): Promise<void> {
      return meshManager.withFilteredObject(filter, (object) => exportObjectAsGlb(object, filename))
    },
    getAvailableColors(): (string | null)[] {
      return meshManager.getAvailableColors()
    },
    screenshot(filename?: string): void {
      downloadScreenshot(sceneHandle.renderer, filename)
    },
    exportFullImage(filename?: string): void {
      sceneHandle.frameAll(meshManager.getObject())
      sceneHandle.captureHighRes(FULL_IMAGE_EXPORT_SCALE, () => {
        downloadScreenshot(sceneHandle.renderer, filename ?? 'blockscad-view-full.png')
      })
    },
    zoomIn(): void {
      sceneHandle.zoomBy(ZOOM_STEP)
    },
    zoomOut(): void {
      sceneHandle.zoomBy(1 / ZOOM_STEP)
    },
    resetView(): void {
      sceneHandle.resetView()
    },
    setView(preset: ViewPreset): void {
      sceneHandle.setView(preset)
    },
    setAxesVisible(visible: boolean): void {
      sceneHandle.coordinateHelpers.visible = visible
    },
    setShadowsEnabled(enabled: boolean): void {
      sceneHandle.setShadowsEnabled(enabled)
    },
    setStudioMode(enabled: boolean): void {
      sceneHandle.setStudioMode(enabled)
      setMetallic(enabled)
    },
    setWireframe(enabled: boolean): void {
      setWireframe(enabled)
    },
    setTransparencySelection(blockIds: ReadonlySet<string>, opacity: number): void {
      meshManager.setTransparencySelection(blockIds, opacity)
    },
    setWallThicknessHeatmap(enabled: boolean): void {
      meshManager.setWallThicknessHeatmap(enabled)
    },
    setClipping(enabled: boolean, axis: ClipAxis, position: number, invert = false): void {
      if (!enabled) {
        meshManager.setClipping(null)
        return
      }
      // Schneidet alles jenseits von `position` weg: Normalenrichtung zeigt
      // in die zu entfernende Haelfte, daher constant=-position. invert=true
      // dreht die Normalenrichtung (und damit welche Seite entfernt wird) um.
      const sign = invert ? -1 : 1
      const normal = CLIP_NORMALS[axis].clone().multiplyScalar(sign)
      meshManager.setClipping(new THREE.Plane(normal, -sign * position))
    },
    setExplosion(factor: number): void {
      meshManager.setExplosion(factor)
    },
    setLightAngle(degrees: number): void {
      sceneHandle.setLightAngle(degrees)
    },
    setLightIntensity(intensity: number): void {
      sceneHandle.setLightIntensity(intensity)
    },
    setLightAutoRotate(enabled: boolean, speedDegPerSec?: number): void {
      sceneHandle.setLightAutoRotate(enabled, speedDegPerSec)
    },
    setMeshColor(hex: string): void {
      setMeshColor(hex)
      meshManager.syncDefaultCapColor(hex)
    },
    getMeshColor(): string {
      return getMeshColor()
    },
    setMeasureMode(enabled: boolean, mode?: MeasureMode): void {
      measureTool.setActive(enabled, mode)
      // Waehrend des Messens Kamera-Rotation/Pan/Zoom sperren - sonst wuerde
      // derselbe Klick, der einen Messpunkt setzen soll, je nach minimaler
      // Mausbewegung gleichzeitig die Ansicht verdrehen.
      sceneHandle.controls.enabled = !enabled
    },
    isMeasureModeActive(): boolean {
      return measureTool.isActive()
    },
    getMeasureMode(): MeasureMode {
      return measureTool.getMode()
    },
    setBlockPickEnabled(enabled: boolean): void {
      blockPickEnabled = enabled
    },
    setFlashlightEnabled(enabled: boolean): void {
      flashlight.setEnabled(enabled)
    },
    isFlashlightEnabled(): boolean {
      return flashlight.isEnabled()
    },
    getAxisRange(
      blockId: string,
      axis: ClipAxis,
    ): { min: number; mid: number; max: number } | null {
      const tracked = meshManager
        .getTrackedMeshes()
        .find((t) => t.mesh.userData.blockId === blockId)
      if (!tracked) return null
      const box = new THREE.Box3().setFromObject(tracked.mesh)
      if (box.isEmpty()) return null
      return {
        min: box.min[axis],
        mid: box.getCenter(new THREE.Vector3())[axis],
        max: box.max[axis],
      }
    },
    showCollisions(stls: ArrayBuffer[]): void {
      collisionHighlighter.show(stls)
    },
    clearCollisions(): void {
      collisionHighlighter.clear()
    },
    setPhotoProjections(projections: PhotoProjection[]): Promise<void> {
      return photoProjectionManager.update(projections, meshManager.getTrackedMeshes())
    },
    startRecording(micEnabled = false): Promise<void> {
      return recorder.start(undefined, micEnabled)
    },
    isRecording(): boolean {
      return recorder.isRecording()
    },
    isRecordingPaused(): boolean {
      return recorder.isPaused()
    },
    pauseRecording(): void {
      recorder.pause()
    },
    resumeRecording(): void {
      recorder.resume()
    },
    stopRecording(): Promise<Blob | null> {
      return recorder.stop()
    },
    resize(): void {
      sceneHandle.resize()
    },
    restartAnimation(): void {
      sceneHandle.restartAnimation()
    },
    reload(): void {
      performReload()
    },
    dispose(): void {
      measureTool.dispose()
      blockPicker.dispose()
      collisionHighlighter.dispose()
      photoProjectionManager.dispose()
      flashlight.dispose()
      meshManager.clear()
      sceneHandle.dispose()
    },
  }
}
