import { generator, numberInput } from '../openscadGenerator'
import { Order } from '../order'
import { svgFilenameFor } from '../svgAssets'
import type { ImportSvgState } from '../../editor/blocks/svg'

generator.forBlock['os_import_svg'] = (block) => {
  const dpi = numberInput(generator, block, 'DPI', '96', Order.ATOMIC)
  const center = block.getFieldValue('CENTER') === 'TRUE' ? 'true' : 'false'
  const state = block.saveExtraState?.() as Partial<ImportSvgState> | undefined
  const filename = svgFilenameFor(block.id, state?.filename ?? '')
  return `import("${filename}", center=${center}, dpi=${dpi});\n`
}
