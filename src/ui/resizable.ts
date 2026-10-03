export type ResizeDirection = 'row' | 'column'

interface ResizableOptions {
  /** 'row': Handle wird horizontal gezogen, aendert die Breite von `target`.
   *  'column': Handle wird vertikal gezogen, aendert die Hoehe von `target`. */
  direction: ResizeDirection
  min: number
  max: number
  /** true, wenn `target` in der Flex-Reihenfolge NACH `handle` kommt — dann
   *  soll Ziehen nach rechts/unten das Panel verkleinern statt vergroessern
   *  (das Vorzeichen der Bewegung ist in diesem Fall umgekehrt). */
  reverse?: boolean
}

/** Macht `handle` zu einem Drag-Griff, der die flex-basis von `target` aendert. */
export function makeResizable(
  handle: HTMLElement,
  target: HTMLElement,
  options: ResizableOptions,
): void {
  const { direction, min, max, reverse = false } = options
  const sign = reverse ? -1 : 1
  let startPos = 0
  let startSize = 0

  function onPointerMove(event: PointerEvent): void {
    const rawDelta = direction === 'row' ? event.clientX - startPos : event.clientY - startPos
    const next = Math.min(max, Math.max(min, startSize + sign * rawDelta))
    target.style.flexBasis = `${next}px`
  }

  function onPointerUp(): void {
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', onPointerUp)
  }

  handle.addEventListener('pointerdown', (event) => {
    startPos = direction === 'row' ? event.clientX : event.clientY
    const rect = target.getBoundingClientRect()
    startSize = direction === 'row' ? rect.width : rect.height
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    event.preventDefault()
  })
}
