/**
 * Milestone list + weekly development plan for both twins at the top.
 *
 * Weekly activities are one shared JSON plan per UTC week (`weekly_activities`) — not the same as
 * per-child `milestone_tasks` on each milestone detail page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  adjustDifficulty,
  fetchLatestLogDatesByMilestone,
  fetchMilestonesOrdered,
  fetchWeeklyActivities,
  generateWeeklyActivities,
  replaceActivity,
  toggleActivityDone,
} from '../lib/milestoneService'
import { getRelativeDate, getWeekStartIsoUtc } from '../lib/dateUtils'
import type { ActivityItem, Milestone, WeeklyActivities } from '../types/milestones'
import { useToast } from '../contexts/ToastContext'

type ChildFilter = 'all' | 'viky' | 'adri'

/** Only one activity card shows the replace form at a time so the UI stays readable on mobile. */
type SectionBusy = 'generate' | 'adjust' | null

function childLabel(name: Milestone['child_name']): string {
  return name === 'adri' ? 'Adri' : 'Viky'
}

function categoryLabel(cat: Milestone['category']): string {
  return cat === 'life_skill' ? 'Životní dovednost' : 'Vývojový milník'
}

function childBadgeClass(name: Milestone['child_name']): string {
  return name === 'adri'
    ? 'bg-purple-100 text-purple-700'
    : 'bg-pink-100 text-pink-700'
}

function statusDotClass(status: Milestone['status']): string {
  if (status === 'active') return 'bg-green-500'
  if (status === 'paused') return 'bg-yellow-400'
  return 'bg-gray-400'
}

function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <div
      className={`shrink-0 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent ${className}`}
      aria-hidden
    />
  )
}

const CATEGORY_LABELS: Record<ActivityItem['category'], string> = {
  motor: 'Motorika',
  speech: 'Řeč',
  independence: 'Samostatnost',
  sensory: 'Smysly',
  play: 'Hra',
  social: 'Sociální',
}

function categoryBadgeClass(cat: ActivityItem['category']): string {
  const map: Record<ActivityItem['category'], string> = {
    motor: 'bg-blue-100 text-blue-700',
    speech: 'bg-green-100 text-green-700',
    independence: 'bg-orange-100 text-orange-700',
    sensory: 'bg-yellow-100 text-yellow-700',
    play: 'bg-pink-100 text-pink-700',
    social: 'bg-purple-100 text-purple-700',
  }
  return map[cat]
}

/** `difficulty_level` is stored on the row after each generate/adjust; we only mirror it in the UI. */
function difficultyLabel(d: WeeklyActivities['difficulty_level']): string {
  if (d === 'easier') return 'jednodušší'
  if (d === 'harder') return 'náročnější'
  return 'normální'
}

function WeeklyActivitiesSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />
      ))}
    </div>
  )
}

function MilestonesPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [weekStart] = useState(() => getWeekStartIsoUtc())

  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyActivities | null>(null)
  const [weeklyLoading, setWeeklyLoading] = useState(true)
  const [sectionBusy, setSectionBusy] = useState<SectionBusy>(null)
  const [replacingId, setReplacingId] = useState<string | null>(null)
  const [replaceOpenForId, setReplaceOpenForId] = useState<string | null>(null)
  const [replaceReason, setReplaceReason] = useState('')

  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [lastLogById, setLastLogById] = useState<Map<string, string>>(new Map())
  const [milestonesLoading, setMilestonesLoading] = useState(true)
  const [childFilter, setChildFilter] = useState<ChildFilter>('all')

  const load = useCallback(async () => {
    setWeeklyLoading(true)
    setMilestonesLoading(true)
    try {
      const [plan, list] = await Promise.all([
        fetchWeeklyActivities(weekStart),
        fetchMilestonesOrdered(),
      ])
      setWeeklyPlan(plan)
      setMilestones(list)
      const ids = list.map((m) => m.id)
      const dates = await fetchLatestLogDatesByMilestone(ids)
      setLastLogById(dates)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Chyba načítání'
      showToast(msg, 'error')
      setWeeklyPlan(null)
      setMilestones([])
      setLastLogById(new Map())
    } finally {
      setWeeklyLoading(false)
      setMilestonesLoading(false)
    }
  }, [showToast, weekStart])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (childFilter === 'all') return milestones
    return milestones.filter((m) => m.child_name === childFilter)
  }, [milestones, childFilter])

  function toggleChildFilter(next: 'viky' | 'adri') {
    setChildFilter((prev) => (prev === next ? 'all' : next))
  }

  async function runGenerate() {
    if (weeklyPlan) {
      if (!window.confirm('Nahradit aktuální plán?')) return
    }
    setSectionBusy('generate')
    try {
      const level = weeklyPlan?.difficulty_level
      const plan = await generateWeeklyActivities(level)
      setWeeklyPlan(plan)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Chyba'
      showToast(msg, 'error')
    } finally {
      setSectionBusy(null)
    }
  }

  async function runAdjust(level: 'easier' | 'harder') {
    const word = level === 'easier' ? 'jednodušší' : 'náročnější'
    if (!window.confirm(`Přegenerovat celý plán na ${word} úroveň?`)) return
    setSectionBusy('adjust')
    try {
      const plan = await adjustDifficulty(level)
      setWeeklyPlan(plan)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Chyba'
      showToast('Nepodařilo se upravit obtížnost.', 'error')
      if (msg) console.warn(msg)
    } finally {
      setSectionBusy(null)
    }
  }

  function openReplaceForm(activityId: string) {
    setReplaceOpenForId((prev) => (prev === activityId ? null : activityId))
    setReplaceReason('')
  }

  async function submitReplace(activityId: string) {
    if (!weeklyPlan) return
    setReplacingId(activityId)
    try {
      const plan = await replaceActivity(activityId, replaceReason.trim() || undefined)
      setWeeklyPlan(plan)
      setReplaceOpenForId(null)
      setReplaceReason('')
    } catch {
      showToast('Nepodařilo se nahradit aktivitu.', 'error')
    } finally {
      setReplacingId(null)
    }
  }

  /**
   * Checkbox: flip local state immediately, then persist; revert on failure (same idea as milestone task rows).
   */
  async function onToggleActivityDone(activityId: string) {
    if (!weeklyPlan) return
    const prev = weeklyPlan
    const nextActivities = prev.activities.map((a) =>
      a.id === activityId ? { ...a, done: !a.done } : a,
    )
    setWeeklyPlan({ ...prev, activities: nextActivities })
    try {
      await toggleActivityDone(prev.id, activityId, prev.activities)
    } catch {
      setWeeklyPlan(prev)
      showToast('Nepodařilo se uložit stav aktivity.', 'error')
    }
  }

  const doneCount = weeklyPlan?.activities.filter((a) => a.done).length ?? 0
  const totalActivities = weeklyPlan?.activities.length ?? 0
  const progressPct =
    totalActivities > 0 ? Math.round((doneCount / totalActivities) * 100) : 0

  return (
    <div className="mx-auto max-w-md pb-2">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">Vývoj dětí</h1>
        <button
          type="button"
          onClick={() => navigate('/milestones/new')}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-indigo-600 text-indigo-600"
          aria-label="Přidat milník"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Shared weekly plan (twins); milestone list follows after separator. */}
      <section className="relative mb-8 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        {sectionBusy ? (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/90 px-4"
            aria-busy="true"
          >
            <Spinner className="h-8 w-8" />
            <p className="text-center text-sm font-medium text-gray-700">
              {sectionBusy === 'generate'
                ? 'Claude vymýšlí aktivity...'
                : 'Přizpůsobuji obtížnost...'}
            </p>
          </div>
        ) : null}

        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-gray-900">Aktivity na tento týden</h2>
          <button
            type="button"
            onClick={() => void runGenerate()}
            disabled={!!sectionBusy || weeklyLoading}
            className="shrink-0 rounded-xl border border-indigo-600 px-3 py-2 text-xs font-medium text-indigo-600 disabled:opacity-50"
          >
            Generovat nový plán
          </button>
        </div>

        {weeklyLoading ? (
          <WeeklyActivitiesSkeleton />
        ) : !weeklyPlan ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 py-8 text-center">
            <p className="mb-4 px-2 text-sm text-gray-600">Zatím nemáte plán na tento týden</p>
            <button
              type="button"
              onClick={() => void runGenerate()}
              disabled={!!sectionBusy}
              className="mx-auto min-h-11 rounded-xl bg-indigo-600 px-6 py-3 font-medium text-white disabled:opacity-50"
            >
              Vygenerovat aktivity
            </button>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {weeklyPlan.activities.map((a) => {
                const isReplaceOpen = replaceOpenForId === a.id
                const isReplacing = replacingId === a.id
                return (
                  <li
                    key={a.id}
                    className="relative rounded-xl border border-gray-100 bg-gray-50/80 p-3 shadow-sm"
                  >
                    {isReplacing ? (
                      <div className="absolute inset-0 z-[5] flex items-center justify-center rounded-xl bg-white/75">
                        <Spinner className="h-6 w-6" />
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-start justify-center pt-0.5">
                        <input
                          type="checkbox"
                          checked={a.done}
                          onChange={() => void onToggleActivityDone(a.id)}
                          className="h-6 w-6 rounded border-gray-300 text-indigo-600"
                          disabled={!!sectionBusy || !!replacingId}
                        />
                      </label>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`font-medium text-gray-900 ${a.done ? 'text-gray-400 line-through' : ''}`}
                        >
                          {a.activity}
                        </p>
                        {a.tip ? (
                          <p className="mt-1 text-sm text-gray-500">{a.tip}</p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryBadgeClass(a.category)}`}
                          >
                            {CATEGORY_LABELS[a.category]}
                          </span>
                          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                            {a.estimated_minutes} min
                          </span>
                        </div>
                        {isReplaceOpen ? (
                          <div className="mt-3 border-t border-gray-200 pt-3">
                            <input
                              type="text"
                              value={replaceReason}
                              onChange={(e) => setReplaceReason(e.target.value)}
                              placeholder="Např. příliš těžké, už to umí..."
                              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void submitReplace(a.id)}
                                disabled={!!replacingId || !!sectionBusy}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                              >
                                Nahradit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReplaceOpenForId(null)
                                  setReplaceReason('')
                                }}
                                className="min-h-11 px-3 text-sm font-medium text-gray-600"
                              >
                                Zrušit
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => openReplaceForm(a.id)}
                        disabled={!!sectionBusy || !!replacingId}
                        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                        aria-label="Nahradit aktivitu"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden
                        >
                          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>

            <p className="mt-4 text-center text-sm text-gray-600">
              Splněno: {doneCount}/{totalActivities} aktivit
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => void runAdjust('easier')}
                disabled={!!sectionBusy || !!replacingId}
                className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border border-indigo-600 py-2 text-sm font-medium text-indigo-600 disabled:opacity-50"
              >
                <span aria-hidden>↓</span>
                Jednodušší
              </button>
              <p className="text-center text-xs text-gray-500 sm:px-2">
                Úroveň: {difficultyLabel(weeklyPlan.difficulty_level)}
              </p>
              <button
                type="button"
                onClick={() => void runAdjust('harder')}
                disabled={!!sectionBusy || !!replacingId}
                className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border border-indigo-600 py-2 text-sm font-medium text-indigo-600 disabled:opacity-50"
              >
                Náročnější
                <span aria-hidden>↑</span>
              </button>
            </div>
          </>
        )}
      </section>

      <div
        className="mb-6 border-t border-gray-200"
        role="separator"
        aria-hidden
      />

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => toggleChildFilter('viky')}
          className={`min-h-11 flex-1 rounded-full px-4 py-2 text-sm font-medium ${
            childFilter === 'viky'
              ? 'bg-indigo-600 text-white'
              : 'border border-indigo-600 text-indigo-600'
          }`}
        >
          Viky
        </button>
        <button
          type="button"
          onClick={() => toggleChildFilter('adri')}
          className={`min-h-11 flex-1 rounded-full px-4 py-2 text-sm font-medium ${
            childFilter === 'adri'
              ? 'bg-indigo-600 text-white'
              : 'border border-indigo-600 text-indigo-600'
          }`}
        >
          Adri
        </button>
      </div>

      {milestonesLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <p className="mb-4 text-gray-600">Zatím žádné milníky</p>
          <button
            type="button"
            onClick={() => navigate('/milestones/new')}
            className="w-full rounded-xl bg-indigo-600 py-3 font-medium text-white"
          >
            Přidat milník
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((m) => {
            const last = lastLogById.get(m.id)
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/milestones/${m.id}`)}
                  className="w-full rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm"
                >
                  <div className="flex gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900">{m.title}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                          {categoryLabel(m.category)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${childBadgeClass(m.child_name)}`}
                        >
                          {childLabel(m.child_name)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        {last ? getRelativeDate(last) : 'Zatím bez záznamu'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start pt-1">
                      <span
                        className={`mt-1 h-3 w-3 rounded-full ${statusDotClass(m.status)}`}
                        title={m.status}
                        aria-hidden
                      />
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default MilestonesPage
