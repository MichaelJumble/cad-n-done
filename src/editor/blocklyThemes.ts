import * as Blockly from 'blockly'
import type { ThemeName } from '../ui/theme'

const darkTheme = Blockly.Theme.defineTheme('bsn-dark', {
  name: 'bsn-dark',
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#1f2023',
    toolboxBackgroundColour: '#2a2b2e',
    toolboxForegroundColour: '#e6e6e6',
    flyoutBackgroundColour: '#2a2b2e',
    flyoutForegroundColour: '#e6e6e6',
    flyoutOpacity: 1,
    scrollbarColour: '#5a5b60',
    insertionMarkerColour: '#ffffff',
    insertionMarkerOpacity: 0.3,
    cursorColour: '#ffffff',
  },
})

const contrastTheme = Blockly.Theme.defineTheme('bsn-contrast', {
  name: 'bsn-contrast',
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#000000',
    toolboxBackgroundColour: '#000000',
    toolboxForegroundColour: '#ffffff',
    flyoutBackgroundColour: '#000000',
    flyoutForegroundColour: '#ffffff',
    flyoutOpacity: 1,
    scrollbarColour: '#ffff00',
    insertionMarkerColour: '#ffff00',
    insertionMarkerOpacity: 0.5,
  },
})

const themesByName: Record<ThemeName, Blockly.Theme> = {
  default: Blockly.Themes.Classic,
  dark: darkTheme,
  contrast: contrastTheme,
}

/** Liefert das zum App-Farbdesign passende Blockly-Workspace-Theme. */
export function getBlocklyTheme(theme: ThemeName): Blockly.Theme {
  return themesByName[theme]
}
