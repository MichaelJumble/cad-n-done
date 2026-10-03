import { generator, numberInput } from '../openscadGenerator'
import { Order } from '../order'
import { tracePhotoFilenameFor } from '../svgAssets'

generator.forBlock['os_trace_photo'] = (block) => {
  const dpi = numberInput(generator, block, 'DPI', '96', Order.ATOMIC)
  const center = block.getFieldValue('CENTER') === 'TRUE' ? 'true' : 'false'
  const filename = tracePhotoFilenameFor(block.id)
  return `import("${filename}", center=${center}, dpi=${dpi});\n`
}
