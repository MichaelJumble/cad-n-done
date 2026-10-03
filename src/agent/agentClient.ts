import * as Blockly from 'blockly'
import { executeTool } from './toolExecutor'
import { AGENT_TOOLS } from './tools'
import { generateCode, describeTopLevelBlocks } from '../codegen'
import type {
  AgentContentBlock,
  AgentProvider,
  AgentStopReason,
  AgentToolResult,
  AgentTurnRequest,
  AgentTurnResponse,
} from '../types'

// Getrennte Node-RED-Flows pro Anbieter (siehe src/nodered/flow-claude.json
// und flow-chatgpt.json) - keine gemeinsame Logik/Verdrahtung zwischen
// Claude und ChatGPT mehr, daher auch zwei eigene Endpunkte statt eines
// gemeinsamen mit provider-Feld.
const AGENT_ENDPOINTS: Record<AgentProvider, string> = {
  claude: 'https://ctest.cad-n-done.de/rest/cadndone/assistant/claude',
  chatgpt: 'https://ctest.cad-n-done.de/rest/cadndone/assistant/chatgpt',
}

// Rein optische Pause zwischen Bau-Schritten, damit man dem Agenten beim
// Bauen "zusehen" kann. Der komplette Plan liegt zu diesem Zeitpunkt schon
// lokal vor (ein einziger API-Aufruf, siehe unten) — die Verzoegerung
// passiert rein clientseitig, kostet also nichts.
const STEP_PACING_MS = 500

export interface AgentRunCallbacks {
  onText?(text: string): void
  onThinking?(text: string): void
  onToolUse?(name: string, input: Record<string, unknown>): void
  onToolResult?(name: string, result: AgentToolResult): void
  onDone?(reason: AgentStopReason): void
  onError?(message: string): void
}

export interface AgentClient {
  /** Startet einen neuen Bau-Vorgang ausgehend von `userMessage` mit dem
   *  gerade im Panel gewaehlten KI-Anbieter. */
  start(userMessage: string, provider: AgentProvider): void
  /** Verwirft den aktuell laufenden Vorgang - noch ausstehende Antworten
   *  oder Schritte werden ignoriert (siehe requestSeq-Muster in
   *  viewerPanel.ts). */
  stop(): void
}

interface PlanStep {
  id: string
  tool: string
  input: Record<string, unknown>
}

// Nur diese Feldnamen tragen jemals eine Schritt-id (siehe tools.ts). Ein
// (schwaecheres) Modell hat schon mal aus Versehen den Bezeichner eines
// FRUEHEREN Schritts in ein voellig anderes Feld geschrieben, z.B. als
// "type": "<id des Hut-Zylinder-Schritts>" statt "type": "cylinder" - eine
// blinde, feldunabhaengige Ersetzung wuerde das dann klaglos in eine echte,
// aber im Kontext voellig sinnlose block_id verwandeln und den eigentlichen
// Fehler (das Modell hat sich vertan) hinter einer gueltig aussehenden id
// verstecken. Deshalb wird nur in den tatsaechlichen Referenz-Feldern
// ersetzt - alle anderen Werte (type, colour, name, ...) bleiben unberuehrt
// und ein solcher Fehler des Modells bleibt als klar erkennbarer,
// unbekannter Wert sichtbar.
const REFERENCE_FIELDS = new Set([
  'child_block_id',
  'child_block_ids',
  'body_block_ids',
  'block_id',
])

function resolveStepRefs(
  input: Record<string, unknown>,
  idMap: Map<string, string>,
): Record<string, unknown> {
  function resolveValue(value: unknown): unknown {
    if (typeof value === 'string') return idMap.get(value) ?? value
    if (Array.isArray(value)) return value.map(resolveValue)
    return value
  }
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    resolved[key] = REFERENCE_FIELDS.has(key) ? resolveValue(value) : value
  }
  return resolved
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Liest eine lesbare Fehlermeldung aus, egal ob body.error ein String ist
 *  (unser eigener {error: "..."}-Fehlerform, siehe Node-RED) oder ein
 *  verschachteltes Objekt mit .message (z.B. wenn eine rohe Claude-
 *  Fehlerantwort durchrutscht, {error: {type, message}}). */
function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error: unknown }).error
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message)
    }
  }
  return fallback
}

