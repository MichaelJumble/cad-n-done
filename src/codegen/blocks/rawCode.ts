import { generator } from '../openscadGenerator'

generator.forBlock['os_raw_code'] = (block) => {
  const code = String(block.getFieldValue('CODE') ?? '')
  return code.endsWith('\n') ? code : `${code}\n`
}
