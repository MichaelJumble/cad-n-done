export type BlockRenderer = 'geras' | 'zelos' | 'metallic' | 'steampunk'

export const SUPPORTED_BLOCK_RENDERERS: readonly BlockRenderer[] = [
  'geras',
  'zelos',
  'metallic',
  'steampunk',
]
export const DEFAULT_BLOCK_RENDERER: BlockRenderer = 'geras'

const STORAGE_KEY = 'blockscad-next:renderer'

function isBlockRenderer(value: string | null): value is BlockRenderer {
  return value != null && (SUPPORTED_BLOCK_RENDERERS as readonly string[]).includes(value)
}

export function getBlockRenderer(): BlockRenderer {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isBlockRenderer(stored) ? stored : DEFAULT_BLOCK_RENDERER
}

/** Wechselt den Block-Renderer dauerhaft. Anders als das Farbschema (siehe
 *  ui/theme.ts, dort per workspace.setTheme() live umschaltbar) baut Blockly
 *  den Renderer nur beim Injizieren des Workspace auf - daher hier Reload,
 *  gleiches Muster wie bei setLocale() in i18n/index.ts. */
export function setBlockRenderer(renderer: BlockRenderer): void {
  if (renderer === getBlockRenderer()) return
  localStorage.setItem(STORAGE_KEY, renderer)
  location.reload()
}
