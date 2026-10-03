import { generator, numberInput } from '../openscadGenerator'
import { Order } from '../order'
import { stlFilenameFor } from '../stlAssets'
import type { ImportStlState } from '../../editor/blocks/stl'

generator.forBlock['os_import_stl'] = (block) => {
  const convexity = numberInput(generator, block, 'CONVEXITY', '10', Order.ATOMIC)
  const center = block.getFieldValue('CENTER') === 'TRUE' ? 'true' : 'false'
  const state = block.saveExtraState?.() as Partial<ImportStlState> | undefined
  const filename = stlFilenameFor(block.id, state?.filename ?? '')
  return `import("${filename}", convexity=${convexity}, center=${center});\n`
}
