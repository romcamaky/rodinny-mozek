/**
 * Single milestone: weekly AI tasks (with optimistic checkbox updates), log + evaluate,
 * ask Claude (ephemeral answer card), and history with parsed ai_response JSON.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  askMilestoneQuestion,
  evaluateMilestoneLog,
  fetchMilestoneById,
  fetchMilestoneLogs,
  fetchMilestoneTaskCurrentWeek,
  generateTasksForMilestone,
  insertMilestoneLog,
  parseAiEvaluation,
  updateMilestoneStatus,
  updateMilestoneTasksDone,
} from '../lib/milestoneService'
import { formatCzechLongDate } from '../lib/dateUtils'
import type { AiAskResponse, Milestone, MilestoneLog, MilestoneTask, TaskItem } from '../types/milestones'
import { useToast } from '../contexts/ToastContext'

function childLabel(name: Milestone['child_name']): string {
  return name === 'adri' ? 'Adri' : 'Viky'
}

function childBadgeClass(name: Milestone['child_name']): string {
  return name === 'adri'
    ? 'bg-purple-100 text-purple-700'
    : 'bg-pink-100 text-pink-700'
}

function categoryLabel(cat: Milestone['category']): string {
  return cat === 'life_skill' ? 'Životní dovednost' : 'Vývojový milník'
}

function statusLabel(s: Milestone['status']): string {
  if (s === 'active') return 'Aktivní'
  if (s === 'paused') return 'Pozastaveno'
  return 'Dokončeno'
}

function difficultyBadge(d: TaskItem['difficulty']): { className: string; text: string } {
  if (d === 'medium') return { className: 'bg-yellow-100 text-yellow-800', text: 'Střední' }
  if (d === 'challenge') return { className: 'bg-red-100 text-red-800', text: 'Výzva' }
  return { className: 'bg-green-100 text-green-800', text: 'Lehké' }
}

function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <div
      className={`shrink-0 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent ${className}`}
      aria-hidden
    />
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MilestoneDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const [taskRow, setTaskRow] = useState<MilestoneTask | null>(null)
  const [logs, setLogs] = useState<MilestoneLog[]>([])
  const [tasksOpen, setTasksOpen] = useState(true)
  const [askOpen, setAskOpen] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [logNote, setLogNote] = useState('')
  const [logSaving, setLogSaving] = useState(false)
  const [askQuestion, setAskQuestion] = useState('')
  const [askLoading, setAskLoading] = useState(false)
  const [askResult, setAskResult] = useState<AiAskResponse | null>(null)

  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    if (!id) return
    const [m, t, l] = await Promise.all([
      fetchMilestoneById(id),
      fetchMilestoneTaskCurrentWeek(id),
      fetchMilestoneLogs(id),
    ])
    setMilestone(m)
    setTaskRow(t)
    setLogs(l)
  }, [id])

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        await refresh()
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Chyba načítání'
          showToast(msg, 'error')
          setMilestone(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, refresh, showToast])

  const localTasks = taskRow?.tasks ?? []

  async function onToggleTask(taskText: string, nextDone: boolean) {
    if (!taskRow) return
    const prev = taskRow.tasks
    const nextTasks = prev.map((t) =>
      t.task === taskText ? { ...t, done: nextDone } : t,
    )
    setTaskRow({ ...taskRow, tasks: nextTasks })
    try {
      await updateMilestoneTasksDone(taskRow.id, nextTasks)
    } catch {
      setTaskRow({ ...taskRow, tasks: prev })
      showToast('Nepodařilo se uložit úkol.', 'error')
    }
  }

  async function onGenerateTasks() {
    if (!id) return
    setGenerating(true)
    try {
      const row = await generateTasksForMilestone(id)
      setTaskRow(row)
    } catch {
      showToast('Nepodařilo se vygenerovat úkoly. Zkus to znovu.', 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function onSaveLog() {
    if (!id || !logNote.trim()) {
      showToast('Zadej text záznamu.', 'error')
      return
    }
    setLogSaving(true)
    try {
      const noteText = logNote.trim()
      const newLog = await insertMilestoneLog({ milestone_id: id, note: noteText })
      setLogNote('')
      await refresh()
      const evalResult = await evaluateMilestoneLog(id, newLog.id, noteText)
      if (!evalResult.ok) {
        showToast('Záznam uložen, ale hodnocení se nepodařilo.', 'error')
      }
      await refresh()
    } catch {
      showToast('Nepodařilo se uložit záznam.', 'error')
    } finally {
      setLogSaving(false)
    }
  }

  async function onAsk() {
    if (!id || !askQuestion.trim()) {
      showToast('Zadej otázku.', 'error')
      return
    }
    setAskLoading(true)
    try {
      const res = await askMilestoneQuestion(id, askQuestion.trim())
      setAskResult(res)
      setAskQuestion('')
    } catch {
      showToast('Nepodařilo se získat odpověď.', 'error')
    } finally {
      setAskLoading(false)
    }
  }

  async function onMarkCompleted() {
    if (!id || !milestone) return
    try {
      await updateMilestoneStatus(id, 'completed')
      await refresh()
      showToast('Milník označen jako dokončený.', 'success')
    } catch {
      showToast('Nepodařilo se aktualizovat stav.', 'error')
    }
  }

  function toggleLogAi(logId: string) {
    setExpandedLogIds((prev) => {
      const next = new Set(prev)
      if (next.has(logId)) next.delete(logId)
      else next.add(logId)
      return next
    })
  }

  if (!id) {
    return <p className="text-center text-gray-600">Chybí ID milníku.</p>
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!milestone) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-6 text-center shadow-sm">
        <p className="mb-4 text-gray-600">Milník nenalezen.</p>
        <button
          type="button"
          onClick={() => navigate('/milestones')}
          className="rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white"
        >
          Zpět na seznam
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6 pb-8">
      {/* Section A — header */}
      <div>
        <button
          type="button"
          onClick={() => navigate('/milestones')}
          className="mb-3 flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-700"
          aria-label="Zpět"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${childBadgeClass(milestone.child_name)}`}
        >
          {childLabel(milestone.child_name)}
        </span>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{milestone.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
            {categoryLabel(milestone.category)}
          </span>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
            {statusLabel(milestone.status)}
          </span>
        </div>
        {milestone.description ? (
          <p className="mt-3 text-sm text-gray-500">{milestone.description}</p>
        ) : null}
        <p className="mt-2 text-sm text-gray-600">
          Sledováno od: {formatCzechLongDate(milestone.started_at)}
        </p>
      </div>

      {/* Section B — weekly tasks */}
      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 p-4">
          <button
            type="button"
            onClick={() => setTasksOpen((o) => !o)}
            className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 text-left"
          >
            <span className="font-semibold text-gray-900">Úkoly na tento týden</span>
            <Chevron open={tasksOpen} />
          </button>
          <button
            type="button"
            onClick={() => void onGenerateTasks()}
            disabled={generating}
            className="shrink-0 rounded-xl border border-indigo-600 px-3 py-2 text-sm font-medium text-indigo-600 disabled:opacity-60"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <Spinner className="h-4 w-4" />
                Generuji…
              </span>
            ) : (
              'Generovat nové'
            )}
          </button>
        </div>
        {tasksOpen ? (
          <div className="space-y-3 border-t border-gray-100 p-4">
            {localTasks.length === 0 ? (
              <div className="text-center text-sm text-gray-600">
                <p className="mb-3">Zatím bez úkolů. Vygeneruj nové!</p>
                <button
                  type="button"
                  onClick={() => void onGenerateTasks()}
                  disabled={generating}
                  className="w-full rounded-xl border border-indigo-600 py-2 font-medium text-indigo-600 disabled:opacity-60"
                >
                  {generating ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner className="h-4 w-4" />
                      Generuji…
                    </span>
                  ) : (
                    'Generovat nové'
                  )}
                </button>
              </div>
            ) : (
              localTasks.map((t) => (
                <div
                  key={t.task}
                  className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-3"
                >
                  <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-start justify-center pt-0.5">
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={(e) => void onToggleTask(t.task, e.target.checked)}
                      className="h-6 w-6 rounded border-gray-300 text-indigo-600"
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`font-medium text-gray-900 ${t.done ? 'text-gray-400 line-through' : ''}`}
                    >
                      {t.task}
                    </p>
                    {t.tip ? <p className="mt-1 text-sm text-gray-500">{t.tip}</p> : null}
                  </div>
                  <span
                    className={`shrink-0 self-start rounded-full px-2 py-0.5 text-xs font-medium ${difficultyBadge(t.difficulty).className}`}
                  >
                    {difficultyBadge(t.difficulty).text}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : null}
      </section>

      {/* Section C — add log */}
      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold text-gray-900">Nový záznam</h2>
        <textarea
          value={logNote}
          onChange={(e) => setLogNote(e.target.value)}
          placeholder="Co se dnes povedlo?"
          rows={3}
          className="mb-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900"
        />
        <button
          type="button"
          onClick={() => void onSaveLog()}
          disabled={logSaving}
          className="flex w-full min-h-11 items-center justify-center rounded-xl bg-indigo-600 py-3 font-medium text-white disabled:opacity-60"
        >
          {logSaving ? (
            <span className="flex items-center gap-2">
              <Spinner className="h-5 w-5 border-white border-t-transparent" />
              Claude hodnotí…
            </span>
          ) : (
            'Uložit'
          )}
        </button>
      </section>

      {/* Section D — ask */}
      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setAskOpen((o) => !o)}
          className="flex w-full min-h-11 items-center justify-between p-4 text-left"
        >
          <span className="font-semibold text-gray-900">Zeptej se na cokoliv</span>
          <Chevron open={askOpen} />
        </button>
        {askOpen ? (
          <div className="space-y-3 border-t border-gray-100 p-4">
            <textarea
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              placeholder="Např. Je normální, že ještě…"
              rows={2}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900"
            />
            <button
              type="button"
              onClick={() => void onAsk()}
              disabled={askLoading}
              className="flex w-full min-h-11 items-center justify-center rounded-xl border border-indigo-600 py-2 font-medium text-indigo-600 disabled:opacity-60"
            >
              {askLoading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  Claude přemýšlí…
                </span>
              ) : (
                'Zeptat se'
              )}
            </button>
            {askResult ? (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                <p className="text-gray-900">{askResult.answer}</p>
                {askResult.follow_up_suggestion ? (
                  <div className="mt-3 rounded-lg bg-white/80 p-3 text-sm text-gray-600">
                    {askResult.follow_up_suggestion}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setAskResult(null)}
                  className="mt-3 w-full rounded-xl border border-gray-300 py-2 text-sm font-medium text-gray-700"
                >
                  Zavřít
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Section E — history */}
      <section>
        <h2 className="mb-3 font-semibold text-gray-900">Historie záznamů</h2>
        {logs.length === 0 ? (
          <p className="text-center text-sm text-gray-500">Zatím žádné záznamy</p>
        ) : (
          <ul className="space-y-3">
            {logs.map((log) => {
              const parsed = parseAiEvaluation(log.ai_response)
              const expanded = expandedLogIds.has(log.id)
              return (
                <li
                  key={log.id}
                  className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <p className="font-bold text-gray-900">{formatCzechLongDate(log.logged_at)}</p>
                  <p className="mt-2 text-gray-800">{log.note}</p>
                  {log.ai_response && parsed ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => toggleLogAi(log.id)}
                        className="min-h-11 w-full rounded-lg bg-slate-100 py-2 text-left text-sm font-medium text-slate-700"
                      >
                        {expanded ? 'Skrýt hodnocení' : 'Zobrazit hodnocení Claude'}
                      </button>
                      {expanded ? (
                        <div className="mt-2 rounded-xl bg-indigo-50 p-3 text-sm text-gray-800">
                          {parsed.evaluation || '(Prázdné hodnocení)'}
                          {parsed.suggested_status === 'completed' && milestone.status !== 'completed' ? (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <p className="text-sm text-amber-900">
                                Claude doporučuje označit jako dokončený
                              </p>
                              <button
                                type="button"
                                onClick={() => void onMarkCompleted()}
                                className="mt-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
                              >
                                Označit
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : log.ai_response ? (
                    <p className="mt-2 text-xs text-gray-500">Hodnocení nelze zobrazit (neplatný formát).</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

export default MilestoneDetailPage
