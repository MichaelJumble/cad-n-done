import fieldColourPlugin from '@blockly/field-colour'
const { registerFieldColour } = fieldColourPlugin
import type { BlockDefinition } from './types'
import { TRANSFORM_COLOUR } from './colours'
import { STATEMENT_TYPE } from './constants'
import { registerNumberShadows, centeredOptions } from './blockHelpers'
import { registerOperandButtonsExtension, operandButtonFields } from './operandButtons'
import { t } from '../../i18n'

try {
  registerFieldColour()
} catch {
  // Bereits registriert (z.B. durch Vite-HMR) — ignorieren.
}

const CHILD_INIT_EXTENSION = 'os_transform_child_init'

function mirrorPlaneOptions(): [string, string][] {
  return [
    [t('field.mirror_xy'), 'XY'],
    [t('field.mirror_yz'), 'YZ'],
    [t('field.mirror_xz'), 'XZ'],
  ]
}

function colorModeOptions(): [string, string][] {
  return [[t('field.hsv'), 'HSV']]
}

function axisOptions(): [string, string][] {
  return [
    [t('field.axis_x'), 'X'],
    [t('field.axis_y'), 'Y'],
    [t('field.axis_z'), 'Z'],
  ]
}

/** Transformationen: umschliessen verschachtelte Objekte. Statt eines
 *  einzelnen statischen DO-Einschubs (Blockly stackt darin ohnehin beliebig
 *  viele Kind-Bloecke) gibt es — analog zu den Mengenoperationen — ein
 *  "+"/"−"-Feld im Titel, das dynamisch DO0, DO1, ... Einschuebe anlegt;
 *  standardmaessig nur 1 Einschub (Mengenoperationen starten mit 2). */
