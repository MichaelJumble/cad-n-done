import * as Blockly from 'blockly'

/** Blocklys Standard-Flyout (das Kategorie-Popup mit den verfuegbaren
 *  Bloecken) uebernimmt bei jedem Reflow unveraendert den Zoom des
 *  Haupt-Workspace (Flyout.prototype.getFlyoutScale() liefert per Default
 *  targetWorkspace.scale) - beim Herein-/Herauszoomen im Canvas wirken die
 *  Bloecke in der Toolbox dadurch ebenso winzig/riesig, obwohl sie dort rein
 *  zum Ansehen/Herausziehen gedacht sind und unabhaengig lesbar bleiben
 *  sollten. getFlyoutScale() ist genau fuer diesen Fall als ueberschreibbar
 *  dokumentiert (siehe flyout_base.d.ts) - hier fest auf 1 (100%) gepinnt,
 *  unabhaengig vom aktuellen Workspace-Zoom. */
export class FixedScaleFlyout extends Blockly.VerticalFlyout {
  override getFlyoutScale(): number {
    return 1
  }
}
