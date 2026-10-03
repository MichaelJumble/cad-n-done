const STORAGE_KEY = 'blockscad-next:soundEnabled'

/** Blockly spielt Klick-/Verbinden-/Loeschen-Geraeusche standardmaessig ab
 *  (workspace.getAudioManager()), ohne dass diese App das je ausgeschaltet
 *  haette - "aktiviert" ist daher der Standardwert, wenn noch nichts
 *  gespeichert wurde. */
export function getSoundEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== 'false'
}

/** Nur die Einstellung speichern - das tatsaechliche Stummschalten passiert
 *  live ueber workspace.getAudioManager().setMuted(), da Blockly dafuer
 *  (anders als beim Renderer/der Sprache) eine offizielle Laufzeit-API
 *  bietet und kein Neuladen noetig ist. */
export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled))
}
