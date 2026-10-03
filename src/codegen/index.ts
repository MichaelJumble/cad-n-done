import type { Workspace } from 'blockly'
import type { BlockToCodeResult } from '../types'
import { generator } from './openscadGenerator'
// Registrieren der forBlock-Generatoren (Seiteneffekt beim Import).
import './blocks/primitives'
import './blocks/primitives2d'
import './blocks/transforms'
import './blocks/booleans'
import './blocks/logic'
import './blocks/values'
import './blocks/math'
import './blocks/loops'
import './blocks/text'
import './blocks/svg'
import './blocks/tracePhoto'
import './blocks/stl'
import './blocks/procedures'
import './blocks/rawCode'
import './blocks/modules'

export { generateColorFragments, type RenderFragment } from './colorFragments'
export { describeTopLevelBlocks, type TopLevelBlockSummary } from './describeTopLevelBlocks'
export { collectSvgAssets, svgFilenameFor, type SvgAsset } from './svgAssets'
export { collectStlAssets, stlFilenameFor, type StlAsset } from './stlAssets'

/** Erzeugt OpenSCAD-Quelltext aus dem aktuellen Blockly-Workspace. */
export function generateCode(workspace: Workspace): BlockToCodeResult {
  generator.warnings = []
  const code = generator.workspaceToCode(workspace)
  return { code, warnings: generator.warnings }
}
