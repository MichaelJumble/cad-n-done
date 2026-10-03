import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { setStatus } from './status'

export function runThreeTest(): void {
  try {
    const container = document.querySelector<HTMLDivElement>('#three-canvas')
    if (!container) throw new Error('#three-canvas nicht gefunden')

    const width = container.clientWidth || 300
    const height = container.clientHeight || 320

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    camera.position.set(3, 3, 3)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.update()

    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1)
    scene.add(light)

    function animate() {
      requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    setStatus('three', true, 'Leere Szene mit Kamera, Licht und OrbitControls laeuft.')
  } catch (err) {
    setStatus('three', false, `Fehler: ${String(err)}`)
  }
}
