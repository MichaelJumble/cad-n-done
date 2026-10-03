import type { WebGLRenderer } from 'three'

/** Laedt das aktuelle Rendererbild als PNG herunter. */
export function downloadScreenshot(renderer: WebGLRenderer, filename = 'blockscad-view.png'): void {
  renderer.domElement.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
