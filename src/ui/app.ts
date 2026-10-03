import { makeResizable } from './resizable'
import { makePopout, type PopoutHandle } from './popout'
import { mountInfoDialog } from './infoDialog'
import { mountRecordingDialog } from './recordingDialog'
import { createTabRecorder } from './tabRecorder'
import { getProjectName, setProjectName } from './projectName'
import {
  CAMERA_ICON_SVG,
  RECORD_RESUME_ICON_SVG,
  MIC_ICON_SVG,
  buildRecordingFilename,
} from './viewerPanel'
import { t, getLocale, setLocale, SUPPORTED_LOCALES, type Locale } from '../i18n'
import { getTheme, setTheme, SUPPORTED_THEMES, type ThemeName } from './theme'
import {
  getBlockRenderer,
  setBlockRenderer,
  SUPPORTED_BLOCK_RENDERERS,
  type BlockRenderer,
} from '../editor/blockRenderer'

/** DOM-Container/-Elemente, in die andere Schichten (Editor, Codegen, Viewer) ihren Inhalt mounten. */
export interface AppShellRoots {
  editorRoot: HTMLElement
  codeRoot: HTMLElement
  viewerRoot: HTMLElement
  agentRoot: HTMLElement
  undoBtn: HTMLButtonElement
  redoBtn: HTMLButtonElement
  openDesignBtn: HTMLButtonElement
  samplesBtn: HTMLButtonElement
  importDesignBtn: HTMLButtonElement
  importSvgBtn: HTMLButtonElement
  importTracePhotoBtn: HTMLButtonElement
  importStlBtn: HTMLButtonElement
  importBlockscadBtn: HTMLButtonElement
  arrangeBlocksBtn: HTMLButtonElement
  exportPngBtn: HTMLButtonElement
  saveDesignBtn: HTMLButtonElement
  saveDesignIconBtn: HTMLButtonElement
  deleteDesignBtn: HTMLButtonElement
  viewerPopout: PopoutHandle
  /** Setzt Projektname (Eingabefeld + Persistenz) — genutzt beim "Laden", um
   *  Name/Zaehler aus der geladenen Datei wieder im Header anzuzeigen. */
  setProjectNameValue: (name: string) => void
  /** Setzt den Kopf-Zaehler (intern + Anzeige) — genutzt beim "Laden". */
  setCounterValue: (value: number) => void
}

const LOCALE_LABELS: Record<Locale, string> = { de: 'Deutsch', en: 'English' }
const THEME_LABEL_KEYS: Record<ThemeName, 'theme.default' | 'theme.dark' | 'theme.contrast'> = {
  default: 'theme.default',
  dark: 'theme.dark',
  contrast: 'theme.contrast',
}
const BLOCK_RENDERER_LABEL_KEYS: Record<
  BlockRenderer,
  | 'block_renderer.geras'
  | 'block_renderer.zelos'
  | 'block_renderer.metallic'
  | 'block_renderer.steampunk'
> = {
  geras: 'block_renderer.geras',
  zelos: 'block_renderer.zelos',
  metallic: 'block_renderer.metallic',
  steampunk: 'block_renderer.steampunk',
}

