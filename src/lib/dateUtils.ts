/**
 * Czech-relative labels for milestone "last activity" display.
 * Uses calendar day difference in local timezone (simple, no external deps).
 */

const MS_PER_DAY = 86_400_000

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function dayDiffFromNow(dateString: string): number {
  const then = startOfLocalDay(new Date(dateString))
  const now = startOfLocalDay(new Date())
  return Math.round((now - then) / MS_PER_DAY)
}

/**
 * Returns a short Czech relative phrase for `dateString` (ISO or parseable).
 */
export function getRelativeDate(dateString: string): string {
  const diff = dayDiffFromNow(dateString)
  if (diff === 0) return 'dnes'
  if (diff === 1) return 'včera'
  if (diff === 2) return 'před 2 dny'
  if (diff >= 3 && diff < 7) return `před ${diff} dny`
  if (diff >= 7 && diff < 14) return 'před týdnem'
  if (diff >= 14 && diff < 28) {
    const w = Math.floor(diff / 7)
    return `před ${w} týdny`
  }
  if (diff >= 28 && diff < 60) return 'před měsícem'
  if (diff >= 60 && diff < 365) {
    const m = Math.floor(diff / 30)
    return m === 1 ? 'před měsícem' : `před ${m} měsíci`
  }
  const y = Math.floor(diff / 365)
  return y === 1 ? 'před rokem' : `před ${y} lety`
}

const CZECH_MONTHS = [
  'ledna',
  'února',
  'března',
  'dubna',
  'května',
  'června',
  'července',
  'srpna',
  'září',
  'října',
  'listopadu',
  'prosince',
]

/**
 * e.g. "3. dubna 2026" for log history headers.
 */
export function formatCzechLongDate(dateString: string): string {
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return dateString
  const day = d.getDate()
  const month = CZECH_MONTHS[d.getMonth()] ?? ''
  const year = d.getFullYear()
  return `${day}. ${month} ${year}`
}

/**
 * Same UTC Monday week_start as the milestone-ai edge function uses for `milestone_tasks`.
 */
export function getWeekStartIsoUtc(d = new Date()): string {
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const day = new Date(utc).getUTCDay()
  const daysSinceMonday = (day + 6) % 7
  const mondayUtc = utc - daysSinceMonday * MS_PER_DAY
  return new Date(mondayUtc).toISOString().slice(0, 10)
}
