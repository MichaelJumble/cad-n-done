import { t } from '../i18n'

export interface InfoDialogHandle {
  open(): void
}

/** Baut das Info-Dialog (ueber das Hauptmenue erreichbar) und haengt es an document.body. */
export function mountInfoDialog(): InfoDialogHandle {
  const dialog = document.createElement('dialog')
  dialog.className = 'info-dialog'
  dialog.innerHTML = `
    <h2>${t('app.title')}</h2>
    <p>${t('info.tagline')}</p>
    <p class="info-subheading">${t('info.license_heading')}</p>
    <ul class="info-tech-list">
      <li>${t('info.license_blockly')}</li>
      <li>${t('info.license_openscad')}</li>
      <li>${t('info.license_threejs')}</li>
    </ul>
    <p class="info-copyright">
      V0.90 - ©2026 Michael Sendrowski, D-Willich · <a href="mailto:michael@sendrowski.de">michael@sendrowski.de</a><br />
      ${t('info.usage_notice')}
    </p>
    <form method="dialog">
      <button type="submit" class="btn">${t('info.close')}</button>
    </form>
  `
  document.body.appendChild(dialog)

  return {
    open(): void {
      dialog.showModal()
    },
  }
}
