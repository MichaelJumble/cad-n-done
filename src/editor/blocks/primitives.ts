import * as Blockly from 'blockly'
import type { BlockDefinition } from './types'
import { PRIMITIVE_3D_COLOUR } from './colours'
import { STATEMENT_TYPE } from './constants'
import { centeredOptions, registerNumberShadows } from './blockHelpers'
import { t } from '../../i18n'

const LOCK_CLOSED_CHAR = '🔒'
const LOCK_OPEN_CHAR = '🔓'

/** Checkbox, die je nach Zustand ein geschlossenes oder offenes Schloss
 *  zeigt (die eingebaute field_checkbox versteckt ihr Zeichen komplett,
 *  solange sie nicht angehakt ist). */
class FieldLockToggle extends Blockly.FieldCheckbox {
  static override fromJson(options: Blockly.FieldCheckboxFromJsonConfig): FieldLockToggle {
    return new FieldLockToggle(options.checked)
  }

  override initView(): void {
    super.initView()
    this.updateLockAppearance()
  }

  protected override doValueUpdate_(newValue: 'TRUE' | 'FALSE'): void {
    super.doValueUpdate_(newValue)
    this.updateLockAppearance()
  }

  private updateLockAppearance(): void {
    this.setCheckCharacter(this.getValueBoolean() ? LOCK_CLOSED_CHAR : LOCK_OPEN_CHAR)
    if (this.textElement_) this.textElement_.style.display = 'block'
  }
}

try {
  Blockly.fieldRegistry.register('field_lock_toggle', FieldLockToggle)
} catch {
  // Bereits registriert (z.B. durch Vite-HMR) — ignorieren.
}

const CYLINDER_LOCK_SYNC_EXTENSION = 'os_cylinder_lock_sync'

/** Solange das Schloss-Feld verriegelt ist, wird radius1 auf radius2
 *  uebertragen (nur kosmetisch — die Codegenerierung nutzt bei Verriegelung
 *  ohnehin radius1 fuer beide Werte, siehe codegen/blocks/primitives.ts). */
function registerCylinderLockSync(): void {
  if (Blockly.Extensions.isRegistered(CYLINDER_LOCK_SYNC_EXTENSION)) return
  Blockly.Extensions.register(CYLINDER_LOCK_SYNC_EXTENSION, function (this: Blockly.Block) {
    const syncR2FromR1 = (): void => {
      if (this.getFieldValue('LOCK') !== 'TRUE') return
      const r1Field = this.getInputTargetBlock('R1')?.getField('NUM')
      const r2Field = this.getInputTargetBlock('R2')?.getField('NUM')
      if (!r1Field || !r2Field) return
      const r1Value = r1Field.getValue()
      if (r2Field.getValue() !== r1Value) r2Field.setValue(r1Value)
    }
    this.getField('LOCK')?.setValidator((newValue: unknown) => {
      if (newValue === 'TRUE') setTimeout(syncR2FromR1, 0)
      return newValue
    })
    this.setOnChange((event: Blockly.Events.Abstract) => {
      if (
        event.type === Blockly.Events.BLOCK_CHANGE ||
        event.type === Blockly.Events.BLOCK_MOVE ||
        event.type === Blockly.Events.BLOCK_FIELD_INTERMEDIATE_CHANGE
      ) {
        syncR2FromR1()
      }
    })
  })
}

/** Grundkoerper: cube, sphere, cylinder, ring (Torus). */
export function primitiveBlocks(): BlockDefinition[] {
  registerNumberShadows('os_sphere_defaults', { R: 10 })
  registerNumberShadows('os_cube_defaults', { X: 10, Y: 10, Z: 10 })
  registerNumberShadows('os_cylinder_defaults', { R1: 10, R2: 10, H: 10 })
  // H=0 ist bewusst der Standard: nur damit generiert os_ring exakt das
  // klassische BlockSCAD-Rohrprofil (siehe codegen/blocks/primitives.ts). Ein
  // Wert ungleich 0 verzieht das Profil zur Ellipse - eine bewusste
  // Zusatzfaehigkeit, die BlockSCADs Original nicht hatte.
  registerNumberShadows('os_ring_defaults', { R1: 4, R2: 1, SIDES: 8, FACES: 16, H: 0 })
  registerCylinderLockSync()

  return [
    {
      type: 'os_cube',
      message0: t('block.cube.message0'),
      args0: [
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'input_value', name: 'Z', check: 'Number' },
        { type: 'field_dropdown', name: 'CENTER', options: centeredOptions() },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: PRIMITIVE_3D_COLOUR,
      tooltip: t('block.cube.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_cube_defaults'],
    },
    {
      type: 'os_sphere',
      message0: t('block.sphere.message0'),
      args0: [{ type: 'input_value', name: 'R', check: 'Number' }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: PRIMITIVE_3D_COLOUR,
      tooltip: t('block.sphere.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_sphere_defaults'],
    },
    {
      type: 'os_cylinder',
      message0: t('block.cylinder.message0'),
      args0: [
        { type: 'input_value', name: 'R1', check: 'Number' },
        { type: 'field_lock_toggle', name: 'LOCK', checked: true },
        { type: 'input_value', name: 'R2', check: 'Number' },
        { type: 'input_value', name: 'H', check: 'Number' },
        { type: 'field_dropdown', name: 'CENTER', options: centeredOptions() },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: PRIMITIVE_3D_COLOUR,
      tooltip: t('block.cylinder.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_cylinder_defaults', CYLINDER_LOCK_SYNC_EXTENSION],
    },
    {
      type: 'os_ring',
      message0: t('block.ring.message0'),
      args0: [
        { type: 'input_value', name: 'R1', check: 'Number' },
        { type: 'input_value', name: 'R2', check: 'Number' },
        { type: 'input_value', name: 'SIDES', check: 'Number' },
        { type: 'input_value', name: 'FACES', check: 'Number' },
        { type: 'input_value', name: 'H', check: 'Number' },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: PRIMITIVE_3D_COLOUR,
      tooltip: t('block.ring.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_ring_defaults'],
    },
    {
      type: 'os_polyhedron',
      message0: t('block.polyhedron.message0'),
      args0: [
        { type: 'input_value', name: 'POINTS', check: 'Array' },
        { type: 'input_value', name: 'FACES', check: 'Array' },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: PRIMITIVE_3D_COLOUR,
      tooltip: t('block.polyhedron.tooltip'),
      helpUrl: '',
      // false statt true: POINTS/FACES enthalten meist mehrzeilig
      // verschachtelte Listen-Bloecke - nebeneinander (inline) wuerde der
      // Block schnell unhandlich breit statt in die Hoehe zu wachsen.
      inputsInline: false,
    },
  ]
}
