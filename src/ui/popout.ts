export interface PopoutHandle {
  toggle(): void
  onToggle(listener: (open: boolean) => void): () => void
}

/**
 * Verschiebt `panelBody` bei Bedarf in ein eigenes Browser-Fenster
 * (window.open, navigiert auf die leere Huellen-Seite viewer.html statt auf
 * about:blank - siehe unten) und wieder zurueck, wenn dieses geschlossen
 * wird. Waehrend das Panel ausgelagert ist, wird die ganze Sektion (inkl.
 * ihres Resizers) versteckt, damit der Nachbarbereich (Design) den frei
 * werdenden Platz uebernimmt.
 */
export function makePopout(
  panelSection: HTMLElement,
  panelBody: HTMLElement,
  resizer: HTMLElement,
): PopoutHandle {
  let popupWindow: Window | null = null
  const listeners = new Set<(open: boolean) => void>()

  function notify(open: boolean): void {
    listeners.forEach((listener) => listener(open))
  }

  function bringBack(): void {
    const win = popupWindow
    popupWindow = null
    panelSection.appendChild(panelBody)
    panelSection.hidden = false
    resizer.hidden = false
    notify(false)
    // "pagehide" feuert nicht nur beim tatsaechlichen Schliessen, sondern
    // auch waehrenddessen - win.close() ist an dieser Stelle idempotent
    // (No-op auf einem bereits schliessenden/geschlossenen Fenster), stellt
    // aber sicher, dass das jetzt leere Popup-Fenster wirklich verschwindet
    // und nicht als leere Huelle stehen bleibt (siehe Bug: manche Browser
    // schliessen ein Popup nach laengerer Interaktion nicht mehr zuverlaessig
    // ueber den urspruenglichen popupWindow.close()-Aufruf in toggle()).
    win?.close()
  }

  function open(): void {
    // viewer.html traegt Titel/Favicon schon fest im HTML (kein about:blank
    // mehr) - dadurch zeigt die Adressleiste eine echte URL und der Tab hat
    // sofort den richtigen Titel, ohne dass hier noch JS dafuer noetig ist.
    const opened = window.open(
      `${import.meta.env.BASE_URL}viewer.html`,
      'blockscad-viewer-popout',
      'width=640,height=480',
    )
    if (!opened) {
      // Popup-Blocker o.ae. — Panel bleibt einfach eingebettet.
      return
    }
    // Eigener Name statt "opened" weiter unten: TS kann die Null-Pruefung
    // oben sonst nicht in die spaeter aufgerufene moveContentIn()-Closure
    // hinein nachverfolgen.
    const win = opened
    popupWindow = win

    // Der Inhalt darf erst rein, NACHDEM viewer.html fertig geladen ist -
    // window.open() navigiert asynchron; wuerde man sofort in win.document
    // schreiben, landet das noch im alten (about:blank-)Dokument und geht
    // beim Abschluss der eigentlichen Navigation verloren. readyState-Check
    // faengt den (seltenen) Fall ab, dass die winzige Seite schon fertig ist,
    // bevor der Listener ueberhaupt angehaengt wurde.
    function moveContentIn(): void {
      // Theme (data-theme + Stylesheets) mit ins Popup-Fenster uebernehmen,
      // damit verschobene Inhalte optisch konsistent zur Hauptseite bleiben.
      const theme = document.documentElement.dataset.theme
      if (theme) win.document.documentElement.dataset.theme = theme
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        win.document.head.appendChild(node.cloneNode(true))
      })

      win.document.body.style.margin = '0'
      win.document.body.style.height = '100vh'
      // Ohne overflow:hidden koennte der verschobene Inhalt (siehe naechster
      // Kommentar) einen Scrollbalken auf dem <body> ausloesen - in einem
      // eigenen, extra dafuer geoeffneten Fenster ergibt Scrollen hier nie
      // einen Sinn (der Viewer selbst passt seine Groesse ohnehin per
      // resize()/notify() an).
      win.document.body.style.overflow = 'hidden'
      win.document.body.style.background = 'var(--color-bg)'
      win.document.body.style.display = 'flex'
      win.document.body.style.flexDirection = 'column'
      win.document.body.appendChild(panelBody)
      // #viewer-root (siehe layout.css) erwartet von seinem Elternelement
      // eine FESTE Hoehe zum Ausfuellen (".viewer-canvas { flex:1 }" braucht
      // das, um den Rest der Spalte zu bekommen) - im eingebetteten Panel
      // liefert das die durchgehende .app-shell/.panel-Kette, hier gibt es
      // die nicht mehr, also muss #viewer-root diese Hoehe selbst per
      // flex:1 einfordern.
      panelBody.style.flex = '1 1 auto'
      panelBody.style.minHeight = '0'
      // Erst JETZT (Inhalt ist wirklich umgezogen) verstecken/benachrichtigen -
      // vorher wuerden z.B. viewer.resize()-Aufrufe in onToggle-Listenern
      // (siehe viewerPanel.ts) noch auf dem alten, gerade erst versteckten
      // Panel rechnen, statt auf der tatsaechlichen neuen Groesse im Popup.
      panelSection.hidden = true
      resizer.hidden = true
      notify(true)

      // ERST hier (nicht schon direkt nach window.open()) anmelden: die
      // anfaengliche Navigation von about:blank zu viewer.html zaehlt fuer
      // das Popup-Fenster selbst bereits als "Dokument wird ersetzt" und kann
      // dabei faelschlich EBENFALLS "pagehide" ausloesen - waere der Listener
      // schon vorher aktiv, wuerde bringBack() (inkl. win.close(), siehe
      // dort) sofort nach dem Oeffnen feuern und das Popup ungewollt sofort
      // wieder schliessen, obwohl der Nutzer nichts getan hat.
      win.addEventListener('pagehide', bringBack)
    }
    // Immer auf "load" warten statt vorab readyState zu pruefen: unmittelbar
    // nach window.open(url) zeigt win.document oft noch das anfaengliche
    // (bereits "complete" gemeldete) Platzhalter-Dokument, BEVOR die
    // eigentliche Navigation zu viewer.html ueberhaupt begonnen hat - eine
    // readyState-Abfrage an dieser Stelle waere also faelschlich schon
    // "complete", obwohl viewer.html noch gar nicht geladen ist. Eine echte
    // URL-Navigation ist (anders als about:blank) nie synchron abgeschlossen,
    // "load" trifft daher zuverlaessig ein.
    win.addEventListener('load', moveContentIn, { once: true })

    // Groessenaenderungen des Popup-Fensters muessen den verschobenen
    // Inhalt (z.B. den 3D-Canvas) explizit zum Neuberechnen anstossen.
    win.addEventListener('resize', () => notify(true))
  }

  window.addEventListener('beforeunload', () => popupWindow?.close())

  return {
    toggle() {
      if (popupWindow) {
        popupWindow.close()
      } else {
        open()
      }
    },
    onToggle(listener: (open: boolean) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
