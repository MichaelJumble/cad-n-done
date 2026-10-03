// localStorage hat pro Origin nur ~5-10MB Platz - ein einzelner STL-/SVG-
// Import (als Base64 im Block-Zustand eingebettet, siehe editor/blocks/
// stl.ts) kann das leicht sprengen (~33% Aufblaehung durch Base64). Ein
// ueberschrittenes Limit liess frueher JEDEN weiteren Autosave-Versuch mit
// einer ungefangenen QuotaExceededError fehlschlagen - das Design wurde nie
// mehr gespeichert, ein Reload verlor dadurch alles. IndexedDB hat dagegen
// pro Origin ueblicherweise Platz im zwei- bis dreistelligen MB- bis
// GB-Bereich (browserabhaengig, an freien Plattenspeicher gekoppelt) und
// speichert Objekte nativ (structured clone) - kein JSON.stringify/parse-Umweg
// noetig.

const DB_NAME = 'blockscad-next'
const DB_VERSION = 1
const STORE_NAME = 'workspace'
const RECORD_KEY = 'current'

// Alter Speicherort vor der Umstellung auf IndexedDB - fuer die einmalige
// Migration bestehender Designs sowie zum Aufraeumen nach dem Umzug.
const LEGACY_LOCALSTORAGE_KEY = 'blockscad-next:workspace'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error as Error)
  })
  return dbPromise
}

/** Speichert den serialisierten Workspace-Zustand (das reine Objekt aus
 *  Blockly.serialization.workspaces.save(), ohne JSON.stringify). */
export async function saveWorkspaceState(state: object): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(state, RECORD_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error as Error)
  })
}

/** Laedt den gespeicherten Workspace-Zustand — inkl. einmaliger Migration
 *  eines evtl. noch vorhandenen alten localStorage-Stands (vor der
 *  IndexedDB-Umstellung), damit dabei niemandes Design verloren geht. */
export async function loadWorkspaceState(): Promise<object | undefined> {
  const db = await openDb()
  const current = await new Promise<object | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(RECORD_KEY)
    request.onsuccess = () => resolve(request.result as object | undefined)
    request.onerror = () => reject(request.error as Error)
  })
  if (current) return current

  const legacyRaw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)
  if (!legacyRaw) return undefined
  try {
    const legacyState = JSON.parse(legacyRaw) as object
    await saveWorkspaceState(legacyState)
    localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY)
    return legacyState
  } catch (err) {
    console.warn('[editor] Konnte alten localStorage-Workspace nicht migrieren:', err)
    return undefined
  }
}

export async function clearWorkspaceState(): Promise<void> {
  localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY)
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(RECORD_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error as Error)
  })
}
