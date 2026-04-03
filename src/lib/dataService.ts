// Data service — handles all Supabase CRUD operations.
// Rows are scoped to the signed-in user via getCurrentUserId().

import { supabase } from './supabase'
import { CURRENT_USER_ID } from './constants'
import type { MealPlan, Milestone, MilestoneLog, MilestoneTask, Note, Place, Task } from '../types/database'
import type { NoteData, PlaceData, TaskData } from './voiceRouter'

/** Re-export for legacy imports; prefer `getCurrentUserId()` at runtime. */
export const TEMP_USER_ID = CURRENT_USER_ID

/** Authenticated user id; `CURRENT_USER_ID` only if session is missing unexpectedly. */
export async function getCurrentUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.user?.id ?? CURRENT_USER_ID
}

export type { Milestone, MilestoneLog, MilestoneTask }

export type TaskAssigneeFilter = 'all' | 'romi' | 'petr' | 'both'
/** active = todo + in_progress; done = only done; all = every status */
export type TaskStatusFilter = 'active' | 'done' | 'all'
export type NoteCategoryFilter = Note['category'] | 'all'

/**
 * Load tasks for the temp user. Default: all assignees, hide completed (todo + in_progress only).
 */
export async function fetchTasks(filters?: {
  assigned_to?: TaskAssigneeFilter
  status?: TaskStatusFilter
}): Promise<Task[]> {
  const userId = await getCurrentUserId()
  const assignedTo = filters?.assigned_to ?? 'all'
  const statusFilter = filters?.status ?? 'active'

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (assignedTo !== 'all') {
    query = query.eq('assigned_to', assignedTo)
  }

  if (statusFilter === 'active') {
    query = query.in('status', ['todo', 'in_progress'])
  } else if (statusFilter === 'done') {
    query = query.eq('status', 'done')
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as Task[]
}

/**
 * Load notes for the temp user. Default: all categories.
 */
export async function fetchNotes(filters?: {
  category?: NoteCategoryFilter
}): Promise<Note[]> {
  const userId = await getCurrentUserId()
  const category = filters?.category ?? 'all'

  let query = supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (category !== 'all') {
    query = query.eq('category', category)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as Note[]
}

export async function updateTaskStatus(
  taskId: string,
  newStatus: Task['status'],
): Promise<{ success: boolean; error?: string }> {
  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('tasks')
    .update({ status: newStatus })
    .eq('id', taskId)
    .eq('user_id', userId)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function deleteTask(
  taskId: string,
): Promise<{ success: boolean; error?: string }> {
  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function deleteNote(
  noteId: string,
): Promise<{ success: boolean; error?: string }> {
  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)
    .eq('user_id', userId)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export type PlaceSourceFilter = Place['source'] | 'all'

/**
 * Extended place payload for forms (DB + optional website and visit duration).
 */
export type SavePlaceInput = PlaceData & {
  website?: string | null
  visit_duration_minutes?: number | null
}

/**
 * Load places for the temp user. Tag filter uses array overlap (ANY selected tag matches).
 */
export async function fetchPlaces(filters?: {
  tags?: string[]
  source?: PlaceSourceFilter
}): Promise<Place[]> {
  const userId = await getCurrentUserId()
  let query = supabase
    .from('places')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  const source = filters?.source ?? 'all'
  if (source !== 'all') {
    query = query.eq('source', source)
  }

  const tagList = filters?.tags?.filter((t) => t.length > 0) ?? []
  if (tagList.length > 0) {
    query = query.overlaps('tags', tagList)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as Place[]
}

export async function deletePlace(
  placeId: string,
): Promise<{ success: boolean; error?: string }> {
  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('places')
    .delete()
    .eq('id', placeId)
    .eq('user_id', userId)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

/** Payload shape returned by Claude for milestones (no DB table yet). */
export interface MilestoneData {
  title: string
  description?: string
}

/** Classification block as produced by the voice-router Edge Function. */
export type VoiceClassification = {
  target: 'task' | 'note' | 'place' | 'milestone'
  confidence: number
  data: TaskData | NoteData | PlaceData | MilestoneData
}

// Maps TaskData + capture metadata to the `tasks` row shape (matches src/types/database.ts).
export async function saveTask(
  data: TaskData,
  source: 'voice' | 'text',
  visibility: 'shared' | 'private',
) {
  const userId = await getCurrentUserId()
  const description =
    data.description !== undefined && data.description.trim() !== ''
      ? data.description.trim()
      : null
  const deadline =
    data.deadline !== undefined && data.deadline.trim() !== ''
      ? data.deadline.trim()
      : null

  const row = {
    user_id: userId,
    title: data.title.trim(),
    description,
    assigned_to: data.assigned_to,
    deadline,
    status: 'todo' as const,
    source,
    visibility,
  }

  const { data: inserted, error } = await supabase
    .from('tasks')
    .insert(row)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return inserted
}

// Maps NoteData + capture metadata to the `notes` row shape.
export async function saveNote(
  data: NoteData,
  source: 'voice' | 'text',
  visibility: 'shared' | 'private',
) {
  const userId = await getCurrentUserId()
  const row = {
    user_id: userId,
    text: data.text.trim(),
    category: data.category,
    source,
    visibility,
  }

  const { data: inserted, error } = await supabase
    .from('notes')
    .insert(row)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return inserted
}

// Maps place form data to the `places` row; geo/source_url left null unless provided later.
export async function savePlace(data: SavePlaceInput) {
  const userId = await getCurrentUserId()
  const address =
    data.address !== undefined && data.address.trim() !== ''
      ? data.address.trim()
      : null
  const notes =
    data.notes !== undefined && data.notes.trim() !== '' ? data.notes.trim() : null
  const websiteRaw = data.website?.trim()
  const website = websiteRaw && websiteRaw.length > 0 ? websiteRaw : null
  const duration =
    typeof data.visit_duration_minutes === 'number' &&
    !Number.isNaN(data.visit_duration_minutes) &&
    data.visit_duration_minutes > 0
      ? Math.round(data.visit_duration_minutes)
      : null

  const row = {
    user_id: userId,
    name: data.name.trim(),
    address,
    latitude: null as number | null,
    longitude: null as number | null,
    website,
    visit_duration_minutes: duration,
    tags: data.tags,
    source: data.source,
    source_url: null as string | null,
    notes,
  }

  const { data: inserted, error } = await supabase
    .from('places')
    .insert(row)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return inserted
}

async function saveMilestoneFromVoiceRouter(data: MilestoneData): Promise<void> {
  // Voice-router milestones only provide title/description. For now we store them
  // as "developmental" milestones with an unknown child name.
  await saveMilestone({
    title: data.title,
    child_name: '',
    category: 'developmental',
    description: data.description ?? undefined,
  })
}

// --- Milestones ---

export async function fetchMilestones(
  status?: 'active' | 'paused' | 'completed',
): Promise<Milestone[]> {
  const userId = await getCurrentUserId()
  let query = supabase
    .from('milestones')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as Milestone[]
}

export async function saveMilestone(milestone: {
  title: string
  child_name: string
  category: 'life_skill' | 'developmental'
  description?: string
}): Promise<Milestone> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('milestones')
    .insert({
      ...milestone,
      user_id: userId,
      description:
        milestone.description !== undefined && milestone.description.trim() !== ''
          ? milestone.description.trim()
          : null,
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Milestone
}

export async function updateMilestoneStatus(
  id: string,
  status: 'active' | 'paused' | 'completed',
): Promise<void> {
  const userId = await getCurrentUserId()
  const update: { status: 'active' | 'paused' | 'completed'; completed_at: string | null } = {
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
  }

  const { error } = await supabase
    .from('milestones')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteMilestone(id: string): Promise<void> {
  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('milestones')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    throw new Error(error.message)
  }
}

// --- Milestone Logs ---

export async function fetchMilestoneLogs(milestoneId: string): Promise<MilestoneLog[]> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('milestone_logs')
    .select('*')
    .eq('milestone_id', milestoneId)
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as MilestoneLog[]
}

export async function saveMilestoneLog(log: {
  milestone_id: string
  note: string
  source: 'voice' | 'text'
  ai_response?: string
}): Promise<MilestoneLog> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('milestone_logs')
    .insert({
      ...log,
      user_id: userId,
      ai_response:
        log.ai_response !== undefined && log.ai_response.trim() !== ''
          ? log.ai_response.trim()
          : null,
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as MilestoneLog
}

// --- Milestone Tasks ---

export async function fetchMilestoneTasks(milestoneId: string): Promise<MilestoneTask | null> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('milestone_tasks')
    .select('*')
    .eq('milestone_id', milestoneId)
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message)
  }

  return (data ?? null) as MilestoneTask | null
}

export async function saveMilestoneTasks(task: {
  milestone_id: string
  week_start: string
  tasks: Array<{ task: string; done: boolean }>
}): Promise<MilestoneTask> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('milestone_tasks')
    .insert({
      ...task,
      user_id: userId,
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as MilestoneTask
}

/**
 * Routes the classified payload to the correct saver.
 * `visibility` applies to tasks and notes only; places have no visibility column in the schema.
 */
export async function saveClassifiedData(
  classification: VoiceClassification,
  source: 'voice' | 'text',
  visibility: 'shared' | 'private',
): Promise<{ success: boolean; target: string; error?: string }> {
  try {
    switch (classification.target) {
      case 'task':
        await saveTask(classification.data as TaskData, source, visibility)
        return { success: true, target: classification.target }
      case 'note':
        await saveNote(classification.data as NoteData, source, visibility)
        return { success: true, target: classification.target }
      case 'place':
        await savePlace(classification.data as SavePlaceInput)
        return { success: true, target: classification.target }
      case 'milestone':
        await saveMilestoneFromVoiceRouter(classification.data as MilestoneData)
        return { success: true, target: classification.target }
      default:
        return {
          success: false,
          target: String(classification.target),
          error: 'Neznámý typ záznamu.',
        }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Neznámá chyba při ukládání.'
    return {
      success: false,
      target: classification.target,
      error: message,
    }
  }
}

// --- Meal planner: HTTP to `generate-meal-plan` Edge Function; rows in `meal_plans`. ---

export type MealPlanPreferences = {
  availableIngredients?: string
  excludeIngredients?: string
}

export type RejectedMealInput = {
  day: string
  mealType: string
  reason?: string
}

/** One shopping line item inside a Rohlik category bucket. */
export type ShoppingListItemRow = {
  name: string
  quantity: string
  unit: string
}

/** Parsed payload returned by Claude from the Edge Function (matches prompt JSON). */
export type GeneratedMealPlanPayload = {
  plan_data: Record<string, Record<string, { name: string; note?: string }>>
  batch_cooking: BatchCookingBlock[]
  shopping_list: Record<string, ShoppingListItemRow[]>
}

export type BatchCookingBlock = {
  cook_day: string
  meals_covered: string[]
  recipes: {
    name: string
    tm_time_minutes?: number
    portions?: number
    note?: string
  }[]
}

function mealPlanFunctionUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  return `${supabaseUrl}/functions/v1/generate-meal-plan`
}

function mealPlanFetchHeaders(): HeadersInit {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

async function parseMealPlanError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    details?: string
  }
  return body.error ?? body.details ?? `Edge Function error: ${response.status}`
}

/**
 * Calls generate-meal-plan in full mode — hits Supabase Edge Function → Anthropic.
 */
export async function generateMealPlan(
  weekStart: string,
  preferences?: MealPlanPreferences,
): Promise<GeneratedMealPlanPayload> {
  const body: Record<string, unknown> = {
    mode: 'full',
    week_start: weekStart,
  }
  const avail = preferences?.availableIngredients?.trim()
  const excl = preferences?.excludeIngredients?.trim()
  if (avail || excl) {
    body.preferences = {
      ...(avail ? { availableIngredients: avail } : {}),
      ...(excl ? { excludeIngredients: excl } : {}),
    }
  }

  const response = await fetch(mealPlanFunctionUrl(), {
    method: 'POST',
    headers: mealPlanFetchHeaders(),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(await parseMealPlanError(response))
  }

  return (await response.json()) as GeneratedMealPlanPayload
}

/**
 * Replace one meal slot; Edge Function returns the full updated plan object.
 */
export async function replaceMeal(
  weekStart: string,
  existingPlan: GeneratedMealPlanPayload,
  rejectedMeal: RejectedMealInput,
): Promise<GeneratedMealPlanPayload> {
  const response = await fetch(mealPlanFunctionUrl(), {
    method: 'POST',
    headers: mealPlanFetchHeaders(),
    body: JSON.stringify({
      mode: 'replace_meal',
      week_start: weekStart,
      existing_plan: existingPlan,
      rejected_meal: rejectedMeal,
    }),
  })

  if (!response.ok) {
    throw new Error(await parseMealPlanError(response))
  }

  return (await response.json()) as GeneratedMealPlanPayload
}

/**
 * Insert or update a row for this user/week/variant and mark it active.
 */
export async function saveMealPlan(
  weekStart: string,
  variant: 'A' | 'B',
  planData: GeneratedMealPlanPayload['plan_data'],
  batchCooking: GeneratedMealPlanPayload['batch_cooking'],
  shoppingList: GeneratedMealPlanPayload['shopping_list'],
): Promise<{ success: boolean; error?: string }> {
  const userId = await getCurrentUserId()
  const { data: existing, error: findError } = await supabase
    .from('meal_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .eq('variant', variant)
    .maybeSingle()

  if (findError) {
    return { success: false, error: findError.message }
  }

  const row = {
    user_id: userId,
    week_start: weekStart,
    variant,
    plan_data: planData,
    batch_cooking: batchCooking,
    shopping_list: shoppingList,
    status: 'active' as const,
  }

  if (existing?.id) {
    const { error } = await supabase.from('meal_plans').update(row).eq('id', existing.id)
    if (error) {
      return { success: false, error: error.message }
    }
  } else {
    const { error } = await supabase.from('meal_plans').insert(row)
    if (error) {
      return { success: false, error: error.message }
    }
  }

  return { success: true }
}

/** All stored variants for a calendar week (typically A and/or B). */
export async function fetchMealPlan(weekStart: string): Promise<MealPlan[]> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .order('variant', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as MealPlan[]
}

/** Latest active plan across weeks (used when opening the meal planner). */
export async function fetchActiveMealPlan(): Promise<MealPlan | null> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as MealPlan | null) ?? null
}
