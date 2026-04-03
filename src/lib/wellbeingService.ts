/**
 * Supabase access for Module 5: weekly wellbeing check-ins and reflections.
 * Maps DB snake_case to camelCase domain types from `src/types/wellbeing.ts`.
 */

import { supabase } from './supabase'
import { CURRENT_USER_ID } from './constants'
import { getWeekStartIsoUtc } from './dateUtils'
import type {
  CheckinWithReflection,
  PlannedBlock,
  SelectedNeed,
  WeeklyCheckin,
  WeeklyReflection,
} from '../types/wellbeing'

/** Monday of the current week as YYYY-MM-DD (UTC), aligned with milestones / milestone-ai. */
export function getWeekStart(): string {
  return getWeekStartIsoUtc()
}

function parseSelectedNeeds(raw: unknown): SelectedNeed[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item): SelectedNeed | null => {
      if (!item || typeof item !== 'object') return null
      const o = item as Record<string, unknown>
      const label = typeof o.label === 'string' ? o.label.trim() : ''
      if (!label) return null
      return { label, isCustom: Boolean(o.isCustom) }
    })
    .filter((n): n is SelectedNeed => n !== null)
}

function parsePlannedBlocks(raw: unknown): PlannedBlock[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item): PlannedBlock | null => {
      if (!item || typeof item !== 'object') return null
      const o = item as Record<string, unknown>
      const needLabel = typeof o.needLabel === 'string' ? o.needLabel : ''
      const day = typeof o.day === 'string' ? o.day : ''
      const timeSlot = typeof o.timeSlot === 'string' ? o.timeSlot : ''
      if (!needLabel || !day || !timeSlot) return null
      return { needLabel, day, timeSlot }
    })
    .filter((b): b is PlannedBlock => b !== null)
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

/** Map a `weekly_checkins` row to `WeeklyCheckin`. */
function rowToWeeklyCheckin(row: Record<string, unknown>): WeeklyCheckin {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    weekStart: String(row.week_start ?? ''),
    myNeeds: parseSelectedNeeds(row.my_needs),
    ourNeeds: parseSelectedNeeds(row.our_needs),
    plannedBlocks: parsePlannedBlocks(row.planned_blocks),
    completedAt: row.completed_at != null ? String(row.completed_at) : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

function rowToWeeklyReflection(row: Record<string, unknown>): WeeklyReflection {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    checkinId: String(row.checkin_id),
    myNeedsDone: parseStringArray(row.my_needs_done),
    ourNeedsDone: parseStringArray(row.our_needs_done),
    note: row.note != null && typeof row.note === 'string' ? row.note : null,
    reflectedAt: String(row.reflected_at ?? ''),
  }
}

/**
 * Fetch the check-in for the given ISO week_start (Monday, YYYY-MM-DD) for the temp user.
 */
export async function getCheckinForWeek(weekStart: string): Promise<WeeklyCheckin | null> {
  try {
    const { data, error } = await supabase
      .from('weekly_checkins')
      .select('*')
      .eq('user_id', CURRENT_USER_ID)
      .eq('week_start', weekStart)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to load weekly check-in: ${error.message}`)
    }
    if (!data) return null
    return rowToWeeklyCheckin(data as Record<string, unknown>)
  } catch (e) {
    if (e instanceof Error) throw e
    throw new Error('Failed to load weekly check-in: unknown error')
  }
}

/**
 * Create or update a check-in for this user + week. Sets `completed_at` and `updated_at` to now.
 * Relies on a unique constraint on (user_id, week_start).
 */
export async function upsertCheckin(
  checkin: Omit<WeeklyCheckin, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<WeeklyCheckin> {
  try {
    const now = new Date().toISOString()
    const payload = {
      user_id: checkin.userId,
      week_start: checkin.weekStart,
      my_needs: checkin.myNeeds,
      our_needs: checkin.ourNeeds,
      planned_blocks: checkin.plannedBlocks,
      completed_at: now,
      updated_at: now,
    }

    const { data, error } = await supabase
      .from('weekly_checkins')
      .upsert(payload, { onConflict: 'user_id,week_start' })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to save weekly check-in: ${error.message}`)
    }
    if (!data) {
      throw new Error('Failed to save weekly check-in: empty response')
    }
    return rowToWeeklyCheckin(data as Record<string, unknown>)
  } catch (e) {
    if (e instanceof Error) throw e
    throw new Error('Failed to save weekly check-in: unknown error')
  }
}

