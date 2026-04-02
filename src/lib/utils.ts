/**
 * Date helpers for Czech UI copy.
 * All comparisons use the user's local timezone unless noted.
 */

/** Formats an ISO date string as "30. 4. 2026" (day. month. year). */
export function formatCzechDate(dateString: string): string {
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) {
    return dateString
  }
  const day = d.getDate()
  const month = d.getMonth() + 1
  const year = d.getFullYear()
  return `${day}. ${month}. ${year}`
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isYesterdayLocal(date: Date): boolean {
  const today = startOfLocalDay(new Date())
  const y = new Date(today)
  y.setDate(y.getDate() - 1)
  return isSameLocalDay(startOfLocalDay(date), y)
}

/**
 * Human-readable relative time in Czech for note timestamps.
 */
export function formatRelativeTime(dateString: string): string {
  const then = new Date(dateString)
  if (Number.isNaN(then.getTime())) {
    return dateString
  }

  const nowMs = Date.now()
  const diffMs = Math.max(0, nowMs - then.getTime())
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)

  if (diffMins < 1) {
    return 'právě teď'
  }
  if (diffMins < 60) {
    if (diffMins === 1) {
      return 'před minutou'
    }
    return `před ${diffMins} minutami`
  }
  if (diffHours < 24) {
    if (diffHours === 1) {
      return 'před hodinou'
    }
    return `před ${diffHours} hodinami`
  }

  const todayStart = startOfLocalDay(new Date())
  const thenStart = startOfLocalDay(then)
  const calendarDaysAgo = Math.floor(
    (todayStart.getTime() - thenStart.getTime()) / 86_400_000,
  )

  if (calendarDaysAgo === 1 || isYesterdayLocal(then)) {
    return 'včera'
  }
  if (calendarDaysAgo >= 2 && calendarDaysAgo < 7) {
    return `před ${calendarDaysAgo} dny`
  }

  return formatCzechDate(dateString)
}

/** True if the calendar day of `yyyy-mm-dd` (or ISO) is strictly before today (local). */
export function isDeadlinePast(deadline: string): boolean {
  const parsed = new Date(deadline)
  if (Number.isNaN(parsed.getTime())) {
    return false
  }
  const deadlineDay = startOfLocalDay(parsed)
  const today = startOfLocalDay(new Date())
  return deadlineDay.getTime() < today.getTime()
}

/** Local calendar date as YYYY-MM-DD (no UTC shift). */
function toYmdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Next Monday as YYYY-MM-DD in local time. If today is Monday, returns today.
 */
export function getNextMonday(): string {
  const d = startOfLocalDay(new Date())
  const dow = d.getDay() // 0 Sun … 6 Sat
  if (dow === 1) {
    return toYmdLocal(d)
  }
  const daysUntilMonday = dow === 0 ? 1 : 8 - dow
  d.setDate(d.getDate() + daysUntilMonday)
  return toYmdLocal(d)
}

/**
 * Week banner like "6. 4. – 12. 4. 2026" from Monday `weekStart` (YYYY-MM-DD).
 */
export function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00`)
  if (Number.isNaN(start.getTime())) {
    return weekStart
  }
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const sd = start.getDate()
  const sm = start.getMonth() + 1
  const ed = end.getDate()
  const em = end.getMonth() + 1
  const y = end.getFullYear()
  return `${sd}. ${sm}. – ${ed}. ${em}. ${y}`
}

const EN_DAY_TO_CZECH: Record<string, string> = {
  monday: 'Pondělí',
  tuesday: 'Úterý',
  wednesday: 'Středa',
  thursday: 'Čtvrtek',
  friday: 'Pátek',
  saturday: 'Sobota',
  sunday: 'Neděle',
}

/** Maps plan_data keys (monday, tuesday, …) to Czech day names. */
export function getCzechDayName(englishDay: string): string {
  const key = englishDay.toLowerCase()
  return EN_DAY_TO_CZECH[key] ?? englishDay
}

/** Phrase for batch-cooking card title, e.g. "Vaření v úterý", "Vaření ve středu". */
export function formatBatchCookDayHeader(englishDay: string): string {
  const key = englishDay.toLowerCase()
  const phrases: Record<string, string> = {
    monday: 'Vaření v pondělí',
    tuesday: 'Vaření v úterý',
    wednesday: 'Vaření ve středu',
    thursday: 'Vaření ve čtvrtek',
    friday: 'Vaření v pátek',
    saturday: 'Vaření v sobotu',
    sunday: 'Vaření v neděli',
  }
  return phrases[key] ?? `Vaření — ${getCzechDayName(englishDay)}`
}
