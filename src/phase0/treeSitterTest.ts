import { Parser, Language } from 'web-tree-sitter'
import { setStatus, setOutput } from './status'

const GRAMMAR_URL = `${import.meta.env.BASE_URL}grammars/tree-sitter-openscad.wasm`

export async function runTreeSitterTest(): Promise<void> {
  try {
    await Parser.init({ locateFile: () => `${import.meta.env.BASE_URL}web-tree-sitter.wasm` })

    let grammar: Language
    try {
      grammar = await Language.load(GRAMMAR_URL)
    } catch (grammarErr) {
      setStatus(
        'treesitter',
        false,
        'web-tree-sitter-Kern laedt (Parser.init OK), aber es gibt keine fertige ' +
          'OpenSCAD-Grammatik-WASM-Datei. Weder das npm-Paket "@openscad/tree-sitter-openscad" ' +
          'noch "tree-sitter-openscad" liefern eine vorgebaute .wasm fuer den Browser — beide ' +
          'sind auf native Node-Bindings ausgelegt (node-gyp/make/gcc), die in dieser Sandbox ' +
          'nicht verfuegbar sind. Die Grammatik muesste auf einer Maschine mit Emscripten/Docker ' +
          'via "tree-sitter build --wasm" erzeugt und danach unter ' +
          GRAMMAR_URL +
          ' abgelegt werden.',
      )
      setOutput('treesitter-output', String(grammarErr))
      return
    }

    const parser = new Parser()
    parser.setLanguage(grammar)
    const tree = parser.parse('cube([1,1,1]);')
    const sexp = tree?.rootNode.toString() ?? '(kein Baum)'
    setStatus('treesitter', true, 'OpenSCAD-Grammatik geladen und String erfolgreich geparst.')
    setOutput('treesitter-output', sexp)
  } catch (err) {
    setStatus('treesitter', false, `Fehler: ${String(err)}`)
  }
}
