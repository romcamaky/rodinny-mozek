import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../contexts/ToastContext'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import PlaceForm from './PlaceForm'
import { saveClassifiedData, type SavePlaceInput, type VoiceClassification } from '../lib/dataService'
import {
  sendToVoiceRouter,
  type NoteData,
  type PlaceData,
  type TaskData,
  type VoiceRouterResponse,
} from '../lib/voiceRouter'

type CaptureOverlayState = 'input' | 'recording' | 'loading' | 'confirm'
type Visibility = 'shared' | 'private'
type Target = 'task' | 'note' | 'place' | 'milestone'

type TaskFormState = TaskData & { visibility: Visibility }
type NoteFormState = NoteData & { visibility: Visibility }

const NOTE_CATEGORY_OPTIONS: { label: string; value: NoteData['category'] }[] = [
  { label: 'Nápad', value: 'idea' },
  { label: 'Výlet', value: 'trip' },
  { label: 'Děti', value: 'kids' },
  { label: 'Osobní', value: 'personal' },
  { label: 'Projekt', value: 'project' },
  { label: 'Ostatní', value: 'other' },
]

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

type CaptureOverlayProps = {
  onClose: () => void
}

function CaptureOverlay({ onClose }: CaptureOverlayProps) {
  const { showToast } = useToast()
  const {
    isRecording,
    startRecording,
    stopRecording,
    audioBlob,
    error: audioError,
    recordingDuration,
  } = useAudioRecorder()

  const [captureState, setCaptureState] = useState<CaptureOverlayState>('input')
  const [textInput, setTextInput] = useState('')
  const [result, setResult] = useState<VoiceRouterResponse | null>(null)
  const [taskForm, setTaskForm] = useState<TaskFormState | null>(null)
  const [noteForm, setNoteForm] = useState<NoteFormState | null>(null)
  const [placeForm, setPlaceForm] = useState<SavePlaceInput | null>(null)
  const [screenError, setScreenError] = useState<string | null>(null)
  const [lastCaptureSource, setLastCaptureSource] = useState<'voice' | 'text'>('text')
  const [isSaving, setIsSaving] = useState(false)

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [])

  function scheduleCloseAfterSuccess() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      onClose()
    }, 1500)
  }

  useEffect(() => {
    if (audioError) {
      setScreenError(audioError)
      setCaptureState('input')
    }
  }, [audioError])

  useEffect(() => {
    if (!audioBlob || captureState !== 'recording') {
      return
    }
    void submitRequest({ audioBlob })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBlob, captureState])

  useEffect(() => {
    const textarea = textAreaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const maxHeight = 24 * 4 + 24
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [textInput])

  const targetLabel = useMemo(() => {
    const target = result?.classification.target
    if (target === 'task') return 'Úkol'
    if (target === 'note') return 'Poznámka'
    if (target === 'place') return 'Místo'
    return 'Milník'
  }, [result])

  const targetStyle = useMemo(() => {
    const target = result?.classification.target
    if (target === 'task') return { backgroundColor: '#dbeafe', color: '#1d4ed8' }
    if (target === 'note') return { backgroundColor: '#dcfce7', color: '#166534' }
    if (target === 'place') return { backgroundColor: '#ffedd5', color: '#c2410c' }
    return { backgroundColor: '#e2e8f0', color: '#334155' }
  }, [result])

  // Drives transitions between input/recording/loading/confirm states.
  async function submitRequest(payload: { audioBlob?: Blob; textInput?: string }) {
    setScreenError(null)
    setCaptureState('loading')
    setLastCaptureSource(payload.audioBlob ? 'voice' : 'text')

    try {
      const response = await sendToVoiceRouter(payload)
      setResult(response)

      // Pre-fill extracted fields so the user can quickly correct and confirm before saving.
      if (response.classification.target === 'task') {
        const data = response.classification.data as TaskData
        setTaskForm({
          title: data.title ?? '',
          description: data.description ?? '',
          assigned_to: data.assigned_to ?? 'both',
          deadline: data.deadline ?? '',
          visibility: 'shared',
        })
        setNoteForm(null)
        setPlaceForm(null)
      }

      if (response.classification.target === 'note') {
        const data = response.classification.data as NoteData
        setNoteForm({
          text: data.text ?? '',
          category: data.category ?? 'other',
          visibility: 'shared',
        })
        setTaskForm(null)
        setPlaceForm(null)
      }

      if (response.classification.target === 'place') {
        const data = response.classification.data as PlaceData
        setPlaceForm({
          name: data.name ?? '',
          address: data.address ?? '',
          tags: data.tags ?? [],
          notes: data.notes ?? '',
          source: data.source ?? 'web',
          website: null,
          visit_duration_minutes: null,
        })
        setTaskForm(null)
        setNoteForm(null)
      }

      if (response.classification.target === 'milestone') {
        setTaskForm(null)
        setNoteForm(null)
        setPlaceForm(null)
      }

      setCaptureState('confirm')
      setTextInput('')
    } catch (err) {
      // Network/DNS/CORS failures usually surface as TypeError from fetch.
      const isNetworkError =
        err instanceof TypeError || (err instanceof Error && /failed to fetch|network|load failed/i.test(err.message))

      const screenMessage = isNetworkError
        ? 'Nepodařilo se spojit se serverem. Zkus to znovu.'
        : 'Chyba při zpracování. Zkus to znovu.'

      setScreenError(screenMessage)
      showToast(screenMessage, 'error')
      setCaptureState('input')
    }
  }

  function resetToInput() {
    setCaptureState('input')
    setResult(null)
    setTaskForm(null)
    setNoteForm(null)
    setPlaceForm(null)
    setScreenError(null)
  }

  async function handleMicAction() {
    if (!isRecording) {
      setScreenError(null)
      setCaptureState('recording')
      await startRecording()
      return
    }
    stopRecording()
  }

  function handleCancelRecording() {
    if (isRecording) stopRecording()
    resetToInput()
  }

  async function handleTextSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = textInput.trim()
    if (!trimmed) return
    await submitRequest({ textInput: trimmed })
  }

  // Builds the classification object from edited form state so Supabase gets the latest user edits.
  function buildClassificationForSave(): VoiceClassification | null {
    if (!result) return null

    const target = result.classification.target

    if (target === 'task') {
      if (!taskForm) return null
      const { visibility: _v, ...taskData } = taskForm
      return {
        target: 'task',
        confidence: result.classification.confidence,
        data: taskData,
      }
    }

    if (target === 'note') {
      if (!noteForm) return null
      const { visibility: _v, ...noteData } = noteForm
      return {
        target: 'note',
        confidence: result.classification.confidence,
        data: noteData,
      }
    }

    if (target === 'milestone') return result.classification as VoiceClassification

    return null
  }

  // Saves a place from the shared PlaceForm (form owns edited fields until submit).
  async function handlePlaceSave(data: SavePlaceInput) {
    if (!result || isSaving) return

    setIsSaving(true)
    try {
      const outcome = await saveClassifiedData(
        {
          target: 'place',
          confidence: result.classification.confidence,
          data,
        },
        lastCaptureSource,
        'shared',
      )

      if (!outcome.success) {
        showToast(outcome.error ?? 'Uložení se nezdařilo.', 'error')
        return
      }

      showToast('Uloženo! (Místo)', 'success')
      resetToInput()
      scheduleCloseAfterSuccess()
    } finally {
      setIsSaving(false)
    }
  }

  // Persists task/note/milestone using current form state (place uses PlaceForm submit).
  async function handleSave() {
    if (!result || isSaving) return
    if (result.classification.target === 'place') return

    const classification = buildClassificationForSave()
    if (!classification) {
      showToast('Chybí data k uložení.', 'error')
      return
    }

    const visibility: 'shared' | 'private' =
      result.classification.target === 'task' && taskForm
        ? taskForm.visibility
        : result.classification.target === 'note' && noteForm
          ? noteForm.visibility
          : 'shared'

    setIsSaving(true)
    try {
      const outcome = await saveClassifiedData(classification, lastCaptureSource, visibility)

      if (!outcome.success) {
        showToast(outcome.error ?? 'Uložení se nezdařilo.', 'error')
        return
      }

      const labelCz =
        outcome.target === 'task'
          ? 'Úkol'
          : outcome.target === 'note'
            ? 'Poznámka'
            : outcome.target === 'place'
              ? 'Místo'
              : 'Milník'

      showToast(`Uloženo! (${labelCz})`, 'success')
      resetToInput()
      scheduleCloseAfterSuccess()
    } finally {
      setIsSaving(false)
    }
  }

  function toggleVisibility(target: Target) {
    if (target === 'task' && taskForm) {
      setTaskForm({
        ...taskForm,
        visibility: taskForm.visibility === 'shared' ? 'private' : 'shared',
      })
    }

    if (target === 'note' && noteForm) {
      setNoteForm({
        ...noteForm,
        visibility: noteForm.visibility === 'shared' ? 'private' : 'shared',
      })
    }
  }

  function renderVisibilityToggle(target: 'task' | 'note', visibility: Visibility) {
    const isShared = visibility === 'shared'

    return (
      <button
        type="button"
        className="mt-4 flex min-h-11 items-center rounded-xl border px-3 py-2 text-sm"
        style={{
          borderColor: 'color-mix(in srgb, var(--color-text-secondary) 35%, transparent)',
          color: 'var(--color-text)',
        }}
        onClick={() => toggleVisibility(target)}
      >
        <span className={isShared ? 'font-semibold' : ''}>Sdílené</span>
        <span className="mx-2" style={{ color: 'var(--color-text-secondary)' }}>
          /
        </span>
        <span className={!isShared ? 'font-semibold' : ''}>Soukromé</span>
      </button>
    )
  }

  function renderTaskForm() {
    if (!taskForm) return null

    return (
      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium">Název</label>
        <input
          className="min-h-11 w-full rounded-xl border px-3 py-2 text-base"
          style={{ borderColor: '#cbd5e1' }}
          value={taskForm.title}
          onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
        />

        <label className="block text-sm font-medium">Popis</label>
        <textarea
          className="w-full rounded-xl border px-3 py-2 text-base"
          style={{ borderColor: '#cbd5e1' }}
          rows={3}
          value={taskForm.description ?? ''}
          onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })}
        />

        <label className="block text-sm font-medium">Přiřazeno</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Romi', value: 'romi' },
            { label: 'Petr', value: 'petr' },
            { label: 'Oba', value: 'both' },
          ].map((option) => {
            const active = taskForm.assigned_to === option.value
            return (
              <button
                key={option.value}
                type="button"
                className="min-h-11 rounded-xl border px-3 py-2 text-sm"
                style={{
                  borderColor: active ? 'var(--color-primary)' : '#cbd5e1',
                  backgroundColor: active
                    ? 'color-mix(in srgb, var(--color-primary) 16%, white)'
                    : 'white',
                }}
                onClick={() => setTaskForm({ ...taskForm, assigned_to: option.value as TaskData['assigned_to'] })}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <label className="block text-sm font-medium">Termín</label>
        <input
          type="date"
          className="min-h-11 w-full rounded-xl border px-3 py-2 text-base"
          style={{ borderColor: '#cbd5e1' }}
          value={taskForm.deadline ?? ''}
          onChange={(event) => setTaskForm({ ...taskForm, deadline: event.target.value })}
        />

        {renderVisibilityToggle('task', taskForm.visibility)}
      </div>
    )
  }

  function renderNoteForm() {
    if (!noteForm) return null

    return (
      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium">Text</label>
        <textarea
          className="w-full rounded-xl border px-3 py-2 text-base"
          style={{ borderColor: '#cbd5e1' }}
          rows={4}
          value={noteForm.text}
          onChange={(event) => setNoteForm({ ...noteForm, text: event.target.value })}
        />

        <label className="block text-sm font-medium">Kategorie</label>
        <select
          className="min-h-11 w-full rounded-xl border px-3 py-2 text-base"
          style={{ borderColor: '#cbd5e1' }}
          value={noteForm.category}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            setNoteForm({ ...noteForm, category: event.target.value as NoteData['category'] })
          }
        >
          {NOTE_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {renderVisibilityToggle('note', noteForm.visibility)}
      </div>
    )
  }

  function renderInputState() {
    return (
      <section className="mx-auto flex w-full max-w-md flex-col items-center">
        <h1 className="text-3xl font-bold">Zachytit</h1>
        <p className="mt-3 text-center text-base" style={{ color: 'var(--color-text-secondary)' }}>
          Řekni mi, co potřebuješ — úkol, poznámku, místo...
        </p>

        <button
          type="button"
          className={`mt-8 flex min-h-20 min-w-20 items-center justify-center rounded-full text-white shadow-lg ${
            isRecording ? 'recording-pulse bg-red-500' : ''
          }`}
          style={{
            height: 96,
            width: 96,
            backgroundColor: isRecording ? '#ef4444' : 'var(--color-primary)',
          }}
          onClick={() => void handleMicAction()}
          aria-label={isRecording ? 'Zastavit nahrávání' : 'Spustit nahrávání'}
        >
          {isRecording ? (
            <span className="h-4 w-4 rounded-sm bg-white" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M6 11a6 6 0 0 0 12 0" />
              <path d="M12 17v4" />
              <path d="M9 21h6" />
            </svg>
          )}
        </button>

        {isRecording ? (
          <>
            <p className="mt-4 text-base font-medium">{formatDuration(recordingDuration)}</p>
            <button
              type="button"
              className="mt-2 min-h-11 px-3 text-sm"
              style={{ color: 'var(--color-text-secondary)' }}
              onClick={handleCancelRecording}
            >
              Zrušit
            </button>
          </>
        ) : null}

        <form className="mt-10 w-full" onSubmit={(event) => void handleTextSubmit(event)}>
          <textarea
            ref={textAreaRef}
            className="w-full resize-none rounded-2xl border bg-white px-4 py-3 text-base"
            style={{ borderColor: '#cbd5e1', lineHeight: '24px' }}
            placeholder="...nebo napiš sem"
            value={textInput}
            rows={2}
            onChange={(event) => setTextInput(event.target.value)}
          />
          {textInput.trim() ? (
            <button
              type="submit"
              className="mt-3 min-h-11 w-full rounded-xl px-4 py-3 text-base font-semibold text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Odeslat
            </button>
          ) : null}
        </form>
      </section>
    )
  }

  function renderLoadingState() {
    return (
      <section className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-500" />
        <p className="mt-4 text-base" style={{ color: 'var(--color-text-secondary)' }}>
          Zpracovávám...
        </p>
      </section>
    )
  }

  function renderConfirmState() {
    if (!result) return null

    return (
      <section className="mx-auto w-full max-w-md pb-28">
        <h1 className="text-3xl font-bold">Potvrzení</h1>

        <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold">Přepis:</p>
          <p className="mt-2 text-base" style={{ color: 'var(--color-text)' }}>
            {result.transcript}
          </p>

          <p className="mt-4 text-sm font-semibold">Rozpoznáno jako:</p>
          <span
            className="mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold"
            style={targetStyle}
          >
            {targetLabel}
          </span>

          {result.classification.target === 'task' ? renderTaskForm() : null}
          {result.classification.target === 'note' ? renderNoteForm() : null}
          {result.classification.target === 'place' && placeForm ? (
            <PlaceForm
              initialData={placeForm}
              isSaving={isSaving}
              onSave={(data) => void handlePlaceSave(data)}
              onCancel={resetToInput}
            />
          ) : null}
        </div>

        {result.classification.target !== 'place' ? (
          <div
            className="fixed inset-x-4 z-40"
            style={{ bottom: 'calc(92px + env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold text-white shadow-lg disabled:opacity-70"
              style={{ backgroundColor: 'var(--color-primary)' }}
              disabled={isSaving}
              onClick={() => void handleSave()}
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
              className="mt-2 min-h-11 w-full text-sm"
              style={{ color: 'var(--color-text-secondary)' }}
              onClick={resetToInput}
            >
              Zahodit
            </button>
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] bg-white overflow-y-auto" role="dialog" aria-modal="true">
      <button
        type="button"
        className="fixed right-4 top-4 z-[61] min-h-11 min-w-11 rounded-full border bg-white text-xl shadow-sm"
        style={{ color: 'var(--color-text-secondary)', borderColor: '#e2e8f0' }}
        aria-label="Zavřít"
        onClick={onClose}
      >
        ✕
      </button>

      <section className="px-4 py-5">
        {screenError ? (
          <p
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm"
            style={{ color: '#b91c1c' }}
          >
            {screenError}
          </p>
        ) : null}

        {captureState === 'loading' ? renderLoadingState() : null}
        {captureState === 'input' || captureState === 'recording' ? renderInputState() : null}
        {captureState === 'confirm' ? renderConfirmState() : null}
      </section>
    </div>
  )
}

export default CaptureOverlay