// Unicode-Klammern-Kandidaten fuers Code-Icon rendern in manchen Umgebungen
// als Tofu-Box (siehe Kopieren-Button im Code-Panel) — deshalb hier ein
// Inline-SVG statt eines Textzeichens.
const CODE_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M5 4L1.5 8L5 12"/><path d="M11 4L14.5 8L11 12"/></svg>'
// Sprechblase fuers KI-Assistent-Panel — gleiche Begruendung wie beim
// Code-Icon (Unicode-Tofu-Risiko in manchen Umgebungen).
const AGENT_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M2 3.5h12v7H6.5L3 13.5v-3H2z" stroke-linejoin="round"/></svg>'
// Gleiches Icon wie der "Einbetten"-Zustand des Auslager-Buttons in
// viewerPanel.ts (dorthin ausgelagert, sobald die Vorschau in ihrem eigenen
// Fenster laeuft, siehe wireViewerPopoutRestoreButton unten) — hier als
// eigene Kopie, da dieser Button im Hauptfenster bleibt und daher nicht auf
// ein Modul zugreifen kann, dessen Markup gerade im Popup-Fenster sitzt.
const RESTORE_VIEWER_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3"/><path d="M8 3v4h4"/><path d="M14 1L8 7"/></svg>'
// Diskette fuers Speichern-Icon neben Projektname/Zaehler — gleiche
// Begruendung wie oben (Unicode-Tofu-Risiko), daher Inline-SVG statt 💾.
const SAVE_ICON_SVG =
  '<svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M2 2h9l3 3v9H2V2z" stroke-linejoin="round" stroke-linecap="round"/><path d="M4.5 2v4h6V2"/><path d="M4.5 14v-5h7v5"/></svg>'

/**
 * App-Layout angelehnt an BlockSCAD: Editor (Blockly verwaltet Toolbox +
 * Canvas selbst als eine Einheit), bei Bedarf Code und ganz rechts die
 * 3D-Vorschau (auch als externes Popup-Fenster). Panel-Inhalte ausserhalb
 * des Editors sind vor Phase 3/5 bewusst leer.
 */