async function postTurn(request: AgentTurnRequest): Promise<AgentTurnResponse> {
  const response = await fetch(AGENT_ENDPOINTS[request.provider], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const body: unknown = await response.json()
  if (!response.ok) {
    throw new Error(extractErrorMessage(body, `HTTP ${response.status}`))
  }
  // Verteidigung gegen falsch geformte "erfolgreiche" Antworten (z.B. wenn
  // Node-RED eine Claude-Fehlerantwort versehentlich mit statusCode 200
  // durchreicht) - ohne diese Pruefung wuerde der Aufrufer beim Iterieren
  // von .content unbemerkt abstuerzen, statt den Fehler dem UI zu melden.
  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as { content?: unknown }).content)
  ) {
    throw new Error(extractErrorMessage(body, 'Unerwartete Antwortform vom Server.'))
  }
  return body as AgentTurnResponse
}

/** Baut den Client fuer den agentischen Bau-Loop — bewusst auf genau 2
 *  API-Aufrufe pro Bauvorgang begrenzt, unabhaengig von der Schrittzahl
 *  (jeder zusaetzliche Zug in einem klassischen Tool-Use-Loop wuerde die
 *  komplette bisherige Historie erneut mitschicken und die Kosten schnell
 *  in die Hoehe treiben — siehe tools.ts):
 *
 *  1. Beschreibung + aktueller Workspace-Code -> Claude liefert den
 *     KOMPLETTEN Bauplan in einem einzigen build_plan-Tool-Aufruf zurueck.
 *  2. Der Plan wird lokal Schritt fuer Schritt ausgefuehrt — kein
 *     Netzwerkverkehr dabei, jeder Schritt fuehrt eine echte
 *     Blockly-Mutation aus (toolExecutor.ts); die "live bauen"-Optik
 *     entsteht rein clientseitig durch eine kleine Pause zwischen den
 *     Schritten (STEP_PACING_MS).
 *  3. Der resultierende Code geht ein zweites (und letztes) Mal an Claude,
 *     als tool_result des build_plan-Aufrufs (von der API zwingend
 *     verlangt, da Zug 1 mit einem offenen tool_use endete) — die Antwort
 *     liefert die abschliessende Zusammenfassung. */