export function transformBlocks(): BlockDefinition[] {
  registerNumberShadows('os_translate_defaults', { X: 0, Y: 0, Z: 0 })
  // Drehwinkel, nicht nur Zahlen — Shadow-Block zeigt "0°" statt "0".
  registerNumberShadows('os_rotate_defaults', { X: 0, Y: 0, Z: 0 }, 'math_angle')
  registerNumberShadows('os_scale_defaults', { X: 1, Y: 1, Z: 1 })
  registerNumberShadows('os_color_hsv_defaults', { H: 100, S: 100, V: 100 })
  // R/G/B in Prozent (0-100), wie Cadiums S/V bei os_color_hsv - nicht 0-255
  // (siehe codegen/blocks/transforms.ts::os_color_rgb).
  registerNumberShadows('os_color_rgb_defaults', { R: 100, G: 100, B: 100 })
  registerNumberShadows('os_sides_defaults', { N: 8 })
  // $fa-Standardwert ist ein Winkel (Grad), $fs eine reine Laengenangabe (mm)
  // — Standardwerte entsprechen OpenSCADs eigenen Defaults (12°/2mm).
  registerNumberShadows('os_min_angle_defaults', { A: 12 }, 'math_angle')
  registerNumberShadows('os_min_size_defaults', { S: 2 })
  // ANGLE ist ein Drehwinkel (Grad), X/Y/Z sind dagegen die Achsen-Richtung
  // (reine Zahlen, kein Winkel) — getrennte Extensions mit passendem
  // Shadow-Typ je Feld.
  registerNumberShadows('os_rotate_vector_angle_defaults', { ANGLE: 0 }, 'math_angle')
  registerNumberShadows('os_rotate_vector_xyz_defaults', { X: 0, Y: 0, Z: 0 })
  registerNumberShadows('os_mirror_vector_defaults', { X: 1, Y: 1, Z: 1 })
  registerNumberShadows('os_resize_defaults', { X: 0, Y: 0, Z: 0 })
  registerNumberShadows('os_linear_extrude_defaults', { HEIGHT: 5, SCALE: 1 })
  registerNumberShadows('os_linear_extrude_twist_defaults', { TWIST: 0 }, 'math_angle')
  registerNumberShadows('os_rotate_extrude_defaults', { FACES: 16 })
  registerNumberShadows('os_rotate_extrude_angle_defaults', { ANGLE: 360 }, 'math_angle')
  registerNumberShadows('os_taper_defaults', { FACTOR: 2 })
  registerNumberShadows('os_circular_pattern_count_defaults', { COUNT: 6 })
  registerNumberShadows('os_circular_pattern_angle_defaults', { ANGLE: 360 }, 'math_angle')
  registerOperandButtonsExtension({
    extensionName: CHILD_INIT_EXTENSION,
    inputPrefix: 'DO',
    defaultCount: 1,
    minCount: 1,
  })
  const buttons = operandButtonFields()

  return [
    {
      type: 'os_translate',
      message0: t('block.translate.message0'),
      args0: [
        ...buttons,
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'input_value', name: 'Z', check: 'Number' },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.translate.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_translate_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_rotate',
      message0: t('block.rotate.message0'),
      args0: [
        ...buttons,
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'input_value', name: 'Z', check: 'Number' },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.rotate.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_rotate_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_mirror',
      message0: t('block.mirror.message0'),
      args0: [...buttons, { type: 'field_dropdown', name: 'PLANE', options: mirrorPlaneOptions() }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.mirror.tooltip'),
      helpUrl: '',
      inputsInline: true,
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_scale',
      message0: t('block.scale.message0'),
      args0: [
        ...buttons,
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'input_value', name: 'Z', check: 'Number' },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.scale.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_scale_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_color',
      message0: t('block.color.message0'),
      args0: [...buttons, { type: 'field_colour', name: 'COLOUR', colour: '#ffcc00' }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.color.tooltip'),
      helpUrl: '',
      inputsInline: true,
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_color_hsv',
      message0: t('block.color_hsv.message0'),
      args0: [
        ...buttons,
        { type: 'field_dropdown', name: 'MODE', options: colorModeOptions() },
        { type: 'input_value', name: 'H', check: 'Number' },
        { type: 'input_value', name: 'S', check: 'Number' },
        { type: 'input_value', name: 'V', check: 'Number' },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.color_hsv.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_color_hsv_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_color_rgb',
      message0: t('block.color_rgb.message0'),
      args0: [
        ...buttons,
        { type: 'input_value', name: 'R', check: 'Number' },
        { type: 'input_value', name: 'G', check: 'Number' },
        { type: 'input_value', name: 'B', check: 'Number' },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.color_rgb.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_color_rgb_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_sides',
      message0: t('block.sides.message0'),
      args0: [...buttons, { type: 'input_value', name: 'N', check: 'Number' }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.sides.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_sides_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_min_angle',
      message0: t('block.min_angle.message0'),
      args0: [...buttons, { type: 'input_value', name: 'A', check: 'Number' }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.min_angle.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_min_angle_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_min_size',
      message0: t('block.min_size.message0'),
      args0: [...buttons, { type: 'input_value', name: 'S', check: 'Number' }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.min_size.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_min_size_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_rotate_vector',
      message0: t('block.rotate_vector.message0'),
      args0: [
        ...buttons,
        { type: 'input_value', name: 'ANGLE', check: 'Number' },
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'input_value', name: 'Z', check: 'Number' },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.rotate_vector.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_rotate_vector_angle_defaults', 'os_rotate_vector_xyz_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_mirror_vector',
      message0: t('block.mirror_vector.message0'),
      args0: [
        ...buttons,
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'input_value', name: 'Z', check: 'Number' },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.mirror_vector.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_mirror_vector_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_resize',
      message0: t('block.resize.message0'),
      args0: [
        ...buttons,
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'input_value', name: 'Z', check: 'Number' },
        { type: 'field_checkbox', name: 'AUTO', checked: false },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.resize.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_resize_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_linear_extrude',
      message0: t('block.linear_extrude.message0'),
      args0: [
        ...buttons,
        { type: 'input_value', name: 'HEIGHT', check: 'Number' },
        { type: 'field_dropdown', name: 'CENTER', options: centeredOptions() },
      ],
      message1: t('block.linear_extrude.message1'),
      args1: [
        { type: 'input_value', name: 'TWIST', check: 'Number' },
        { type: 'input_value', name: 'SCALE', check: 'Number' },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.linear_extrude.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_linear_extrude_defaults', 'os_linear_extrude_twist_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_rotate_extrude',
      message0: t('block.rotate_extrude.message0'),
      args0: [...buttons, { type: 'input_value', name: 'FACES', check: 'Number' }],
      message1: t('block.rotate_extrude.message1'),
      args1: [{ type: 'input_value', name: 'ANGLE', check: 'Number' }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.rotate_extrude.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_rotate_extrude_defaults', 'os_rotate_extrude_angle_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_circular_pattern',
      message0: t('block.circular_pattern.message0'),
      args0: [
        ...buttons,
        { type: 'input_value', name: 'COUNT', check: 'Number' },
        { type: 'input_value', name: 'ANGLE', check: 'Number' },
        { type: 'field_dropdown', name: 'AXIS', options: axisOptions() },
      ],
      message1: t('block.circular_pattern.message1'),
      args1: [{ type: 'field_checkbox', name: 'HULL', checked: false }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.circular_pattern.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_circular_pattern_count_defaults', 'os_circular_pattern_angle_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
    {
      type: 'os_taper',
      message0: t('block.taper.message0'),
      args0: [
        ...buttons,
        { type: 'field_dropdown', name: 'AXIS', options: axisOptions() },
        { type: 'input_value', name: 'FACTOR', check: 'Number' },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TRANSFORM_COLOUR,
      tooltip: t('block.taper.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_taper_defaults'],
      mutator: CHILD_INIT_EXTENSION,
    },
  ]
}
