/** Nimmt den Viewer-Canvas als Video auf (MediaRecorder auf einem per
 *  canvas.captureStream() erzeugten MediaStream) — haelt dabei jede
 *  Kamerabewegung/Interaktion fest, die waehrend der Aufnahme passiert,
 *  ohne die eigentliche Render-Schleife (scene.ts) anzufassen. */
export interface CanvasRecorder {
  isRecording(): boolean
  /** true nur waehrend einer laufenden, aber pausierten Aufnahme - false
   *  sowohl vor dem Start als auch waehrend aktiv aufgezeichnet wird. */
  isPaused(): boolean
  /** micEnabled: Mikrofon-Tonspur per getUserMedia() hinzufuegen (siehe
   *  requestMicTrack()) - erst hier abgefragt (nicht schon beim blossen
   *  Umschalten des Mikrofon-Knopfs in der UI), damit der Berechtigungsdialog
   *  erst beim tatsaechlichen Aufnahmestart erscheint. Schlaegt die Anfrage
   *  fehl (Berechtigung verweigert, kein Mikrofon vorhanden), laeuft die
   *  Aufnahme trotzdem ohne Ton weiter, statt komplett abzubrechen. */
  start(fps?: number, micEnabled?: boolean): Promise<void>
  /** Pausiert eine laufende Aufnahme (MediaRecorder.pause()) - noch
   *  aufgezeichnete Daten bleiben erhalten, es kommen nur keine neuen mehr
   *  hinzu, bis resume() aufgerufen wird. Kein Effekt, wenn nicht aufgezeichnet
   *  wird oder schon pausiert ist. */
  pause(): void
  resume(): void
  /** Stoppt die Aufnahme und loest mit dem fertigen Video-Blob auf (null
   *  falls keine Aufnahme lief oder keine Daten anfielen). */
  stop(): Promise<Blob | null>
}

/** Gemeinsam von CanvasRecorder UND TabRecorder (tabRecorder.ts) genutzt -
 *  liefert null statt zu werfen, wenn der Nutzer die Mikrofon-Berechtigung
 *  ablehnt oder kein Mikrofon verfuegbar ist, damit die Aufnahme selbst in
 *  diesem Fall trotzdem (nur ohne Ton) starten kann. */
export async function requestMicTrack(): Promise<MediaStreamTrack | null> {
  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    return micStream.getAudioTracks()[0] ?? null
  } catch {
    return null
  }
}

// Reihenfolge = Praeferenz: bestmoegliche Kompression zuerst, mit
// garantiertem Fallback (leerer String -> Browser waehlt selbst).
const CANDIDATE_MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

export function pickMimeType(): string {
  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

const DEFAULT_FPS = 30

export function createCanvasRecorder(canvas: HTMLCanvasElement): CanvasRecorder {
  let recorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let chunks: Blob[] = []

  return {
    isRecording(): boolean {
      return recorder !== null && recorder.state !== 'inactive'
    },
    isPaused(): boolean {
      return recorder !== null && recorder.state === 'paused'
    },
    pause(): void {
      if (recorder?.state === 'recording') recorder.pause()
    },
    resume(): void {
      if (recorder?.state === 'paused') recorder.resume()
    },
    async start(fps = DEFAULT_FPS, micEnabled = false): Promise<void> {
      if (recorder) return
      const videoStream = canvas.captureStream(fps)
      const micTrack = micEnabled ? await requestMicTrack() : null
      // Falls waehrend des (asynchronen) Mikrofon-Zugriffs bereits eine
      // andere Aufnahme gestartet wurde (schneller Doppelklick o.ae.) - nicht
      // ueberschreiben.
      if (recorder) {
        micTrack?.stop()
        return
      }
      stream = new MediaStream([...videoStream.getVideoTracks(), ...(micTrack ? [micTrack] : [])])
      const mimeType = pickMimeType()
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunks = []
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.start()
    },
    stop(): Promise<Blob | null> {
      const activeRecorder = recorder
      const activeStream = stream
      recorder = null
      stream = null
      if (!activeRecorder) return Promise.resolve(null)

      return new Promise((resolve) => {
        activeRecorder.onstop = () => {
          activeStream?.getTracks().forEach((track) => track.stop())
          const type = activeRecorder.mimeType || 'video/webm'
          resolve(chunks.length > 0 ? new Blob(chunks, { type }) : null)
          chunks = []
        }
        activeRecorder.stop()
      })
    },
  }
}
