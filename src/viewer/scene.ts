import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { createAxesGroup } from './axes'
import { getTheme, onThemeChange, type ThemeName } from '../ui/theme'

// Kamera-Ecke bei +X/-Y: Y+ faellt damit auf dem Bildschirm nach rechts
// oben (~14 Uhr) und X- nach links oben (~11 Uhr) - X+ liegt entsprechend
// nach rechts unten (~5 Uhr), auf den ersten Blick unauffaelliger als Y+.
// Z bleibt bei jeder Achsen-Ecke rein vertikal (Kamera-"up" ist immer Z),
// davon unabhaengig.
const DEFAULT_CAMERA_POS = new THREE.Vector3(80, -80, 80)
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0)

export type ViewPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso'

const VIEW_DIRECTIONS: Record<ViewPreset, THREE.Vector3> = {
  front: new THREE.Vector3(0, -1, 0),
  back: new THREE.Vector3(0, 1, 0),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 0, 1),
  bottom: new THREE.Vector3(0, 0, -1),
  // X und Y bewusst NICHT symmetrisch (-1,-1) - Y soll auf ~14 Uhr erscheinen,
  // -X auf ~11 Uhr (statt umgekehrt X auf 14/Y auf 11 wie bei (-1,-1,1)).
  iso: new THREE.Vector3(1, -1, 1).normalize(),
}

export interface Scene3D {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  coordinateHelpers: THREE.Group
  zoomBy(factor: number): void
  resetView(): void
  setView(preset: ViewPreset): void
  /** Rueckt Kamera-Ziel und -Abstand (bei gleichbleibender Blickrichtung) so
   *  zurecht, dass `object` komplett im Bild ist - fuer den Export des
   *  gesamten Modells unabhaengig vom aktuellen Zoom/Schwenk-Zustand. */
  frameAll(object: THREE.Object3D | null): void
  /** Rendert sofort synchron einen Frame (statt auf die naechste
   *  requestAnimationFrame-Iteration zu warten) - noetig, wenn direkt danach
   *  der Zeichenpuffer ausgelesen wird (z.B. fuer einen Screenshot). */
  render(): void
  /** Rendert einen Frame in `scale`-facher Aufloesung (unabhaengig von der
   *  aktuellen Fenstergroesse/Pixel-Ratio-Deckelung), ruft `capture` auf
   *  (muss den Zeichenpuffer synchron auslesen, z.B. via toBlob) und stellt
   *  danach die normale Aufloesung wieder her - fuer hochaufgeloeste
   *  Bildexporte, bei denen die eigentliche Bildschirmgroesse zu klein waere. */
  captureHighRes<T>(scale: number, capture: () => T): T
  setShadowsEnabled(enabled: boolean): void
  /** "Studio"-Look: neutraler Grauverlauf-Hintergrund (wie eine fotografische
   *  Sweep-Kulisse) statt des Theme-Hintergrunds, Gitter/Achsen ausgeblendet.
   *  Schatten werden bewusst NICHT hier mitgesetzt - das entscheidet
   *  viewerPanel.ts (dieselbe Stelle, die auch die Schnittebenen-
   *  Schatten-Kopplung orchestriert), damit scene.ts nur einzelne
   *  Primitiv-Eigenschaften kennt statt funktionsuebergreifender Regeln. */
  setStudioMode(enabled: boolean): void
  /** Winkel in Grad (0-360), Position der Lampe um die Z-Achse. */
  setLightAngle(degrees: number): void
  setLightIntensity(intensity: number): void
  /** enabled=true laesst die Lampe automatisch um die Z-Achse kreisen (speedDegPerSec Grad/Sekunde). */
  setLightAutoRotate(enabled: boolean, speedDegPerSec?: number): void
  resize(): void
  /** Startet die Animationsschleife garantiert neu (siehe Kommentar bei animate()). */
  restartAnimation(): void
  dispose(): void
}

