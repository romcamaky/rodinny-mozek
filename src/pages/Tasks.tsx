import { useCallback, useEffect, useState } from 'react'
import {
  deleteTask,
  fetchTasks,
  type TaskAssigneeFilter,
  type TaskStatusFilter,
  updateTaskStatus,
} from '../lib/dataService'
import type { Task } from '../types/database'
import { formatCzechDate, isDeadlinePast } from '../lib/utils'
import { useToast } from '../contexts/ToastContext'

const ASSIGNEE_OPTIONS: { label: string; value: TaskAssigneeFilter }[] = [
  { label: 'Všechny', value: 'all' },
  { label: 'Romi', value: 'romi' },
  { label: 'Petr', value: 'petr' },
  { label: 'Oba', value: 'both' },
]

const STATUS_OPTIONS: { label: string; value: TaskStatusFilter }[] = [
  { label: 'Aktivní', value: 'active' },
  { label: 'Hotovo', value: 'done' },
  { label: 'Vše', value: 'all' },
]

function assigneePillStyle(assigned: Task['assigned_to']) {
  if (assigned === 'romi') {
    return { backgroundColor: '#fce7f3', color: '#9d174d' }
  }
  if (assigned === 'petr') {
    return { backgroundColor: '#dbeafe', color: '#1d4ed8' }
  }
  return { backgroundColor: '#f1f5f9', color: '#475569' }
}

function assigneeLabel(assigned: Task['assigned_to']) {
  if (assigned === 'romi') {
    return 'Romi'
  }
  if (assigned === 'petr') {
    return 'Petr'
  }
  return 'Oba'
}

function TaskSourceIcon({ source }: { source: Task['source'] }) {
  const isVoice = source === 'voice' || source === 'ai_generated'
  if (isVoice) {
    return (
      <span className="text-slate-400" title="Hlas">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
      </span>
    )
  }
  return (
    <span className="text-slate-400" title="Text">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
        <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 4H5v-2h2v2zm0-3H5v-2h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z" />
      </svg>
    </span>
  )
}

function TasksSkeleton() {
  return (
    <div className="mt-4 space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-lg bg-slate-200"
          aria-hidden
        />
      ))}
    </div>
  )
}

function Tasks() {
  const { showToast } = useToast()
  const [assignee, setAssignee] = useState<TaskAssigneeFilter>('all')
  const [status, setStatus] = useState<TaskStatusFilter>('active')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchTasks({ assigned_to: assignee, status })
      setTasks(rows)
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Nepodařilo se načíst úkoly.',
        'error',
      )
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [assignee, status, showToast])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  async function handleToggleDone(task: Task) {
    const next: Task['status'] = task.status === 'done' ? 'todo' : 'done'
    const { success, error } = await updateTaskStatus(task.id, next)
    if (!success) {
      showToast(error ?? 'Uložení se nezdařilo.', 'error')
      return
    }
    void loadTasks()
  }

  async function handleDelete(taskId: string) {
    if (!window.confirm('Opravdu smazat?')) {
      return
    }
    const { success, error } = await deleteTask(taskId)
    if (!success) {
      showToast(error ?? 'Smazání se nezdařilo.', 'error')
      return
    }
    void loadTasks()
  }

  function pillClass(active: boolean) {
    return `no-select flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium ${
      active
        ? 'text-white'
        : 'bg-slate-100 text-slate-600'
    }`
  }

  return (
    <section className="mx-auto w-full max-w-md">
      <h1 className="text-3xl font-bold">Úkoly</h1>

      {/* Assignee filters — horizontal scroll on narrow screens */}
      <div className="no-select mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ASSIGNEE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={pillClass(assignee === opt.value)}
            style={
              assignee === opt.value
                ? { backgroundColor: 'var(--color-primary)' }
                : undefined
            }
            onClick={() => setAssignee(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="no-select mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={pillClass(status === opt.value)}
            style={
              status === opt.value
                ? { backgroundColor: 'var(--color-primary)' }
                : undefined
            }
            onClick={() => setStatus(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <TasksSkeleton />
      ) : tasks.length === 0 ? (
        <div
          className="card-rainbow mt-8 rounded-xl border border-dashed p-6 text-center"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-text-secondary) 35%, transparent)',
          }}
        >
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Žádné úkoly. Zachyť první přes mikrofon! 🎤
          </p>
          <button
            type="button"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
            onClick={() => window.dispatchEvent(new Event('open-capture'))}
          >
            Zachytit
          </button>
        </div>
      ) : (
        <ul className="mt-4 flex list-none flex-col gap-3 p-0">
          {tasks.map((task) => {
            const isDone = task.status === 'done'
            const pastDue =
              task.deadline && isDeadlinePast(task.deadline) && !isDone

            return (
              <li
                key={task.id}
                className="card-rainbow rounded-lg border p-3 shadow-sm"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: '#e2e8f0',
                  opacity: isDone ? 0.65 : 1,
                }}
              >
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="no-select mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white"
                    aria-label={isDone ? 'Označit jako nedokončené' : 'Označit jako hotové'}
                    onClick={() => void handleToggleDone(task)}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                        isDone
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300'
                      }`}
                    >
                      {isDone ? '✓' : ''}
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`flex flex-wrap items-center gap-1 text-base font-semibold leading-snug ${
                        isDone ? 'line-through' : ''
                      }`}
                    >
                      {task.google_calendar_event_ids ? (
                        <span className="shrink-0 select-none" aria-hidden>
                          📅
                        </span>
                      ) : null}
                      <span className="min-w-0">{task.title}</span>
                    </p>
                    {task.description ? (
                      <p
                        className="mt-1 text-sm leading-snug"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {task.description}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                        style={assigneePillStyle(task.assigned_to)}
                      >
                        {assigneeLabel(task.assigned_to)}
                      </span>
                      {task.deadline ? (
                        <span
                          className="text-xs font-medium"
                          style={{
                            color: pastDue ? '#dc2626' : 'var(--color-text-secondary)',
                          }}
                        >
                          {formatCzechDate(task.deadline)}
                        </span>
                      ) : null}
                      <TaskSourceIcon source={task.source} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="no-select flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Smazat úkol"
                    onClick={() => void handleDelete(task.id)}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                    </svg>
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default Tasks
