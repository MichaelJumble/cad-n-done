export interface RecordingDialogHandle {
  /** Zeigt die Aufnahme in einer Vorschau; erst bei Klick auf "Speichern"
   *  wird sie tatsaechlich als Datei heruntergeladen. */
  open(blob: Blob, filename: string): void
}

export interface RecordingDialogConfig {
  title: string
  saveLabel: string
  discardLabel: string
}

/** Vorschau-Dialog fuer eine per Viewer-Aufnahme entstandene Videodatei
 *  (siehe recordButton in viewerPanel.ts): spielt das Video direkt aus dem
 *  Blob ab, damit vor dem Speichern erst geprueft werden kann, ob die
 *  Aufnahme brauchbar ist. */
export function mountRecordingDialog(config: RecordingDialogConfig): RecordingDialogHandle {
  const dialog = document.createElement('dialog')
  dialog.className = 'info-dialog recording-dialog'
  dialog.innerHTML = `
    <h2>${config.title}</h2>
    <video class="recording-dialog-video" controls autoplay loop></video>
    <form method="dialog" class="confirm-dialog-actions">
      <button type="submit" class="btn" value="discard">${config.discardLabel}</button>
      <button type="submit" class="btn" value="save">${config.saveLabel}</button>
    </form>
  `
  document.body.appendChild(dialog)
  const video = dialog.querySelector<HTMLVideoElement>('video')!

  let currentUrl: string | null = null
  let currentBlob: Blob | null = null
  let currentFilename = 'aufnahme.webm'

  function releaseVideo(): void {
    video.pause()
    video.removeAttribute('src')
    video.load()
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl)
      currentUrl = null
    }
  }

  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'save' && currentBlob) {
      const url = URL.createObjectURL(currentBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = currentFilename
      a.click()
      URL.revokeObjectURL(url)
    }
    releaseVideo()
    currentBlob = null
  })

  return {
    open(blob: Blob, filename: string): void {
      releaseVideo()
      currentBlob = blob
      currentFilename = filename
      currentUrl = URL.createObjectURL(blob)
      video.src = currentUrl
      dialog.returnValue = ''
      dialog.showModal()
    },
  }
}
