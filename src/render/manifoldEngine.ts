/** Kapselt das Nachrichtenprotokoll des vendorten Manifold-OpenSCAD-Workers
 *  (siehe public/openscad-manifold/README.md fuer Herkunft/Patch) hinter
 *  einer promise-basierten API — ersetzt das alte `openscad-wasm`-npm-Paket
 *  (CGAL-Backend, ca. 10-90x langsamer bei verschachtelten Boolschen
 *  Operationen, siehe Performance-Untersuchung).
 *
 *  Der vendorte Worker ist ein KLASSISCHER (Nicht-ES-Modul-)Worker mit
 *  eigenem, undokumentiertem postMessage-Protokoll:
 *  Anfrage:  { inputs: {path, content?, url?}[], args: string[], outputPaths: string[] }
 *  Antwort:  laufend { stdout }/{ stderr }, am Ende { result: { outputs, exitCode, error?, mergedOutputs, elapsedMillis } }
 *
 *  Jede eingehende Nachricht erzeugt intern eine FRISCHE OpenSCAD-Instanz
 *  (verifiziert per Testskript: derselbe Worker kann fuer viele Render-
 *  Aufrufe hintereinander wiederverwendet werden, ohne dass Zustand
 *  zwischen ihnen durchsickert) — daher genuegt EIN Worker fuer alle
 *  Fragmente/Renders, statt wie beim alten CGAL-Paket pro Fragment eine
 *  neue Instanz zu erzeugen. */

export interface EngineInput {
  path: string
  /** Text-Inhalt (wird intern per TextEncoder in Bytes umgewandelt — NICHT
   *  fuer Binaerdaten wie Schriften/STL geeignet, dafuer `url` nutzen). */
  content?: string
  /** URL (auch blob:), von der Binaer- oder Text-Inhalt per fetch() gelesen wird. */
  url?: string
}

export interface EngineRunResult {
  outputs: Map<string, Uint8Array>
  /** Alle stderr-Zeilen zusammengefasst (fuer Fehlertext-Erkennung, z.B.
   *  "leeres Objekt" — analog zum alten printErr-basierten Sammeln). */
  mergedStderr: string
  exitCode: number | undefined
  error?: string
}

const WORKER_URL = `${import.meta.env.BASE_URL}openscad-manifold/openscad-worker.js`

// Sicherheitsnetz fuer sehr grosse Eingaben (z.B. eine 90+ MB STL-Datei):
// das daraus im WASM-Speicher aufgebaute Dreiecksnetz kann ein Vielfaches
// der Rohdateigroesse belegen. Laeuft der Emscripten-Heap dabei voll,
// bricht die Engine intern ab, OHNE je eine `result`-Nachricht zu senden -
// ohne Timeout wuerde die zugehoerige Promise (und damit der komplette
// Render) fuer immer haengen, ohne jede Fehlermeldung.
const ENGINE_TIMEOUT_MS = 120_000

let engineWorker: Worker | null = null
// Aktuell wartender Resolver (max. einer, da runOpenscad() Aufrufe seriell
// ueber `queue` abarbeitet) - erlaubt es dem worker-weiten error-Handler
// unten, einen haengenden Aufruf bei einem Engine-Absturz sofort mit einer
// Fehlermeldung aufzuloesen statt ihn ewig offen zu lassen.
let currentResolve: ((result: EngineRunResult) => void) | null = null

// Nach einem Absturz/Timeout wird der Worker verworfen statt weiterverwendet
// - sein interner Emscripten-Zustand ist nach einem Abbruch mitten in der
// Verarbeitung nicht mehr vertrauenswuerdig, und bei einem echten Haenger
// (synchrone WASM-Dauerschleife) bleibt er ohnehin dauerhaft unbrauchbar.
// naechster Aufruf erzeugt via getEngineWorker() einfach eine frische Instanz.
function resetEngineWorker(): void {
  engineWorker?.terminate()
  engineWorker = null
}

function getEngineWorker(): Worker {
  if (!engineWorker) {
    engineWorker = new Worker(WORKER_URL)
    engineWorker.addEventListener('error', (event) => {
      const message = `OpenSCAD-Engine abgestürzt (evtl. Datei zu groß): ${event.message || 'unbekannter Fehler'}`
      resetEngineWorker()
      currentResolve?.({
        outputs: new Map(),
        mergedStderr: '',
        exitCode: undefined,
        error: message,
      })
      currentResolve = null
    })
  }
  return engineWorker
}

// Der vendorte Worker beantwortet IMMER nur die zuletzt per postMessage
// hereingekommene Anfrage (kein Request-/Response-Korrelations-ID im
// Protokoll) - laeuft ein zweiter runOpenscad()-Aufruf los, WAEHREND der
// vorige noch auf seine Antwort wartet (z.B. ueberlappende Renders bei
// mehreren Farb-Fragmenten oder zwei schnell hintereinander ausgeloesten
// Auto-Renders), haengen ploetzlich ZWEI "message"-Listener gleichzeitig am
// selben Worker - beide bekommen JEDE Antwort und ordnen sie faelschlich
// ihrem eigenen Aufruf zu (fremde Geometrie/Farbe, "verschwundene" Fragmente).
// Deshalb hier strikt seriell ueber eine Promise-Kette statt parallel.
let queue: Promise<unknown> = Promise.resolve()

function runOpenscadSequential(
  inputs: EngineInput[],
  args: string[],
  outputPaths: string[],
): Promise<EngineRunResult> {
  const worker = getEngineWorker()
  return new Promise((resolve) => {
    const stderrParts: string[] = []
    const finish = (result: EngineRunResult): void => {
      worker.removeEventListener('message', handleMessage)
      clearTimeout(timeoutId)
      currentResolve = null
      resolve(result)
    }
    const handleMessage = (event: MessageEvent): void => {
      const data = event.data as { stdout?: string; stderr?: string; result?: unknown }
      if (data.stderr !== undefined) {
        stderrParts.push(data.stderr)
        return
      }
      if (data.stdout !== undefined) return
      if (data.result) {
        const result = data.result as {
          outputs?: [string, Uint8Array][]
          exitCode?: number
          error?: string
        }
        finish({
          outputs: new Map(result.outputs ?? []),
          mergedStderr: stderrParts.join('\n'),
          exitCode: result.exitCode,
          error: result.error,
        })
      }
    }
    const timeoutId = setTimeout(() => {
      resetEngineWorker()
      finish({
        outputs: new Map(),
        mergedStderr: stderrParts.join('\n'),
        exitCode: undefined,
        error: 'Zeitüberschreitung beim Rendern (evtl. Datei zu groß oder zu komplex)',
      })
    }, ENGINE_TIMEOUT_MS)
    currentResolve = finish
    worker.addEventListener('message', handleMessage)
    worker.postMessage({ inputs, args, outputPaths })
  })
}

/** Fuehrt einen einzelnen OpenSCAD-Aufruf im vendorten Manifold-Worker aus -
 *  wartet dabei, bis alle vorher angestossenen Aufrufe abgeschlossen sind
 *  (siehe Kommentar oben), statt parallel um denselben Worker zu wetteifern. */
export function runOpenscad(
  inputs: EngineInput[],
  args: string[],
  outputPaths: string[],
): Promise<EngineRunResult> {
  const result = queue.then(() => runOpenscadSequential(inputs, args, outputPaths))
  // Weiterlaufen lassen, auch wenn dieser Aufruf fehlschlaegt - sonst wuerde
  // ein einzelner Fehler die Warteschlange fuer alle folgenden Aufrufe blockieren.
  queue = result.catch(() => undefined)
  return result
}
