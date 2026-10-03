import { createOpenSCAD } from 'openscad-wasm'
import { setStatus, setOutput } from './status'

export async function runOpenscadTest(): Promise<void> {
  try {
    const instance = await createOpenSCAD({
      printErr: (text) => console.warn('[openscad-wasm stderr]', text),
    })
    const stl = await instance.renderToStl('cube([1,1,1]);')
    const ok = stl.includes('solid') || stl.length > 0
    setStatus('openscad', ok, `STL erzeugt, ${stl.length} Zeichen.`)
    setOutput('openscad-output', stl.slice(0, 400))
  } catch (err) {
    setStatus('openscad', false, `Fehler: ${String(err)}`)
  }
}
