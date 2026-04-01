import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteNote, fetchNotes, type NoteCategoryFilter } from '../lib/dataService'
import type { Note } from '../types/database'
import { formatRelativeTime } from '../lib/utils'
import { useToast } from '../contexts/ToastContext'

const CATEGORY_OPTIONS: { label: string; value: NoteCategoryFilter }[] = [
  { label: 'Vše', value: 'all' },
  { label: 'Nápad', value: 'idea' },
  { label: 'Výlet', value: 'trip' },
  { label: 'Děti', value: 'kids' },
  { label: 'Osobní', value: 'personal' },
  { label: 'Projekt', value: 'project' },
  { label: 'Ostatní', value: 'other' },
]

function categoryPillStyle(cat: Note['category']) {
  const map: Record<Note['category'], { bg: string; color: string }> = {
    idea: { bg: '#f3e8ff', color: '#6b21a8' },
    trip: { bg: '#dcfce7', color: '#166534' },
    kids: { bg: '#fce7f3', color: '#9d174d' },
    personal: { bg: '#dbeafe', color: '#1d4ed8' },
    project: { bg: '#ffedd5', color: '#c2410c' },
    other: { bg: '#f1f5f9', color: '#475569' },
  }
  return map[cat]
}

function categoryLabel(cat: Note['category']) {
  const found = CATEGORY_OPTIONS.find((o) => o.value === cat)
  return found?.label ?? cat
}

function NoteSourceIcon({ source }: { source: Note['source'] }) {
  if (source === 'voice') {
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

function NotesSkeleton() {
  return (
    <div className="mt-4 space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-lg bg-slate-200"
          aria-hidden
        />
      ))}
    </div>
  )
}

function Notes() {
  const { showToast } = useToast()
  const [category, setCategory] = useState<NoteCategoryFilter>('all')
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadNotes = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchNotes({ category })
      setNotes(rows)
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Nepodařilo se načíst poznámky.',
        'error',
      )
      setNotes([])
    } finally {
      setLoading(false)
    }
  }, [category, showToast])

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  async function handleDelete(noteId: string) {
    if (!window.confirm('Opravdu smazat?')) {
      return
    }
    const { success, error } = await deleteNote(noteId)
    if (!success) {
      showToast(error ?? 'Smazání se nezdařilo.', 'error')
      return
    }
    setExpandedId((id) => (id === noteId ? null : id))
    void loadNotes()
  }

  function pillClass(active: boolean) {
    return `no-select flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium ${
      active ? 'text-white' : 'bg-slate-100 text-slate-600'
    }`
  }

  return (
    <section className="mx-auto w-full max-w-md">
      <h1 className="text-3xl font-bold">Poznámky</h1>

      <div className="no-select mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={pillClass(category === opt.value)}
            style={
              category === opt.value
                ? { backgroundColor: 'var(--color-primary)' }
                : undefined
            }
            onClick={() => setCategory(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <NotesSkeleton />
      ) : notes.length === 0 ? (
        <div
          className="mt-8 rounded-xl border border-dashed p-6 text-center"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-text-secondary) 35%, transparent)',
          }}
        >
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Žádné poznámky. Zachyť první myšlenku! 💡
          </p>
          <Link
            to="/capture"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Zachytit
          </Link>
        </div>
      ) : (
        <ul className="mt-4 flex list-none flex-col gap-3 p-0">
          {notes.map((note) => {
            const expanded = expandedId === note.id
            const catStyle = categoryPillStyle(note.category)

            return (
              <li
                key={note.id}
                className="rounded-lg border p-3 shadow-sm"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: '#e2e8f0',
                }}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    setExpandedId((id) => (id === note.id ? null : note.id))
                  }
                >
                  <p
                    className={`text-sm leading-snug ${
                      expanded ? '' : 'line-clamp-3'
                    }`}
                    style={{ color: 'var(--color-text)' }}
                  >
                    {note.text}
                  </p>
                </button>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: catStyle.bg, color: catStyle.color }}
                    >
                      {categoryLabel(note.category)}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {formatRelativeTime(note.created_at)}
                    </span>
                    <NoteSourceIcon source={note.source} />
                  </div>
                  <button
                    type="button"
                    className="no-select flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Smazat poznámku"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDelete(note.id)
                    }}
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

export default Notes
