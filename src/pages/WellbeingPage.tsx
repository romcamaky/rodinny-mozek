/**
 * Module 5: weekly wellbeing check-in wizard + optional reflection + summary.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCzechLongDate } from '../lib/dateUtils'
import { getCurrentUserId } from '../lib/dataService'
import {
  getCheckinForWeek,
  getCheckinHistory,
  getPreviousWeekStart,
  getReflectionForCheckin,
  getWeekStart,
  saveReflection,
  upsertCheckin,
} from '../lib/wellbeingService'
import { useToast } from '../contexts/ToastContext'
import type { CheckinWithReflection, PlannedBlock, SelectedNeed, WeeklyCheckin } from '../types/wellbeing'
import { MY_NEEDS_OPTIONS, OUR_NEEDS_OPTIONS } from '../types/wellbeing'

const DAY_LABELS = [
  { short: 'Po', full: 'pondělí' },
  { short: 'Út', full: 'úterý' },
  { short: 'St', full: 'středa' },
  { short: 'Čt', full: 'čtvrtek' },
  { short: 'Pá', full: 'pátek' },
  { short: 'So', full: 'sobota' },
  { short: 'Ne', full: 'neděle' },
] as const

const TIME_SLOTS = ['ráno', 'odpoledne', 'večer'] as const

type FlowView = 'loading' | 'summary' | 'reflection' | 'wizard'

function weekEndIso(weekStartIso: string): string {
  const d = new Date(`${weekStartIso}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().slice(0, 10)
}

function weekRangeLabel(weekStartIso: string): string {
  const end = weekEndIso(weekStartIso)
  return `${formatCzechLongDate(weekStartIso)} – ${formatCzechLongDate(end)}`
}

/** Compact Czech range for history cards, e.g. "24.3. – 30.3. 2026". */
function formatWeekRangeCompact(weekStartIso: string): string {
  const start = new Date(`${weekStartIso}T12:00:00.000Z`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const part = (d: Date) => `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`
  return `${part(start)} – ${part(end)} ${end.getUTCFullYear()}`
}

function needLabelsCsv(needs: SelectedNeed[]): string {
  return needs.map((n) => n.label).join(', ') || '—'
}

function plannedBlocksCountLabel(count: number): string {
  if (count === 1) return '1 naplánovaný blok'
  if (count >= 2 && count <= 4) return `${count} naplánované bloky`
  return `${count} naplánovaných bloků`
}

function defaultPlannedBlocks(my: SelectedNeed[], our: SelectedNeed[]): PlannedBlock[] {
  const all = [...my, ...our]
  return all.map((n) => ({
    needLabel: n.label,
    day: 'pondělí',
    timeSlot: 'ráno',
  }))
}

function WellbeingPage() {
  const { showToast } = useToast()

  const weekStart = useMemo(() => getWeekStart(), [])
  const previousWeekStart = useMemo(() => getPreviousWeekStart(weekStart), [weekStart])

  const [flowView, setFlowView] = useState<FlowView>('loading')
  const [thisWeekRow, setThisWeekRow] = useState<WeeklyCheckin | null>(null)
  const [lastWeekRow, setLastWeekRow] = useState<WeeklyCheckin | null>(null)

  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const [stepEnter, setStepEnter] = useState(true)

  const [mySelected, setMySelected] = useState<SelectedNeed[]>([])
  const [ourSelected, setOurSelected] = useState<SelectedNeed[]>([])
  const [myCustomInput, setMyCustomInput] = useState('')
  const [ourCustomInput, setOurCustomInput] = useState('')
  const [plannedBlocks, setPlannedBlocks] = useState<PlannedBlock[]>([])

  const [reflMyDone, setReflMyDone] = useState<Set<string>>(new Set())
  const [reflOurDone, setReflOurDone] = useState<Set<string>>(new Set())
  const [reflNote, setReflNote] = useState('')
  const [savingReflection, setSavingReflection] = useState(false)
  const [savingCheckin, setSavingCheckin] = useState(false)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyData, setHistoryData] = useState<CheckinWithReflection[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const triggerStepTransition = useCallback((fn: () => void) => {
    setStepEnter(false)
    window.setTimeout(() => {
      fn()
      setStepEnter(true)
    }, 160)
  }, [])

  const load = useCallback(async () => {
    setFlowView('loading')
    try {
      const [thisW, lastW] = await Promise.all([
        getCheckinForWeek(weekStart),
        getCheckinForWeek(previousWeekStart),
      ])
      setThisWeekRow(thisW)
      setLastWeekRow(lastW)

      let reflection: Awaited<ReturnType<typeof getReflectionForCheckin>> = null
      if (lastW) {
        reflection = await getReflectionForCheckin(lastW.id)
      }

      if (thisW?.completedAt) {
        setFlowView('summary')
        return
      }
      if (lastW && !reflection) {
        setReflMyDone(new Set())
        setReflOurDone(new Set())
        setReflNote('')
        setFlowView('reflection')
        return
      }
      setMySelected([])
      setOurSelected([])
      setPlannedBlocks([])
      setWizardStep(1)
      setFlowView('wizard')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Nepodařilo se načíst data.', 'error')
      setFlowView('wizard')
    }
  }, [previousWeekStart, showToast, weekStart])

  useEffect(() => {
    void load()
  }, [load])

  // Lazy-load history only when the section is expanded and cache is empty.
  useEffect(() => {
    if (!historyOpen || historyData !== null) {
      return
    }
    let cancelled = false
    setHistoryLoading(true)
    void getCheckinHistory(12)
      .then((rows) => {
        if (!cancelled) setHistoryData(rows)
      })
      .catch((e) => {
        if (!cancelled) {
          showToast(
            e instanceof Error ? e.message : 'Historii se nepodařilo načíst.',
            'error',
          )
          setHistoryData([])
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
      setHistoryLoading(false)
    }
  }, [historyOpen, historyData, showToast])

  const pastCheckinHistory = useMemo(() => {
    if (!historyData) return []
    return historyData.filter((h) => h.checkin.weekStart !== weekStart).slice(0, 12)
  }, [historyData, weekStart])

  function togglePredefined(
    list: SelectedNeed[],
    setList: (v: SelectedNeed[]) => void,
    label: string,
    isCustom: boolean,
  ) {
    const exists = list.some((n) => n.label === label && n.isCustom === isCustom)
    if (exists) {
      setList(list.filter((n) => !(n.label === label && n.isCustom === isCustom)))
    } else {
      setList([...list, { label, isCustom }])
    }
  }

  function isPredefinedSelected(list: SelectedNeed[], label: string): boolean {
    return list.some((n) => n.label === label && !n.isCustom)
  }

  function addCustom(
    input: string,
    list: SelectedNeed[],
    setList: (v: SelectedNeed[]) => void,
    clear: (s: string) => void,
  ) {
    const t = input.trim()
    if (!t) return
    if (list.some((n) => n.label === t)) {
      showToast('Tato položka už je vybraná.', 'error')
      return
    }
    setList([...list, { label: t, isCustom: true }])
    clear('')
  }

  async function handleSaveReflection() {
    if (!lastWeekRow) return
    setSavingReflection(true)
    try {
      const userId = await getCurrentUserId()
      await saveReflection({
        userId,
        checkinId: lastWeekRow.id,
        myNeedsDone: [...reflMyDone],
        ourNeedsDone: [...reflOurDone],
        note: reflNote.trim() || null,
      })
      showToast('Reflexe uložena.', 'success')
      setHistoryData(null)
      setMySelected([])
      setOurSelected([])
      setPlannedBlocks([])
      setWizardStep(1)
      triggerStepTransition(() => setFlowView('wizard'))
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Uložení reflexe se nezdařilo.', 'error')
    } finally {
      setSavingReflection(false)
    }
  }

  async function handleSaveCheckin() {
    if (mySelected.length === 0 && ourSelected.length === 0) {
      showToast('Vyber alespoň jednu potřebu.', 'error')
      return
    }
    setSavingCheckin(true)
    try {
      const userId = await getCurrentUserId()
      const row = await upsertCheckin({
        userId,
        weekStart,
        myNeeds: mySelected,
        ourNeeds: ourSelected,
        plannedBlocks,
        completedAt: null,
      })
      setThisWeekRow(row)
      setHistoryData(null)
      showToast('Check-in uložen.', 'success')
      setFlowView('summary')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Uložení check-inu se nezdařilo.', 'error')
    } finally {
      setSavingCheckin(false)
    }
  }

  function goNextFromStep1() {
    if (mySelected.length === 0) {
      showToast('Vyber alespoň jednu potřebu pro sebe.', 'error')
      return
    }
    triggerStepTransition(() => setWizardStep(2))
  }

  function goNextFromStep2() {
    if (ourSelected.length === 0) {
      showToast('Vyber alespoň jednu společnou potřebu.', 'error')
      return
    }
    triggerStepTransition(() => {
      setPlannedBlocks(defaultPlannedBlocks(mySelected, ourSelected))
      setWizardStep(3)
    })
  }

  const transitionClass = `transition-all duration-200 ease-out ${
    stepEnter ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
  }`

  if (flowView === 'loading') {
    return (
      <div className="bg-page mx-auto max-w-md px-1 pb-28">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--color-border)] border-t-[color:var(--color-primary)]"
            aria-hidden
          />
          <p className="text-secondary text-sm">Načítám…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-page mx-auto max-w-md px-1 pb-28">
      <div className="mb-4 flex items-center gap-2">
        <Link
          to="/dashboard"
          className="text-primary flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[color:var(--color-border)] text-sm font-medium"
          aria-label="Zpět na dashboard"
        >
          ←
        </Link>
        <h1 className="text-primary text-lg font-bold">Týdenní well-being</h1>
      </div>

      {flowView === 'summary' && thisWeekRow && (
        <section
          className="card-rainbow bg-surface rounded-xl border border-[color:var(--color-border)] p-4 shadow-sm"
          style={{
            boxShadow: '0 1px 3px color-mix(in srgb, var(--color-text) 8%, transparent)',
          }}
        >
          <p className="text-secondary text-sm font-medium">
            Tento týden ({weekRangeLabel(thisWeekRow.weekStart)})
          </p>
          <h2 className="text-primary mt-1 text-xl font-bold">Tvůj plán je uložený</h2>

          <div className="mt-6">
            <h3 className="text-primary text-sm font-semibold">Moje potřeby</h3>
            <ul className="text-primary mt-2 space-y-1 text-sm">
              {thisWeekRow.myNeeds.map((n) => (
                <li key={`m-${n.label}-${n.isCustom}`}>• {n.label}</li>
              ))}
            </ul>
          </div>

          <div className="mt-5">
            <h3 className="text-primary text-sm font-semibold">Společné potřeby</h3>
            <ul className="text-primary mt-2 space-y-1 text-sm">
              {thisWeekRow.ourNeeds.map((n) => (
                <li key={`o-${n.label}-${n.isCustom}`}>• {n.label}</li>
              ))}
            </ul>
          </div>

          <div className="mt-5">
            <h3 className="text-primary text-sm font-semibold">Plán</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {thisWeekRow.plannedBlocks.map((b, i) => (
                <li
                  key={`${b.needLabel}-${i}-${b.day}`}
                  className="text-primary rounded-lg bg-[color:var(--color-input-bg)] px-3 py-2"
                >
                  <span className="font-medium">{b.needLabel}</span>
                  <span className="text-secondary">
                    {' '}
                    — {b.day}, {b.timeSlot}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {flowView === 'reflection' && lastWeekRow && (
        <div className={transitionClass}>
          <div className="mb-4 flex items-center justify-center gap-1.5" aria-hidden>
            <span className="h-2 w-2 rounded-full bg-[color:var(--color-primary)]" />
            <span className="bg-[color:var(--color-input-bg)] h-2 w-2 rounded-full" />
            <span className="bg-[color:var(--color-input-bg)] h-2 w-2 rounded-full" />
            <span className="bg-[color:var(--color-input-bg)] h-2 w-2 rounded-full" />
          </div>
          <p className="text-secondary text-center text-xs font-medium">Reflexe</p>

          <h2 className="text-primary mt-2 text-center text-xl font-bold">Jak proběhl minulý týden?</h2>
          <p className="text-secondary mt-1 text-center text-sm">{weekRangeLabel(lastWeekRow.weekStart)}</p>

          <div className="mt-6">
            <h3 className="text-primary text-sm font-semibold">Moje potřeby — co se povedlo?</h3>
            <div className="mt-3 space-y-2">
              {lastWeekRow.myNeeds.map((n) => {
                const checked = reflMyDone.has(n.label)
                return (
                  <label
                    key={`rm-${n.label}-${n.isCustom}`}
                    className="bg-surface flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[color:var(--color-border)] px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      className="border-[color:var(--color-border)] h-5 w-5 rounded text-[color:var(--color-primary)] focus:ring-[color:var(--color-primary)]"
                      checked={checked}
                      onChange={() => {
                        setReflMyDone((prev) => {
                          const next = new Set(prev)
                          if (next.has(n.label)) next.delete(n.label)
                          else next.add(n.label)
                          return next
                        })
                      }}
                    />
                    <span className="text-primary text-sm">{n.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-primary text-sm font-semibold">Společné potřeby — co se povedlo?</h3>
            <div className="mt-3 space-y-2">
              {lastWeekRow.ourNeeds.map((n) => {
                const checked = reflOurDone.has(n.label)
                return (
                  <label
                    key={`ro-${n.label}-${n.isCustom}`}
                    className="bg-surface flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[color:var(--color-border)] px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      className="border-[color:var(--color-border)] h-5 w-5 rounded text-[color:var(--color-primary)] focus:ring-[color:var(--color-primary)]"
                      checked={checked}
                      onChange={() => {
                        setReflOurDone((prev) => {
                          const next = new Set(prev)
                          if (next.has(n.label)) next.delete(n.label)
                          else next.add(n.label)
                          return next
                        })
                      }}
                    />
                    <span className="text-primary text-sm">{n.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="mt-6">
            <label htmlFor="refl-note" className="text-primary text-sm font-semibold">
              Poznámka k minulému týdnu
            </label>
            <textarea
              id="refl-note"
              rows={3}
              value={reflNote}
              onChange={(e) => setReflNote(e.target.value)}
              placeholder="Volitelně…"
              className="bg-surface text-primary placeholder:text-secondary mt-2 w-full rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm focus:border-[color:var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-primary)]"
            />
          </div>

          <button
            type="button"
            disabled={savingReflection}
            onClick={() => void handleSaveReflection()}
            className="mt-8 flex min-h-12 w-full items-center justify-center rounded-full bg-[color:var(--color-primary)] text-base font-semibold text-[color:var(--color-btn-text)] disabled:opacity-60"
          >
            {savingReflection ? 'Ukládám…' : 'Uložit reflexi'}
          </button>
        </div>
      )}

      {flowView === 'wizard' && (
        <div className={transitionClass}>
          <div className="mb-4 flex items-center justify-center gap-1.5" aria-hidden>
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`h-2 w-2 rounded-full ${wizardStep >= s ? 'bg-[color:var(--color-primary)]' : 'bg-[color:var(--color-input-bg)]'}`}
              />
            ))}
          </div>
          <p className="text-secondary text-center text-xs font-medium">
            Krok {wizardStep} ze 3
          </p>

          {wizardStep === 1 && (
            <div className="mt-4">
              <h2 className="text-primary text-xl font-bold">Co tento týden potřebuji já?</h2>
              <p className="text-secondary mt-1 text-sm">Vyber, co je pro tebe tento týden důležité</p>

              <div className="mt-5 flex flex-wrap gap-2">
                {MY_NEEDS_OPTIONS.map((opt) => {
                  const on = isPredefinedSelected(mySelected, opt)
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => togglePredefined(mySelected, setMySelected, opt, false)}
                      className={`min-h-11 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        on
                          ? 'bg-[color:var(--color-primary)] text-[color:var(--color-btn-text)]'
                          : 'bg-[color:var(--color-input-bg)] text-primary'
                      }`}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>

              <div className="mt-6 flex gap-2">
                <input
                  type="text"
                  value={myCustomInput}
                  onChange={(e) => setMyCustomInput(e.target.value)}
                  placeholder="Jiné…"
                  className="bg-surface text-primary placeholder:text-secondary min-h-11 min-w-0 flex-1 rounded-xl border border-[color:var(--color-border)] px-3 text-sm focus:border-[color:var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={() => addCustom(myCustomInput, mySelected, setMySelected, setMyCustomInput)}
                  className="text-primary min-h-11 shrink-0 rounded-full bg-[color:var(--color-input-bg)] px-4 text-sm font-semibold"
                >
                  Přidat
                </button>
              </div>

              <button
                type="button"
                onClick={goNextFromStep1}
                className="mt-10 flex min-h-12 w-full items-center justify-center rounded-full bg-[color:var(--color-primary)] text-base font-semibold text-[color:var(--color-btn-text)]"
              >
                Další krok →
              </button>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => triggerStepTransition(() => setWizardStep(1))}
                className="mb-4 min-h-11 text-sm font-medium text-[color:var(--color-primary)]"
              >
                ← Zpět
              </button>
              <h2 className="text-primary text-xl font-bold">Co tento týden potřebujeme spolu?</h2>
              <p className="text-secondary mt-1 text-sm">Vyber, na co se chcete tento týden zaměřit</p>

              <div className="mt-5 flex flex-wrap gap-2">
                {OUR_NEEDS_OPTIONS.map((opt) => {
                  const on = isPredefinedSelected(ourSelected, opt)
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => togglePredefined(ourSelected, setOurSelected, opt, false)}
                      className={`min-h-11 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        on
                          ? 'bg-[color:var(--color-primary)] text-[color:var(--color-btn-text)]'
                          : 'bg-[color:var(--color-input-bg)] text-primary'
                      }`}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>

              <div className="mt-6 flex gap-2">
                <input
                  type="text"
                  value={ourCustomInput}
                  onChange={(e) => setOurCustomInput(e.target.value)}
                  placeholder="Jiné…"
                  className="bg-surface text-primary placeholder:text-secondary min-h-11 min-w-0 flex-1 rounded-xl border border-[color:var(--color-border)] px-3 text-sm focus:border-[color:var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={() =>
                    addCustom(ourCustomInput, ourSelected, setOurSelected, setOurCustomInput)
                  }
                  className="text-primary min-h-11 shrink-0 rounded-full bg-[color:var(--color-input-bg)] px-4 text-sm font-semibold"
                >
                  Přidat
                </button>
              </div>

              <button
                type="button"
                onClick={goNextFromStep2}
                className="mt-10 flex min-h-12 w-full items-center justify-center rounded-full bg-[color:var(--color-primary)] text-base font-semibold text-[color:var(--color-btn-text)]"
              >
                Další krok →
              </button>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => triggerStepTransition(() => setWizardStep(2))}
                className="mb-4 min-h-11 text-sm font-medium text-[color:var(--color-primary)]"
              >
                ← Zpět
              </button>
              <h2 className="text-primary text-xl font-bold">Kdy to uděláme?</h2>
              <p className="text-secondary mt-1 text-sm">Naplánuj si čas u každé potřeby</p>

              <div className="mt-6 space-y-5">
                {plannedBlocks.map((block, idx) => (
                  <div
                    key={`${block.needLabel}-${idx}`}
                    className="card-rainbow bg-surface rounded-xl border border-[color:var(--color-border)] p-3 shadow-sm"
                  >
                    <p className="text-primary text-sm font-semibold">{block.needLabel}</p>
                    <p className="text-secondary mt-2 text-xs font-medium">Den</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {DAY_LABELS.map((d) => {
                        const on = block.day === d.full
                        return (
                          <button
                            key={d.full}
                            type="button"
                            onClick={() =>
                              setPlannedBlocks((prev) =>
                                prev.map((b, i) => (i === idx ? { ...b, day: d.full } : b)),
                              )
                            }
                            className={`min-h-11 min-w-[2.75rem] rounded-full px-2 text-xs font-semibold ${
                              on
                                ? 'bg-[color:var(--color-primary)] text-[color:var(--color-btn-text)]'
                                : 'bg-[color:var(--color-input-bg)] text-primary'
                            }`}
                          >
                            {d.short}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-secondary mt-3 text-xs font-medium">Čas</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {TIME_SLOTS.map((t) => {
                        const on = block.timeSlot === t
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() =>
                              setPlannedBlocks((prev) =>
                                prev.map((b, i) => (i === idx ? { ...b, timeSlot: t } : b)),
                              )
                            }
                            className={`min-h-11 rounded-full px-4 text-sm font-medium ${
                              on
                                ? 'bg-[color:var(--color-primary)] text-[color:var(--color-btn-text)]'
                                : 'bg-[color:var(--color-input-bg)] text-primary'
                            }`}
                          >
                            {t}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={savingCheckin}
                onClick={() => void handleSaveCheckin()}
                className="mt-10 flex min-h-12 w-full items-center justify-center rounded-full bg-[color:var(--color-primary)] text-base font-semibold text-[color:var(--color-btn-text)] disabled:opacity-60"
              >
                {savingCheckin ? 'Ukládám…' : 'Uložit check-in ✓'}
              </button>
            </div>
          )}
        </div>
      )}

      <section
        className="mt-10 border-t pt-8"
        style={{
          borderColor: 'color-mix(in srgb, var(--color-text-secondary) 18%, transparent)',
        }}
        aria-label="Historie check-inů"
      >
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          className="text-primary flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-1 text-left"
          aria-expanded={historyOpen}
        >
          <span className="text-base font-semibold">Historie</span>
          <span className="text-secondary flex shrink-0 items-center gap-2 text-sm">
            <span>{historyOpen ? 'Skrýt historii' : 'Zobrazit historii'}</span>
            <span className="text-xs" aria-hidden>
              {historyOpen ? '▲' : '▼'}
            </span>
          </span>
        </button>

        {historyOpen && (
          <div className="mt-4 space-y-3">
            {historyLoading && (
              <p className="text-secondary text-sm">Načítám historii…</p>
            )}
            {!historyLoading && historyData !== null && pastCheckinHistory.length === 0 && (
              <p className="text-secondary text-sm leading-relaxed">
                Zatím žádné check-iny. Začněte prvním výše ☝️
              </p>
            )}
            {!historyLoading && historyData !== null && pastCheckinHistory.length > 0 && (
              <div className="space-y-3">
                {pastCheckinHistory.map(({ checkin, reflection }) => (
                  <article
                    key={checkin.id}
                    className="card-rainbow bg-surface rounded-xl border border-[color:var(--color-border)] p-4 shadow-sm"
                    style={{
                      boxShadow: '0 1px 2px color-mix(in srgb, var(--color-text) 6%, transparent)',
                    }}
                  >
                    <p className="text-primary text-sm font-semibold">
                      {formatWeekRangeCompact(checkin.weekStart)}
                    </p>

                    <div className="mt-3 min-w-0">
                      <p className="text-secondary text-xs font-medium uppercase tracking-wide">
                        Moje potřeby
                      </p>
                      {reflection ? (
                        <NeedLabelsWithReflection
                          needs={checkin.myNeeds}
                          doneLabels={reflection.myNeedsDone}
                        />
                      ) : (
                        <p className="text-primary mt-0.5 break-words text-sm">
                          {needLabelsCsv(checkin.myNeeds)}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 min-w-0">
                      <p className="text-secondary text-xs font-medium uppercase tracking-wide">
                        Společné potřeby
                      </p>
                      {reflection ? (
                        <NeedLabelsWithReflection
                          needs={checkin.ourNeeds}
                          doneLabels={reflection.ourNeedsDone}
                        />
                      ) : (
                        <p className="text-primary mt-0.5 break-words text-sm">
                          {needLabelsCsv(checkin.ourNeeds)}
                        </p>
                      )}
                    </div>

                    <p className="text-primary mt-3 text-sm">
                      Plán: {plannedBlocksCountLabel(checkin.plannedBlocks.length)}
                    </p>

                    <p className="mt-2 text-sm">
                      {reflection ? (
                        <span className="font-medium text-emerald-700">Reflektováno ✓</span>
                      ) : (
                        <span className="text-secondary">Bez reflexe</span>
                      )}
                    </p>

                    {reflection?.note ? (
                      <p className="text-secondary mt-2 break-words text-sm italic">{reflection.note}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

/** Renders need labels; fulfilled ones (per reflection) show a subtle checkmark. */
function NeedLabelsWithReflection({
  needs,
  doneLabels,
}: {
  needs: SelectedNeed[]
  doneLabels: string[]
}) {
  const done = new Set(doneLabels)
  if (needs.length === 0) {
    return <p className="text-secondary mt-0.5 text-sm">—</p>
  }
  return (
    <p className="text-primary mt-0.5 break-words text-sm leading-relaxed">
      {needs.map((n, i) => (
        <span key={`${n.label}-${i}-${n.isCustom}`}>
          {i > 0 ? ', ' : null}
          {done.has(n.label) ? (
            <span className="text-emerald-800">
              <span aria-hidden>✓ </span>
              {n.label}
            </span>
          ) : (
            <span>{n.label}</span>
          )}
        </span>
      ))}
    </p>
  )
}

export default WellbeingPage