export function renderAppShell(root: HTMLElement): AppShellRoots {
  root.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <div class="menu-wrapper">
          <button type="button" class="btn menu-btn" id="menu-btn" aria-haspopup="true" aria-expanded="false">
            ${t('menu.button')}
          </button>
          <div class="menu-dropdown" id="menu-dropdown" hidden>
            <div class="menu-section">
              <button type="button" class="menu-item" id="home-menu-item">${t('menu.home')}</button>
            </div>
            <div class="menu-section">
              <span class="menu-label">${t('menu.file_section')}</span>
              <button type="button" class="menu-item" id="open-design-menu-item">${t('menu.open')}</button>
              <button type="button" class="menu-item" id="save-design-menu-item">${t('menu.save')}</button>
              <button type="button" class="menu-item" id="delete-design-menu-item">${t('menu.delete')}</button>
            </div>
            <div class="menu-section">
              <span class="menu-label">${t('menu.import_section')}</span>
              <button type="button" class="menu-item" id="import-design-menu-item">${t('menu.import')}</button>
              <button type="button" class="menu-item" id="import-svg-menu-item">${t('menu.import_svg')}</button>
              <button type="button" class="menu-item" id="import-trace-photo-menu-item">${t('menu.trace_photo')}</button>
              <button type="button" class="menu-item" id="import-stl-menu-item">${t('menu.import_stl')}</button>
              <button type="button" class="menu-item" id="import-blockscad-menu-item">${t('menu.import_blockscad')}</button>
            </div>
            <div class="menu-section">
              <span class="menu-label">${t('menu.design_section')}</span>
              <button type="button" class="menu-item" id="arrange-blocks-menu-item">${t('menu.arrange_blocks')}</button>
              <button type="button" class="menu-item" id="export-png-menu-item">${t('menu.export_png')}</button>
            </div>
            <div class="menu-section">
              <label class="menu-label" for="language-select">${t('menu.language')}</label>
              <select class="menu-select" id="language-select">
                ${SUPPORTED_LOCALES.map((locale) => `<option value="${locale}">${LOCALE_LABELS[locale]}</option>`).join('')}
              </select>
            </div>
            <div class="menu-section">
              <label class="menu-label" for="theme-select">${t('menu.theme')}</label>
              <select class="menu-select" id="theme-select">
                ${SUPPORTED_THEMES.map((theme) => `<option value="${theme}">${t(THEME_LABEL_KEYS[theme])}</option>`).join('')}
              </select>
            </div>
            <div class="menu-section">
              <label class="menu-label" for="block-renderer-select">${t('menu.block_renderer')}</label>
              <select class="menu-select" id="block-renderer-select">
                ${SUPPORTED_BLOCK_RENDERERS.map((renderer) => `<option value="${renderer}">${t(BLOCK_RENDERER_LABEL_KEYS[renderer])}</option>`).join('')}
              </select>
            </div>
            <div class="menu-section">
              <button type="button" class="menu-item" id="samples-menu-item">${t('menu.samples')}</button>
            </div>
            <div class="menu-section">
              <button type="button" class="menu-item" id="info-menu-item">${t('menu.info')}</button>
            </div>
          </div>
        </div>
        <div class="header-actions">
          <button type="button" class="btn btn-icon" id="undo-btn" title="${t('undo')}" aria-label="${t('undo')}" disabled>
            ↶
          </button>
          <button type="button" class="btn btn-icon" id="redo-btn" title="${t('redo')}" aria-label="${t('redo')}" disabled>
            ↷
          </button>
        </div>
        <h1>${t('app.title')}</h1>
        <input
          type="text"
          class="project-name-input"
          id="project-name-input"
          placeholder="${t('project.name_placeholder')}"
        />
        <div class="counter" id="project-counter">
          <input
            type="text"
            inputmode="numeric"
            class="counter-value"
            id="counter-value"
            value="000"
            aria-label="${t('counter.value')}"
          />
          <div class="counter-arrows">
            <button
              type="button"
              class="counter-arrow-btn"
              id="counter-up-btn"
              aria-label="${t('counter.increase')}"
            >
              ▲
            </button>
            <button
              type="button"
              class="counter-arrow-btn"
              id="counter-down-btn"
              aria-label="${t('counter.decrease')}"
            >
              ▼
            </button>
          </div>
        </div>
        <button type="button" class="btn btn-icon" id="save-design-icon-btn" title="${t('menu.save')}" aria-label="${t('menu.save')}">${SAVE_ICON_SVG}</button>
        <div class="header-spacer"></div>
        <div class="header-actions">
          <div class="menu-wrapper" id="record-tab-menu-wrapper">
            <button type="button" class="btn btn-icon" id="record-tab-menu-btn" aria-haspopup="true" aria-expanded="false" aria-pressed="false" title="${t('tab_recording.start')}" aria-label="${t('tab_recording.start')}">${CAMERA_ICON_SVG}</button>
            <div class="menu-dropdown record-menu-dropdown" id="record-tab-menu-dropdown" hidden>
              <button type="button" class="btn btn-icon" id="record-tab-btn" aria-pressed="false" title="${t('tab_recording.start')}" aria-label="${t('tab_recording.start')}">${CAMERA_ICON_SVG}</button>
              <button type="button" class="btn btn-icon" id="record-tab-pause-btn" aria-pressed="false" title="${t('tab_recording.pause')}" aria-label="${t('tab_recording.pause')}" hidden>⏸</button>
              <button type="button" class="btn btn-icon" id="record-tab-mic-btn" aria-pressed="false" title="${t('tab_recording.mic')}" aria-label="${t('tab_recording.mic')}">${MIC_ICON_SVG}</button>
            </div>
          </div>
          <button type="button" class="btn btn-icon" id="toggle-agent-btn" aria-pressed="false" title="${t('toggle_agent.show')}" aria-label="${t('toggle_agent.show')}">${AGENT_ICON_SVG}</button>
          <button type="button" class="btn btn-icon" id="toggle-code-btn" aria-pressed="false" title="${t('toggle_code.show')}" aria-label="${t('toggle_code.show')}">${CODE_ICON_SVG}</button>
          <button type="button" class="btn btn-icon" id="restore-viewer-btn" title="${t('restore_viewer.show')}" aria-label="${t('restore_viewer.show')}" hidden>${RESTORE_VIEWER_ICON_SVG}</button>
        </div>
      </header>
      <main class="app-layout">
        <section class="panel panel-editor" id="panel-editor" aria-label="Editor">
          <div class="panel-body" id="editor-root"></div>
        </section>

        <div class="resizer resizer-vertical" id="resizer-code" role="separator" aria-orientation="vertical" hidden></div>
        <section class="panel panel-code" id="panel-code" aria-label="${t('panel.code')}" hidden>
          <h2 class="panel-title">${t('panel.code')}</h2>
          <div class="panel-body" id="code-root"></div>
        </section>

        <div class="resizer resizer-vertical" id="resizer-viewer" role="separator" aria-orientation="vertical"></div>
        <section class="panel panel-viewer" id="panel-viewer" aria-label="${t('panel.viewer')}">
          <div class="panel-body" id="viewer-root"></div>
        </section>

        <div class="resizer resizer-vertical" id="resizer-agent" role="separator" aria-orientation="vertical" hidden></div>
        <section class="panel panel-agent" id="panel-agent" aria-label="${t('panel.agent')}" hidden>
          <h2 class="panel-title">${t('panel.agent')}</h2>
          <div class="panel-body" id="agent-root"></div>
        </section>
      </main>
    </div>
  `

  wireMenu(root)
  wireLanguageSelect(root)
  wireThemeSelect(root)
  wireBlockRendererSelect(root)
  wireHomeMenuItem(root)
  wireInfoMenuItem(root)
  wireMenuItemCloseOnClick(root, 'open-design-menu-item')
  wireMenuItemCloseOnClick(root, 'samples-menu-item')
  wireMenuItemCloseOnClick(root, 'import-design-menu-item')
  wireMenuItemCloseOnClick(root, 'import-svg-menu-item')
  wireMenuItemCloseOnClick(root, 'import-trace-photo-menu-item')
  wireMenuItemCloseOnClick(root, 'import-stl-menu-item')
  wireMenuItemCloseOnClick(root, 'import-blockscad-menu-item')
  wireMenuItemCloseOnClick(root, 'arrange-blocks-menu-item')
  wireMenuItemCloseOnClick(root, 'export-png-menu-item')
  wireMenuItemCloseOnClick(root, 'save-design-menu-item')
  wireMenuItemCloseOnClick(root, 'delete-design-menu-item')
  const projectNameHandle = wireProjectName(root)
  const counterHandle = wireCounter(root)
  wireCodeToggle(root)
  wireAgentToggle(root)
  wireTabRecording(root)
  wireResizers(root)
  const viewerPopout = wireViewerPopout(root)

  return {
    editorRoot: root.querySelector<HTMLElement>('#editor-root')!,
    codeRoot: root.querySelector<HTMLElement>('#code-root')!,
    viewerRoot: root.querySelector<HTMLElement>('#viewer-root')!,
    agentRoot: root.querySelector<HTMLElement>('#agent-root')!,
    undoBtn: root.querySelector<HTMLButtonElement>('#undo-btn')!,
    redoBtn: root.querySelector<HTMLButtonElement>('#redo-btn')!,
    openDesignBtn: root.querySelector<HTMLButtonElement>('#open-design-menu-item')!,
    samplesBtn: root.querySelector<HTMLButtonElement>('#samples-menu-item')!,
    importDesignBtn: root.querySelector<HTMLButtonElement>('#import-design-menu-item')!,
    importSvgBtn: root.querySelector<HTMLButtonElement>('#import-svg-menu-item')!,
    importTracePhotoBtn: root.querySelector<HTMLButtonElement>('#import-trace-photo-menu-item')!,
    importStlBtn: root.querySelector<HTMLButtonElement>('#import-stl-menu-item')!,
    importBlockscadBtn: root.querySelector<HTMLButtonElement>('#import-blockscad-menu-item')!,
    arrangeBlocksBtn: root.querySelector<HTMLButtonElement>('#arrange-blocks-menu-item')!,
    exportPngBtn: root.querySelector<HTMLButtonElement>('#export-png-menu-item')!,
    saveDesignBtn: root.querySelector<HTMLButtonElement>('#save-design-menu-item')!,
    saveDesignIconBtn: root.querySelector<HTMLButtonElement>('#save-design-icon-btn')!,
    deleteDesignBtn: root.querySelector<HTMLButtonElement>('#delete-design-menu-item')!,
    viewerPopout,
    setProjectNameValue: projectNameHandle.setValue,
    setCounterValue: counterHandle.setValue,
  }
}

function wireMenu(root: HTMLElement): void {
  const menuWrapper = root.querySelector<HTMLDivElement>('.menu-wrapper')!
  const menuBtn = root.querySelector<HTMLButtonElement>('#menu-btn')!
  const menuDropdown = root.querySelector<HTMLDivElement>('#menu-dropdown')!

  function closeMenu(): void {
    menuDropdown.hidden = true
    menuBtn.setAttribute('aria-expanded', 'false')
  }

  // Feste CSS-Hoehe waere entweder auf kleinen Fenstern zu hoch (Menue ragt
  // unten aus dem Viewport) oder auf grossen Fenstern unnoetig knapp - daher
  // hier bei jedem Oeffnen aus der tatsaechlich verbleibenden Fensterhoehe ab
  // dem Menue-Rand berechnet (samt etwas Abstand zum unteren Fensterrand).
  function updateMenuMaxHeight(): void {
    const top = menuDropdown.getBoundingClientRect().top
    menuDropdown.style.maxHeight = `${window.innerHeight - top - 16}px`
  }

  menuBtn.addEventListener('click', () => {
    const willOpen = menuDropdown.hidden
    menuDropdown.hidden = !willOpen
    menuBtn.setAttribute('aria-expanded', String(willOpen))
    if (willOpen) updateMenuMaxHeight()
  })

  document.addEventListener('click', (event) => {
    if (!menuDropdown.hidden && !menuWrapper.contains(event.target as Node)) closeMenu()
  })
}

function wireLanguageSelect(root: HTMLElement): void {
  const select = root.querySelector<HTMLSelectElement>('#language-select')!
  select.value = getLocale()
  select.addEventListener('change', () => setLocale(select.value as Locale))
}

function wireThemeSelect(root: HTMLElement): void {
  const select = root.querySelector<HTMLSelectElement>('#theme-select')!
  select.value = getTheme()
  select.addEventListener('change', () => setTheme(select.value as ThemeName))
}

function wireBlockRendererSelect(root: HTMLElement): void {
  const select = root.querySelector<HTMLSelectElement>('#block-renderer-select')!
  select.value = getBlockRenderer()
  select.addEventListener('change', () => setBlockRenderer(select.value as BlockRenderer))
}

function wireHomeMenuItem(root: HTMLElement): void {
  const homeBtn = root.querySelector<HTMLButtonElement>('#home-menu-item')!
  homeBtn.addEventListener('click', () => {
    window.location.href = 'index.html'
  })
}

function wireInfoMenuItem(root: HTMLElement): void {
  const menuDropdown = root.querySelector<HTMLDivElement>('#menu-dropdown')!
  const infoBtn = root.querySelector<HTMLButtonElement>('#info-menu-item')!
  const infoDialog = mountInfoDialog()

  infoBtn.addEventListener('click', () => {
    menuDropdown.hidden = true
    infoDialog.open()
  })
}

/** Schliesst das Hauptmenue beim Klick auf einen Menuepunkt, dessen
 *  eigentliche Logik erst in main.ts verdrahtet wird, sobald der
 *  Blockly-Workspace bereit ist (z.B. "Löschen", "Speichern"). */
function wireMenuItemCloseOnClick(root: HTMLElement, buttonId: string): void {
  const menuDropdown = root.querySelector<HTMLDivElement>('#menu-dropdown')!
  const button = root.querySelector<HTMLButtonElement>(`#${buttonId}`)!
  button.addEventListener('click', () => {
    menuDropdown.hidden = true
  })
}

