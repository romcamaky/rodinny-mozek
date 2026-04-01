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
