/**
 * Supabase Edge Function: milestone-ai
 *
 * Handles AI-assisted milestone workflows (evaluate, weekly tasks, Q&A) plus weekly
 * developmental activity plans for both twins together (`weekly_activities` table).
 * Uses service role + explicit user_id from the body (RLS not relied on here yet).
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

// --- CORS (frontend calls this function with fetch + anon JWT) ---

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// --- Corrected age (premature birth context) ---
// We use the *expected due date* (term date) instead of birth date so developmental
// expectations match "corrected" age — common for premature infants whose chronological
// age overstates maturity. The app fixes EDD to 2024-07-24 per clinical plan.

type CorrectedAge = { months: number; days: number; label: string }

function czechMonthsWord(n: number): string {
  if (n === 1) return 'měsíc'
  if (n >= 2 && n <= 4) return 'měsíce'
  if (n % 100 >= 11 && n % 100 <= 14) return 'měsíců'
  if (n % 10 === 1) return 'měsíc'
  if (n % 10 >= 2 && n % 10 <= 4) return 'měsíce'
  return 'měsíců'
}

function czechDaysWord(n: number): string {
  if (n === 1) return 'den'
  if (n >= 2 && n <= 4) return 'dny'
  if (n % 100 >= 11 && n % 100 <= 14) return 'dní'
  if (n % 10 === 1) return 'den'
  if (n % 10 >= 2 && n % 10 <= 4) return 'dny'
  return 'dní'
}

/**
 * Age from expected due date (2024-07-24) to `currentDate` as whole months + remainder days.
 * Produces a Czech label, e.g. "21 měsíců a 10 dní".
 */
function getCorrectedAge(currentDate: Date): CorrectedAge {
  const start = Date.UTC(2024, 6, 24) // July 24, 2024
  const end = Date.UTC(
    currentDate.getUTCFullYear(),
    currentDate.getUTCMonth(),
    currentDate.getUTCDate(),
  )

  if (end < start) {
    return { months: 0, days: 0, label: '0 dní' }
  }

  const startDate = new Date(start)
  const endDate = new Date(end)

  let months =
    (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
    (endDate.getUTCMonth() - startDate.getUTCMonth())

  const addMonths = (base: Date, m: number) => {
    const d = new Date(base.getTime())
    d.setUTCMonth(d.getUTCMonth() + m)
    return d
  }

  let cursor = addMonths(startDate, months)
  if (cursor > endDate) {
    months -= 1
    cursor = addMonths(startDate, months)
  }

  const days = Math.max(
    0,
    Math.round((endDate.getTime() - cursor.getTime()) / 86_400_000),
  )

  let label: string
  if (months === 0 && days === 0) {
    label = `0 ${czechDaysWord(0)}`
  } else if (months === 0) {
    label = `${days} ${czechDaysWord(days)}`
  } else if (days === 0) {
    label = `${months} ${czechMonthsWord(months)}`
  } else {
    label = `${months} ${czechMonthsWord(months)} a ${days} ${czechDaysWord(days)}`
  }

  return { months, days, label }
}

// --- week_start for milestone_tasks ---
/**
 * `week_start` is the UTC calendar date (YYYY-MM-DD) of the Monday that starts the ISO week.
 * All weekly micro-tasks for a milestone in that week share this key; regenerating in the same
 * week updates the same logical row (see upsert in handlers).
 */
function getWeekStartIsoUtc(d = new Date()): string {
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const day = new Date(utc).getUTCDay()
  const daysSinceMonday = (day + 6) % 7
  const mondayUtc = utc - daysSinceMonday * 86_400_000
  return new Date(mondayUtc).toISOString().slice(0, 10)
}

// --- Claude ---

const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const CLAUDE_MAX_TOKENS = 1024
/** Weekly activity plans return larger JSON (5–7 items with tips). */
const CLAUDE_MAX_TOKENS_ACTIVITIES = 4096
/** Low temperature keeps evaluations grounded and repeatable — not creative fiction. */
const CLAUDE_TEMPERATURE = 0.3

function stripMarkdownFences(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/s, '')
  }
  return t.trim()
}

type ClaudeMessage = { role: 'user' | 'assistant'; content: string }

