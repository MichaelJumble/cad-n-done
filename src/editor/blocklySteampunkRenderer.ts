import * as Blockly from 'blockly'
import {
  AngularConstantProvider,
  AngularDrawer,
  AngularHighlightConstantProvider,
  SVG_NS,
  ensureGradient,
} from './blocklyAngularRendererShared'

/**
 * Vierter, experimenteller Block-Stil ("steampunk") - dieselbe eckige
 * Mechanik wie Metallic (siehe blocklyAngularRendererShared.ts: Ecken,
 * Verbinder-Nase, Boden-Kerbe), aber mit warmer Messing/Kupfer-Patina statt
 * kuehlem Stahlblau.
 */

const RENDERER_NAME = 'steampunk'
const SHEEN_GRADIENT_ID = 'cadndone-steampunk-sheen-gradient'

// Messing/Bronze-Ton, in den die Blockfarben gemischt werden - sorgt dafuer,
// dass wirklich JEDE Kategorie (Formen, Transformationen, Mengenoperationen
// ...) warm/patiniert wirkt, statt nur die urspruengliche Theme-Farbe (Blau,
// Gruen, Lila ...) mit einem duennen Verlauf zu ueberziehen.
const BRASS_TINT: readonly [number, number, number] = [128, 92, 52]

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
  return '#' + [r, g, b].map((value) => clamp(value).toString(16).padStart(2, '0')).join('')
}

function towardBrass(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex)
  const [br, bg, bb] = BRASS_TINT
  return rgbToHex(
    r * (1 - ratio) + br * ratio,
    g * (1 - ratio) + bg * ratio,
    b * (1 - ratio) + bb * ratio,
  )
}

class SteampunkConstantProvider extends AngularConstantProvider {
  override getCSS_(selector: string): string[] {
    return [
      ...super.getCSS_(selector),
      `${selector} .blocklyPath {`,
      'filter: drop-shadow(2px 3px 2px rgba(40,20,5,.55));',
      '}',
      `${selector} .blocklyInsertionMarker > .blocklyPath {`,
      'filter: none;',
      '}',
      `${selector} .blocklySteampunkSheen {`,
      // multiply statt overlay: kann das Blech nur abdunkeln, nie
      // aufhellen - dadurch wirkt es schmutzig/oelig statt poliert/glitzernd.
      'mix-blend-mode: multiply;',
      'pointer-events: none;',
      '}',
    ]
  }
}

class SteampunkPathObject extends Blockly.geras.PathObject {
  private readonly svgPathSheen: SVGElement

  constructor(...args: ConstructorParameters<typeof Blockly.geras.PathObject>) {
    super(...args)
    const [root] = args
    // Kein heller Glanzpunkt oben (das liesse es poliert/glitzernd wirken) -
    // stattdessen ungleichmaessige dunkle "Oelflecken", per multiply nur
    // abdunkelnd, schwerpunktmaessig nach unten absackend wie echtes Fett.
    ensureGradient(root, SHEEN_GRADIENT_ID, [
      ['0%', '#000000', '0.06'],
      ['32%', '#2a1f10', '0.24'],
      ['55%', '#000000', '0.04'],
      ['78%', '#1c130a', '0.2'],
      ['100%', '#0d0904', '0.45'],
    ])
    this.svgPathSheen = document.createElementNS(SVG_NS, 'path')
    this.svgPathSheen.setAttribute('class', 'blocklySteampunkSheen')
    this.svgPathSheen.setAttribute('fill', `url(#${SHEEN_GRADIENT_ID})`)
    this.svgRoot.appendChild(this.svgPathSheen)
  }

  override setStyle(...args: Parameters<Blockly.geras.PathObject['setStyle']>): void {
    const [blockStyle] = args
    super.setStyle({
      ...blockStyle,
      colourPrimary: towardBrass(blockStyle.colourPrimary, 0.5),
      colourSecondary: towardBrass(blockStyle.colourSecondary, 0.55),
      colourTertiary: towardBrass(blockStyle.colourTertiary, 0.4),
    })
  }

  override setPath(mainPath: string): void {
    super.setPath(mainPath)
    this.svgPathSheen.setAttribute('d', mainPath)
  }

  override flipRTL(): void {
    super.flipRTL()
    this.svgPathSheen.setAttribute('transform', 'scale(-1 1)')
  }

  override updateShadow_(shadow: boolean): void {
    super.updateShadow_(shadow)
    this.svgPathSheen.style.display = shadow ? 'none' : ''
  }
}

class SteampunkRenderer extends Blockly.geras.Renderer {
  override makeConstants_() {
    return new SteampunkConstantProvider()
  }

  override makePathObject(...args: Parameters<Blockly.geras.Renderer['makePathObject']>) {
    return new SteampunkPathObject(
      args[0],
      args[1],
      this.getConstants() as Blockly.geras.ConstantProvider,
    )
  }

  override makeDrawer_(...args: Parameters<Blockly.geras.Renderer['makeDrawer_']>) {
    return new AngularDrawer(
      args[0],
      args[1] as unknown as ConstructorParameters<typeof Blockly.geras.Drawer>[1],
    )
  }

  protected override makeHighlightConstants_() {
    return new AngularHighlightConstantProvider(this.getConstants())
  }
}

try {
  Blockly.blockRendering.register(RENDERER_NAME, SteampunkRenderer)
} catch {
  // Bereits registriert (z.B. durch Vite-HMR ein zweites Mal geladen) - egal.
}