function wireProjectName(root: HTMLElement): { setValue: (name: string) => void } {
  const input = root.querySelector<HTMLInputElement>('#project-name-input')!
  input.value = getProjectName()
  input.addEventListener('input', () => setProjectName(input.value))

  return {
    setValue(name: string): void {
      input.value = name
      setProjectName(name)
    },
  }
}

const COUNTER_STORAGE_KEY = 'blockscad-next:counter'

function wireCounter(root: HTMLElement): { setValue: (value: number) => void } {
  const valueInput = root.querySelector<HTMLInputElement>('#counter-value')!
  const downBtn = root.querySelector<HTMLButtonElement>('#counter-down-btn')!
  const upBtn = root.querySelector<HTMLButtonElement>('#counter-up-btn')!
  // Analog zu projectName.ts: der Zaehler soll wie der Projektname einen
  // Reload ueberleben, statt jedes Mal wieder bei 000 anzufangen.
  const stored = Number.parseInt(localStorage.getItem(COUNTER_STORAGE_KEY) ?? '', 10)
  let value = Number.isFinite(stored) ? Math.max(0, stored) : 0

  function render(): void {
    valueInput.value = String(value).padStart(3, '0')
    localStorage.setItem(COUNTER_STORAGE_KEY, String(value))
  }

  function commit(): void {
    const parsed = Number.parseInt(valueInput.value, 10)
    value = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
    render()
  }

  downBtn.addEventListener('click', () => {
    value = Math.max(0, value - 1)
    render()
  })
  upBtn.addEventListener('click', () => {
    value += 1
    render()
  })
  valueInput.addEventListener('input', () => {
    valueInput.value = valueInput.value.replace(/\D/g, '')
  })
  valueInput.addEventListener('blur', commit)
  valueInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') valueInput.blur()
  })

  render()

  return {
    setValue(newValue: number): void {
      value = Number.isFinite(newValue) ? Math.max(0, Math.trunc(newValue)) : 0
      render()
    },
  }
}