/** Baut Kamera, Licht, Grid, Achsen und OrbitControls fuer den 3D-Viewer auf. */
export function createScene(container: HTMLElement): Scene3D {
  const scene = new THREE.Scene()
  // Grauverlauf-Textur fuer den "Studio"-Look (setStudioMode weiter unten,
  // erst NACH coordinateHelpers definiert, da sie dessen Sichtbarkeit
  // mitsteuert) - einmalig erzeugt statt bei jedem Umschalten neu.
  const studioBackgroundTexture = createStudioGradientTexture()
  let studioModeEnabled = false
  function applyBackground(): void {
    // Der weiche Grauverlauf dient JETZT immer als Reflexionsquelle (image-
    // based lighting), nicht nur im Studio-Modus - ohne "environment" bleiben
    // Materialien rein auf direktes Licht angewiesen und wirken dadurch matt/
    // "leblos" im Vergleich zu BlockSCADs eigenem Viewer (hellere, glänzendere
    // Reflexionen). Nur das sichtbare `background` (weiss/schwarz je Theme vs.
    // der Studio-Verlauf) bleibt an den Modus gekoppelt.
    scene.environment = studioBackgroundTexture
    if (studioModeEnabled) {
      scene.background = studioBackgroundTexture
    } else {
      applySceneBackground(scene)
    }
  }
  applyBackground()
  const unsubscribeTheme = onThemeChange(() => applyBackground())

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000)
  // OpenSCAD/STL sind Z-up, Three.js/OrbitControls gehen von Y-up aus. Die
  // Mesh-Geometrie bleibt bewusst unangetastet (sonst waeren STL/GLB-Exporte
  // fuer Slicer/CAD falsch orientiert) — stattdessen bekommt die Kamera
  // Z als "oben", muss vor dem Erzeugen der OrbitControls gesetzt sein.
  camera.up.set(0, 0, 1)
  camera.position.copy(DEFAULT_CAMERA_POS)

  // preserveDrawingBuffer: fuer Screenshots (toDataURL) noetig, sonst kann
  // der Puffer schon geleert sein, wenn der Button-Klick ausgewertet wird.
  // stencil: fuer die Schnittebenen-Deckflaeche (siehe meshLoader.buildStencilRig).
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    stencil: true,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  // Fuer die Schnittebenen-Funktion (siehe meshLoader.setClippingPlanes) —
  // ohne dieses Flag ignoriert der Renderer `material.clippingPlanes`.
  renderer.localClippingEnabled = true
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(DEFAULT_TARGET)
  // Kein Damping: mit Damping "spinnt" die Ansicht nach dem Loslassen der
  // Maus noch kurz nach (Traegheit), bis sie ausklingt - bei sich
  // ueberschneidender/deckungsgleicher Geometrie faellt Z-Fighting waehrend
  // dieser staendig wechselnden Blickwinkel viel staerker als Flackern auf
  // als im (danach wieder statischen) Ruhezustand. Ohne Damping stoppt die
  // Ansicht sofort beim Loslassen - der Nachlauf wird schlicht nicht gebraucht.
  controls.enableDamping = false
  controls.update()

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.4))
  const directional = new THREE.DirectionalLight(0xffffff, 0.9)
  const LIGHT_RADIUS = 130
  const LIGHT_HEIGHT = 90
  // Licht soll von der gleichen Seite wie die Kamera kommen (leicht versetzt,
  // 18°, fuer Schattierung statt flachem "Kamera-Blitz"-Look) - bei der
  // Kamera-Ecke +X/-Y (siehe DEFAULT_CAMERA_POS, Azimut 315°) also 315°+18°,
  // sonst waere das Modell von hinten beleuchtet und die sichtbaren
  // Flaechen im Schatten.
  const DEFAULT_LIGHT_ANGLE_DEG = 333
  let lightAngleDeg = DEFAULT_LIGHT_ANGLE_DEG
  let lightAutoRotate = false
  let lightRotationSpeed = 20 // Grad/Sekunde

  function applyLightPosition(): void {
    const rad = (lightAngleDeg * Math.PI) / 180
    directional.position.set(
      LIGHT_RADIUS * Math.cos(rad),
      LIGHT_RADIUS * Math.sin(rad),
      LIGHT_HEIGHT,
    )
  }
  applyLightPosition()

  function setLightAngle(degrees: number): void {
    lightAngleDeg = degrees
    applyLightPosition()
  }

  function setLightIntensity(intensity: number): void {
    directional.intensity = intensity
  }

  function setLightAutoRotate(enabled: boolean, speedDegPerSec = lightRotationSpeed): void {
    lightAutoRotate = enabled
    lightRotationSpeed = speedDegPerSec
  }

  // Standardmaessig aus (siehe viewerPanel.ts, das denselben Default haelt) —
  // hier trotzdem explizit gesetzt, damit dieses Modul auch fuer sich allein
  // konsistent mit seinem tatsaechlichen Startzustand ist.
  directional.castShadow = false
  directional.shadow.mapSize.set(2048, 2048)
  directional.shadow.camera.near = 1
  directional.shadow.camera.far = 600
  directional.shadow.camera.left = -150
  directional.shadow.camera.right = 150
  directional.shadow.camera.top = 150
  directional.shadow.camera.bottom = -150
  // Schatten-"Schmieren" durch die begrenzte Shadow-Map-Aufloesung mindern.
  directional.shadow.bias = -0.0015
  scene.add(directional)

  // Baut Fein-/Grobgitter DIREKT in der XY-Ebene (Z=0, unsere Boden-Ebene) -
  // bewusst NICHT ueber GridHelper (das seinerseits die XZ-Ebene annimmt und
  // erst per rotation.x gedreht werden muss) und bewusst NICHT ueber Line2/
  // LineMaterial (siehe thickLines.ts): normale THREE.LineSegments +
  // LineBasicMaterial reichen fuer diese Optik voellig, sind das direkteste
  // Mittel und haben keinerlei Shader-Sonderfaelle. Rand als eigene Linie
  // markiert die 200x200-Flaeche klar.
  // Farbe der 1mm-Linien ist die einzige, die sich mit dem Theme aendert
  // (Grob-/Randlinien bleiben fest) - im Dunkelmodus wirkt der helle
  // Hell-Modus-Grauton (0xd4d4d4) vor schwarzem Hintergrund zu grell/unruhig.
  const MINOR_GRID_COLOR_BY_THEME: Record<ThemeName, number> = {
    default: 0xd4d4d4,
    dark: 0x2a2a2a,
    contrast: 0x2a2a2a,
  }

  function createGrid(
    size: number,
    minorStep: number,
    majorStep: number,
  ): { group: THREE.Group; minorMaterial: THREE.LineBasicMaterial } {
    const half = size / 2
    const minor: number[] = []
    const major: number[] = []
    for (let v = -half; v <= half + 0.0001; v += minorStep) {
      const rounded = Math.round(v * 1000) / 1000
      const isMajor = Math.abs(rounded / majorStep - Math.round(rounded / majorStep)) < 0.0001
      const target = isMajor ? major : minor
      target.push(rounded, -half, 0, rounded, half, 0) // parallel zur Y-Achse
      target.push(-half, rounded, 0, half, rounded, 0) // parallel zur X-Achse
    }

    const group = new THREE.Group()

    const minorGeometry = new THREE.BufferGeometry()
    minorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(minor, 3))
    const minorMaterial = new THREE.LineBasicMaterial({
      color: MINOR_GRID_COLOR_BY_THEME[getTheme()],
    })
    group.add(new THREE.LineSegments(minorGeometry, minorMaterial))

    const majorGeometry = new THREE.BufferGeometry()
    majorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(major, 3))
    group.add(
      new THREE.LineSegments(majorGeometry, new THREE.LineBasicMaterial({ color: 0x8f8f8f })),
    )

    const borderGeometry = new THREE.BufferGeometry()
    borderGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -half,
          -half,
          0,
          half,
          -half,
          0,
          half,
          -half,
          0,
          half,
          half,
          0,
          half,
          half,
          0,
          -half,
          half,
          0,
          -half,
          half,
          0,
          -half,
          -half,
          0,
        ],
        3,
      ),
    )
    group.add(
      new THREE.LineSegments(borderGeometry, new THREE.LineBasicMaterial({ color: 0x555555 })),
    )

    return { group, minorMaterial }
  }

  const { group: grid, minorMaterial: minorGridMaterial } = createGrid(200, 1, 10)
  const unsubscribeGridTheme = onThemeChange((theme) => {
    minorGridMaterial.color.set(MINOR_GRID_COLOR_BY_THEME[theme])
  })

  // Leicht durchscheinende Flaeche GENAU bei Z=0 (minimal darunter, um
  // Z-Fighting mit den Gitterlinien zu vermeiden) - macht die Ebene selbst
  // als durchgehende Flaeche erkennbar, nicht nur als Linienraster.
  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
    }),
  )
  groundPlane.position.z = -0.01

  // Grid + Bodenflaeche + Achsen in einer Gruppe, damit ein Toggle alles
  // gemeinsam ein-/ausblendet.
  const coordinateHelpers = new THREE.Group()
  coordinateHelpers.add(grid, groundPlane, createAxesGroup(100))
  scene.add(coordinateHelpers)

  // Merkt sich den Sichtbarkeits-Zustand von VOR dem Studio-Modus, damit ein
  // zuvor manuell ausgeblendetes Gitter beim Verlassen nicht faelschlich
  // wieder eingeblendet wird (analog zum Schatten-Zustand rund um die
  // Schnittebene in viewerPanel.ts).
  let axesVisibleBeforeStudio = coordinateHelpers.visible

  // Reflektierender MARMOR-Boden fuer den Studio-Modus: ohne Gitter (im
  // Studio-Modus ausgeblendet, siehe setStudioMode) haette Z=0 gar keine
  // sichtbare Referenz mehr - das Modell wuerde scheinbar frei im Raum
  // schweben. Der Standard-"Reflector" kennt nur einen flachen Farbton
  // (kein Textur-Uniform), deshalb ein eigener, von ReflectorShader
  // abgeleiteter Shader: er mischt eine erzeugte Marmor-Textur MIT der
  // Spiegelung statt sie nur einzufaerben - passt zum "Showroom"-Look
  // zusammen mit dem metallischeren Material-Look im Studio-Modus (siehe
  // meshLoader.ts::setMetallic). Minimal unter Z=0 (statt exakt darauf), um
  // Z-Fighting mit Gitter/Schatten-Ebene zu vermeiden, die beide exakt bei
  // Z=0 liegen - bei diesem Massstab nicht wahrnehmbar.
  const STUDIO_FLOOR_SIZE = 400
  const studioFloor = new Reflector(new THREE.PlaneGeometry(STUDIO_FLOOR_SIZE, STUDIO_FLOOR_SIZE), {
    textureWidth: 1024,
    textureHeight: 1024,
    shader: MARBLE_REFLECTOR_SHADER,
  })
  const studioFloorMaterial = studioFloor.material as THREE.ShaderMaterial
  studioFloorMaterial.uniforms.marbleMap.value = createMarbleTexture()
  studioFloor.position.z = -0.05
  studioFloor.visible = false
  scene.add(studioFloor)

  function setStudioMode(enabled: boolean): void {
    if (enabled === studioModeEnabled) return
    studioModeEnabled = enabled
    if (enabled) {
      axesVisibleBeforeStudio = coordinateHelpers.visible
      coordinateHelpers.visible = false
    } else {
      coordinateHelpers.visible = axesVisibleBeforeStudio
    }
    studioFloor.visible = enabled
    applyBackground()
  }

  // Unsichtbarer Bodenempfaenger fuer die Schatten (PlaneGeometry liegt
  // standardmaessig schon in der XY-Ebene mit Normale +Z — passt direkt
  // zum Z-up-Boden, keine Rotation noetig). ShadowMaterial zeigt nur den
  // Schatten selbst, sonst transparent.
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.ShadowMaterial({ opacity: 0.25 }),
  )
  shadowCatcher.receiveShadow = true
  shadowCatcher.visible = false
  scene.add(shadowCatcher)

  function setShadowsEnabled(enabled: boolean): void {
    directional.castShadow = enabled
    shadowCatcher.visible = enabled
  }

  function resize(): void {
    const { clientWidth, clientHeight } = container
    if (clientWidth === 0 || clientHeight === 0) return
    camera.aspect = clientWidth / clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(clientWidth, clientHeight)
  }
  resize()

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)

  // Dynamisch das Fenster ermitteln, das `container` gerade tatsaechlich
  // anzeigt (Hauptfenster oder ein per Popout ausgelagertes Fenster).
  // Browser drosseln requestAnimationFrame fuer inaktive/hintergrund Fenster
  // — haengt die Schleife fest am urspruenglichen Fenster, friert das Bild
  // nach einem Resize (der den Zeichenpuffer leert) ein. Wird das Popup
  // waehrend ein Frame darueber eingeplant war geschlossen, stirbt die
  // Schleife sogar ganz (das geschlossene Fenster liefert nie einen
  // naechsten Frame) — deshalb `renderGeneration`: restartAnimation()
  // startet unabhaengig vom (evtl. bereits toten) alten Zustand neu, und
  // eine veraltete Schleife erkennt per Generation, dass sie ueberholt
  // wurde, und beendet sich selbst statt doppelt zu rendern.
  let animationFrame = 0
  let renderGeneration = 0
  const clock = new THREE.Clock()

  function animate(myGeneration: number): void {
    if (myGeneration !== renderGeneration) return
    const win = container.ownerDocument.defaultView ?? window
    animationFrame = win.requestAnimationFrame(() => animate(myGeneration))
    // Gedeckelt, damit ein Sprung nach laengerer Inaktivitaet (z.B.
    // Popout-Fenster war zu, requestAnimationFrame pausiert) die Lampe nicht
    // schlagartig um hunderte Grad weiterspringen laesst.
    const delta = Math.min(clock.getDelta(), 0.1)
    if (lightAutoRotate) {
      lightAngleDeg = (lightAngleDeg + lightRotationSpeed * delta) % 360
      applyLightPosition()
    }
    controls.update()
    renderer.render(scene, camera)
  }

  function restartAnimation(): void {
    renderGeneration += 1
    animate(renderGeneration)
  }
  restartAnimation()

  function zoomBy(factor: number): void {
    const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor)
    camera.position.copy(controls.target).add(offset)
    controls.update()
  }

  function resetView(): void {
    camera.position.copy(DEFAULT_CAMERA_POS)
    controls.target.copy(DEFAULT_TARGET)
    controls.update()
  }

  function setView(preset: ViewPreset): void {
    const distance = camera.position.distanceTo(controls.target) || 150
    const direction = VIEW_DIRECTIONS[preset]
    camera.position.copy(controls.target).addScaledVector(direction, distance)
    controls.update()
  }

  // Etwas Rand um das Modell lassen, statt es bildfuellend anzuschneiden.
  const FRAME_ALL_PADDING = 1.2

  function frameAll(object: THREE.Object3D | null): void {
    if (!object) return
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    if (sphere.radius <= 0) return

    // Blickrichtung beibehalten (nur Ziel + Abstand anpassen), damit der
    // aktuell gewaehlte Blickwinkel des Nutzers erhalten bleibt.
    const direction = camera.position.clone().sub(controls.target)
    if (direction.lengthSq() === 0) direction.copy(DEFAULT_CAMERA_POS)
    direction.normalize()

    const verticalFov = (camera.fov * Math.PI) / 180
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
    const limitingFov = Math.min(verticalFov, horizontalFov)
    const distance = (sphere.radius / Math.sin(limitingFov / 2)) * FRAME_ALL_PADDING

    controls.target.copy(sphere.center)
    camera.position.copy(sphere.center).addScaledVector(direction, distance)
    controls.update()
  }

  function render(): void {
    controls.update()
    renderer.render(scene, camera)
  }

  // Vermeidet WebGL-Kontextfehler auf Geraeten mit begrenzter maximaler
  // Texture-/Renderbuffer-Groesse.
  const MAX_CAPTURE_DIMENSION = 4096

  function captureHighRes<T>(scale: number, capture: () => T): T {
    const { clientWidth, clientHeight } = container
    const targetWidth = Math.min(Math.round(clientWidth * scale), MAX_CAPTURE_DIMENSION)
    const targetHeight = Math.min(Math.round(clientHeight * scale), MAX_CAPTURE_DIMENSION)

    const previousPixelRatio = renderer.getPixelRatio()
    renderer.setPixelRatio(1)
    camera.aspect = targetWidth / targetHeight
    camera.updateProjectionMatrix()
    // updateStyle=false: nur der Zeichenpuffer waechst, die auf dem
    // Bildschirm angezeigte Canvas-Groesse (CSS) bleibt unveraendert.
    renderer.setSize(targetWidth, targetHeight, false)
    controls.update()
    renderer.render(scene, camera)

    // `capture` (z.B. canvas.toBlob) liest den Zeichenpuffer synchron aus dem
    // aktuellen Frame - Groesse/Pixel-Ratio duerfen daher erst danach
    // zurueckgesetzt werden.
    const result = capture()

    renderer.setPixelRatio(previousPixelRatio)
    resize()

    return result
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    coordinateHelpers,
    zoomBy,
    resetView,
    setView,
    frameAll,
    render,
    captureHighRes,
    setShadowsEnabled,
    setStudioMode,
    setLightAngle,
    setLightIntensity,
    setLightAutoRotate,
    resize,
    restartAnimation,
    dispose(): void {
      renderGeneration += 1
      try {
        ;(container.ownerDocument.defaultView ?? window).cancelAnimationFrame(animationFrame)
      } catch {
        // Fenster, das den ausstehenden Frame eingeplant hat, ist evtl.
        // schon geschlossen — renderGeneration-Bump oben reicht als Fallback.
      }
      resizeObserver.disconnect()
      unsubscribeTheme()
      unsubscribeGridTheme()
      controls.dispose()
      studioBackgroundTexture.dispose()
      // Reflector.dispose() entsorgt nur Render-Target + eigenes Material -
      // die manuell zugewiesene Marmor-Textur (siehe oben) haengt an einem
      // eigenen Shader-Uniform und wird davon NICHT automatisch mit erfasst.
      ;(studioFloorMaterial.uniforms.marbleMap.value as THREE.Texture | null)?.dispose()
      studioFloor.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

// Bewusst eigene, kraeftigere Werte statt der jeweiligen --color-bg-Variable
// (dort z.B. #eceef1 fuer Hell, ein Grauton statt reinem Weiss) - passend
// zum kraeftigen Gitter/Bodenflaeche-Look (siehe createGrid/groundPlane
// oben): Hell wird reines Weiss, Dunkel/Kontrast reines Schwarz.
const SCENE_BACKGROUND_BY_THEME: Record<ThemeName, number> = {
  default: 0xffffff,
  dark: 0x000000,
  contrast: 0x000000,
}

/** Szenenhintergrund passend zum aktuellen App-Theme. */
function applySceneBackground(scene: THREE.Scene): void {
  scene.background = new THREE.Color(SCENE_BACKGROUND_BY_THEME[getTheme()])
}

/** Vertikaler Grauverlauf ("Sweep"-Kulisse wie im Fotostudio: dunklerer
 *  Zenit, heller Horizont, wieder etwas dunklerer Boden) fuer den Studio-
 *  Modus - deutlich praesentabler als der flache Theme-Hintergrund, aber
 *  ohne den Aufwand einer echten HDRI-Umgebungskarte. Einmalig als Canvas-
 *  Textur erzeugt statt jedes Mal neu (siehe Aufrufer in createScene). */
function createStudioGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, '#3a3d42')
  gradient.addColorStop(0.55, '#c9cbd0')
  gradient.addColorStop(1, '#8a8d93')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  // Fuer die Verwendung als scene.environment (siehe applyBackground oben) -
  // ohne dieses Mapping wuerde Three.js die Textur nicht als
  // Rundum-Reflexionsquelle interpretieren.
  texture.mapping = THREE.EquirectangularReflectionMapping
  return texture
}

