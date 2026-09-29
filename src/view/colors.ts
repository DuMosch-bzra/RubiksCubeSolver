import type { Face } from '../cube/state.ts'

/**
 * Colour scheme: yellow top, green front, so the white cross is solved on
 * the bottom as in CFOP. Each face's colour and its name live together so
 * they can't drift apart.
 */
const SCHEME: Record<Face, { hex: string; name: string }> = {
  U: { hex: '#ffd500', name: 'yellow' },
  D: { hex: '#f5f5f5', name: 'white' },
  F: { hex: '#00ff00', name: 'green' },
  B: { hex: '#0000ff', name: 'blue' },
  R: { hex: '#ff0000', name: 'red' },
  L: { hex: '#ff5800', name: 'orange' },
}

const mapScheme = <T,>(pick: (entry: { hex: string; name: string }) => T) =>
  Object.fromEntries(Object.entries(SCHEME).map(([f, e]) => [f, pick(e)])) as Record<Face, T>

export const FACE_COLORS: Record<Face, string> = mapScheme((e) => e.hex)
export const COLOR_NAMES: Record<Face, string> = mapScheme((e) => e.name)

export const colorName = (f: Face): string => COLOR_NAMES[f]

/** Colour of an unpainted sticker. */
export const UNPAINTED_COLOR = '#55555b'
