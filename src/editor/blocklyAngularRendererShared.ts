import * as Blockly from 'blockly'

/**
 * Gemeinsame Mechanik fuer alle "eckigen" experimentellen Block-Stile
 * (aktuell Metallic und Steampunk) - Ecken-Radius, Verbinder-Nase und die
 * zusaetzliche Boden-Kerbe bei Klammer-Bloecken. Beide Renderer erben davon,
 * damit dieser Blockly-interne, versionsabhaengige Code (siehe Kommentar an
 * drawStatementInput_) nur an EINER Stelle gepflegt werden muss.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg'

export function ensureGradient(
  root: SVGElement,
  id: string,
  stops: ReadonlyArray<readonly [string, string, string]>,
): void {
  const svgRoot = root.ownerSVGElement ?? (root as unknown as SVGSVGElement)
  if (svgRoot.querySelector(`#${id}`)) return
  const defs = document.createElementNS(SVG_NS, 'defs')
  const gradient = document.createElementNS(SVG_NS, 'linearGradient')
  gradient.setAttribute('id', id)
  gradient.setAttribute('x1', '0')
  gradient.setAttribute('y1', '0')
  gradient.setAttribute('x2', '0')
  gradient.setAttribute('y2', '1')
  for (const [offset, colour, opacity] of stops) {
    const stop = document.createElementNS(SVG_NS, 'stop')
    stop.setAttribute('offset', offset)
    stop.setAttribute('stop-color', colour)
    stop.setAttribute('stop-opacity', opacity)
    gradient.appendChild(stop)
  }
  defs.appendChild(gradient)
  svgRoot.appendChild(defs)
}

export class AngularConstantProvider extends Blockly.geras.ConstantProvider {
  constructor() {
    super()
    // Eckige statt abgerundete Block-Silhouette. Die Basisformel fuer
    // Aussen-/Innenecken nutzt CORNER_RADIUS direkt als Bogenradius - bei 0
    // entartet der SVG-Arc-Befehl laut Spezifikation zu einer geraden Linie,
    // es sind also keine eigenen makeOutsideCorners()/makeInsideCorners()
    // noetig.
    this.CORNER_RADIUS = 0
  }

  protected override makePuzzleTab() {
    const width = this.TAB_WIDTH
    const height = this.TAB_HEIGHT
    const quarter = height / 4
    const half = height / 2
    const angularTab = (up: boolean): string => {
      const sign = up ? -1 : 1
      return ` l ${-width},${sign * quarter} 0,${sign * half} ${width},${sign * quarter} `
    }
    return {
      type: this.SHAPES.PUZZLE,
      width,
      height,
      pathDown: angularTab(false),
      pathUp: angularTab(true),
    }
  }
}

/**
 * Geras zeichnet zusaetzlich zur Hauptkontur eine duenne helle "Glanzlinie"
 * (this.constants_.PUZZLE_TAB) entlang der Werteingabe-Nase - fest verdrahtet
 * als eigene Bezier-Kurven-Naeherung der ABGERUNDETEN Standard-Puzzle-Nase,
 * unabhaengig von unserer eckigen Nase aus AngularConstantProvider.makePuzzleTab().
 * Ohne diese Korrektur zeichnet Blockly die alte rundliche Glanzlinie an der
 * falschen Stelle unserer eckigen Nase - sichtbar als stoerender grauer
 * Strich quer ueber den Block. Da unser eckiger Stil ohnehin auf Schlagschatten/
 * Sheen statt auf diese Feindetail-Glanzlinie setzt, wird sie hier einfach
 * leer gezeichnet statt nachgebaut.
 *
 * ACHTUNG bei einem Blockly-Versionswechsel: gleiches Risiko wie bei
 * AngularDrawer.drawStatementInput_ oben - dieser Mechanismus (getrennter
 * "Highlight-Konstanten"-Anbieter, der die Haupt-Kontur-Formen nicht
 * wiederverwendet) ist Blockly-intern und nicht offiziell dokumentiert.
 */
export class AngularHighlightConstantProvider extends Blockly.geras.HighlightConstantProvider {
  protected override makePuzzleTab() {
    return {
      width: this.constantProvider.TAB_WIDTH,
      height: this.constantProvider.TAB_HEIGHT,
      pathUp: () => '',
      pathDown: () => '',
    }
  }
}

/** Laufzeit-Felder auf dem letzten Input einer Statement-Zeile, die in den
 *  oeffentlichen Typdefinitionen fehlen (xPos/notchOffset/shape werden von
 *  RenderInfo dynamisch gesetzt), aber im kompilierten Kern real existieren -
 *  siehe die Basisklassen-Implementierung von drawStatementInput_. */
interface StatementRowInput {
  xPos: number
  notchOffset: number
  shape: { width: number; pathRight: string }
}

/**
 * Zeichnet am Boden einer Klammer (Statement-Eingang) zusaetzlich eine Kerbe
 * auf dessen Oberseite - im selben Stil wie die bereits vorhandene
 * Decken-Kerbe oben in der Kammer. Die Basis-Implementierung (die Geras von
 * der gemeinsamen Drawer-Klasse erbt) zeichnet den Kammerboden bisher IMMER
 * als reine gerade Linie, unabhaengig vom Verbindungsstatus - anders als
 * Zelos, das dort eine eigene ("connectedBottomNextConnection")-Kerbe kennt,
 * hat Geras dafuer gar keinen Mechanismus. Diese Kerbe wird hier ergaenzt,
 * nur fuer Klammer-Bloecke (mit Statement-Eingang). Die Decken-Kerbe und die
 * aeussere Verbindungs-Nase am Blockende bleiben davon unberuehrt.
 *
 * ACHTUNG bei einem Blockly-Versionswechsel: diese Methode baut den
 * internen Pfadaufbau von drawStatementInput_ nach (xPos/notchOffset/
 * INSIDE_CORNERS ...), statt nur einen offiziell dafuer vorgesehenen Hook
 * zu nutzen (den gibt es hier nicht). Nach einem Blockly-Update deshalb den
 * Kammerboden dieser Renderer visuell gegenchecken, nicht nur tsc laufen
 * lassen - ein Bruch waere sonst rein optisch und faellt nicht beim
 * Kompilieren auf.
 */
export class AngularDrawer extends Blockly.geras.Drawer {
  override drawStatementInput_(
    ...args: Parameters<Blockly.geras.Drawer['drawStatementInput_']>
  ): void {
    const [row] = args
    const isBracketBlock = this.block_.inputList.some(
      (input) => input.type === Blockly.inputs.inputTypes.STATEMENT,
    )
    const lastInput = isBracketBlock ? row.getLastInput() : null
    const input = lastInput as unknown as StatementRowInput | null
    if (!input) {
      super.drawStatementInput_(...args)
      return
    }
    const corners = this.constants_.INSIDE_CORNERS
    const notch = this.constants_.NOTCH
    const ceilingTarget = input.xPos + input.notchOffset + input.shape.width
    const ceiling = `${input.shape.pathRight} h ${-(input.notchOffset - corners.width)} ${corners.pathTop}`
    const wallHeight = row.height - 2 * corners.height
    const floorNotch = ` h ${input.notchOffset - corners.width} ${notch.pathLeft} `
    this.outlinePath_ += ` H ${ceilingTarget} ${ceiling} v ${wallHeight} ${corners.pathBottom} ${floorNotch} H ${row.xPos + row.width} `
    this.positionStatementInputConnection_(row)
  }
}
