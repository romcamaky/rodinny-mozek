// Canonical place tag keys (aligned with voice-router / Claude) and UI labels + colors.

export const PLACE_TAG_CHIPS: { key: string; label: string }[] = [
  { key: 'kids-friendly', label: 'Děti' },
  { key: 'outdoor', label: 'Venku' },
  { key: 'indoor', label: 'Uvnitř' },
  { key: 'farma', label: 'Farma' },
  { key: 'hřiště', label: 'Hřiště' },
  { key: 'muzeum', label: 'Muzeum' },
  { key: 'příroda', label: 'Příroda' },
  { key: 'restaurace', label: 'Restaurace' },
  { key: 'kavárna', label: 'Kavárna' },
  { key: 'výlet', label: 'Výlet' },
  { key: 'zdarma', label: 'Zdarma' },
  { key: 'víkend', label: 'Víkend' },
  { key: 'čas ve dvou', label: 'Ve dvou' },
  { key: 'hernička', label: 'Hernička' },
]

/** Tag filter row on Places page (same keys as chips; "Vše" handled separately). */
export const PLACE_TAG_FILTER_OPTIONS = PLACE_TAG_CHIPS

const COLORS: Record<string, { bg: string; color: string }> = {
  'kids-friendly': { bg: '#fce7f3', color: '#9d174d' },
  outdoor: { bg: '#dcfce7', color: '#166534' },
  indoor: { bg: '#dbeafe', color: '#1d4ed8' },
  farma: { bg: '#fef3c7', color: '#b45309' },
  hřiště: { bg: '#ffedd5', color: '#c2410c' },
  muzeum: { bg: '#f3e8ff', color: '#6b21a8' },
  příroda: { bg: '#d1fae5', color: '#047857' },
  restaurace: { bg: '#fee2e2', color: '#b91c1c' },
  kavárna: { bg: '#e7e5e4', color: '#44403c' },
  výlet: { bg: '#ccfbf1', color: '#0f766e' },
  zdarma: { bg: '#ecfccb', color: '#4d7c0f' },
  víkend: { bg: '#e0e7ff', color: '#4338ca' },
  'čas ve dvou': { bg: '#ffe4e6', color: '#be123c' },
  hernička: { bg: '#fef9c3', color: '#a16207' },
}

const DEFAULT_STYLE = { bg: '#f1f5f9', color: '#475569' }

/** Returns pill colors for a stored tag string (case-insensitive key match). */
export function getPlaceTagStyle(tag: string): { bg: string; color: string } {
  const normalized = tag.trim().toLowerCase()
  const entry = PLACE_TAG_CHIPS.find((c) => c.key.toLowerCase() === normalized)
  if (entry && COLORS[entry.key]) {
    return COLORS[entry.key]
  }
  return COLORS[normalized] ?? DEFAULT_STYLE
}

export function labelForPlaceTag(tag: string): string {
  const normalized = tag.trim().toLowerCase()
  const found = PLACE_TAG_CHIPS.find((c) => c.key.toLowerCase() === normalized)
  return found?.label ?? tag
}