function wireCodeToggle(root: HTMLElement): void {
  const codePanel = root.querySelector<HTMLElement>('#panel-code')!
  const codeResizer = root.querySelector<HTMLElement>('#resizer-code')!
  const toggleBtn = root.querySelector<HTMLButtonElement>('#toggle-code-btn')!

  toggleBtn.addEventListener('click', () => {
    const willShow = codePanel.hidden
    codePanel.hidden = !willShow
    codeResizer.hidden = !willShow
    toggleBtn.setAttribute('aria-pressed', String(willShow))
    const label = willShow ? t('toggle_code.hide') : t('toggle_code.show')
    toggleBtn.title = label
    toggleBtn.setAttribute('aria-label', label)
  })
}

function wireAgentToggle(root: HTMLElement): void {
  const agentPanel = root.querySelector<HTMLElement>('#panel-agent')!
  const agentResizer = root.querySelector<HTMLElement>('#resizer-agent')!
  const toggleBtn = root.querySelector<HTMLButtonElement>('#toggle-agent-btn')!

  toggleBtn.addEventListener('click', () => {
    const willShow = agentPanel.hidden
    agentPanel.hidden = !willShow
    agentResizer.hidden = !willShow
    toggleBtn.setAttribute('aria-pressed', String(willShow))
    const label = willShow ? t('toggle_agent.hide') : t('toggle_agent.show')
    toggleBtn.title = label
    toggleBtn.setAttribute('aria-label', label)
  })
}

