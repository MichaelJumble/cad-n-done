import { defineConfig, type Plugin } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// Der Proxy unter dev.do-n-done.de leitet nur Pfade unter diesem Praefix
// durch, entfernt es aber, bevor die Anfrage bei Vite ankommt. Vite braucht
// das Praefix trotzdem (via `base`), um im HTML/Modulgraph korrekte,
// proxy-taugliche URLs zu erzeugen. Diese Middleware ergaenzt das vom Proxy
// entfernte Praefix serverseitig wieder, bevor Vites eigenes Routing greift.
const PROXY_PREFIX = '/proxy/5173'

function restoreProxyPrefix(): Plugin {
  return {
    name: 'restore-proxy-prefix',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && !req.url.startsWith(PROXY_PREFIX)) {
          req.url = PROXY_PREFIX + req.url
        }
        next()
      })
    },
  }
}

export default defineConfig({
  base: `${PROXY_PREFIX}/`,
  plugins: [restoreProxyPrefix()],
  server: {
    host: '0.0.0.0',
    // dev-convenience: erlaubt beliebige Host-Header (z.B. wenn ueber ein
    // Ports-Panel/Tunnel mit wechselndem Hostnamen zugegriffen wird)
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      input: {
        // Landingpage/Marketing-Seite (statisches HTML, kein Modulgraph) -
        // der eigentliche Editor liegt unter startcadndone.html, siehe dort.
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./startcadndone.html', import.meta.url)),
        // Impressum liegt als rein statische Seite in public/ (siehe dort) -
        // kein eigener Rollup-Entry noetig, public/* wird unveraendert in
        // die Ausgabe kopiert.
        // Phase-0-Machbarkeitstests bleiben als separate Seite erreichbar,
        // siehe docs/phase0-report.md.
        phase0: fileURLToPath(new URL('./phase0.html', import.meta.url)),
        // Eigenstaendige Seite fuer den Tutorials-Popout (siehe
        // samplesDialog.ts/tutorialsMain.ts) - eine echte Seite statt eines
        // about:blank-Popup-Fensters.
        tutorials: fileURLToPath(new URL('./tutorials.html', import.meta.url)),
        // Leere Huellen-Seite fuer den Viewer-Popout (siehe popout.ts) - eine
        // echte, aus einer Datei geladene Seite statt about:blank, damit Tab-
        // Titel/Favicon/Adresse stimmen. Ohne eigenes Skript: der komplette
        // Viewer-Inhalt wird weiterhin per DOM-Verschiebung vom Hauptfenster
        // aus hineingesetzt, sobald die Seite geladen ist.
        viewer: fileURLToPath(new URL('./viewer.html', import.meta.url)),
      },
    },
  },
})
