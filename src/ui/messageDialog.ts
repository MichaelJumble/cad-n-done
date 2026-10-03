export interface MessageDialogHandle {
  open(): void
}

/** Einfacher Hinweisdialog mit nur einem "Schliessen"-Button, z.B. fuer
 *  Fehlermeldungen (analog zum Info-Dialog, aber mit frei waehlbarem Text). */
export function mountMessageDialog(
  title: string,
  message: string,
  closeLabel: string,
): MessageDialogHandle {
  const dialog = document.createElement('dialog')
  dialog.className = 'info-dialog message-dialog'
  dialog.innerHTML = `
    <h2>${title}</h2>
    <p>${message}</p>
    <form method="dialog">
      <button type="submit" class="btn">${closeLabel}</button>
    </form>
  `
  document.body.appendChild(dialog)

  return {
    open(): void {
      dialog.showModal()
    },
  }
}