/**
 * Return the reflection row for a given check-in id, if any.
 */
export async function getReflectionForCheckin(checkinId: string): Promise<WeeklyReflection | null> {
  try {
    const { data, error } = await supabase
      .from('weekly_reflections')
      .select('*')
      .eq('user_id', CURRENT_USER_ID)
      .eq('checkin_id', checkinId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to load reflection: ${error.message}`)
    }
    if (!data) return null
    return rowToWeeklyReflection(data as Record<string, unknown>)
  } catch (e) {
    if (e instanceof Error) throw e
    throw new Error('Failed to load reflection: unknown error')
  }
}

/**
 * Insert a new reflection for a past check-in. Sets `reflected_at` to now.
 */
export async function saveReflection(
  reflection: Omit<WeeklyReflection, 'id' | 'reflectedAt'>,
): Promise<WeeklyReflection> {
  try {
    const reflectedAt = new Date().toISOString()
    const { data, error } = await supabase
      .from('weekly_reflections')
      .insert({
        user_id: reflection.userId,
        checkin_id: reflection.checkinId,
        my_needs_done: reflection.myNeedsDone,
        our_needs_done: reflection.ourNeedsDone,
        note: reflection.note,
        reflected_at: reflectedAt,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to save reflection: ${error.message}`)
    }
    if (!data) {
      throw new Error('Failed to save reflection: empty response')
    }
    return rowToWeeklyReflection(data as Record<string, unknown>)
  } catch (e) {
    if (e instanceof Error) throw e
    throw new Error('Failed to save reflection: unknown error')
  }
}

/**
 * Fetch recent check-ins with reflections merged in JS (no SQL join).
 * Fetches a small buffer over `limit` so callers can exclude the current week and still get up to `limit` past rows.
 * Ordered by `week_start` descending.
 */
export async function getCheckinHistory(limit: number = 12): Promise<CheckinWithReflection[]> {
  try {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 50)
    const fetchCount = Math.min(safeLimit + 15, 40)

    const { data: checkinRows, error: checkinError } = await supabase
      .from('weekly_checkins')
      .select('*')
      .eq('user_id', CURRENT_USER_ID)
      .order('week_start', { ascending: false })
      .limit(fetchCount)

    if (checkinError) {
      throw new Error(`Failed to load check-in history: ${checkinError.message}`)
    }

    const checkins = (checkinRows ?? []).map((row) =>
      rowToWeeklyCheckin(row as Record<string, unknown>),
    )
    const ids = checkins.map((c) => c.id)

    const reflectionByCheckinId = new Map<string, WeeklyReflection>()
    if (ids.length > 0) {
      const { data: reflRows, error: reflError } = await supabase
        .from('weekly_reflections')
        .select('*')
        .eq('user_id', CURRENT_USER_ID)
        .in('checkin_id', ids)

      if (reflError) {
        throw new Error(`Failed to load reflections for history: ${reflError.message}`)
      }
      for (const row of reflRows ?? []) {
        const r = rowToWeeklyReflection(row as Record<string, unknown>)
        reflectionByCheckinId.set(r.checkinId, r)
      }
    }

    return checkins.map((checkin) => ({
      checkin,
      reflection: reflectionByCheckinId.get(checkin.id) ?? null,
    }))
  } catch (e) {
    if (e instanceof Error) throw e
    throw new Error('Failed to load check-in history: unknown error')
  }
}

/**
 * Recent check-ins for the current user, newest `week_start` first.
 */
export async function getRecentCheckins(limit: number): Promise<WeeklyCheckin[]> {
  try {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 50)
    const { data, error } = await supabase
      .from('weekly_checkins')
      .select('*')
      .eq('user_id', CURRENT_USER_ID)
      .order('week_start', { ascending: false })
      .limit(safeLimit)

    if (error) {
      throw new Error(`Failed to load recent check-ins: ${error.message}`)
    }
    return (data ?? []).map((row) => rowToWeeklyCheckin(row as Record<string, unknown>))
  } catch (e) {
    if (e instanceof Error) throw e
    throw new Error('Failed to load recent check-ins: unknown error')
  }
}

/** ISO date string for the Monday before `weekStart` (UTC calendar). */
export function getPreviousWeekStart(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}