/** Nimmt (anders als der Aufnahme-Button im Viewer, der nur den reinen
 *  3D-Canvas erfasst) den gesamten Browser-Tab auf — inkl. Bloecke-Editor,
 *  Toolbox und Customizer-Overlay, die auf dem WebGL-Canvas selbst gar nicht
 *  existieren (siehe tabRecorder.ts). Startet erst NACH einem Berechtigungs-
 *  dialog des Browsers, kann also vom Nutzer dort abgebrochen werden. */
function wireTabRecording(root: HTMLElement): void {
  const menuWrapper = root.querySelector<HTMLDivElement>('#record-tab-menu-wrapper')!
  const menuBtn = root.querySelector<HTMLButtonElement>('#record-tab-menu-btn')!
  const menuDropdown = root.querySelector<HTMLDivElement>('#record-tab-menu-dropdown')!
  const recordBtn = root.querySelector<HTMLButtonElement>('#record-tab-btn')!
  const pauseBtn = root.querySelector<HTMLButtonElement>('#record-tab-pause-btn')!
  const micBtn = root.querySelector<HTMLButtonElement>('#record-tab-mic-btn')!
  const recorder = createTabRecorder()

  // Kamera-Symbol oeffnet/schliesst nur noch das Mini-Menue mit den
  // eigentlichen Aufnahme-Reglern (Start/Stop, Pause, Mikrofon) - bleibt
  // waehrend einer laufenden Aufnahme bewusst offen (zeigt dann den
  // zusaetzlichen Pause-Knopf), schliesst sich nur durch erneuten Klick auf
  // das Kamera-Symbol selbst oder einen Klick ausserhalb (gleiches Muster
  // wie wireMenu() oben fuer das Hauptmenue).
  menuBtn.addEventListener('click', () => {
    const willOpen = menuDropdown.hidden
    menuDropdown.hidden = !willOpen
    menuBtn.setAttribute('aria-expanded', String(willOpen))
  })
  document.addEventListener('click', (event) => {
    // event.composedPath() statt menuWrapper.contains(event.target): der
    // Mikrofon-Knopf im Menue wird waehrend seines eigenen Klicks
    // deaktiviert (siehe micBtn.disabled weiter unten) - Chromium liefert
    // fuer .contains() im Rest DESSELBEN Event-Durchlaufs dann faelschlich
    // false, obwohl sich am DOM nichts geaendert hat. composedPath() ist
    // beim Dispatch bereits eingefroren und bleibt davon unberuehrt.
    if (!menuDropdown.hidden && !event.composedPath().includes(menuWrapper)) {
      menuDropdown.hidden = true
      menuBtn.setAttribute('aria-expanded', 'false')
    }
  })
  const recordingDialog = mountRecordingDialog({
    title: t('recording_dialog.title'),
    saveLabel: t('recording_dialog.save'),
    discardLabel: t('recording_dialog.discard'),
  })

  function setRecordingState(recording: boolean): void {
    recordBtn.setAttribute('aria-pressed', String(recording))
    const label = recording ? t('tab_recording.stop') : t('tab_recording.start')
    recordBtn.title = label
    recordBtn.setAttribute('aria-label', label)
    recordBtn.innerHTML = recording ? '⏹' : CAMERA_ICON_SVG
    pauseBtn.hidden = !recording
    setPauseState(false)
    // Waehrend der laufenden Aufnahme laesst sich die Tonspur nicht mehr
    // nachtraeglich hinzufuegen/entfernen.
    micBtn.disabled = recording
    // Das aeussere Kamera-Symbol (oeffnet/schliesst nur noch das Mini-Menue)
    // zeigt den Aufnahmestatus per aria-pressed weiterhin selbst an (rotes
    // Pulsieren, siehe layout.css) - sonst waere bei geschlossenem Menue gar
    // nicht mehr zu erkennen, dass gerade aufgezeichnet wird.
    menuBtn.setAttribute('aria-pressed', String(recording))
    menuBtn.title = label
    menuBtn.setAttribute('aria-label', label)
  }

  function setPauseState(paused: boolean): void {
    pauseBtn.setAttribute('aria-pressed', String(paused))
    const label = paused ? t('tab_recording.resume') : t('tab_recording.pause')
    pauseBtn.title = label
    pauseBtn.setAttribute('aria-label', label)
    pauseBtn.innerHTML = paused ? RECORD_RESUME_ICON_SVG : '⏸'
    recordBtn.classList.toggle('recording-paused', paused)
    menuBtn.classList.toggle('recording-paused', paused)
  }

  recordBtn.addEventListener('click', () => {
    if (recorder.isRecording()) {
      setRecordingState(false)
      void recorder.stop().then((blob) => {
        if (blob) recordingDialog.open(blob, buildRecordingFilename('_tab'))
      })
      return
    }
    recorder
      .start(micBtn.getAttribute('aria-pressed') === 'true')
      .then(() => setRecordingState(true))
      .catch(() => {
        // Nutzer hat den Freigabedialog abgebrochen (oder der Browser
        // unterstuetzt getDisplayMedia() nicht) - Button bleibt einfach im
        // Ausgangszustand, keine Fehlermeldung noetig fuer einen bewussten
        // Abbruch.
      })
  })
  micBtn.addEventListener('click', () => {
    micBtn.setAttribute('aria-pressed', String(micBtn.getAttribute('aria-pressed') !== 'true'))
  })
  pauseBtn.addEventListener('click', () => {
    if (recorder.isPaused()) {
      recorder.resume()
      setPauseState(false)
    } else {
      recorder.pause()
      setPauseState(true)
    }
  })
}

