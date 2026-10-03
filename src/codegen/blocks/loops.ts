import { generator, numberInput, variableName } from '../openscadGenerator'
import { Order } from '../order'

generator.forBlock['os_for'] = (block) => {
  const varName = variableName(block, 'VAR')
  const from = numberInput(generator, block, 'FROM', '0', Order.ATOMIC)
  const to = numberInput(generator, block, 'TO', '0', Order.ATOMIC)
  const step = numberInput(generator, block, 'STEP', '1', Order.ATOMIC)
  const branch = generator.statementToCode(block, 'DO')
  if (block.getFieldValue('HUELLE') !== 'TRUE') {
    return `for (${varName} = [${from}:${step}:${to}]) {\n${branch}}\n`
  }
  // "Als Huelle" baut - wie im BlockSCAD-Vorbild - eine KETTEN-Huelle:
  // pro Schleifendurchlauf werden das Profil bei i UND das Profil beim
  // NAECHSTEN Schritt (i+1) gemeinsam in EIN hull() gepackt, nicht die
  // gesamte Schleife auf einmal (das ergaebe nur eine grobe konvexe Huelle
  // ueber ALLE Iterationen hinweg statt einer sanft verbundenen Flaeche
  // zwischen aufeinanderfolgenden Querschnitten, z.B. fuer eine
  // gedrehte/verjuengte Vasenwand). Der Schleifenkoerper wird dafuer ein
  // zweites Mal mit i+1 statt i eingesetzt - da diese App Werte generell
  // als OpenSCAD-Formeltext erzeugt (nicht zur Codegen-Zeit auswertet),
  // passiert das per Wortgrenzen-Ersetzung des Bezeichners in dessen
  // eigenem generierten Text (varName ist der sanitisierte, eindeutige Name
  // dieser Zaehlvariable, siehe variableName() - os_variable_get gibt fuer
  // sie ausschliesslich genau diesen Text aus, nichts anderes kann davon
  // ungewollt getroffen werden). Die Obergrenze sinkt um 1, damit das
  // letzte Segmentpaar (TO-1, TO) noch existiert, statt bei TO+1 (das gar
  // nicht mehr existierende naechste Profil) ins Leere zu hüllen.
  const nextVarPattern = new RegExp(`\\b${varName}\\b`, 'g')
  const nextBranch = branch.replace(nextVarPattern, `(${varName} + 1)`)
  return `for (${varName} = [${from}:${step}:${to} - 1]) {\n  hull() {\n${branch}${nextBranch}  }\n}\n`
}

// Eingebauter Blockly-Block (in der Toolbox unter "Schleifen"). OpenSCAD kennt
// keine reine Wiederholungsanweisung, daher ueber eine for-Schleife mit einer
// intern verwendeten, nach aussen nicht sichtbaren Zaehlvariable nachgebildet.
generator.forBlock['controls_repeat_ext'] = (block) => {
  const times = numberInput(generator, block, 'TIMES', '0', Order.ATOMIC)
  const branch = generator.statementToCode(block, 'DO')
  return `for (__i = [1:${times}]) {\n${branch}}\n`
}

// Eingebauter Blockly-Block (in der Toolbox unter "Schleifen"). OpenSCAD-for
// akzeptiert direkt eine Liste als Wertebereich, daher 1:1 uebertragbar.
generator.forBlock['controls_forEach'] = (block) => {
  const varName = variableName(block, 'VAR')
  const list = numberInput(generator, block, 'LIST', '[]', Order.ATOMIC)
  const branch = generator.statementToCode(block, 'DO')
  return `for (${varName} = ${list}) {\n${branch}}\n`
}
