import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrentUserId } from '../lib/dataService'
import { supabase } from '../lib/supabase'
import { getCheckinForWeek, getWeekStart } from '../lib/wellbeingService'

/** Czech plural copy for active milestone count (1 / 2–4 / 5+). */
function activeMilestonesSubtitle(count: number): string {
  const n = count % 100
  if (n >= 11 && n <= 14) {
    return `${count} aktivních milníků`
  }
  const last = count % 10
  if (last === 1) {
    return `${count} aktivní milník`
  }
  if (last >= 2 && last <= 4) {
    return `${count} aktivní milníky`
  }
  return `${count} aktivních milníků`
}

function Dashboard() {
  const [wellbeingFilled, setWellbeingFilled] = useState<boolean | null>(null)
  /** `null` = loading */
  const [milestoneSubtitle, setMilestoneSubtitle] = useState<string | null>(null)

  const loadWellbeingStatus = useCallback(async () => {
    try {
      const row = await getCheckinForWeek(getWeekStart())
      setWellbeingFilled(Boolean(row?.completedAt))
    } catch {
      setWellbeingFilled(false)
    }
  }, [])

  useEffect(() => {
    void loadWellbeingStatus()
  }, [loadWellbeingStatus])

  const loadActiveMilestoneCount = useCallback(async () => {
    const userId = await getCurrentUserId()
    const { count, error } = await supabase
      .from('milestones')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active')

    if (error || count === null || count === 0) {
      setMilestoneSubtitle('Zatím žádné milníky')
      return
    }
    setMilestoneSubtitle(activeMilestonesSubtitle(count))
  }, [])

  useEffect(() => {
    void loadActiveMilestoneCount()
  }, [loadActiveMilestoneCount])

  return (
    <section className="bg-page mx-auto w-full max-w-md pb-4">
      <h1 className="text-primary text-3xl font-bold">Dashboard</h1>

      <div className="mt-5 space-y-4">
        <Link
          to="/dashboard/wellbeing"
          className="card-rainbow bg-surface block rounded-xl border border-[color:var(--color-border)] p-4 shadow-sm transition-opacity active:opacity-90"
          style={{ boxShadow: '0 1px 3px color-mix(in srgb, var(--color-text) 10%, transparent)' }}
        >
          <div className="text-primary flex items-center gap-2 text-base font-semibold">
            <span aria-hidden>💚</span>
            <span>Týdenní well-being check-in</span>
          </div>
          <p className="text-secondary mt-2 text-sm">
            {wellbeingFilled === null && 'Načítám stav…'}
            {wellbeingFilled === true && 'Vyplněno ✓'}
            {wellbeingFilled === false && 'Čeká na vyplnění'}
          </p>
        </Link>

        <Link
          to="/milestones"
          className="card-rainbow bg-surface block rounded-xl border border-[color:var(--color-border)] p-4 shadow-sm transition-opacity active:opacity-90"
          style={{ boxShadow: '0 1px 3px color-mix(in srgb, var(--color-text) 10%, transparent)' }}
        >
          <div className="text-primary flex items-center gap-2 text-base font-semibold">
            <span aria-hidden>👶</span>
            <span>Vývoj dětí</span>
          </div>
          <p className="text-secondary mt-2 text-sm">
            {milestoneSubtitle === null ? 'Načítám…' : milestoneSubtitle}
          </p>
        </Link>

        <div
          className="card-rainbow bg-surface rounded-xl border border-[color:var(--color-border)] p-4 shadow-sm"
          style={{ boxShadow: '0 1px 3px color-mix(in srgb, var(--color-text) 10%, transparent)' }}
        >
          <div className="text-primary flex items-center gap-2 text-base font-semibold">
            <span aria-hidden>🌤️</span>
            <span>Víkendové aktivity</span>
          </div>
          <p className="text-secondary mt-2 text-sm">Brzy zde: doporučení na víkend</p>
        </div>
      </div>
    </section>
  )
}

export default Dashboard
