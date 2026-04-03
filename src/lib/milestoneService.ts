/**
 * Supabase access + milestone-ai edge calls for the Kids Development Tracker.
 */

import { getCurrentUserId } from './dataService'
import { supabase } from './supabase'
import { getWeekStartIsoUtc } from './dateUtils'
import type {
  ActivityItem,
  AiAskResponse,
  AiEvaluation,
  Milestone,
  MilestoneLog,
  MilestoneTask,
  TaskItem,
  WeeklyActivities,
} from '../types/milestones'

function milestoneAiUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string
  return `${base}/functions/v1/milestone-ai`
}

function milestoneAiHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`,
  }
}

/** POST milestone-ai; expects `{ success, mode?, data?, error? }`. */
export async function postMilestoneAi(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const res = await fetch(milestoneAiUrl(), {
    method: 'POST',
    headers: milestoneAiHeaders(),
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean
    data?: Record<string, unknown>
    error?: string
  }
  if (!res.ok) {
    return { ok: false, error: json.error ?? `HTTP ${res.status}` }
  }
  if (json.success === false) {
    return { ok: false, error: json.error ?? 'Neznámá chyba' }
  }
  if (!json.data || typeof json.data !== 'object') {
    return { ok: false, error: 'Neplatná odpověď serveru (chybí data).' }
  }
  return { ok: true, data: json.data }
}

export function normalizeChildName(raw: string | null | undefined): 'viky' | 'adri' {
  const s = (raw ?? '').toLowerCase().trim()
  if (s === 'adri') return 'adri'
  return 'viky'
}

function rowToMilestone(row: Record<string, unknown>): Milestone {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    child_name: normalizeChildName(row.child_name as string),
    title: String(row.title ?? ''),
    category: row.category === 'developmental' ? 'developmental' : 'life_skill',
    description: row.description != null ? String(row.description) : null,
    status:
      row.status === 'paused'
        ? 'paused'
        : row.status === 'completed'
          ? 'completed'
          : 'active',
    started_at: String(row.started_at ?? ''),
    completed_at: row.completed_at != null ? String(row.completed_at) : null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

/** Normalize one task object from JSONB (edge function may omit tip/difficulty). */
export function normalizeTaskItem(raw: unknown): TaskItem {
  if (!raw || typeof raw !== 'object') {
    return { task: '', tip: '', difficulty: 'easy', done: false }
  }
  const o = raw as Record<string, unknown>
  const d = o.difficulty
  let difficulty: TaskItem['difficulty'] = 'easy'
  if (d === 'medium' || d === 'challenge') difficulty = d
  return {
    task: String(o.task ?? ''),
    tip: String(o.tip ?? ''),
    difficulty,
    done: Boolean(o.done),
  }
}

function rowToMilestoneTask(row: Record<string, unknown>): MilestoneTask {
  const rawTasks = row.tasks
  const tasks: TaskItem[] = Array.isArray(rawTasks)
    ? rawTasks.map(normalizeTaskItem)
    : []
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    milestone_id: String(row.milestone_id),
    week_start: String(row.week_start ?? ''),
    tasks,
    generated_at: String(row.generated_at ?? ''),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function rowToMilestoneLog(row: Record<string, unknown>): MilestoneLog {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    milestone_id: String(row.milestone_id),
    note: String(row.note ?? ''),
    source: row.source === 'voice' ? 'voice' : 'text',
    ai_response: row.ai_response != null ? String(row.ai_response) : null,
    logged_at: String(row.logged_at ?? ''),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

const STATUS_SORT: Record<Milestone['status'], number> = {
  active: 0,
  paused: 1,
  completed: 2,
}

/**
 * All milestones for the temp user, ordered active → paused → completed, then updated_at DESC.
 */
export async function fetchMilestonesOrdered(): Promise<Milestone[]> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Record<string, unknown>[]
  const list = rows.map(rowToMilestone)
  list.sort((a, b) => {
    const s = STATUS_SORT[a.status] - STATUS_SORT[b.status]
    if (s !== 0) return s
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
  return list
}

/**
 * Latest `logged_at` per milestone for list cards (one extra query, grouped in JS).
 */
export async function fetchLatestLogDatesByMilestone(
  milestoneIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (milestoneIds.length === 0) return map

  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('milestone_logs')
    .select('milestone_id, logged_at')
    .eq('user_id', userId)
    .in('milestone_id', milestoneIds)
    .order('logged_at', { ascending: false })

  if (error) throw new Error(error.message)
  for (const row of data ?? []) {
    const id = (row as { milestone_id: string }).milestone_id
    if (!map.has(id)) {
      map.set(id, (row as { logged_at: string }).logged_at)
    }
  }
  return map
}

export async function fetchMilestoneById(id: string): Promise<Milestone | null> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return rowToMilestone(data as Record<string, unknown>)
}

export async function insertMilestone(input: {
  child_name: 'viky' | 'adri'
  title: string
  category: 'life_skill' | 'developmental'
  description: string | null
}): Promise<Milestone> {
  const userId = await getCurrentUserId()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('milestones')
    .insert({
      user_id: userId,
      child_name: input.child_name,
      title: input.title.trim(),
      category: input.category,
      description: input.description,
      status: 'active',
      started_at: now,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToMilestone(data as Record<string, unknown>)
}

export async function updateMilestoneStatus(
  id: string,
  status: 'active' | 'paused' | 'completed',
): Promise<void> {
  const userId = await getCurrentUserId()
  const completed_at = status === 'completed' ? new Date().toISOString() : null
  const { error } = await supabase
    .from('milestones')
    .update({ status, completed_at, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

/** Milestone task row for the current ISO week (UTC Monday), if any. */
export async function fetchMilestoneTaskCurrentWeek(
  milestoneId: string,
): Promise<MilestoneTask | null> {
  const userId = await getCurrentUserId()
  const weekStart = getWeekStartIsoUtc()
  const { data, error } = await supabase
    .from('milestone_tasks')
    .select('*')
    .eq('milestone_id', milestoneId)
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return rowToMilestoneTask(data as Record<string, unknown>)
}

/**
 * Calls edge `generate_tasks`, then reloads the current week row from DB.
 */
export async function generateTasksForMilestone(milestoneId: string): Promise<MilestoneTask> {
  const userId = await getCurrentUserId()
  const ai = await postMilestoneAi({
    mode: 'generate_tasks',
    user_id: userId,
    milestone_id: milestoneId,
  })
  if (!ai.ok) throw new Error(ai.error)

  const task = await fetchMilestoneTaskCurrentWeek(milestoneId)
  if (!task) {
    throw new Error('Úkoly se nepodařilo načíst po generování.')
  }
  return task
}

/**
 * Persists the full tasks array after a checkbox toggle (optimistic UI in the page).
 */
export async function updateMilestoneTasksDone(
  taskRowId: string,
  tasks: TaskItem[],
): Promise<void> {
  const userId = await getCurrentUserId()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('milestone_tasks')
    .update({ tasks, updated_at: now })
    .eq('id', taskRowId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

export async function insertMilestoneLog(input: {
  milestone_id: string
  note: string
}): Promise<MilestoneLog> {
  const userId = await getCurrentUserId()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('milestone_logs')
    .insert({
      user_id: userId,
      milestone_id: input.milestone_id,
      note: input.note.trim(),
      source: 'text',
      logged_at: now,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToMilestoneLog(data as Record<string, unknown>)
}

/**
 * After log insert, edge `evaluate` writes ai_response on the log row.
 * `newLogNote` mirrors the saved log text for the edge function prompt (redundant with DB but explicit for the API).
 */
export async function evaluateMilestoneLog(
  milestoneId: string,
  logId: string,
  newLogNote: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await getCurrentUserId()
  const result = await postMilestoneAi({
    mode: 'evaluate',
    user_id: userId,
    milestone_id: milestoneId,
    log_id: logId,
    new_log_note: newLogNote.trim(),
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

export async function fetchMilestoneLogs(milestoneId: string): Promise<MilestoneLog[]> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('milestone_logs')
    .select('*')
    .eq('milestone_id', milestoneId)
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToMilestoneLog(row as Record<string, unknown>))
}

export async function askMilestoneQuestion(
  milestoneId: string,
  question: string,
): Promise<AiAskResponse> {
  const userId = await getCurrentUserId()
  const result = await postMilestoneAi({
    mode: 'ask',
    user_id: userId,
    milestone_id: milestoneId,
    question: question.trim(),
  })
  if (!result.ok) throw new Error(result.error)

  const answer =
    typeof result.data.answer === 'string' ? result.data.answer : String(result.data.answer ?? '')
  const follow =
    result.data.follow_up_suggestion != null &&
    typeof result.data.follow_up_suggestion === 'string'
      ? result.data.follow_up_suggestion
      : null

  return { answer, follow_up_suggestion: follow }
}

/**
 * Parse `ai_response` JSON into AiEvaluation; tolerates edge variants (tips, tasks, updated_tasks).
 */
export function parseAiEvaluation(jsonString: string | null): AiEvaluation | null {
  if (!jsonString || !jsonString.trim()) return null
  try {
    const raw = JSON.parse(jsonString) as Record<string, unknown>
    const evaluation =
      typeof raw.evaluation === 'string'
        ? raw.evaluation
        : typeof raw.tips === 'string'
          ? raw.tips
          : ''
    let suggested_status: AiEvaluation['suggested_status'] = null
    if (raw.suggested_status === 'completed' || raw.suggested_status === 'active') {
      suggested_status = raw.suggested_status
    }
    const tasksRaw = raw.updated_tasks ?? raw.tasks
    const updated_tasks: TaskItem[] = Array.isArray(tasksRaw)
      ? tasksRaw.map(normalizeTaskItem)
      : []
    return { evaluation, suggested_status, updated_tasks }
  } catch {
    return null
  }
}

// --- Weekly activities (one plan per UTC week for both twins; separate from per-child milestone_tasks) ---

const WEEKLY_CATEGORIES: ActivityItem['category'][] = [
  'motor',
  'speech',
  'independence',
  'sensory',
  'play',
  'social',
]

function normalizeActivityCategoryWeekly(raw: unknown): ActivityItem['category'] {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if ((WEEKLY_CATEGORIES as string[]).includes(s)) return s as ActivityItem['category']
  return 'play'
}

/** Normalize one element from weekly_activities.activities JSONB (matches edge shape). */
export function normalizeWeeklyActivityItem(raw: unknown, fallbackIndex: number): ActivityItem {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `act_${fallbackIndex + 1}`,
      activity: '',
      tip: '',
      category: 'play',
      estimated_minutes: 10,
      done: false,
    }
  }
  const o = raw as Record<string, unknown>
  const activity = typeof o.activity === 'string' ? o.activity.trim() : ''
  const id =
    typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `act_${fallbackIndex + 1}`
  const est =
    typeof o.estimated_minutes === 'number' && Number.isFinite(o.estimated_minutes)
      ? Math.max(1, Math.round(o.estimated_minutes))
      : 10
  return {
    id,
    activity,
    tip: typeof o.tip === 'string' ? o.tip.trim() : '',
    category: normalizeActivityCategoryWeekly(o.category),
    estimated_minutes: est,
    done: Boolean(o.done),
  }
}

function rowToWeeklyActivities(row: Record<string, unknown>): WeeklyActivities {
  const rawActs = row.activities
  const activities: ActivityItem[] = Array.isArray(rawActs)
    ? rawActs.map((item, i) => normalizeWeeklyActivityItem(item, i))
    : []
  const dl = row.difficulty_level
  const difficulty_level: WeeklyActivities['difficulty_level'] =
    dl === 'easier' || dl === 'harder' || dl === 'normal' ? dl : 'normal'
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    week_start: String(row.week_start ?? ''),
    difficulty_level,
    activities,
    generated_at: String(row.generated_at ?? ''),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function parsePlanFromAiData(data: Record<string, unknown>): WeeklyActivities {
  const plan = data.plan
  if (!plan || typeof plan !== 'object') {
    throw new Error('Odpověď neobsahuje platný plán (data.plan).')
  }
  return rowToWeeklyActivities(plan as Record<string, unknown>)
}

/**
 * Load the stored weekly plan for a given ISO week_start (UTC Monday), or null.
 */
export async function fetchWeeklyActivities(
  weekStart: string,
): Promise<WeeklyActivities | null> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('weekly_activities')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return rowToWeeklyActivities(data as Record<string, unknown>)
}

/**
 * Edge `suggest_activities` — creates/replaces the plan for the current UTC week.
 * Omits difficulty_level when undefined so the server uses the latest stored default or `normal`.
 */
export async function generateWeeklyActivities(
  difficultyLevel?: string,
): Promise<WeeklyActivities> {
  const userId = await getCurrentUserId()
  const body: Record<string, unknown> = {
    mode: 'suggest_activities',
    user_id: userId,
  }
  const d = difficultyLevel?.trim()
  if (d === 'easier' || d === 'normal' || d === 'harder') {
    body.difficulty_level = d
  }
  const result = await postMilestoneAi(body)
  if (!result.ok) throw new Error(result.error)
  return parsePlanFromAiData(result.data)
}

/** Edge `replace_activity` — swap one activity in the current week’s plan. */
export async function replaceActivity(
  activityId: string,
  reason?: string,
): Promise<WeeklyActivities> {
  const userId = await getCurrentUserId()
  const body: Record<string, unknown> = {
    mode: 'replace_activity',
    user_id: userId,
    activity_id: activityId,
  }
  const r = reason?.trim()
  if (r) body.reason = r
  const result = await postMilestoneAi(body)
  if (!result.ok) throw new Error(result.error)
  return parsePlanFromAiData(result.data)
}

/** Edge `adjust_difficulty` — full regenerate at easier or harder. */
export async function adjustDifficulty(
  difficultyLevel: 'easier' | 'harder',
): Promise<WeeklyActivities> {
  const userId = await getCurrentUserId()
  const result = await postMilestoneAi({
    mode: 'adjust_difficulty',
    user_id: userId,
    difficulty_level: difficultyLevel,
  })
  if (!result.ok) throw new Error(result.error)
  return parsePlanFromAiData(result.data)
}

/**
 * Toggle one activity’s `done` flag and persist the JSONB array (optimistic UI updates state first in the page).
 */
export async function toggleActivityDone(
  weeklyActivitiesId: string,
  activityId: string,
  activities: ActivityItem[],
): Promise<void> {
  const userId = await getCurrentUserId()
  const next = activities.map((a) =>
    a.id === activityId ? { ...a, done: !a.done } : a,
  )
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('weekly_activities')
    .update({ activities: next, updated_at: now })
    .eq('id', weeklyActivitiesId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}
