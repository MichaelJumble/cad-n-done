import { pickMimeType, requestMicTrack } from '../viewer/recorder'

/** Nimmt den GESAMTEN Browser-Tab als Video auf (MediaRecorder auf einem per
 *  getDisplayMedia() erzeugten MediaStream) — anders als der reine Viewer-
 *  Canvas-Rekorder (siehe viewer/recorder.ts) landet hier alles, was
 *  tatsaechlich auf dem Bildschirm sichtbar ist: Bloecke-Editor, Toolbox,
 *  Customizer-Overlay usw. Kostet dafuer bei jedem Start einen Browser-
 *  Berechtigungsdialog (Tab/Fenster/Bildschirm auswaehlen). */
export interface TabRecorder {
  isRecording(): boolean
  /** true nur waehrend einer laufenden, aber pausierten Aufnahme. */
  isPaused(): boolean
  /** Wirft, wenn der Nutzer den Freigabedialog abbricht (NotAllowedError o.ae.) -
   *  vom Aufrufer bewusst NICHT verschluckt, damit die UI den Button-Zustand
   *  in diesem Fall unveraendert lassen kann statt faelschlich "Aufnahme laeuft".
   *  micEnabled: siehe requestMicTrack() in viewer/recorder.ts - eine
   *  verweigerte/fehlende Mikrofon-Berechtigung laesst die Tab-Aufnahme
   *  selbst aber trotzdem starten (nur ohne Ton). */
  start(micEnabled?: boolean): Promise<void>
  pause(): void
  resume(): void
  stop(): Promise<Blob | null>
}

const DEFAULT_FPS = 30

export function createTabRecorder(): TabRecorder {
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
    async start(micEnabled = false): Promise<void> {
      if (recorder) return
      // "displaySurface: browser" schlaegt Chrome im Freigabedialog
      // automatisch "Diesen Tab" vor statt dass der Nutzer manuell durch
      // Fenster/Bildschirme suchen muss - andere Browser ignorieren die
      // Option einfach und zeigen ihren eigenen Standarddialog.
      // Chrome blendet den AUFRUFENDEN Tab selbst aus der Auswahlliste aus,
      // solange nicht explizit "preferCurrentTab" gesetzt wird (nicht
      // standardisiert, daher kein TS-Typ dafuer) - ohne dieses Flag waere
      // "diesen Tab aufnehmen" ueberhaupt nicht waehlbar, obwohl genau das
      // hier der Zweck ist. Andere Browser ignorieren das Flag einfach.
      // audio: false hier betrifft nur den Tab/System-Ton (bewusst
      // ausgeschaltet) - das Mikrofon (falls micEnabled) kommt separat ueber
      // requestMicTrack() und wird der Aufnahme unten als eigene Tonspur
      // hinzugefuegt.
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: DEFAULT_FPS } as MediaTrackConstraints,
        audio: false,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions)
      const micTrack = micEnabled ? await requestMicTrack() : null
      if (recorder) {
        // Waehrend der (asynchronen) Freigabe-/Mikrofonanfrage bereits eine
        // andere Aufnahme gestartet - nicht ueberschreiben.
        displayStream.getTracks().forEach((track) => track.stop())
        micTrack?.stop()
        return
      }
      const combinedStream = new MediaStream([
        ...displayStream.getTracks(),
        ...(micTrack ? [micTrack] : []),
      ])
      stream = combinedStream
      const mimeType = pickMimeType()
      const activeRecorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined)
      chunks = []
      activeRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      // Der Nutzer kann die Freigabe auch ueber die BROWSER-EIGENE Leiste
      // ("Freigabe beenden") stoppen statt ueber unseren Aufnahme-Button -
      // ohne diesen Listener wuerde recorder.state faelschlich "recording"
      // bleiben (isRecording() luege) und stop() nie automatisch ausgeloest.
      const [track] = displayStream.getVideoTracks()
      track.addEventListener('ended', () => {
        if (activeRecorder.state !== 'inactive') activeRecorder.stop()
      })
      recorder = activeRecorder
      activeRecorder.start()
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
        if (activeRecorder.state !== 'inactive') activeRecorder.stop()
      })
    },
  }
}
