const STORAGE_KEY = 'blockscad-next:zoomScaleSpeed'

// Blocklys eigener Standard fuer zoomOptions.scaleSpeed ist 1.2 (20% Zoom pro
// Mausrad-Tick) - das wirkt fuer viele "ruppig"/sprunghaft. 1.1 (10% pro
// Tick) ist deutlich sanfter und dient hier als Ausgangswert, ueber den
// Schieberegler im Zoom-Cluster (siehe minimap.ts) frei einstellbar.
export const DEFAULT_ZOOM_SCALE_SPEED = 1.1
export const MIN_ZOOM_SCALE_SPEED = 1.02
export const MAX_ZOOM_SCALE_SPEED = 1.4

export function getZoomScaleSpeed(): number {
  const stored = Number.parseFloat(localStorage.getItem(STORAGE_KEY) ?? '')
  if (!Number.isFinite(stored)) return DEFAULT_ZOOM_SCALE_SPEED
  return Math.min(MAX_ZOOM_SCALE_SPEED, Math.max(MIN_ZOOM_SCALE_SPEED, stored))
}

export function setZoomScaleSpeed(scaleSpeed: number): void {
  localStorage.setItem(STORAGE_KEY, String(scaleSpeed))
}
