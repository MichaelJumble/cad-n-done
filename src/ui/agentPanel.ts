import type { WorkspaceSvg } from 'blockly'
import { createAgentClient, type AgentRunCallbacks } from '../agent/agentClient'
import { t, getLocale } from '../i18n'
import type { AgentProvider } from '../types'

type LogKind = 'user' | 'text' | 'thinking' | 'tool' | 'error' | 'info'

const PROVIDER_STORAGE_KEY = 'blockscad-next:agentProvider'

function loadProvider(): AgentProvider {
  return localStorage.getItem(PROVIDER_STORAGE_KEY) === 'chatgpt' ? 'chatgpt' : 'claude'
}

export interface AgentPanelHandle {
  /** Bricht einen laufenden Bau-Vorgang ab und leert das Log — z.B. wenn
   *  "Neu" den Workspace zuruecksetzt: die alte Konversation bezieht sich
   *  dann auf nicht mehr existierende Bloecke und sollte nicht stehen bleiben. */
  clear(): void
}

/** Baut das KI-Bau-Assistent-Panel: Prompt-Eingabe, scrollendes Log
 *  (Kommentar/Tool-Aufrufe des Agenten) und Stop-Button. Die eigentliche
 *  Zug-Schleife (Node-RED-Anfragen, Tool-Ausfuehrung am Workspace) steckt in
 *  agentClient.ts/toolExecutor.ts — dieses Modul ist reine UI-Verdrahtung. */
export function mountAgentPanel(root: HTMLElement, workspace: WorkspaceSvg): AgentPanelHandle {
  root.innerHTML = `
    <div class="agent-panel">
      <div class="agent-provider-row">
        <button
          type="button"
          class="agent-provider-toggle"
          id="agent-provider-toggle"
          title="${t('agent.provider_toggle')}"
        ></button>
      </div>
      <div class="agent-log" id="agent-log"></div>
      <form class="agent-input-row" id="agent-form">
        <input
          type="text"
          class="agent-prompt-input"
          id="agent-prompt-input"
          placeholder="${t('agent.placeholder')}"
        />
        <button type="submit" class="btn btn-small" id="agent-start-btn">${t('agent.start')}</button>
        <button type="button" class="btn btn-small btn-danger" id="agent-stop-btn" hidden>${t('agent.stop')}</button>
      </form>
    </div>
  `

  const log = root.querySelector<HTMLDivElement>('#agent-log')!
  const form = root.querySelector<HTMLFormElement>('#agent-form')!
  const input = root.querySelector<HTMLInputElement>('#agent-prompt-input')!
  const startBtn = root.querySelector<HTMLButtonElement>('#agent-start-btn')!
  const stopBtn = root.querySelector<HTMLButtonElement>('#agent-stop-btn')!
  const providerToggleBtn = root.querySelector<HTMLButtonElement>('#agent-provider-toggle')!

  let provider: AgentProvider = loadProvider()
  function renderProvider(): void {
    providerToggleBtn.textContent = provider === 'chatgpt' ? 'ChatGPT' : 'Claude'
    providerToggleBtn.setAttribute('aria-pressed', String(provider === 'chatgpt'))
  }
  renderProvider()
  providerToggleBtn.addEventListener('click', () => {
    provider = provider === 'claude' ? 'chatgpt' : 'claude'
    localStorage.setItem(PROVIDER_STORAGE_KEY, provider)
    renderProvider()
  })

  function appendEntry(kind: LogKind, text: string): void {
    const entry = document.createElement('div')
    entry.className = `agent-log-entry agent-log-entry-${kind}`
    entry.textContent = text
    log.appendChild(entry)
    log.scrollTop = log.scrollHeight
  }

  function setRunning(running: boolean): void {
    input.disabled = running
    startBtn.hidden = running
    stopBtn.hidden = !running
    providerToggleBtn.disabled = running
  }

  const callbacks: AgentRunCallbacks = {
    onText: (text) => appendEntry('text', text),
    onThinking: (text) => appendEntry('thinking', text),
    onToolUse: (name, toolInput) => {
      appendEntry('tool', `${t('agent.tool_running')} ${name}(${JSON.stringify(toolInput)})`)
    },
    onToolResult: (name, result) => {
      if (!result.ok) appendEntry('error', `${name}: ${result.error}`)
    },
    onDone: () => setRunning(false),
    onError: (message) => {
      appendEntry('error', message)
      setRunning(false)
    },
  }

  const client = createAgentClient(workspace, getLocale(), callbacks)

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const message = input.value.trim()
    if (!message) return
    appendEntry('user', message)
    input.value = ''
    setRunning(true)
    client.start(message, provider)
  })

  stopBtn.addEventListener('click', () => {
    client.stop()
    setRunning(false)
    appendEntry('info', t('agent.stopped'))
  })

  return {
    clear(): void {
      client.stop()
      setRunning(false)
      log.innerHTML = ''
    },
  }
}
