import type { utils } from 'blockly'
import {
  PRIMITIVE_3D_COLOUR,
  PRIMITIVE_2D_COLOUR,
  TRANSFORM_COLOUR,
  BOOLEAN_COLOUR,
  MATH_COLOUR,
  LOGIC_COLOUR,
  LOOPS_COLOUR,
  TEXT_COLOUR,
  VARIABLES_COLOUR,
  MODULE_COLOUR,
  RAW_CODE_COLOUR,
} from './blocks/colours'
import { t } from '../i18n'

/**
 * Toolbox-Definition: eigene OpenSCAD-Bloecke, gruppiert nach Kategorie
 * (in der aktuell aktiven Sprache — siehe src/i18n).
 */
export function buildToolboxDefinition(): utils.toolbox.ToolboxDefinition {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: t('category.primitives_3d'),
        colour: String(PRIMITIVE_3D_COLOUR),
        cssconfig: { icon: 'bsn-cat-icon bsn-cat-icon-primitives3d' },
        contents: [
          { kind: 'block', type: 'os_sphere' },
          { kind: 'block', type: 'os_cube' },
          { kind: 'block', type: 'os_cylinder' },
          { kind: 'block', type: 'os_ring' },
          { kind: 'block', type: 'os_polyhedron' },
        ],
      },
      {
        kind: 'category',
        name: t('category.transforms'),
        colour: String(TRANSFORM_COLOUR),
        cssconfig: { icon: 'bsn-cat-icon bsn-cat-icon-transforms' },
        contents: [
          { kind: 'block', type: 'os_translate' },
          { kind: 'block', type: 'os_rotate' },
          { kind: 'block', type: 'os_mirror' },
          { kind: 'block', type: 'os_scale' },
          { kind: 'block', type: 'os_color' },
          { kind: 'block', type: 'os_color_hsv' },
          { kind: 'block', type: 'os_color_rgb' },
          { kind: 'block', type: 'os_sides' },
          { kind: 'block', type: 'os_min_angle' },
          { kind: 'block', type: 'os_min_size' },
          { kind: 'block', type: 'os_rotate_vector' },
          { kind: 'block', type: 'os_mirror_vector' },
          { kind: 'block', type: 'os_resize' },
          { kind: 'block', type: 'os_circular_pattern' },
          { kind: 'block', type: 'os_taper' },
        ],
      },
      {
        kind: 'category',
        name: t('category.booleans'),
        colour: String(BOOLEAN_COLOUR),
        cssconfig: { icon: 'bsn-cat-icon bsn-cat-icon-booleans' },
        contents: [
          { kind: 'block', type: 'os_union' },
          { kind: 'block', type: 'os_difference' },
          { kind: 'block', type: 'os_intersection' },
          { kind: 'block', type: 'os_hull' },
          { kind: 'block', type: 'os_minkowski' },
        ],
      },
      {
        kind: 'category',
        name: t('category.math'),
        colour: String(MATH_COLOUR),
        cssconfig: { icon: 'bsn-cat-icon bsn-cat-icon-math' },
        // Jeder Zahlen-Eingang bekommt sofort einen vorbelegten Shadow-Block
        // (Grad bei Winkel-Feldern wie math_trig, sonst eine Zahl), damit man
        // nach dem Herausziehen direkt damit arbeiten kann statt erst einen
        // leeren Diamant-Sockel fuellen zu muessen.
        contents: [
          { kind: 'block', type: 'math_number' },
          { kind: 'block', type: 'math_angle' },
          {
            kind: 'block',
            type: 'math_arithmetic',
            inputs: {
              A: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              B: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            },
          },
          {
            kind: 'block',
            type: 'math_single',
            inputs: { NUM: { shadow: { type: 'math_number', fields: { NUM: 9 } } } },
          },
          {
            kind: 'block',
            type: 'math_trig',
            inputs: { NUM: { shadow: { type: 'math_angle', fields: { NUM: 45 } } } },
          },
          { kind: 'block', type: 'math_constant' },
          {
            kind: 'block',
            type: 'math_number_property',
            inputs: { NUMBER_TO_CHECK: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
          },
          {
            kind: 'block',
            type: 'math_round',
            inputs: { NUM: { shadow: { type: 'math_number', fields: { NUM: 3.1 } } } },
          },
          {
            kind: 'block',
            type: 'math_modulo',
            inputs: {
              DIVIDEND: { shadow: { type: 'math_number', fields: { NUM: 64 } } },
              DIVISOR: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
            },
          },
          {
            kind: 'block',
            type: 'math_constrain',
            inputs: {
              VALUE: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
              LOW: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              HIGH: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            },
          },
          {
            kind: 'block',
            type: 'math_random_int',
            inputs: {
              FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              TO: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            },
          },
          { kind: 'block', type: 'math_random_float' },
          { kind: 'block', type: 'lists_create_with' },
        ],
      },
      {
        kind: 'category',
        name: t('category.logic'),
        colour: String(LOGIC_COLOUR),
        cssconfig: { icon: 'bsn-cat-icon bsn-cat-icon-logic' },
        contents: [
          { kind: 'block', type: 'controls_if' },
          { kind: 'block', type: 'logic_compare' },
          { kind: 'block', type: 'logic_operation' },
          { kind: 'block', type: 'logic_negate' },
          { kind: 'block', type: 'logic_boolean' },
          { kind: 'block', type: 'logic_ternary' },
        ],
      },
      {
        kind: 'category',
        name: t('category.loops'),
        colour: String(LOOPS_COLOUR),
        cssconfig: { icon: 'bsn-cat-icon bsn-cat-icon-loops' },
        // OpenSCAD kennt weder "wiederhole solange/bis" (kein while) noch
        // "Schleife abbrechen/fortfahren" (kein break/continue) — diese zwei
        // Stock-Blockly-Bloecke haben deshalb bewusst kein Gegenstueck hier.
        contents: [
          {
            kind: 'block',
            type: 'os_for',
            inputs: {
              FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              TO: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
              STEP: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            },
          },
          {
            kind: 'block',
            type: 'controls_repeat_ext',
            inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } } },
          },
          { kind: 'block', type: 'controls_forEach' },
        ],
      },
      {
        kind: 'category',
        name: t('category.text'),
        colour: String(TEXT_COLOUR),
        cssconfig: { icon: 'bsn-cat-icon bsn-cat-icon-text' },
        contents: [
          { kind: 'block', type: 'text', fields: { TEXT: t('field.text_placeholder') } },
          {
            kind: 'block',
            type: 'text_length',
            inputs: {
              VALUE: { shadow: { type: 'text', fields: { TEXT: t('field.text_placeholder') } } },
            },
          },
          {
            kind: 'block',
            type: 'os_text_3d',
            inputs: {
              TEXT: { shadow: { type: 'text', fields: { TEXT: t('field.text_placeholder') } } },
              SIZE: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
              HEIGHT: { shadow: { type: 'math_number', fields: { NUM: 2 } } },
            },
          },
        ],
      },
      {
        kind: 'category',
        name: t('category.variables'),
        colour: String(VARIABLES_COLOUR),
        cssconfig: { icon: 'bsn-cat-icon bsn-cat-icon-variables' },
        custom: 'VARIABLE',
      },
      {
        kind: 'category',
        name: t('category.modules'),
        colour: String(MODULE_COLOUR),
        cssconfig: { icon: 'bsn-cat-icon bsn-cat-icon-modules' },
        custom: 'PROCEDURE',
      },
      {
        kind: 'category',
        name: t('category.code'),
        colour: String(RAW_CODE_COLOUR),
        cssconfig: { icon: 'bsn-cat-icon bsn-cat-icon-code' },
        contents: [{ kind: 'block', type: 'os_raw_code' }],
      },
      // Bewusst ganz am Ende: 2D-Grundformen (circle/square) braucht man in
      // Cadium normalerweise nicht (siehe SVG-Import als bevorzugter Weg fuer
      // 2D-Umrisse) - existieren primaer, damit importierte BlockSCAD-Projekte
      // (siehe blockscad/convertBlockscadXml.ts), die noch mit circle()/
      // square()+linear_extrude()/rotate_extrude() arbeiten, vollstaendig
      // geladen werden koennen statt diese Bloecke stillschweigend zu
      // verlieren. "Extrudieren"/"rotieren-extrudieren" stehen bewusst HIER
      // statt (wie alle anderen Transformationen) in der Transformationen-
      // Kategorie: sie sind untrennbar mit 2D-Formen verbunden (machen aus
      // ihnen erst einen 3D-Koerper) - alles 2D-Relevante soll an einer
      // Stelle zu finden sein.
      {
        kind: 'category',
        name: t('category.primitives_2d'),
        colour: String(PRIMITIVE_2D_COLOUR),
        cssconfig: { icon: 'bsn-cat-icon bsn-cat-icon-primitives2d' },
        contents: [
          { kind: 'block', type: 'os_circle' },
          { kind: 'block', type: 'os_square' },
          { kind: 'block', type: 'os_linear_extrude' },
          { kind: 'block', type: 'os_rotate_extrude' },
        ],
      },
    ],
  }
}
