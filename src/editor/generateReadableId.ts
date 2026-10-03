const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const ID_LENGTH = 20

/** Rein alphanumerische ID (A-Z a-z 0-9), passend fuer sowohl Block- als
 *  auch Variablen-IDs — siehe readableIds.ts/readableVariableIds.ts. */
export function generateReadableId(): string {
  let id = ''
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  }
  return id
}

/** Erkennt, ob eine ID bereits "sauber" (rein alphanumerisch) ist. */
export const CLEAN_ID_RE = /^[A-Za-z0-9]+$/