/** Heller Marmor-Untergrund mit ein paar unregelmaessigen, halbtransparenten
 *  "Adern" (grob nachempfunden, keine geologische Genauigkeit) - erzeugt statt
 *  als Asset ausgeliefert, damit der Studio-Boden ohne zusaetzliche Datei
 *  auskommt. RepeatWrapping, da die Textur ueber den ganzen Boden gekachelt
 *  wird (siehe MARBLE_REFLECTOR_SHADER::marbleRepeat). */
function createMarbleTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#e9e6e0'
  ctx.fillRect(0, 0, size, size)
  const veinColors = ['rgba(120,120,115,0.35)', 'rgba(90,90,88,0.22)', 'rgba(163,150,138,0.3)']
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = veinColors[i % veinColors.length]
    ctx.lineWidth = 1 + Math.random() * 2.5
    ctx.beginPath()
    let x = Math.random() * size
    let y = Math.random() * size
    ctx.moveTo(x, y)
    for (let j = 0; j < 6; j++) {
      x += (Math.random() - 0.5) * size * 0.5
      y += (Math.random() - 0.5) * size * 0.5
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Von Reflector.ReflectorShader abgeleiteter Shader: mischt die
 *  Marmor-Textur MIT der Spiegelung (statt wie im Original nur einen
 *  flachen Farbton per Overlay-Blend einzufaerben) - "reflectivity" steuert
 *  das Verhaeltnis (0 = reines Marmor-Diffuse, 1 = reiner Spiegel). Die
 *  Uniforms "color"/"tDiffuse"/"textureMatrix" MUESSEN vorhanden bleiben,
 *  auch wenn "color" hier ungenutzt ist - Reflector() setzt deren .value
 *  nach der Konstruktion unbedingt, ein fehlender Schluessel wuerde dort
 *  crashen (siehe Reflector.js). */
const MARBLE_REFLECTOR_SHADER = {
  name: 'MarbleReflectorShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    marbleMap: { value: null },
    marbleRepeat: { value: new THREE.Vector2(3, 3) },
    reflectivity: { value: 0.32 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec2 vUvPlane;

    void main() {
      vUvPlane = uv;
      vUv = textureMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D marbleMap;
    uniform vec2 marbleRepeat;
    uniform float reflectivity;
    varying vec4 vUv;
    varying vec2 vUvPlane;

    void main() {
      vec4 reflection = texture2DProj( tDiffuse, vUv );
      vec3 marble = texture2D( marbleMap, vUvPlane * marbleRepeat ).rgb;
      gl_FragColor = vec4( mix( marble, reflection.rgb, reflectivity ), 1.0 );
    }`,
}
