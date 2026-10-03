import type { Block } from 'blockly'
import { generator, numberInput, sanitizeIdentifier } from '../openscadGenerator'
import { Order } from '../order'

// Blocklys eingebaute Prozeduren-Bloecke bringen getProcedureDef()/
// getProcedureCall() mit (siehe core/interfaces/i_legacy_procedure_blocks —
// intern, daher hier minimal nachgebildet statt importiert).
interface ProcedureDefBlock extends Block {
  getProcedureDef(): [name: string, params: string[], hasReturn: boolean]
}
interface ProcedureCallBlock extends Block {
  getProcedureCall(): string
}

function argCode(block: Block, count: number): string[] {
  const args: string[] = []
  for (let i = 0; i < count; i++) {
    args.push(numberInput(generator, block, `ARG${i}`, '0', Order.ATOMIC))
  }
  return args
}

// "etwas tun": OpenSCAD-Modul — reine Anweisungen, keine Rueckgabe.
generator.forBlock['procedures_defnoreturn'] = (block) => {
  const [name, params] = (block as ProcedureDefBlock).getProcedureDef()
  const paramNames = params.map(sanitizeIdentifier)
  const body = generator.statementToCode(block, 'STACK')
  return `module ${sanitizeIdentifier(name)}(${paramNames.join(', ')}) {\n${body}}\n`
}

// "gib zurück": OpenSCAD-Funktion — reiner Ausdruck (function f(x) = ...;).
// OpenSCAD-Funktionen kennen keinen Anweisungs-Rumpf, daher wird ein evtl.
// gefuellter STACK-Einschub ignoriert (mit Warnung), nur RETURN wird genutzt.
generator.forBlock['procedures_defreturn'] = (block) => {
  const [name, params] = (block as ProcedureDefBlock).getProcedureDef()
  const paramNames = params.map(sanitizeIdentifier)
  if (block.getInputTargetBlock('STACK')) {
    generator.warnings.push({
      blockId: block.id,
      message:
        'OpenSCAD-Funktionen können keine Anweisungen enthalten — nur "gib zurück" wird verwendet.',
    })
  }
  const returnValue = numberInput(generator, block, 'RETURN', '0', Order.ATOMIC)
  return `function ${sanitizeIdentifier(name)}(${paramNames.join(', ')}) = ${returnValue};\n`
}

generator.forBlock['procedures_callnoreturn'] = (block) => {
  const name = (block as ProcedureCallBlock).getProcedureCall()
  const argCount = block.inputList.filter((input) => input.name.startsWith('ARG')).length
  const args = argCode(block, argCount)
  return `${sanitizeIdentifier(name)}(${args.join(', ')});\n`
}

generator.forBlock['procedures_callreturn'] = (block): [string, Order] => {
  const name = (block as ProcedureCallBlock).getProcedureCall()
  const argCount = block.inputList.filter((input) => input.name.startsWith('ARG')).length
  const args = argCode(block, argCount)
  return [`${sanitizeIdentifier(name)}(${args.join(', ')})`, Order.ATOMIC]
}
