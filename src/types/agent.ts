/** Minimale, selbst gehaltene Nachbildung der fuer den Tool-Use-Loop
 *  benoetigten Anthropic-Messages-API-Formen — bewusst ohne Abhaengigkeit
 *  von @anthropic-ai/sdk (die App braucht nur diese wenigen Formen, der
 *  eigentliche API-Aufruf passiert ohnehin serverseitig in Node-RED). */
export type AgentContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string | AgentContentBlock[]
}

/** Welcher KI-Anbieter fuer den Bau-Agenten genutzt werden soll (Frontend-
 *  Toggle im Panel) — die eigentliche Uebersetzung in das jeweilige
 *  API-Format passiert serverseitig in Node-RED, das Frontend schickt fuer
 *  beide Anbieter dieselbe Nachrichten-/Werkzeugform. */
export type AgentProvider = 'claude' | 'chatgpt'

export interface AgentTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties: boolean
  }
}

/** Anfrage an den Node-RED-Endpunkt /rest/cadndone/assistant. Erster Zug:
 *  nur `message`. Ab Zug 2 (nach mindestens einem tool_use): `messages`
 *  traegt die komplette bisherige Historie, `message` bleibt weg. */
export interface AgentTurnRequest {
  message?: string
  messages?: AgentMessage[]
  tools: AgentTool[]
  locale: string
  provider: AgentProvider
}

export type AgentStopReason =
  'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'pause_turn' | 'refusal' | null

/** Antwort vom Node-RED-Endpunkt — bei Claude nahezu unveraendert
 *  durchgereicht, bei ChatGPT von Node-RED aus der Chat-Completions-Form in
 *  dieselbe Form uebersetzt (siehe "Konvertiere OpenAI Antwort" im Flow),
 *  damit das Frontend providerunabhaengig bleibt. */
export interface AgentTurnResponse {
  content: AgentContentBlock[]
  stop_reason: AgentStopReason
  usage?: { input_tokens: number; output_tokens: number }
}

export type AgentToolResult =
  { ok: true; block_id?: string; data?: unknown } | { ok: false; error: string }
