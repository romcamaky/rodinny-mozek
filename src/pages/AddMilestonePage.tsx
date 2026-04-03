/**
 * Create milestone: required child, title, category; optional description.
 * Inserts into Supabase then navigates to the new detail route.
 */

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { insertMilestone } from '../lib/milestoneService'
import type { Milestone } from '../types/milestones'
import { useToast } from '../contexts/ToastContext'

function AddMilestonePage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [childName, setChildName] = useState<Milestone['child_name'] | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Milestone['category'] | null>(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!childName || !title.trim() || !category) {
      showToast('Vyplň dítě, název a kategorii.', 'error')
      return
    }
    setSubmitting(true)
    try {
      const row = await insertMilestone({
        child_name: childName,
        title: title.trim(),
        category,
        description: description.trim() ? description.trim() : null,
      })
      navigate(`/milestones/${row.id}`, { replace: true })
    } catch {
      showToast('Nepodařilo se vytvořit milník.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md pb-8">
      <div className="mb-6 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-700"
          aria-label="Zpět"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900">Nový milník</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Dítě</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChildName('viky')}
              className={`min-h-11 flex-1 rounded-full px-4 py-2 text-sm font-medium ${
                childName === 'viky'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-indigo-600 text-indigo-600'
              }`}
            >
              Viky
            </button>
            <button
              type="button"
              onClick={() => setChildName('adri')}
              className={`min-h-11 flex-1 rounded-full px-4 py-2 text-sm font-medium ${
                childName === 'adri'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-indigo-600 text-indigo-600'
              }`}
            >
              Adri
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="ms-title" className="mb-1 block text-sm font-medium text-gray-700">
            Název
          </label>
          <input
            id="ms-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Např. Pití z hrnku"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900"
            required
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Kategorie</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setCategory('life_skill')}
              className={`min-h-11 flex-1 rounded-xl px-4 py-2 text-sm font-medium ${
                category === 'life_skill'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-indigo-600 text-indigo-600'
              }`}
            >
              Životní dovednost
            </button>
            <button
              type="button"
              onClick={() => setCategory('developmental')}
              className={`min-h-11 flex-1 rounded-xl px-4 py-2 text-sm font-medium ${
                category === 'developmental'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-indigo-600 text-indigo-600'
              }`}
            >
              Vývojový milník
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="ms-desc" className="mb-1 block text-sm font-medium text-gray-700">
            Popis (volitelné)
          </label>
          <textarea
            id="ms-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Volitelný popis nebo kontext"
            rows={3}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-indigo-600 py-3 font-medium text-white disabled:opacity-60"
        >
          {submitting ? 'Ukládám…' : 'Vytvořit milník'}
        </button>
      </form>
    </div>
  )
}

export default AddMilestonePage
