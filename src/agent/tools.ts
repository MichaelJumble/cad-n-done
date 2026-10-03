import type { AgentTool } from '../types'

/** Einziges Tool des Bau-Agenten: liefert den KOMPLETTEN Bauplan in einem
 *  einzigen Aufruf statt in vielen einzelnen Zuegen (siehe agentClient.ts —
 *  bewusst auf genau 2 API-Aufrufe pro Bauvorgang begrenzt, unabhaengig von
 *  der Schrittzahl, da jeder zusaetzliche Zug die komplette bisherige
 *  Historie erneut mitschickt und dadurch stark ins Gewicht faellt).
 *
 *  Da alle Schritte in EINEM Aufruf entstehen, kennt Claude beim Erzeugen
 *  eines Schritts noch keine echten Blockly-block_ids nachfolgender/
 *  vorheriger Schritte (die entstehen erst beim tatsaechlichen lokalen
 *  Bauen) — deshalb vergibt Claude pro Schritt eine eigene, im Plan
 *  eindeutige "id" (z.B. "cube1"), auf die andere Schritte per String
 *  verweisen koennen. toolExecutor.ts fuehrt jeden Schritt der Reihe nach
 *  aus und ersetzt jeden Verweis auf eine Schritt-id durch die dabei
 *  entstandene echte block_id, bevor der naechste Schritt drankommt (siehe
 *  resolveStepRefs() in agentClient.ts). */
