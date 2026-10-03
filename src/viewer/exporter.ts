import type { Object3D } from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

const stlExporter = new STLExporter()
const gltfExporter = new GLTFExporter()

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Reines Parsen ohne Download — Grundlage fuer exportObjectAsStl() (Datei-
 *  Download) UND fuer das direkte Einbetten des aktuellen Modells als neuer
 *  os_import_stl-Block (siehe ui/viewerPanel.ts), das die Bytes NICHT auf die
 *  Festplatte schreibt, sondern base64-kodiert im Workspace ablegt. */
export function exportObjectAsStlBytes(object: Object3D): Uint8Array {
  const result = stlExporter.parse(object, { binary: true }) as unknown as DataView
  return new Uint8Array(result.buffer, result.byteOffset, result.byteLength)
}

export function exportObjectAsStl(object: Object3D, filename = 'model.stl'): void {
  const result = stlExporter.parse(object, { binary: true })
  const blob = new Blob([result], { type: 'model/stl' })
  download(blob, filename)
}

export function exportObjectAsGlb(object: Object3D, filename = 'model.glb'): Promise<void> {
  return new Promise((resolve, reject) => {
    gltfExporter.parse(
      object,
      (result) => {
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error('GLTFExporter hat kein ArrayBuffer geliefert (binary-Option fehlt?).'))
          return
        }
        const blob = new Blob([result], { type: 'model/gltf-binary' })
        download(blob, filename)
        resolve()
      },
      (error) => reject(error),
      { binary: true },
    )
  })
}
