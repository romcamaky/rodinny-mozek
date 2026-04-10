/**
 * Weekly meal planner: calls generate-meal-plan Edge Function, shows plan / batch cooking / shopping,
 * supports replace-meal flow and Supabase persistence on meal_plans.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addToRohlikCart,
  fetchActiveMealPlan,
  generateMealPlan,
  replaceMeal,
  saveMealPlan,
  type BatchCookingBlock,
  type GeneratedMealPlanPayload,
  type RejectedMealInput,
  type RohlikCartResult,
} from '../lib/dataService'
import { MEAL_TYPE_LABELS, SHOPPING_CATEGORY_EMOJI } from '../lib/mealPlanConstants'
import {
  formatBatchCookDayHeader,
  formatWeekRange,
  getCzechDayName,
  getNextMonday,
} from '../lib/utils'
import type { MealPlan as MealPlanRow } from '../types/database'
import { useToast } from '../contexts/ToastContext'

const DAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

type PageMode = 'generate' | 'plan'
type PlanSubTab = 'meals' | 'cooking' | 'shopping'

function rowToPayload(row: MealPlanRow): GeneratedMealPlanPayload {
  return {
    plan_data: (row.plan_data ?? {}) as GeneratedMealPlanPayload['plan_data'],
    batch_cooking: Array.isArray(row.batch_cooking)
      ? (row.batch_cooking as BatchCookingBlock[])
      : [],
    shopping_list: (row.shopping_list ?? {}) as GeneratedMealPlanPayload['shopping_list'],
  }
}

/** Parses batch_cooking coverage strings like "wednesday mom_lunch". */
function parseCoverageSlot(raw: string): { day: string; slot: string } {
  const lower = raw.toLowerCase().trim()
  for (const d of DAY_ORDER) {
    const prefix = `${d} `
    if (lower.startsWith(prefix)) {
      return { day: d, slot: lower.slice(prefix.length) }
    }
  }
  return { day: '', slot: lower }
}

function formatCoverageLine(raw: string): string {
  const { day, slot } = parseCoverageSlot(raw)
  if (!day) {
    return raw
  }
  const dayCz = getCzechDayName(day)
  const label = MEAL_TYPE_LABELS[slot] ?? slot.replace(/_/g, ' ')
  return `${dayCz.toLocaleLowerCase('cs')} ${label.toLocaleLowerCase('cs')}`
}

function shoppingItemKey(category: string, item: { name: string; quantity: string; unit: string }) {
  return `${category}|${item.name}|${item.quantity}|${item.unit}`
}

