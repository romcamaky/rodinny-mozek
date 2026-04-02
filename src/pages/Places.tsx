import { useCallback, useEffect, useState } from 'react'
import PlaceForm from '../components/PlaceForm'
import {
  deletePlace,
  fetchPlaces,
  savePlace,
  type PlaceSourceFilter,
  type SavePlaceInput,
} from '../lib/dataService'
import { sendToVoiceRouter } from '../lib/voiceRouter'
import type { PlaceData } from '../lib/voiceRouter'
import type { Place } from '../types/database'
import { formatRelativeTime } from '../lib/utils'
import { getPlaceTagStyle, labelForPlaceTag, PLACE_TAG_FILTER_OPTIONS } from '../lib/placeTags'
import { useToast } from '../contexts/ToastContext'

const SOURCE_FILTERS: { label: string; value: PlaceSourceFilter }[] = [
  { label: 'Vše', value: 'all' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Kamarád', value: 'friend' },
  { label: 'Web', value: 'web' },
  { label: 'Vlastní', value: 'own_experience' },
]

function normalizeWebsiteUrl(url: string): string {
  const t = url.trim()
  if (!t) {
    return ''
  }
  if (/^https?:\/\//i.test(t)) {
    return t
  }
  return `https://${t}`
}

function sourceBadge(source: Place['source']) {
  const map = {
    instagram: { icon: '📷', label: 'Instagram' },
    friend: { icon: '👤', label: 'Kamarád' },
    web: { icon: '🌐', label: 'Web' },
    own_experience: { icon: '⭐', label: 'Vlastní' },
  }
  return map[source]
}

function mapRouterPlaceToForm(data: PlaceData): SavePlaceInput {
  return {
    name: data.name ?? '',
    address: data.address ?? '',
    tags: data.tags ?? [],
    notes: data.notes ?? '',
    source: data.source ?? 'web',
    website: null,
    visit_duration_minutes: null,
  }
}

function PlacesSkeleton() {
  return (
    <div className="mt-4 space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-lg bg-slate-200" aria-hidden />
      ))}
    </div>
  )
}

