import type { WorkspaceSvg } from 'blockly'

function parseRgb(colour: string): [number, number, number] | null {
  const rgbMatch = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(colour)
  if (rgbMatch) return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])]
  const hexMatch = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour.trim())
  if (hexMatch) {
    return [parseInt(hexMatch[1], 16), parseInt(hexMatch[2], 16), parseInt(hexMatch[3], 16)]
  }
  return null
}

/** Mischt `colour` Richtung `target` (amount 0..1, 1 = komplett target). */
function mixTowards(colour: string, target: [number, number, number], amount: number): string {
  const rgb = parseRgb(colour)
  if (!rgb) return colour
  const mix = (channel: number, targetChannel: number): number =>
    Math.round(channel + (targetChannel - channel) * amount)
  return `rgb(${mix(rgb[0], target[0])}, ${mix(rgb[1], target[1])}, ${mix(rgb[2], target[2])})`
}

/** Hinterlegt jede Toolbox-Kategorie mit einer gedaempften Version ihrer
 *  eigenen Akzentfarbe (als CSS-Variable "--cat-tint", siehe layout.css) --
 *  Richtung der aktuellen Toolbox-HINTERGRUNDFARBE gemischt (nicht fest
 *  Richtung Weiss!), damit der Kontrast zum Text in JEDEM Theme passt: im
 *  Dunkel-Theme bleibt die Toenung dunkel (heller Text bleibt lesbar), im
 *  Hell-Theme hell. Liest dafuer die vom Browser bereits BERECHNETE
 *  border-left-color aus (die Blockly selbst inline je Kategorie aus der
 *  Toolbox-"colour" setzt) statt Blocklys HSV->RGB-Umrechnung hier zu
 *  duplizieren. Muss nach jedem (Neu-)Aufbau der Toolbox-DOM erneut
 *  aufgerufen werden — siehe workspace.ts (initial + bei Themenwechsel, da
 *  workspace.setTheme() die Toolbox neu rendert). */
export function applyCategoryTints(workspace: WorkspaceSvg): void {
  const injectionDiv = workspace.getInjectionDiv()
  const bgColour = getComputedStyle(injectionDiv).getPropertyValue('--color-bg').trim()
  const bgRgb = parseRgb(bgColour) ?? [236, 238, 241]

  const rows = injectionDiv.querySelectorAll<HTMLElement>('.blocklyToolboxCategory')
  rows.forEach((row) => {
    const borderColor = getComputedStyle(row).borderLeftColor
    row.style.setProperty('--cat-tint', mixTowards(borderColor, bgRgb, 0.78))
  })
}