export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'build_plan',
    description: `Gibt den kompletten Bauplan als geordnete Liste von Schritten zurueck. Jeder Schritt hat:
- "id": eine frei waehlbare, in diesem Plan eindeutige Kennung (z.B. "cube1", "wrap1") — wird verwendet, damit spaetere Schritte auf das Ergebnis frueherer Schritte verweisen koennen. KEINE echte Blockly-block_id, die kennst du hier noch nicht.
- "tool": eines von add_primitive | wrap_transform | combine | create_module | call_module | create_loop | set_field | remove_block. WICHTIG: "union", "difference", "intersection", "cube", "sphere", "cylinder", "translate", "rotate", "scale", "color", "sides", "resize" sind KEINE eigenen Werkzeugnamen, sondern nur WERTE des "type"-Parameters von combine/add_primitive/wrap_transform (siehe unten) — "tool" muss trotzdem immer eines der acht oben genannten Werkzeuge bleiben.
- "input": die Parameter fuer dieses Werkzeug (siehe unten). Ueberall wo eine "id" referenziert wird (z.B. child_block_id, child_block_ids, body_block_ids, block_id), gilt: fuer einen Block, den DU in DIESEM Plan selbst mit "add_primitive"/"wrap_transform"/"combine"/"create_module"/"call_module"/"create_loop" erzeugst, dort genau den String aus dessen eigenem "id"-Feld eintragen. Um stattdessen ein BEREITS VORHANDENES Objekt aus einem frueheren Bauvorgang zu veraendern (faerben, verschieben, loeschen, ...), dort die ECHTE block_id aus der Liste "Vorhandene Top-Level-Objekte" (siehe Nutzernachricht) eintragen - niemals eine id fuer ein bereits existierendes Objekt selbst erfinden.

WERKZEUGE UND IHRE PARAMETER:
- add_primitive: { type: "cube"|"sphere"|"cylinder", x,y,z (cube), r (sphere), r1,r2,h (cylinder), centered: boolean }. Erzeugt einen neuen, frei stehenden Grundkoerper.
- wrap_transform: { child_block_id: "<id eines frueheren Schritts>", type: "translate"|"rotate"|"scale"|"color"|"sides"|"resize", x,y,z, colour (nur color, Hex z.B. "#ff0000"), n (nur sides, Anzahl Facetten fuer runde Formen wie Kugel/Zylinder, Standard 8 - hoehere Werte fuer glattere Kugeln/Zylinder, z.B. 32 oder 64, kosten mehr Renderzeit), auto: boolean (nur resize, automatische Proportionsanpassung) }. Umschliesst den referenzierten Block mit einer Transformation — der referenzierte Block wird dabei zu deren Kind, seine alte id ist danach nicht mehr gueltig, nur noch die id DIESES wrap-Schritts. "resize" skaliert die Zielmasse in X/Y/Z absolut (im Gegensatz zu "scale", das mit einem Faktor multipliziert).
- combine: { type: "union"|"difference"|"intersection", child_block_ids: ["<id>", "<id>", ...] } (mind. 2). Bei "difference" ist der erste Eintrag die Ausgangsform, alle weiteren werden abgezogen.
- create_module: { name: string, body_block_ids: ["<id>", ...] }. Fasst frei stehende Bloecke als Modul-Rumpf zusammen — erzeugt NUR die Definition, OHNE Aufruf bleibt sie wirkungslos!
- call_module: { name: string }. WICHTIG: fuer JEDES per create_module definierte Modul, das tatsaechlich im Modell erscheinen soll, IMMER mindestens einen eigenen call_module-Schritt mit demselben name ergaenzen (sonst wird das Modul nie instanziiert und taucht im erzeugten Code gar nicht auf). Erzeugt einen frei stehenden Aufruf-Block, dessen id wie jede andere weiterverwendet werden kann (z.B. um mehrere Aufrufe unterschiedlich zu positionieren).
- create_loop: { var_name: string (z.B. "i"), from, to, step (Standard 1), hull: boolean (Standard false, umschliesst den Schleifenrumpf mit hull() statt ihn nur zu wiederholen), body_block_ids: ["<id>", ...] }. Fasst frei stehende Bloecke als Schleifenrumpf zusammen (wie create_module, aber als OpenSCAD for-Schleife statt Modul). Nutze dies fuer WIEDERKEHRENDE Anordnungen mit einer laufenden Zahl (z.B. 8 Zaunlatten im Kreis, 12 Zaehne an einem Zahnrad) statt denselben Bauplan mehrfach zu wiederholen. "var_name" ist ein normaler String (KEINE Schritt-id) - referenziere ihn in numerischen Feldern INNERHALB des Schleifenrumpfs per {"op":"variable","name":"i"} (siehe MATHE-AUSDRUECKE unten). Zwei VERSCHACHTELTE Schleifen brauchen unterschiedliche var_name, sonst teilen sie sich versehentlich dieselbe Laufvariable.
- set_field: { block_id: "<id>", field_name: string, value: string|number|Ausdruck }. Korrigiert nachtraeglich einen einzelnen Wert (Feldnamen z.B. X, Y, Z, R, COLOUR, CENTER, NAME, oder bei einer Schleife FROM/TO/STEP).
- remove_block: { block_id: "<id>" }. Loescht einen Schritt wieder.

MATHE-AUSDRUECKE: JEDER numerische Parameter (x, y, z, r, r1, r2, h, n, from, to, step, ...) akzeptiert statt einer reinen Zahl auch ein verschachteltes Ausdrucksobjekt mit einem "op"-Feld:
- {"op":"add"|"subtract"|"multiply"|"divide"|"power", "a": <Zahl-oder-Ausdruck>, "b": <Zahl-oder-Ausdruck>} — z.B. {"op":"multiply","a":{"op":"variable","name":"i"},"b":10} fuer "das i-fache von 10".
- {"op":"neg"|"sqrt"|"abs"|"ln"|"log10"|"exp", "a": <Zahl-oder-Ausdruck>}
- {"op":"sin"|"cos"|"tan"|"asin"|"acos"|"atan", "a": <Zahl-oder-Ausdruck>} (Winkel in Grad)
- {"op":"variable", "name": "<var_name einer create_loop-Schleife>"} — referenziert die Laufvariable. Funktioniert nur, wenn die referenzierte Schleife tatsaechlich existiert (in diesem Plan per create_loop angelegt).`,
    input_schema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              tool: {
                type: 'string',
                enum: [
                  'add_primitive',
                  'wrap_transform',
                  'combine',
                  'create_module',
                  'call_module',
                  'create_loop',
                  'set_field',
                  'remove_block',
                ],
              },
              input: { type: 'object' },
            },
            required: ['id', 'tool', 'input'],
            additionalProperties: false,
          },
        },
      },
      required: ['steps'],
      additionalProperties: false,
    },
  },
]