function loadBoughtMap(weekStart: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(`meal-plan-bought-${weekStart}`)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function saveBoughtMap(weekStart: string, map: Record<string, boolean>) {
  localStorage.setItem(`meal-plan-bought-${weekStart}`, JSON.stringify(map))
}

function buildShoppingListText(list: GeneratedMealPlanPayload['shopping_list']): string {
  const lines: string[] = []
  const categories = Object.keys(list).sort((a, b) => a.localeCompare(b, 'cs'))
  for (const cat of categories) {
    const items = list[cat]
    if (!items?.length) {
      continue
    }
    lines.push(cat)
    for (const it of items) {
      lines.push(`  ${it.name} — ${it.quantity} ${it.unit}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

function MealPlan() {
  const { showToast } = useToast()
  const [pageMode, setPageMode] = useState<PageMode>('generate')
  const [initialLoading, setInitialLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => getNextMonday())
  const [variant, setVariant] = useState<'A' | 'B'>('A')
  const [plan, setPlan] = useState<GeneratedMealPlanPayload | null>(null)
  const [savedToDb, setSavedToDb] = useState(false)
  const [subTab, setSubTab] = useState<PlanSubTab>('meals')

  const [availText, setAvailText] = useState('')
  const [excludeText, setExcludeText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [rejectTarget, setRejectTarget] = useState<{
    day: string
    mealType: string
  } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [replacingKey, setReplacingKey] = useState<string | null>(null)

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})
  const [bought, setBought] = useState<Record<string, boolean>>({})

  // Tracks whether the Rohlik cart request is in progress
  const [rohlikLoading, setRohlikLoading] = useState(false)
  // Stores the result of the last Rohlik cart attempt (null = not yet tried)
  const [rohlikResult, setRohlikResult] = useState<RohlikCartResult | null>(null)

  useEffect(() => {
    if (pageMode === 'plan' && plan) {
      setBought(loadBoughtMap(weekStart))
    }
  }, [pageMode, plan, weekStart])

  const persistBought = useCallback(
    (next: Record<string, boolean>) => {
      setBought(next)
      saveBoughtMap(weekStart, next)
    },
    [weekStart],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setInitialLoading(true)
      try {
        const active = await fetchActiveMealPlan()
        if (cancelled || !active) {
          return
        }
        setWeekStart(active.week_start)
        setVariant(active.variant)
        setPlan(rowToPayload(active))
        setPageMode('plan')
        setSavedToDb(true)
      } catch (e) {
        if (!cancelled) {
          console.error(e)
          showToast('Nepodařilo se načíst jídelníček.', 'error')
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showToast])

  const sortedDays = useMemo(() => {
    if (!plan?.plan_data) {
      return []
    }
    return DAY_ORDER.filter((d) => plan.plan_data[d])
  }, [plan])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const payload = await generateMealPlan(weekStart, {
        availableIngredients: availText || undefined,
        excludeIngredients: excludeText || undefined,
      })
      setPlan(payload)
      setPageMode('plan')
      setSavedToDb(false)
      setSubTab('meals')
      showToast('Jídelníček je připraven. Uložte ho, aby zůstal po obnovení stránky.', 'success')
    } catch (e) {
      console.error(e)
      showToast(
        e instanceof Error ? e.message : 'Generování selhalo. Zkuste to znovu.',
        'error',
      )
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!plan) {
      return
    }
    setSaving(true)
    try {
      const res = await saveMealPlan(
        weekStart,
        variant,
        plan.plan_data,
        plan.batch_cooking,
        plan.shopping_list,
      )
      if (res.success) {
        setSavedToDb(true)
        showToast('Plán uložen.', 'success')
      } else {
        showToast(res.error ?? 'Uložení selhalo.', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleReplaceConfirm = async () => {
    if (!rejectTarget || !plan) {
      return
    }
    const { day, mealType } = rejectTarget
    const key = `${day}:${mealType}`
    setReplacingKey(key)
    setRejectTarget(null)
    const rejected: RejectedMealInput = {
      day,
      mealType,
      reason: rejectReason.trim() || undefined,
    }
    setRejectReason('')
    try {
      const updated = await replaceMeal(weekStart, plan, rejected)
      setPlan(updated)
      setSavedToDb(false)
      showToast('Jídlo bylo nahrazeno.', 'success')
      const saveRes = await saveMealPlan(
        weekStart,
        variant,
        updated.plan_data,
        updated.batch_cooking,
        updated.shopping_list,
      )
      if (saveRes.success) {
        setSavedToDb(true)
      }
    } catch (e) {
      console.error(e)
      showToast(e instanceof Error ? e.message : 'Nahrazení selhalo.', 'error')
    } finally {
      setReplacingKey(null)
    }
  }

  const copyShoppingList = async () => {
    if (!plan?.shopping_list) {
      return
    }
    const text = buildShoppingListText(plan.shopping_list)
    try {
      await navigator.clipboard.writeText(text)
      showToast('Seznam zkopírován.', 'success')
    } catch {
      showToast('Kopírování se nezdařilo.', 'error')
    }
  }

  // Sends the current shopping list to Rohlik and populates the cart
  const addToRohlik = async () => {
    if (!plan?.shopping_list) return
    setRohlikLoading(true)
    setRohlikResult(null)
    try {
      const filteredList: GeneratedMealPlanPayload['shopping_list'] = {}
      for (const [category, items] of Object.entries(plan.shopping_list)) {
        const included = items.filter((item) => {
          const id = shoppingItemKey(category, item)
          // Include when the row is checked for Rohlík (not marked skip in `bought`)
          return !bought[id]
        })
        if (included.length > 0) {
          filteredList[category] = included
        }
      }

      const totalItems = Object.values(plan.shopping_list).flat().length
      const filteredItems = Object.values(filteredList).flat().length
      const skipped = totalItems - filteredItems

      const result = await addToRohlikCart(filteredList)
      setRohlikResult(result)

      const skipMsg = skipped > 0 ? ` (${skipped} přeskočeno jako doma)` : ''
      if (result.summary.failed === 0) {
        showToast(`Přidáno ${result.summary.added} položek do Rohlíku ✓${skipMsg}`, 'success')
      } else {
        showToast(
          `Přidáno ${result.summary.added} z ${result.summary.total} položek. ${result.summary.failed} se nepodařilo.${skipMsg}`,
          'error',
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Neznámá chyba'
      showToast(`Chyba Rohlíku: ${msg}`, 'error')
    } finally {
      setRohlikLoading(false)
    }
  }

  const startNewPlan = () => {
    setPageMode('generate')
    setPlan(null)
    setSavedToDb(false)
    setVariant('A')
    setWeekStart(getNextMonday())
    setAvailText('')
    setExcludeText('')
    setSubTab('meals')
  }

  if (initialLoading) {
    return (
      <div className="bg-page flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--color-border)] border-t-[color:var(--color-text-secondary)]"
          aria-hidden
        />
        <p className="text-secondary text-sm">Načítám jídelníček...</p>
      </div>
    )
  }

  if (pageMode === 'generate') {
    return (
      <div className="bg-page mx-auto max-w-md space-y-5">
        <div>
          <h1 className="text-primary text-xl font-semibold">Jídelníček</h1>
          <p className="text-secondary mt-1 text-sm">
            Týdenní plán pro celou rodinu — vaření v Thermomixu a nákup na Rohlík.
          </p>
        </div>

        <label className="block">
          <span className="text-primary mb-1 block text-sm font-medium">Týden od:</span>
          <input
            type="date"
            value={weekStart}
            disabled={generating}
            onChange={(e) => setWeekStart(e.target.value)}
            className="bg-surface text-primary w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2.5 text-base"
          />
        </label>

        <label className="block">
          <span className="text-primary mb-1 block text-sm font-medium">Mám v lednici: (volitelné)</span>
          <textarea
            value={availText}
            disabled={generating}
            onChange={(e) => setAvailText(e.target.value)}
            rows={3}
            placeholder="např. kuřecí prsa, rýže basmati..."
            className="bg-surface text-primary placeholder:text-secondary w-full resize-y rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-primary mb-1 block text-sm font-medium">Tento týden bez: (volitelné)</span>
          <textarea
            value={excludeText}
            disabled={generating}
            onChange={(e) => setExcludeText(e.target.value)}
            rows={2}
            placeholder="např. houby, vepřové..."
            className="bg-surface text-primary placeholder:text-secondary w-full resize-y rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm"
          />
        </label>

        <button
          type="button"
          disabled={generating}
          onClick={() => void handleGenerate()}
          className="w-full rounded-xl py-4 text-base font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {generating ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span
                className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden
              />
              Generuji...
            </span>
          ) : (
            'Vygenerovat jídelníček 🍳'
          )}
        </button>

        {generating ? (
          <p className="text-secondary text-center text-sm">Claude připravuje váš jídelníček...</p>
        ) : (
          <p className="text-secondary text-center text-xs">Generování trvá ~30 sekund</p>
        )}
      </div>
    )
  }

  if (!plan) {
    return null
  }

  return (
    <div className="bg-page mx-auto max-w-md pb-40">
      <div className="mb-4">
        <h1 className="text-primary text-xl font-semibold">Jídelníček</h1>
        <p className="text-secondary text-sm">
          {formatWeekRange(weekStart)}
          {!savedToDb ? (
            <span className="ml-2 text-amber-700">· Neuloženo</span>
          ) : null}
        </p>
      </div>

      {/* Sub-tabs: underline style */}
      <div
        className="mb-4 flex border-b"
        style={{ borderColor: 'color-mix(in srgb, var(--color-text-secondary) 25%, transparent)' }}
        role="tablist"
      >
        {(
          [
            ['meals', 'Jídelníček'],
            ['cooking', 'Vaření'],
            ['shopping', 'Nákupy'],
          ] as const
        ).map(([id, label]) => {
          const active = subTab === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              className="min-h-11 flex-1 border-b-2 pb-2 pt-2 text-sm font-medium transition-colors"
              style={{
                borderBottomColor: active ? 'var(--color-primary)' : 'transparent',
                color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}
              onClick={() => setSubTab(id)}
            >
              {label}
            </button>
          )
        })}
      </div>

      {subTab === 'meals' && (
        <div className="space-y-4">
          {sortedDays.map((day) => {
            const slots = plan.plan_data[day]
            if (!slots) {
              return null
            }
            const entries = Object.entries(slots)
            return (
              <section
                key={day}
                className="card-rainbow bg-surface overflow-hidden rounded-lg shadow-sm"
                style={{
                  boxShadow: '0 1px 3px color-mix(in srgb, var(--color-text) 12%, transparent)',
                }}
              >
                <h2 className="text-secondary border-b border-[color:var(--color-border)] px-4 py-3 text-base font-bold">
                  {getCzechDayName(day)}
                </h2>
                <ul className="divide-y divide-[color:var(--color-border)]">
                  {entries.map(([mealType, meal]) => {
                    const nameTrimmed =
                      meal && typeof meal.name === 'string' ? meal.name.trim() : ''
                    if (!nameTrimmed) {
                      return null
                    }
                    const label = MEAL_TYPE_LABELS[mealType] ?? mealType
                    const rowKey = `${day}:${mealType}`
                    const isReplacing = replacingKey === rowKey
                    return (
                      <li
                        key={mealType}
                        className={`flex gap-2 px-4 py-3 ${isReplacing ? 'animate-pulse bg-[color:var(--color-input-bg)]' : ''}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-secondary text-xs font-medium uppercase tracking-wide">
                            {label}
                          </div>
                          <div className="text-primary font-medium">{meal.name}</div>
                          {meal.note ? (
                            <div className="text-secondary mt-0.5 text-sm">{meal.note}</div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={isReplacing || !!replacingKey}
                          onClick={() => setRejectTarget({ day, mealType })}
                          className="text-secondary h-11 min-w-11 shrink-0 rounded-lg text-lg transition hover:bg-red-500/10 hover:text-red-500"
                          aria-label="Odmítnout jídlo"
                        >
                          ❌
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      {subTab === 'cooking' && (
        <div className="space-y-4">
          {(plan.batch_cooking ?? []).map((block, i) => {
            return (
              <article
                key={`${block.cook_day}-${i}`}
                className="card-rainbow bg-surface rounded-lg p-4 shadow-sm"
                style={{
                  boxShadow: '0 1px 3px color-mix(in srgb, var(--color-text) 12%, transparent)',
                }}
              >
                <h3 className="text-primary text-base font-bold">{formatBatchCookDayHeader(block.cook_day)}</h3>
                <p className="text-secondary mt-1 text-sm">
                  → {block.meals_covered.map(formatCoverageLine).join(', ')}
                </p>
                <ul className="mt-3 space-y-3">
                  {block.recipes.map((r, j) => (
                    <li
                      key={j}
                      className="border-t border-[color:var(--color-border)] pt-3 first:border-0 first:pt-0"
                    >
                      <div className="text-primary font-medium">{r.name}</div>
                      {typeof r.tm_time_minutes === 'number' ? (
                        <div className="text-secondary text-sm">⏱ {r.tm_time_minutes} min v TM</div>
                      ) : null}
                      {typeof r.portions === 'number' ? (
                        <div className="text-secondary text-sm">📦 {r.portions} porcí</div>
                      ) : null}
                      {r.note ? <div className="text-secondary text-sm">{r.note}</div> : null}
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
          {plan.batch_cooking?.length === 0 ? (
            <p className="text-secondary text-sm">Žádné plánované vaření v dávkách.</p>
          ) : null}
        </div>
      )}

      {subTab === 'shopping' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void copyShoppingList()}
            className="bg-surface text-primary w-full rounded-xl border-2 border-[color:var(--color-border)] py-3 text-sm font-medium"
          >
            Kopírovat seznam
          </button>
          {/* Rohlik cart button — sends shopping list to Rohlik.cz */}
          <button
            type="button"
            onClick={() => void addToRohlik()}
            disabled={rohlikLoading}
            className="bg-surface text-primary w-full rounded-xl border-2 border-[color:var(--color-border)] py-3 text-sm font-medium disabled:opacity-50"
          >
            {rohlikLoading ? 'Přidávám do Rohlíku…' : '🛒 Přidat do Rohlíku'}
          </button>
          {/* Result summary shown after Rohlik cart attempt */}
          {rohlikResult && (
            <div className="card-rainbow bg-surface rounded-lg p-4 text-sm">
              <p className="text-primary mb-2 font-bold">
                Výsledek: {rohlikResult.summary.added}/{rohlikResult.summary.total} položek přidáno
              </p>
              {rohlikResult.items
                .filter((item) => !item.added)
                .map((item) => (
                  <p key={item.ingredient} className="text-secondary mt-1 text-xs">
                    ✗ {item.ingredient}
                    {item.productFound ? ' — nepodařilo se přidat' : ' — produkt nenalezen'}
                  </p>
                ))}
            </div>
          )}
          {/* Select all / deselect all for Rohlik cart */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => persistBought({})}
              className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-surface py-2 text-xs font-medium text-primary"
            >
              ✓ Označit vše
            </button>
            <button
              type="button"
              onClick={() => {
                const allBought: Record<string, boolean> = {}
                for (const [category, items] of Object.entries(plan?.shopping_list ?? {})) {
                  for (const item of items) {
                    allBought[shoppingItemKey(category, item)] = true
                  }
                }
                persistBought(allBought)
              }}
              className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-surface py-2 text-xs font-medium text-primary"
            >
              ✗ Zrušit vše
            </button>
          </div>
          {Object.entries(plan.shopping_list ?? {})
            .sort(([a], [b]) => a.localeCompare(b, 'cs'))
            .map(([category, items]) => {
              if (!items?.length) {
                return null
              }
              const emoji = SHOPPING_CATEGORY_EMOJI[category] ?? '📦'
              const open = expandedCategories[category] ?? true
              return (
                <div
                  key={category}
                  className="card-rainbow bg-surface overflow-hidden rounded-lg shadow-sm"
                  style={{
                    boxShadow: '0 1px 3px color-mix(in srgb, var(--color-text) 12%, transparent)',
                  }}
                >
                  <button
                    type="button"
                    className="text-primary flex w-full min-h-11 items-center justify-between px-4 py-3 text-left font-bold"
                    onClick={() =>
                      setExpandedCategories((prev) => ({ ...prev, [category]: !open }))
                    }
                  >
                    <span>
                      {emoji} {category}
                    </span>
                    <span className="text-secondary">{open ? '▼' : '▶'}</span>
                  </button>
                  {open ? (
                    <ul className="border-t border-[color:var(--color-border)] px-2 py-1">
                      {items.map((item) => {
                        const id = shoppingItemKey(category, item)
                        const checked = !bought[id]
                        return (
                          <li
                            key={id}
                            className="flex items-center gap-3 border-b border-[color:var(--color-border)] py-1 last:border-0"
                          >
                            <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  persistBought({
                                    ...bought,
                                    [id]: !Boolean(bought[id]),
                                  })
                                }}
                                className="border-[color:var(--color-border)] h-5 w-5 shrink-0 cursor-pointer rounded accent-[var(--color-primary)]"
                              />
                              <span className="text-primary text-sm">
                                {item.name}{' '}
                                <span className="text-secondary">
                                  — {item.quantity} {item.unit}
                                </span>
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}
                </div>
              )
            })}
        </div>
      )}

      {/* Reject meal modal */}
      {rejectTarget ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 pt-[env(safe-area-inset-top)] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-meal-title"
        >
          <div className="card-rainbow bg-surface flex max-h-[70dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl p-4 shadow-xl sm:rounded-2xl">
            <h2 id="reject-meal-title" className="text-primary text-lg font-semibold">
              Nechci toto jídlo
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <p className="text-secondary mt-1 text-sm">Důvod (volitelně):</p>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="text-primary placeholder:text-secondary mt-2 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-input-bg)] px-3 py-2"
                placeholder="např. nemáme rádi..."
                autoFocus
              />
            </div>
            <div className="flex flex-shrink-0 gap-2 pt-3 pb-[env(safe-area-inset-bottom)]">
              <button
                type="button"
                className="text-primary flex-1 rounded-xl border border-[color:var(--color-border)] py-3 text-sm font-medium"
                onClick={() => {
                  setRejectTarget(null)
                  setRejectReason('')
                }}
              >
                Zrušit
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--color-primary)' }}
                onClick={() => void handleReplaceConfirm()}
              >
                Nahradit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Bottom action bar */}
      <div
        className="bg-surface/95 fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-20 mx-auto max-w-md border-t px-4 py-3 backdrop-blur-sm left-0 right-0"
        style={{
          borderColor: 'color-mix(in srgb, var(--color-text-secondary) 20%, transparent)',
        }}
      >
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? 'Ukládám...' : 'Uložit plán'}
          </button>
          <button
            type="button"
            onClick={startNewPlan}
            className="text-primary flex-1 rounded-xl border-2 border-[color:var(--color-border)] py-3 text-sm font-medium"
          >
            Nový plán
          </button>
        </div>
      </div>
    </div>
  )
}

export default MealPlan