function wireResizers(root: HTMLElement): void {
  const codePanel = root.querySelector<HTMLElement>('#panel-code')!
  const codeResizer = root.querySelector<HTMLElement>('#resizer-code')!
  makeResizable(codeResizer, codePanel, { direction: 'row', min: 200, max: 900, reverse: true })

  const viewerPanel = root.querySelector<HTMLElement>('#panel-viewer')!
  const viewerResizer = root.querySelector<HTMLElement>('#resizer-viewer')!
  // max deutlich angehoben (war 1000) - die Vorschau soll sich bei Bedarf
  // (z.B. um genug Platz fuer das Customizer-Overlay UND das Modell
  // gleichzeitig zu haben) viel groesser ziehen lassen, ohne dafuer erst in
  // ein eigenes Fenster ausgelagert werden zu muessen.
  makeResizable(viewerResizer, viewerPanel, {
    direction: 'row',
    min: 240,
    max: 1800,
    reverse: true,
  })

  const agentPanel = root.querySelector<HTMLElement>('#panel-agent')!
  const agentResizer = root.querySelector<HTMLElement>('#resizer-agent')!
  makeResizable(agentResizer, agentPanel, { direction: 'row', min: 260, max: 900, reverse: true })
}

/** Baut nur das PopoutHandle (window.open-Logik) auf — der eigentliche
 *  Auslöse-Button sitzt in der ersten Icon-Zeile des Viewer-Panels selbst
 *  (viewerPanel.ts), nicht mehr im App-Header, da er inhaltlich zur
 *  3D-Vorschau gehört. Waehrend die Vorschau ausgelagert ist, wandert dieser
 *  Button aber MIT dem Panel-Markup ins Popup-Fenster (siehe makePopout) —
 *  im Hauptfenster gibt es dann keine Moeglichkeit mehr, sie zurueckzuholen,
 *  wenn das Popup-Fenster z.B. hinter anderen Fenstern verschwunden ist.
 *  Deshalb zusaetzlich hier ein zweiter, nur waehrend des Auslagerns
 *  sichtbarer Button im Header selbst (#restore-viewer-btn). */
function wireViewerPopout(root: HTMLElement): PopoutHandle {
  const viewerSection = root.querySelector<HTMLElement>('#panel-viewer')!
  const viewerBody = root.querySelector<HTMLElement>('#viewer-root')!
  const viewerResizer = root.querySelector<HTMLElement>('#resizer-viewer')!

  const popout = makePopout(viewerSection, viewerBody, viewerResizer)

  const restoreBtn = root.querySelector<HTMLButtonElement>('#restore-viewer-btn')!
  popout.onToggle((open) => {
    restoreBtn.hidden = !open
  })
  restoreBtn.addEventListener('click', () => popout.toggle())

  return popout
}
