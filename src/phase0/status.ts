export function setStatus(id: string, ok: boolean, message: string): void {
  const el = document.querySelector<HTMLParagraphElement>(`[data-status="${id}"]`)
  if (!el) return
  el.textContent = (ok ? '✅ ' : '❌ ') + message
  el.dataset.ok = String(ok)
  console.log(`[phase0:${id}]`, ok ? 'OK' : 'FAIL', message)
}

export function setOutput(id: string, text: string): void {
  const el = document.querySelector<HTMLPreElement>(`#${id}`)
  if (!el) return
  el.textContent = text
}
