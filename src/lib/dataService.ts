// Data service — handles all Supabase CRUD operations.
// Uses a hardcoded user_id until auth is activated in Phase 3.
// Each function inserts into the correct Supabase table based on data type.

import { supabase } from './supabase'
import type { Note, Place, Task } from '../types/database'
import type { NoteData, PlaceData, TaskData } from './voiceRouter'

// Temporary hardcoded user ID — replaced with real auth in Phase 3
export const TEMP_USER_ID = '00000000-0000-0000-0000-000000000001'

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
  const assignedTo = filters?.assigned_to ?? 'all'
  const statusFilter = filters?.status ?? 'active'

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('user_id', TEMP_USER_ID)
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
  const category = filters?.category ?? 'all'

  let query = supabase
    .from('notes')
    .select('*')
    .eq('user_id', TEMP_USER_ID)
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
  const { error } = await supabase
    .from('tasks')
    .update({ status: newStatus })
    .eq('id', taskId)
    .eq('user_id', TEMP_USER_ID)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function deleteTask(
  taskId: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', TEMP_USER_ID)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function deleteNote(
  noteId: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)
    .eq('user_id', TEMP_USER_ID)

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
  let query = supabase
    .from('places')
    .select('*')
    .eq('user_id', TEMP_USER_ID)
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
  const { error } = await supabase
    .from('places')
    .delete()
    .eq('id', placeId)
    .eq('user_id', TEMP_USER_ID)

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
  const description =
    data.description !== undefined && data.description.trim() !== ''
      ? data.description.trim()
      : null
  const deadline =
    data.deadline !== undefined && data.deadline.trim() !== ''
      ? data.deadline.trim()
      : null

  const row = {
    user_id: TEMP_USER_ID,
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
  const row = {
    user_id: TEMP_USER_ID,
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
    user_id: TEMP_USER_ID,
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

// TODO: Insert into milestones table when it exists (Phase 3)
export async function saveMilestone(data: MilestoneData): Promise<void> {
  console.log('[saveMilestone] TODO: persist to milestones table', data)
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
        await saveMilestone(classification.data as MilestoneData)
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
