import * as Blockly from 'blockly'
import {
  AngularConstantProvider,
  AngularDrawer,
  AngularHighlightConstantProvider,
  SVG_NS,
  ensureGradient,
} from './blocklyAngularRendererShared'

/**
 * Experimenteller dritter Block-Stil ("metallic"), ueber das Menue waehlbar
 * (siehe blockRenderer.ts). Erbt von Geras, weil Geras bereits eine dunkle
 * Versatz-Kontur (svgPathDark) fuer einen leichten 3D-Rand mitbringt - hier
 * ergaenzt um: echten Schlagschatten je Block (CSS drop-shadow, damit sich
 * gestapelte/verschachtelte Bloecke optisch trennen), eckige statt runde
 * Verbinder-"Nasen" (Puzzle-Tab, aus blocklyAngularRendererShared) und eine
 * daemmerungsunabhaengige Metallic-Sheen-Ueberlagerung per SVG-Gradient +
 * mix-blend-mode.
 */

const RENDERER_NAME = 'metallic'
const SHEEN_GRADIENT_ID = 'cadndone-metallic-sheen-gradient'

class MetallicConstantProvider extends AngularConstantProvider {
  override getCSS_(selector: string): string[] {
    return [
      ...super.getCSS_(selector),
      `${selector} .blocklyPath {`,
      'filter: drop-shadow(2px 3px 2px rgba(0,0,0,.45));',
      '}',
      `${selector} .blocklyInsertionMarker > .blocklyPath {`,
      'filter: none;',
      '}',
      `${selector} .blocklyMetallicSheen {`,
      'mix-blend-mode: overlay;',
      'pointer-events: none;',
      '}',
    ]
  }
}

class MetallicPathObject extends Blockly.geras.PathObject {
  private readonly svgPathSheen: SVGElement

  constructor(...args: ConstructorParameters<typeof Blockly.geras.PathObject>) {
    super(...args)
    const [root] = args
    ensureGradient(root, SHEEN_GRADIENT_ID, [
      ['0%', '#ffffff', '0.55'],
      ['22%', '#ffffff', '0.12'],
      ['55%', '#000000', '0'],
      ['100%', '#000000', '0.22'],
    ])
    this.svgPathSheen = document.createElementNS(SVG_NS, 'path')
    this.svgPathSheen.setAttribute('class', 'blocklyMetallicSheen')
    this.svgPathSheen.setAttribute('fill', `url(#${SHEEN_GRADIENT_ID})`)
    this.svgRoot.appendChild(this.svgPathSheen)
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

class MetallicRenderer extends Blockly.geras.Renderer {
  override makeConstants_() {
    return new MetallicConstantProvider()
  }

  override makePathObject(...args: Parameters<Blockly.geras.Renderer['makePathObject']>) {
    return new MetallicPathObject(
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
  Blockly.blockRendering.register(RENDERER_NAME, MetallicRenderer)
} catch {
  // Bereits registriert (z.B. durch Vite-HMR ein zweites Mal geladen) - egal.
}
