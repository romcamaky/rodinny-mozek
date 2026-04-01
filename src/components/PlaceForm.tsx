import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useState } from 'react'
import type { SavePlaceInput } from '../lib/dataService'
import type { PlaceData } from '../lib/voiceRouter'
import { getPlaceTagStyle, PLACE_TAG_CHIPS } from '../lib/placeTags'

const SOURCE_SEGMENTS: { label: string; value: PlaceData['source'] }[] = [
  { label: 'Instagram', value: 'instagram' },
  { label: 'Kamarád', value: 'friend' },
  { label: 'Web', value: 'web' },
  { label: 'Vlastní', value: 'own_experience' },
]

/** Map arbitrary tag strings from the router onto canonical chip keys when possible. */
function normalizeIncomingTags(tags: string[]): string[] {
  return tags.map((t) => {
    const lower = t.trim().toLowerCase()
    const chip = PLACE_TAG_CHIPS.find((c) => c.key.toLowerCase() === lower)
    return chip ? chip.key : t.trim()
  })
}

function toFormState(data: SavePlaceInput): SavePlaceInput {
  return {
    name: data.name ?? '',
    address: data.address ?? '',
    tags: normalizeIncomingTags(data.tags ?? []),
    notes: data.notes ?? '',
    source: data.source ?? 'web',
    website: data.website ?? '',
    visit_duration_minutes: data.visit_duration_minutes ?? null,
  }
}

type PlaceFormProps = {
  initialData: SavePlaceInput
  onSave: (data: SavePlaceInput) => void
  onCancel: () => void
  /** When true, disables actions and shows saving label on submit. */
  isSaving?: boolean
}

/**
 * Shared place editor for Capture confirmation and Places clipboard flow.
 */
function PlaceForm({ initialData, onSave, onCancel, isSaving = false }: PlaceFormProps) {
  const [form, setForm] = useState<SavePlaceInput>(() => toFormState(initialData))

  useEffect(() => {
    setForm(toFormState(initialData))
  }, [initialData])

  function toggleTag(key: string) {
    const lower = key.toLowerCase()
    const has = form.tags.some((t) => t.toLowerCase() === lower)
    const next = has
      ? form.tags.filter((t) => t.toLowerCase() !== lower)
      : [...form.tags, key]
    setForm({ ...form, tags: next })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || isSaving) {
      return
    }
    onSave({
      ...form,
      name: form.name.trim(),
      website: form.website?.trim() || null,
      visit_duration_minutes:
        form.visit_duration_minutes === null ||
        form.visit_duration_minutes === undefined ||
        Number(form.visit_duration_minutes) <= 0
          ? null
          : Number(form.visit_duration_minutes),
    })
  }

  return (
    <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
      <label className="block text-sm font-medium">Název</label>
      <input
        className="min-h-11 w-full rounded-xl border px-3 py-2 text-base"
        style={{ borderColor: '#cbd5e1' }}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
      />

      <label className="block text-sm font-medium">Adresa</label>
      <input
        className="min-h-11 w-full rounded-xl border px-3 py-2 text-base"
        style={{ borderColor: '#cbd5e1' }}
        value={form.address ?? ''}
        onChange={(e) => setForm({ ...form, address: e.target.value })}
      />

      <label className="block text-sm font-medium">Štítky</label>
      <div className="flex flex-wrap gap-2">
        {PLACE_TAG_CHIPS.map(({ key, label }) => {
          const active = form.tags.some((t) => t.toLowerCase() === key.toLowerCase())
          const style = getPlaceTagStyle(key)
          return (
            <button
              key={key}
              type="button"
              className="min-h-11 rounded-full border px-3 py-2 text-xs font-medium"
              style={{
                borderColor: active ? style.color : '#cbd5e1',
                backgroundColor: active ? style.bg : 'white',
                color: active ? style.color : 'var(--color-text)',
              }}
              onClick={() => toggleTag(key)}
            >
              {label}
            </button>
          )
        })}
      </div>

      <label className="block text-sm font-medium">Doba návštěvy</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          className="min-h-11 w-24 rounded-xl border px-3 py-2 text-base"
          style={{ borderColor: '#cbd5e1' }}
          placeholder="—"
          value={form.visit_duration_minutes ?? ''}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const v = e.target.value
            setForm({
              ...form,
              visit_duration_minutes: v === '' ? null : Number(v),
            })
          }}
        />
        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          min
        </span>
      </div>

      <label className="block text-sm font-medium">Zdroj</label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SOURCE_SEGMENTS.map(({ label, value }) => {
          const active = form.source === value
          return (
            <button
              key={value}
              type="button"
              className="min-h-11 rounded-xl border px-2 py-2 text-xs font-medium"
              style={{
                borderColor: active ? 'var(--color-primary)' : '#cbd5e1',
                backgroundColor: active
                  ? 'color-mix(in srgb, var(--color-primary) 16%, white)'
                  : 'white',
                color: 'var(--color-text)',
              }}
              onClick={() => setForm({ ...form, source: value })}
            >
              {label}
            </button>
          )
        })}
      </div>

      <label className="block text-sm font-medium">Web</label>
      <input
        type="text"
        inputMode="url"
        className="min-h-11 w-full rounded-xl border px-3 py-2 text-base"
        style={{ borderColor: '#cbd5e1' }}
        placeholder="https://…"
        value={form.website ?? ''}
        onChange={(e) => setForm({ ...form, website: e.target.value })}
      />

      <label className="block text-sm font-medium">Poznámky</label>
      <textarea
        className="w-full rounded-xl border px-3 py-2 text-base"
        style={{ borderColor: '#cbd5e1' }}
        rows={3}
        value={form.notes ?? ''}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="submit"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-70"
          style={{ backgroundColor: 'var(--color-primary)' }}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Ukládám...
            </>
          ) : (
            'Uložit'
          )}
        </button>
        <button
          type="button"
          className="min-h-11 w-full text-sm"
          style={{ color: 'var(--color-text-secondary)' }}
          disabled={isSaving}
          onClick={onCancel}
        >
          Zrušit
        </button>
      </div>
    </form>
  )
}

export default PlaceForm
