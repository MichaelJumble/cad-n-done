// Haelt das Projekt-Dateiformat handhabbar (Foto landet als data:-URL im
// Block-extraState, siehe editor/blocks/tracePhoto.ts) - IndexedDB-Autosave
// (workspaceStorage.ts) ist zwar generell fuer grosse Blobs ausgelegt (schon
// beim STL-Import als Praezedenzfall), ein unkomprimiertes Foto in voller
// Kamera-Aufloesung waere trotzdem unnoetig gross.
const MAX_PHOTO_DIMENSION = 1200
const JPEG_QUALITY = 0.8

export interface DownscaledPhoto {
  dataUrl: string
  width: number
  height: number
}

/** Laedt eine Bilddatei, skaliert sie bei Bedarf auf max. MAX_PHOTO_DIMENSION
 *  (Langseite, nie hochskaliert) herunter und liefert sie als JPEG-data:-URL
 *  zurueck. Selbes URL.createObjectURL -> Image() -> Canvas-Muster wie
 *  editor/exportPng.ts, inkl. URL.revokeObjectURL im finally (Lifecycle-
 *  Vorbild: ui/recordingDialog.ts's releaseVideo()). */
export async function loadAndDownscalePhoto(file: File): Promise<DownscaledPhoto> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
      image.src = objectUrl
    })

    const scale = Math.min(
      1,
      MAX_PHOTO_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    )
    const width = Math.round(image.naturalWidth * scale)
    const height = Math.round(image.naturalHeight * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar')
    ctx.drawImage(image, 0, 0, width, height)

    return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width, height }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