export function createAgentClient(
  workspace: Blockly.WorkspaceSvg,
  locale: string,
  callbacks: AgentRunCallbacks,
): AgentClient {
  let runId = 0

  /** Aeusseres Sicherheitsnetz: run() erwartet zwar, dass Fehler ueber die
   *  beiden try/catch-Bloecke um postTurn() abgefangen werden, aber ein
   *  unerwarteter Fehler ANDERSWO im Ablauf (z.B. generateCode() oder die
   *  Schritt-Ausfuehrung) darf niemals als unbehandelte Promise-Ablehnung
   *  enden - das Panel bliebe sonst dauerhaft im "laeuft"-Zustand haengen,
   *  ohne dass der Nutzer je einen Fehler zu sehen bekommt. */
  async function run(myRunId: number, userMessage: string, provider: AgentProvider): Promise<void> {
    try {
      await runInner(myRunId, userMessage, provider)
    } catch (err) {
      if (myRunId !== runId) return
      callbacks.onError?.(err instanceof Error ? err.message : String(err))
    }
  }

  async function runInner(
    myRunId: number,
    userMessage: string,
    provider: AgentProvider,
  ): Promise<void> {
    const { code: currentCode } = generateCode(workspace)
    const contextParts: string[] = []
    if (currentCode.trim()) {
      contextParts.push(
        `Aktueller Workspace-Code (bereits vorhanden, ggf. erweitern statt neu anfangen):\n${currentCode}`,
      )
    }
    // Reale block_ids der schon vorhandenen Top-Level-Objekte mitschicken -
    // fuer einen Folgeauftrag ("faerbe den Hut ein") gibt es sonst keine
    // Moeglichkeit, ein bestehendes Objekt zu referenzieren: die Schritt-
    // eigenen "id"s aus resolveStepRefs gelten nur INNERHALB des jeweiligen
    // Bauplans, nicht ueber mehrere Bau-Vorgaenge hinweg (siehe
    // describeTopLevelBlocks.ts).
    const blockSummaries = describeTopLevelBlocks(workspace)
    if (blockSummaries.length) {
      const listing = blockSummaries.map((b) => `- ${b.id}: ${b.preview}`).join('\n')
      contextParts.push(
        `Vorhandene Top-Level-Objekte im Workspace (echte block_id: Code-Vorschau). Um eines davon zu VERAENDERN (z.B. einzufaerben, zu verschieben, zu loeschen), referenziere GENAU eine dieser block_id direkt als child_block_id/block_id in deinem Plan. Erfinde NIEMALS eine eigene id fuer ein bereits existierendes Objekt - eine selbst gewaehlte "id" darfst du nur fuer NEU in diesem Plan erzeugte Schritte vergeben.\n${listing}`,
      )
    }
    const promptWithContext = contextParts.length
      ? `${userMessage}\n\n---\n${contextParts.join('\n\n---\n')}`
      : userMessage

    let planResponse: AgentTurnResponse
    try {
      planResponse = await postTurn({
        messages: [{ role: 'user', content: promptWithContext }],
        tools: AGENT_TOOLS,
        locale,
        provider,
      })
    } catch (err) {
      if (myRunId !== runId) return
      callbacks.onError?.(err instanceof Error ? err.message : String(err))
      return
    }
    if (myRunId !== runId) return

    for (const block of planResponse.content) {
      if (block.type === 'text') callbacks.onText?.(block.text)
      else if (block.type === 'thinking') callbacks.onThinking?.(block.thinking)
    }

    const planCall = planResponse.content.find(
      (block): block is Extract<AgentContentBlock, { type: 'tool_use' }> =>
        block.type === 'tool_use' && block.name === 'build_plan',
    )

    if (!planCall) {
      // Claude hat keinen Bauplan geliefert (z.B. reine Rueckfrage) — nichts
      // zu tun, kein zweiter Aufruf noetig.
      callbacks.onDone?.(planResponse.stop_reason)
      return
    }

    const steps = Array.isArray(planCall.input.steps) ? (planCall.input.steps as PlanStep[]) : []
    const idMap = new Map<string, string>()
    // Fehlgeschlagene Schritte werden gesammelt, damit die abschliessende
    // Zusammenfassung (Zug 2) sie tatsaechlich kennt - der Review-Zug sieht
    // sonst NUR den fertigen OpenSCAD-Code, und ein fehlgeschlagener Schritt
    // hinterlaesst dort keine Spur (er wird einfach ausgelassen), sodass ein
    // teilweise fehlgeschlagener Bau als voller Erfolg zusammengefasst wurde.
    const failures: string[] = []

    for (const step of steps) {
      if (myRunId !== runId) return
      const resolvedInput = resolveStepRefs(step.input ?? {}, idMap)
      callbacks.onToolUse?.(step.tool, resolvedInput)
      const result = await executeTool(workspace, step.tool, resolvedInput)
      if (myRunId !== runId) return
      callbacks.onToolResult?.(step.tool, result)
      if (result.ok && result.block_id) idMap.set(step.id, result.block_id)
      if (!result.ok)
        failures.push(`- ${step.tool}(${JSON.stringify(resolvedInput)}): ${result.error}`)
      await delay(STEP_PACING_MS)
    }

    const { code: finalCode } = generateCode(workspace)
    const failureNote = failures.length
      ? `\n\nACHTUNG: ${failures.length} von ${steps.length} Schritten sind fehlgeschlagen und wurden NICHT gebaut:\n${failures.join('\n')}\n`
      : ''
    let reviewResponse: AgentTurnResponse
    try {
      reviewResponse = await postTurn({
        messages: [
          { role: 'user', content: promptWithContext },
          { role: 'assistant', content: planResponse.content },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: planCall.id,
                content: `Plan umgesetzt. Aktueller OpenSCAD-Code:\n\n${finalCode}${failureNote}\n\nFasse in wenigen Saetzen ehrlich zusammen, was gebaut wurde, und weise dabei explizit auf die oben genannten fehlgeschlagenen Schritte hin, falls es welche gab.`,
              },
            ],
          },
        ],
        tools: [],
        locale,
        provider,
      })
    } catch (err) {
      if (myRunId !== runId) return
      callbacks.onError?.(err instanceof Error ? err.message : String(err))
      return
    }
    if (myRunId !== runId) return

    for (const block of reviewResponse.content) {
      if (block.type === 'text') callbacks.onText?.(block.text)
    }
    callbacks.onDone?.(reviewResponse.stop_reason)
  }

  return {
    start(userMessage: string, provider: AgentProvider): void {
      runId += 1
      void run(runId, userMessage, provider)
    },
    stop(): void {
      runId += 1
    },
  }
}
