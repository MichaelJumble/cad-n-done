/** Kodiert/dekodiert binaere Daten als Base64 — fuer Bloecke, die
 *  Binaerdateien (z.B. STL, siehe editor/blocks/stl.ts) als String in ihrem
 *  Block-Zustand halten muessen (Blockly-Serialisierung ist JSON-basiert,
 *  kennt keine rohen Binaerdaten). In Bloecken von 32 KB zerlegt, damit
 *  String.fromCharCode(...bytes) bei grossen Dateien nicht am
 *  Funktionsaufruf-Stack-Limit scheitert. */
const CHUNK_SIZE = 0x8000

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE))
  }
  return btoa(binary)
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
