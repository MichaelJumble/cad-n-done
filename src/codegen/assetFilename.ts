/** Kurzer, stabiler Hash (kein Crypto noetig — nur zur Kollisionsvermeidung
 *  bei gleichnamigen Dateien, nicht sicherheitsrelevant). */
function shortHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(hash, 31) + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

/** Leitet aus dem urspruenglichen Dateinamen + der Blockly-Block-ID einen
 *  sicheren, eindeutigen Dateinamen ab — der echte Name bleibt dadurch auch
 *  im generierten OpenSCAD-Code (import("...")) wiedererkennbar, statt nur
 *  die (fuer Menschen bedeutungslose) Block-ID zu zeigen. Der Hash-Suffix
 *  verhindert Kollisionen, wenn mehrere Bloecke gleichnamige Dateien
 *  importieren. Von codegen/svgAssets.ts UND codegen/stlAssets.ts genutzt
 *  (jeweils zusammen mit dem passenden Codegen), damit beide Seiten
 *  unabhaengig voneinander auf denselben Namen kommen. */
export function assetFilenameFor(
  blockId: string,
  originalFilename: string,
  extension: string,
): string {
  const suffix = new RegExp(`\\.${extension}$`, 'i')
  const base =
    originalFilename
      .replace(suffix, '')
      .replace(/[^A-Za-z0-9_-]/g, '_')
      .slice(0, 40) || 'import'
  return `${base}_${shortHash(blockId)}.${extension}`
}