function Places() {
  const { showToast } = useToast()
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sourceFilter, setSourceFilter] = useState<PlaceSourceFilter>('all')
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(true)
  const [clipboardOpen, setClipboardOpen] = useState(false)
  const [clipText, setClipText] = useState('')
  const [extractLoading, setExtractLoading] = useState(false)
  const [pendingPlace, setPendingPlace] = useState<SavePlaceInput | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingPlace, setSavingPlace] = useState(false)

  const loadPlaces = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchPlaces({
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        source: sourceFilter,
      })
      setPlaces(rows)
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Nepodařilo se načíst místa.',
        'error',
      )
      setPlaces([])
    } finally {
      setLoading(false)
    }
  }, [selectedTags, sourceFilter, showToast])

  useEffect(() => {
    void loadPlaces()
  }, [loadPlaces])

  function toggleTagFilter(key: string) {
    if (key === '__all__') {
      setSelectedTags([])
      return
    }
    const lower = key.toLowerCase()
    const has = selectedTags.some((t) => t.toLowerCase() === lower)
    if (has) {
      setSelectedTags(selectedTags.filter((t) => t.toLowerCase() !== lower))
    } else {
      setSelectedTags([...selectedTags, key])
    }
  }

  async function handleExtract() {
    const text = clipText.trim()
    if (!text) {
      return
    }
    setExtractLoading(true)
    try {
      const res = await sendToVoiceRouter({ textInput: text })
      if (res.classification.target !== 'place') {
        showToast('Text nebyl rozpoznán jako místo. Zkus ho upřesnit.', 'error')
        return
      }
      setPendingPlace(mapRouterPlaceToForm(res.classification.data as PlaceData))
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Extrakce se nezdařila.',
        'error',
      )
    } finally {
      setExtractLoading(false)
    }
  }

  async function handleClipboardSave(data: SavePlaceInput) {
    setSavingPlace(true)
    try {
      await savePlace(data)
      showToast('Uloženo!', 'success')
      setPendingPlace(null)
      setClipText('')
      setClipboardOpen(false)
      void loadPlaces()
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Uložení se nezdařilo.',
        'error',
      )
    } finally {
      setSavingPlace(false)
    }
  }

  async function handleDelete(placeId: string) {
    if (!window.confirm('Opravdu smazat?')) {
      return
    }
    const { success, error } = await deletePlace(placeId)
    if (!success) {
      showToast(error ?? 'Smazání se nezdařilo.', 'error')
      return
    }
    setExpandedId((id) => (id === placeId ? null : id))
    void loadPlaces()
  }

  function pillActive(tagKeys: string[], key: string): boolean {
    return tagKeys.some((t) => t.toLowerCase() === key.toLowerCase())
  }

  return (
    <section className="mx-auto w-full max-w-md pb-4">
      <h1 className="text-3xl font-bold">Místa</h1>

      {/* Tag filters — multi-select; "Vše" clears tag filters */}
      <div className="no-select mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          className="flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium text-white"
          style={{
            backgroundColor:
              selectedTags.length === 0 ? 'var(--color-primary)' : '#f1f5f9',
            color: selectedTags.length === 0 ? 'white' : '#475569',
          }}
          onClick={() => toggleTagFilter('__all__')}
        >
          Vše
        </button>
        {PLACE_TAG_FILTER_OPTIONS.map(({ key, label }) => {
          const active = pillActive(selectedTags, key)
          return (
            <button
              key={key}
              type="button"
              className="flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium"
              style={{
                backgroundColor: active ? 'var(--color-primary)' : '#f1f5f9',
                color: active ? 'white' : '#475569',
              }}
              onClick={() => toggleTagFilter(key)}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Source filter — single-select */}
      <div className="no-select mt-2 flex flex-wrap gap-1.5">
        {SOURCE_FILTERS.map((opt) => {
          const active = sourceFilter === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: active ? 'var(--color-primary)' : '#e2e8f0',
                color: active ? 'white' : '#64748b',
              }}
              onClick={() => setSourceFilter(opt.value)}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Collapsible smart clipboard */}
      <div className="mt-4">
        {!clipboardOpen ? (
          <button
            type="button"
            className="no-select min-h-11 w-full rounded-xl border border-dashed px-4 py-2 text-sm font-medium"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-primary) 40%, transparent)',
              color: 'var(--color-primary)',
            }}
            onClick={() => setClipboardOpen(true)}
          >
            ＋ Přidat místo
          </button>
        ) : (
          <div
            className="rounded-xl border p-3"
            style={{
              borderColor: '#e2e8f0',
              backgroundColor: 'var(--color-surface)',
            }}
          >
            {pendingPlace ? (
              <div>
                <p className="mb-2 text-sm font-medium">Zkontroluj a ulož</p>
                <PlaceForm
                  initialData={pendingPlace}
                  isSaving={savingPlace}
                  onSave={(data) => void handleClipboardSave(data)}
                  onCancel={() => {
                    setPendingPlace(null)
                    setExtractLoading(false)
                  }}
                />
              </div>
            ) : (
              <>
                <textarea
                  className="w-full rounded-xl border px-3 py-2 text-base"
                  style={{ borderColor: '#cbd5e1' }}
                  rows={4}
                  placeholder="Vlož text z Instagramu, odkaz, nebo tip od kamaráda..."
                  value={clipText}
                  onChange={(e) => setClipText(e.target.value)}
                  disabled={extractLoading}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-70"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                    disabled={extractLoading || !clipText.trim()}
                    onClick={() => void handleExtract()}
                  >
                    {extractLoading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Zpracovávám...
                      </>
                    ) : (
                      'Extrahovat'
                    )}
                  </button>
                  <button
                    type="button"
                    className="min-h-11 shrink-0 px-3 text-sm"
                    style={{ color: 'var(--color-text-secondary)' }}
                    onClick={() => {
                      setClipboardOpen(false)
                      setClipText('')
                      setPendingPlace(null)
                    }}
                  >
                    Zavřít
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <PlacesSkeleton />
      ) : places.length === 0 && !pendingPlace ? (
        <div
          className="mt-8 rounded-xl border border-dashed p-6 text-center"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-text-secondary) 35%, transparent)',
          }}
        >
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Zatím žádná místa. Přidej první tip! 📍
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
              type="button"
              onClick={() => window.dispatchEvent(new Event('open-capture'))}
            >
              Zachytit hlasem
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold"
              onClick={() => setClipboardOpen(true)}
            >
              Vložit text
            </button>
          </div>
        </div>
      ) : (
        <ul className="mt-4 flex list-none flex-col gap-3 p-0">
          {places.map((place) => {
            const expanded = expandedId === place.id
            const badge = sourceBadge(place.source)
            const href = place.website ? normalizeWebsiteUrl(place.website) : ''

            return (
              <li
                key={place.id}
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
                    setExpandedId((id) => (id === place.id ? null : place.id))
                  }
                >
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold leading-snug">{place.name}</p>
                      {place.address ? (
                        <p
                          className="mt-1 text-sm"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {place.address}
                        </p>
                      ) : null}
                      <div className="no-select mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {place.tags.map((tag) => {
                          const st = getPlaceTagStyle(tag)
                          return (
                            <span
                              key={tag}
                              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: st.bg, color: st.color }}
                            >
                              {labelForPlaceTag(tag)}
                            </span>
                          )
                        })}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span>
                          {badge.icon} {badge.label}
                        </span>
                        {place.visit_duration_minutes != null ? (
                          <span style={{ color: 'var(--color-text-secondary)' }}>
                            ~{place.visit_duration_minutes} min
                          </span>
                        ) : null}
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          {formatRelativeTime(place.created_at)}
                        </span>
                      </div>
                      {place.notes ? (
                        <p
                          className={`mt-2 text-sm leading-snug ${
                            expanded ? '' : 'line-clamp-2'
                          }`}
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {place.notes}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </button>
                {expanded ? (
                  <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
                    {place.address ? (
                      <p style={{ color: 'var(--color-text)' }}>{place.address}</p>
                    ) : null}
                    {place.notes ? (
                      <p
                        className="mt-2"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {place.notes}
                      </p>
                    ) : null}
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium"
                        style={{ color: 'var(--color-primary)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill="currentColor"
                          aria-hidden
                        >
                          <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                        </svg>
                        Otevřít web
                      </a>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="no-select flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Smazat místo"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDelete(place.id)
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

export default Places