type ClaudeOk = { ok: true; data: Record<string, unknown> }
type ClaudeErr = { ok: false; error: string; rawText: string }
type ClaudeResult = ClaudeOk | ClaudeErr

async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options?: { maxTokens?: number },
): Promise<ClaudeResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return {
      ok: false,
      error: 'Server misconfiguration: ANTHROPIC_API_KEY is not set',
      rawText: '',
    }
  }

  const max_tokens = options?.maxTokens ?? CLAUDE_MAX_TOKENS

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens,
        temperature: CLAUDE_TEMPERATURE,
        system: systemPrompt,
        messages,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      return {
        ok: false,
        error: `Claude API error ${res.status}: ${errBody.slice(0, 500)}`,
        rawText: errBody,
      }
    }

    const payload = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const textBlock = payload.content?.find((c) => c.type === 'text')
    const rawText = textBlock?.text ?? ''

    const stripped = stripMarkdownFences(rawText)
    try {
      const data = JSON.parse(stripped) as Record<string, unknown>
      return { ok: true, data }
    } catch {
      return {
        ok: false,
        error:
          'Model returned text that is not valid JSON after stripping fences. See rawText.',
        rawText,
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Claude request failed: ${msg}`, rawText: '' }
  }
}

// --- Supabase ---

function getSupabaseAdmin(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key)
}

type MilestoneRow = {
  id: string
  user_id: string
  title: string
  child_name: string
  category: string
  description: string | null
  status: string
}

async function fetchMilestoneForUser(
  supabase: SupabaseClient,
  milestoneId: string,
  userId: string,
): Promise<MilestoneRow | null> {
  const { data, error } = await supabase
    .from('milestones')
    .select('id,user_id,title,child_name,category,description,status')
    .eq('id', milestoneId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as MilestoneRow | null
}

type MilestoneLogRow = {
  id: string
  milestone_id: string
  user_id: string
  note: string
  logged_at: string
}

/** We only send the last 5 logs to Claude to limit prompt size and API cost. */
const LOG_LIMIT = 5

async function fetchRecentLogs(
  supabase: SupabaseClient,
  milestoneId: string,
  userId: string,
): Promise<MilestoneLogRow[]> {
  const { data, error } = await supabase
    .from('milestone_logs')
    .select('id,milestone_id,user_id,note,logged_at')
    .eq('milestone_id', milestoneId)
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(LOG_LIMIT)

  if (error) throw new Error(error.message)
  return (data ?? []) as MilestoneLogRow[]
}

async function fetchLogById(
  supabase: SupabaseClient,
  logId: string,
  milestoneId: string,
  userId: string,
): Promise<MilestoneLogRow | null> {
  const { data, error } = await supabase
    .from('milestone_logs')
    .select('id,milestone_id,user_id,note,logged_at')
    .eq('id', logId)
    .eq('milestone_id', milestoneId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as MilestoneLogRow | null
}

type TaskItem = { task: string; done: boolean }

function normalizeTasks(value: unknown): TaskItem[] | null {
  if (!Array.isArray(value)) return null
  const out: TaskItem[] = []
  for (const item of value) {
    if (item && typeof item === 'object' && typeof (item as { task?: unknown }).task === 'string') {
      out.push({
        task: (item as { task: string }).task,
        done: Boolean((item as { done?: unknown }).done),
      })
    }
  }
  return out.length ? out : null
}

async function upsertMilestoneTasksRow(
  supabase: SupabaseClient,
  params: {
    user_id: string
    milestone_id: string
    week_start: string
    tasks: TaskItem[]
  },
): Promise<void> {
  const now = new Date().toISOString()
  const { data: existing, error: selErr } = await supabase
    .from('milestone_tasks')
    .select('id')
    .eq('milestone_id', params.milestone_id)
    .eq('user_id', params.user_id)
    .eq('week_start', params.week_start)
    .maybeSingle()

  if (selErr) throw new Error(selErr.message)

  if (existing?.id) {
    const { error } = await supabase
      .from('milestone_tasks')
      .update({
        tasks: params.tasks,
        generated_at: now,
        updated_at: now,
      })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('milestone_tasks').insert({
      user_id: params.user_id,
      milestone_id: params.milestone_id,
      week_start: params.week_start,
      tasks: params.tasks,
      generated_at: now,
    })
    if (error) throw new Error(error.message)
  }
}

// --- mode: evaluate ---
// Triggered when the parent logs progress on a milestone; Claude evaluates the note in context
// and we persist the structured result on the log row (`ai_response`).

async function handleEvaluate(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Response> {
  const userId = body.user_id
  const milestoneId = body.milestone_id
  const logId = body.log_id

  if (typeof userId !== 'string' || !userId.trim()) {
    return jsonResponse({ success: false, error: 'Missing or invalid user_id' }, 400)
  }
  if (typeof milestoneId !== 'string' || !milestoneId.trim()) {
    return jsonResponse({ success: false, error: 'Missing or invalid milestone_id' }, 400)
  }
  if (typeof logId !== 'string' || !logId.trim()) {
    return jsonResponse({ success: false, error: 'Missing or invalid log_id' }, 400)
  }

  let milestone: MilestoneRow | null
  try {
    milestone = await fetchMilestoneForUser(supabase, milestoneId, userId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
  }
  if (!milestone) {
    return jsonResponse(
      { success: false, error: 'Milestone not found for this user_id' },
      404,
    )
  }

  let log: MilestoneLogRow | null
  try {
    log = await fetchLogById(supabase, logId, milestoneId, userId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
  }
  if (!log) {
    return jsonResponse(
      { success: false, error: 'Log not found or does not belong to this milestone/user' },
      404,
    )
  }

  let recentLogs: MilestoneLogRow[]
  try {
    recentLogs = await fetchRecentLogs(supabase, milestoneId, userId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
  }

  const corrected = getCorrectedAge(new Date())
  const system = `You are a supportive child-development assistant. The family uses Czech where relevant.
Respond with ONLY a single JSON object (no markdown), shape:
{"evaluation": string, "tips": string, "tasks": [ {"task": string, "done": false} ] }
tasks is optional (omit or [] if none). Be practical and grounded.`

  const userContent = JSON.stringify({
    mode: 'evaluate',
    corrected_age: corrected,
    milestone: {
      title: milestone.title,
      child_name: milestone.child_name,
      category: milestone.category,
      description: milestone.description,
    },
    current_log: { id: log.id, note: log.note, logged_at: log.logged_at },
    recent_logs_for_context: recentLogs.map((l) => ({
      note: l.note,
      logged_at: l.logged_at,
    })),
  })

  const claude = await callClaude(system, [{ role: 'user', content: userContent }])
  if (!claude.ok) {
    return jsonResponse(
      {
        success: false,
        error: `${claude.error} Raw model output: ${claude.rawText}`,
      },
      500,
    )
  }

  const aiJson = JSON.stringify(claude.data)

  try {
    const { error: upErr } = await supabase
      .from('milestone_logs')
      .update({ ai_response: aiJson, updated_at: new Date().toISOString() })
      .eq('id', logId)
      .eq('user_id', userId)
      .eq('milestone_id', milestoneId)

    if (upErr) throw new Error(upErr.message)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
  }

  const tasks = normalizeTasks(claude.data.tasks)
  if (tasks) {
    try {
      await upsertMilestoneTasksRow(supabase, {
        user_id: userId,
        milestone_id: milestoneId,
        week_start: getWeekStartIsoUtc(),
        tasks,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse({ success: false, error: `Database error (tasks): ${msg}` }, 500)
    }
  }

  return jsonResponse({
    success: true,
    mode: 'evaluate',
    data: claude.data,
  })
}

// --- mode: generate_tasks ---
// Triggered when the parent asks for fresh weekly micro-tasks; we upsert milestone_tasks for the current ISO week.

async function handleGenerateTasks(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Response> {
  const userId = body.user_id
  const milestoneId = body.milestone_id

  if (typeof userId !== 'string' || !userId.trim()) {
    return jsonResponse({ success: false, error: 'Missing or invalid user_id' }, 400)
  }
  if (typeof milestoneId !== 'string' || !milestoneId.trim()) {
    return jsonResponse({ success: false, error: 'Missing or invalid milestone_id' }, 400)
  }

  let milestone: MilestoneRow | null
  try {
    milestone = await fetchMilestoneForUser(supabase, milestoneId, userId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
  }
  if (!milestone) {
    return jsonResponse(
      { success: false, error: 'Milestone not found for this user_id' },
      404,
    )
  }

  let recentLogs: MilestoneLogRow[]
  try {
    recentLogs = await fetchRecentLogs(supabase, milestoneId, userId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
  }

  const corrected = getCorrectedAge(new Date())
  const system = `You are a supportive child-development assistant.
Respond with ONLY a single JSON object (no markdown), shape:
{"tasks": [ {"task": string, "done": false} ] }
Provide 3–7 small, concrete tasks for the current week.`

  const userContent = JSON.stringify({
    mode: 'generate_tasks',
    corrected_age: corrected,
    milestone: {
      title: milestone.title,
      child_name: milestone.child_name,
      category: milestone.category,
      description: milestone.description,
    },
    recent_logs: recentLogs.map((l) => ({ note: l.note, logged_at: l.logged_at })),
  })

  const claude = await callClaude(system, [{ role: 'user', content: userContent }])
  if (!claude.ok) {
    return jsonResponse(
      {
        success: false,
        error: `${claude.error} Raw model output: ${claude.rawText}`,
      },
      500,
    )
  }

  const tasks = normalizeTasks(claude.data.tasks)
  if (!tasks) {
    return jsonResponse(
      {
        success: false,
        error:
          'Model JSON did not contain a valid tasks array. Raw model output: ' +
          JSON.stringify(claude.data),
      },
      500,
    )
  }

  try {
    await upsertMilestoneTasksRow(supabase, {
      user_id: userId,
      milestone_id: milestoneId,
      week_start: getWeekStartIsoUtc(),
      tasks,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
  }

  return jsonResponse({
    success: true,
    mode: 'generate_tasks',
    data: claude.data,
  })
}

// --- mode: ask ---
// Ad-hoc questions: with a milestone_id, we load that milestone + recent logs. With
// milestone_id null, we skip DB reads and answer general child-development questions using
// fixed family context (both children, corrected age in months).

async function handleAsk(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Response> {
  const userId = body.user_id
  const milestoneIdRaw = body.milestone_id
  const question = body.question

  if (typeof userId !== 'string' || !userId.trim()) {
    return jsonResponse({ success: false, error: 'Missing or invalid user_id' }, 400)
  }
  const isGeneralAsk = milestoneIdRaw === null
  if (
    !isGeneralAsk &&
    (typeof milestoneIdRaw !== 'string' || !milestoneIdRaw.trim())
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          'Missing or invalid milestone_id: use null for general questions or a non-empty string',
      },
      400,
    )
  }
  if (typeof question !== 'string' || !question.trim()) {
    return jsonResponse({ success: false, error: 'Missing or invalid question' }, 400)
  }

  const corrected = getCorrectedAge(new Date())
  const system = `You are a supportive child-development assistant.
Respond with ONLY a single JSON object (no markdown), shape:
{"answer": string}`

  let userContent: string

  if (isGeneralAsk) {
    const contextLine = `Obě děti — Viky a Adri — korigovaný věk: ${corrected.months} měsíců`
    userContent = JSON.stringify({
      mode: 'ask',
      question: question.trim(),
      context: contextLine,
    })
  } else {
    const milestoneId = (milestoneIdRaw as string).trim()

    let milestone: MilestoneRow | null
    try {
      milestone = await fetchMilestoneForUser(supabase, milestoneId, userId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
    }
    if (!milestone) {
      return jsonResponse(
        { success: false, error: 'Milestone not found for this user_id' },
        404,
      )
    }

    let recentLogs: MilestoneLogRow[]
    try {
      recentLogs = await fetchRecentLogs(supabase, milestoneId, userId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
    }

    userContent = JSON.stringify({
      mode: 'ask',
      question: question.trim(),
      corrected_age: corrected,
      milestone: {
        title: milestone.title,
        child_name: milestone.child_name,
        category: milestone.category,
        description: milestone.description,
      },
      recent_logs: recentLogs.map((l) => ({ note: l.note, logged_at: l.logged_at })),
    })
  }

  const claude = await callClaude(system, [{ role: 'user', content: userContent }])
  if (!claude.ok) {
    return jsonResponse(
      {
        success: false,
        error: `${claude.error} Raw model output: ${claude.rawText}`,
      },
      500,
    )
  }

  return jsonResponse({
    success: true,
    mode: 'ask',
    data: claude.data,
  })
}

// --- Weekly activities (twins Viky & Adri — one shared plan per ISO week, UTC Monday) ---
// Separate from per-child milestone_tasks: full-week playful + developmental mix.
// activity categories must match CHECK-friendly strings stored in JSONB.

const ACTIVITY_CATEGORIES = [
  'motor',
  'speech',
  'independence',
  'sensory',
  'play',
  'social',
] as const

type ActivityItem = {
  id: string
  activity: string
  tip: string
  category: string
  estimated_minutes: number
  done: boolean
}

type DifficultyLevel = 'easier' | 'normal' | 'harder'

type WeeklyPlanRow = {
  id: string
  user_id: string
  week_start: string
  difficulty_level: string
  activities: ActivityItem[]
  generated_at: string
  created_at: string
  updated_at: string
}

function isDifficultyLevel(d: unknown): d is DifficultyLevel {
  return d === 'easier' || d === 'normal' || d === 'harder'
}

function normalizeActivityCategory(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if ((ACTIVITY_CATEGORIES as readonly string[]).includes(s)) return s
  return 'play'
}

/**
 * Build ActivityItem rows from Claude output (no ids yet); caller assigns act_1, act_2, …
 */
function parseActivitiesArrayFromClaude(value: unknown): Omit<ActivityItem, 'id' | 'done'>[] | null {
  if (!Array.isArray(value)) return null
  const out: Omit<ActivityItem, 'id' | 'done'>[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const activity = typeof o.activity === 'string' ? o.activity.trim() : ''
    if (!activity) continue
    const tip = typeof o.tip === 'string' ? o.tip.trim() : ''
    const estimated =
      typeof o.estimated_minutes === 'number' && Number.isFinite(o.estimated_minutes)
        ? Math.max(1, Math.round(o.estimated_minutes))
        : 10
    out.push({
      activity,
      tip,
      category: normalizeActivityCategory(o.category),
      estimated_minutes: estimated,
    })
  }
  return out.length >= 1 ? out : null
}

function assignSequentialActivityIds(
  items: Omit<ActivityItem, 'id' | 'done'>[],
): ActivityItem[] {
  return items.map((it, i) => ({
    ...it,
    id: `act_${i + 1}`,
    done: false,
  }))
}

/** Clamp suggest output to 5–7 items (spec). */
function clampActivityCount(items: Omit<ActivityItem, 'id' | 'done'>[]): Omit<
  ActivityItem,
  'id' | 'done'
>[] {
  if (items.length <= 7) return items
  return items.slice(0, 7)
}

async function fetchLatestDifficultyDefault(
  supabase: SupabaseClient,
  userId: string,
): Promise<DifficultyLevel> {
  const { data, error } = await supabase
    .from('weekly_activities')
    .select('difficulty_level')
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const d = data?.difficulty_level
  return isDifficultyLevel(d) ? d : 'normal'
}

/** Last two weekly plans strictly before `currentWeekStart` — used to reduce repeated ideas. */
async function fetchPreviousTwoWeeklyPlans(
  supabase: SupabaseClient,
  userId: string,
  currentWeekStart: string,
): Promise<{ week_start: string; activities: unknown }[]> {
  const { data, error } = await supabase
    .from('weekly_activities')
    .select('week_start, activities')
    .eq('user_id', userId)
    .lt('week_start', currentWeekStart)
    .order('week_start', { ascending: false })
    .limit(2)

  if (error) throw new Error(error.message)
  return (data ?? []) as { week_start: string; activities: unknown }[]
}

function summarizePastActivitiesForPrompt(
  plans: { week_start: string; activities: unknown }[],
): string {
  const lines: string[] = []
  for (const p of plans) {
    const arr = Array.isArray(p.activities) ? p.activities : []
    const titles = arr
      .map((a) =>
        a && typeof a === 'object' && typeof (a as { activity?: unknown }).activity === 'string'
          ? (a as { activity: string }).activity
          : null,
      )
      .filter(Boolean)
    if (titles.length) {
      lines.push(`Týden ${p.week_start}: ${titles.join('; ')}`)
    }
  }
  return lines.length ? lines.join('\n') : '(žádné předchozí plány v databázi)'
}

async function fetchActiveMilestonesSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ title: string; child_name: string; category: string; description: string | null }[]> {
  const { data, error } = await supabase
    .from('milestones')
    .select('title, child_name, category, description')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (error) throw new Error(error.message)
  return (data ?? []) as {
    title: string
    child_name: string
    category: string
    description: string | null
  }[]
}

async function fetchWeeklyPlanForWeek(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
): Promise<WeeklyPlanRow | null> {
  const { data, error } = await supabase
    .from('weekly_activities')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return data as WeeklyPlanRow
}

function normalizeStoredActivities(raw: unknown): ActivityItem[] {
  if (!Array.isArray(raw)) return []
  const out: ActivityItem[] = []
  let i = 0
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const activity = typeof o.activity === 'string' ? o.activity : ''
    if (!activity) continue
    i += 1
    out.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id : `act_${i}`,
      activity,
      tip: typeof o.tip === 'string' ? o.tip : '',
      category: normalizeActivityCategory(o.category),
      estimated_minutes:
        typeof o.estimated_minutes === 'number' && Number.isFinite(o.estimated_minutes)
          ? Math.round(o.estimated_minutes)
          : 10,
      done: Boolean(o.done),
    })
  }
  return out
}

async function upsertWeeklyActivitiesRow(
  supabase: SupabaseClient,
  params: {
    user_id: string
    week_start: string
    difficulty_level: DifficultyLevel
    activities: ActivityItem[]
  },
): Promise<WeeklyPlanRow> {
  const now = new Date().toISOString()
  const { data: existing, error: selErr } = await supabase
    .from('weekly_activities')
    .select('id')
    .eq('user_id', params.user_id)
    .eq('week_start', params.week_start)
    .maybeSingle()

  if (selErr) throw new Error(selErr.message)

  if (existing?.id) {
    const { data, error } = await supabase
      .from('weekly_activities')
      .update({
        difficulty_level: params.difficulty_level,
        activities: params.activities,
        generated_at: now,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    const row = data as WeeklyPlanRow
    row.activities = normalizeStoredActivities(row.activities as unknown)
    return row
  }

  const { data, error } = await supabase
    .from('weekly_activities')
    .insert({
      user_id: params.user_id,
      week_start: params.week_start,
      difficulty_level: params.difficulty_level,
      activities: params.activities,
      generated_at: now,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  const row = data as WeeklyPlanRow
  row.activities = normalizeStoredActivities(row.activities as unknown)
  return row
}

const ACTIVITY_SYSTEM_SUGGEST = `You are planning weekly developmental activities for twin girls Viky and Adri in Czech family context.
They were born May 8, 2024; use corrected age from expected due date July 24, 2024 (premature twins — corrected age matters).
One shared plan for BOTH children — they do activities together as a pair.
Respond with ONLY valid JSON (no markdown). Language: Czech for activity, tip, and any visible text fields.

Required JSON shape:
{"activities": [ {"activity": string, "tip": string, "category": string, "estimated_minutes": number} ] }

Rules:
- Produce between 5 and 7 activities.
- category must be one of: motor, speech, independence, sensory, play, social.
- Mix categories across the week; include playful games and simple developmental goals.
- tips should be concrete coaching for parents (short).
- Respect difficulty_level in the user message: easier = simpler/shorter; harder = more challenge; normal = balanced.
- Avoid repeating or closely paraphrasing activities listed under "previous_weeks" — offer fresh variety.`

/**
 * Core generation used by suggest_activities and adjust_difficulty (full replace for current week).
 */
async function runSuggestActivitiesGeneration(
  supabase: SupabaseClient,
  userId: string,
  difficultyLevel: DifficultyLevel,
  weekStart: string,
  extraUserContext?: Record<string, unknown>,
): Promise<WeeklyPlanRow> {
  const corrected = getCorrectedAge(new Date())
  const prev = await fetchPreviousTwoWeeklyPlans(supabase, userId, weekStart)
  const pastSummary = summarizePastActivitiesForPrompt(prev)
  const milestones = await fetchActiveMilestonesSummary(supabase, userId)

  const userPayload = {
    mode: 'suggest_activities',
    twins: 'Viky a Adri — společné aktivity pro dvojčata',
    birth_date: '2024-05-08',
    expected_due_date: '2024-07-24',
    corrected_age: corrected,
    difficulty_level: difficultyLevel,
    week_start_utc_monday: weekStart,
    active_milestones: milestones,
    previous_weeks: pastSummary,
    ...extraUserContext,
  }

  const claude = await callClaude(ACTIVITY_SYSTEM_SUGGEST, [
    { role: 'user', content: JSON.stringify(userPayload) },
  ], { maxTokens: CLAUDE_MAX_TOKENS_ACTIVITIES })

  if (!claude.ok) {
    throw new Error(`${claude.error} Raw: ${claude.rawText}`)
  }

  let parsed = parseActivitiesArrayFromClaude(claude.data.activities)
  if (!parsed) {
    throw new Error('Model did not return a valid activities array.')
  }
  parsed = clampActivityCount(parsed)
  if (parsed.length < 5) {
    throw new Error(`Expected at least 5 activities, got ${parsed.length}.`)
  }

  const withIds = assignSequentialActivityIds(parsed)
  return await upsertWeeklyActivitiesRow(supabase, {
    user_id: userId,
    week_start: weekStart,
    difficulty_level: difficultyLevel,
    activities: withIds,
  })
}

// --- mode: suggest_activities ---

async function handleSuggestActivities(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Response> {
  const userId = body.user_id
  if (typeof userId !== 'string' || !userId.trim()) {
    return jsonResponse({ success: false, error: 'Missing or invalid user_id' }, 400)
  }

  let difficulty: DifficultyLevel
  if (body.difficulty_level === undefined || body.difficulty_level === null) {
    try {
      difficulty = await fetchLatestDifficultyDefault(supabase, userId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
    }
  } else if (isDifficultyLevel(body.difficulty_level)) {
    difficulty = body.difficulty_level
  } else {
    return jsonResponse(
      { success: false, error: 'Invalid difficulty_level: use easier, normal, or harder' },
      400,
    )
  }

  const weekStart = getWeekStartIsoUtc()

  try {
    const plan = await runSuggestActivitiesGeneration(supabase, userId, difficulty, weekStart)
    return jsonResponse({
      success: true,
      mode: 'suggest_activities',
      data: { plan },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: msg }, 500)
  }
}

// --- mode: replace_activity ---

const ACTIVITY_SYSTEM_REPLACE = `You replace ONE activity in a weekly twin plan (Viky & Adri, Czech context, corrected age from EDD 2024-07-24).
Respond with ONLY JSON: {"activity": {"activity": string, "tip": string, "category": string, "estimated_minutes": number}}
category must be one of: motor, speech, independence, sensory, play, social.
Do not duplicate activities similar to those listed under "keep_activities".`

async function handleReplaceActivity(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Response> {
  const userId = body.user_id
  const activityId = body.activity_id
  const reason = body.reason

  if (typeof userId !== 'string' || !userId.trim()) {
    return jsonResponse({ success: false, error: 'Missing or invalid user_id' }, 400)
  }
  if (typeof activityId !== 'string' || !activityId.trim()) {
    return jsonResponse({ success: false, error: 'Missing or invalid activity_id' }, 400)
  }

  const weekStart = getWeekStartIsoUtc()
  let plan: WeeklyPlanRow | null
  try {
    plan = await fetchWeeklyPlanForWeek(supabase, userId, weekStart)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
  }

  if (!plan) {
    return jsonResponse({ success: false, error: 'Žádný plán na tento týden' }, 400)
  }

  const activities = normalizeStoredActivities(plan.activities as unknown)
  const idx = activities.findIndex((a) => a.id === activityId.trim())
  if (idx === -1) {
    return jsonResponse({ success: false, error: 'Aktivita nenalezena' }, 404)
  }

  const rejected = activities[idx]
  const keep = activities.filter((_, i) => i !== idx)

  const corrected = getCorrectedAge(new Date())
  const userPayload = {
    mode: 'replace_activity',
    corrected_age: corrected,
    rejected_activity: rejected,
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    keep_activities: keep.map((a) => ({
      id: a.id,
      activity: a.activity,
      category: a.category,
    })),
  }

  const claude = await callClaude(ACTIVITY_SYSTEM_REPLACE, [
    { role: 'user', content: JSON.stringify(userPayload) },
  ], { maxTokens: CLAUDE_MAX_TOKENS_ACTIVITIES })

  if (!claude.ok) {
    return jsonResponse(
      { success: false, error: `${claude.error} Raw model output: ${claude.rawText}` },
      500,
    )
  }

  const rawOne = claude.data.activity
  const parsedArr =
    rawOne !== undefined && rawOne !== null && typeof rawOne === 'object'
      ? parseActivitiesArrayFromClaude([rawOne])
      : null
  if (!parsedArr || parsedArr.length !== 1) {
    return jsonResponse(
      {
        success: false,
        error: 'Model did not return a single replacement activity.',
      },
      500,
    )
  }

  const replacement: ActivityItem = {
    ...parsedArr[0],
    id: rejected.id,
    done: false,
  }

  const next = [...activities]
  next[idx] = replacement

  try {
    const updated = await upsertWeeklyActivitiesRow(supabase, {
      user_id: userId,
      week_start: weekStart,
      difficulty_level: isDifficultyLevel(plan.difficulty_level)
        ? plan.difficulty_level
        : 'normal',
      activities: next,
    })
    return jsonResponse({
      success: true,
      mode: 'replace_activity',
      data: { plan: updated },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
  }
}

// --- mode: adjust_difficulty ---

async function handleAdjustDifficulty(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Response> {
  const userId = body.user_id
  const rawDiff = body.difficulty_level

  if (typeof userId !== 'string' || !userId.trim()) {
    return jsonResponse({ success: false, error: 'Missing or invalid user_id' }, 400)
  }
  if (rawDiff !== 'easier' && rawDiff !== 'harder') {
    return jsonResponse(
      { success: false, error: 'Invalid difficulty_level: use easier or harder' },
      400,
    )
  }

  const newDifficulty: DifficultyLevel = rawDiff
  const weekStart = getWeekStartIsoUtc()

  let plan: WeeklyPlanRow | null
  try {
    plan = await fetchWeeklyPlanForWeek(supabase, userId, weekStart)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: `Database error: ${msg}` }, 500)
  }

  if (!plan) {
    return jsonResponse({ success: false, error: 'Žádný plán na tento týden' }, 400)
  }

  const previousActivities = normalizeStoredActivities(plan.activities as unknown)
  const oldDifficulty = isDifficultyLevel(plan.difficulty_level)
    ? plan.difficulty_level
    : 'normal'

  try {
    const updatedPlan = await runSuggestActivitiesGeneration(
      supabase,
      userId,
      newDifficulty,
      weekStart,
      {
        adjust_difficulty: true,
        previous_difficulty: oldDifficulty,
        new_difficulty: newDifficulty,
        previous_plan_activities: previousActivities.map((a) => ({
          activity: a.activity,
          category: a.category,
          estimated_minutes: a.estimated_minutes,
        })),
      },
    )
    return jsonResponse({
      success: true,
      mode: 'adjust_difficulty',
      data: { plan: updatedPlan },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: msg }, 500)
  }
}

// --- Main ---

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const mode = body.mode
  const allowedModes = new Set([
    'evaluate',
    'generate_tasks',
    'ask',
    'suggest_activities',
    'replace_activity',
    'adjust_difficulty',
  ])
  if (typeof mode !== 'string' || !allowedModes.has(mode)) {
    return jsonResponse(
      {
        success: false,
        error:
          "Invalid mode: must be 'evaluate', 'generate_tasks', 'ask', 'suggest_activities', 'replace_activity', or 'adjust_difficulty'",
      },
      400,
    )
  }

  let supabase: SupabaseClient
  try {
    supabase = getSupabaseAdmin()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: msg }, 500)
  }

  try {
    if (mode === 'evaluate') return await handleEvaluate(supabase, body)
    if (mode === 'generate_tasks') return await handleGenerateTasks(supabase, body)
    if (mode === 'ask') return await handleAsk(supabase, body)
    if (mode === 'suggest_activities') return await handleSuggestActivities(supabase, body)
    if (mode === 'replace_activity') return await handleReplaceActivity(supabase, body)
    return await handleAdjustDifficulty(supabase, body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: `Unhandled error: ${msg}` }, 500)
  }
})
