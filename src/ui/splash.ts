const splash = document.getElementById('splash')
const progressFill = document.getElementById('splash-progress-fill')
const statusText = document.getElementById('splash-status')

// Mindest-Anzeigedauer des Lade-Splashscreens: ist die App schneller fertig
// (der Regelfall), wird das Ausblenden bis zu dieser Marke zurueckgehalten,
// damit der Splash nicht nur als kurzes Aufblitzen wahrgenommen wird. Im
// Dev-Server uebersprungen (0ms) - der Splash blockiert bis zum tatsaechlichen
// Ausblenden JEDEN Klick auf die App (kein pointer-events:none vor
// "splash-hidden"), 5s bei jedem Reload waeren waehrend der Entwicklung
// unzumutbar.
const SPLASH_HOLD_MS = import.meta.env.DEV ? 0 : 5000
const splashLoadStart = performance.now()

/** Bewegt den Fortschrittsbalken des Lade-Splashscreens (Markup in startcadndone.html)
 *  auf `percent` (0-100) - an den tatsaechlichen Boot-Ablauf in main.ts
 *  gekoppelt, keine reine Zier-Animation. */
export function setSplashProgress(percent: number): void {
  if (progressFill) progressFill.style.width = `${percent}%`
}

/** Setzt den Statustext unter dem Titel (z.B. "3D-Engine wird gestartet…").
 *  Bewusst keine Framework-/Bibliotheksnamen (Blockly/OpenSCAD/WebAssembly) -
 *  verwirrt Leute, die damit nichts anfangen koennen. */
export function setSplashStatus(text: string): void {
  if (statusText) statusText.textContent = text
}

/** Blendet den Splashscreen aus, sobald die App interaktiv ist, und entfernt
 *  ihn danach komplett aus dem DOM. Wartet dabei mindestens SPLASH_HOLD_MS ab
 *  Seitenaufruf - ist die App frueher fertig (der Regelfall), wird das
 *  Ausblenden entsprechend zurueckgehalten. Ist SPLASH_HOLD_MS bereits
 *  verstrichen (langsame Verbindung), blendet sofort aus. */
export function hideSplash(): void {
  if (!splash) return
  setSplashProgress(100)
  const remaining = SPLASH_HOLD_MS - (performance.now() - splashLoadStart)
  setTimeout(
    () => {
      requestAnimationFrame(() => {
        splash.classList.add('splash-hidden')
        splash.addEventListener('transitionend', () => splash.remove(), { once: true })
      })
    },
    Math.max(0, remaining),
  )
}
