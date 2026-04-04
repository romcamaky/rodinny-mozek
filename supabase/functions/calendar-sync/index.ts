/**
 * Supabase Edge Function: calendar-sync
 *
 * Creates, updates, and deletes Google Calendar events for tasks with deadlines.
 * Uses a Google Cloud service account (JWT bearer) — no end-user OAuth.
 * Secrets: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_CALENDAR_ID
 */

// --- CORS (same pattern as milestone-ai: frontend may call with anon JWT) ---

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

// --- Constants ---

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'
const PRAGUE_TZ = 'Europe/Prague'

type EventIds = {
  week_before: string | null
  two_days_before: string | null
  deadline: string | null
}

// --- Base64url (JWT uses URL-safe base64 without padding) ---

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i])
  const b64 = btoa(binary)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function stringToBase64Url(s: string): string {
  return bytesToBase64Url(new TextEncoder().encode(s).buffer)
}

/**
 * Strip PEM armor and decode PKCS#8 DER bytes for crypto.subtle.importKey.
 * Service account JSON keys use "BEGIN PRIVATE KEY" (PKCS#8).
 */
function pemPrivateKeyToPkcs8(pem: string): ArrayBuffer {
  const lines = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const binary = atob(lines)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/**
 * Build and sign a JWT for Google service account using RS256 (RSA + SHA-256).
 *
 * Steps:
 * 1. Header: algorithm RS256, type JWT (standard for Google).
 * 2. Payload: iss = client email, scope = Calendar API, aud = token endpoint,
 *    exp/iat for a 1-hour window (Google requires short-lived assertion).
 * 3. Signing input is ASCII: base64url(header) + "." + base64url(payload).
 * 4. Sign with RSASSA-PKCS1-v1_5 over SHA-256 using the imported PKCS#8 private key.
 * 5. Append base64url(signature) to form the compact JWT string.
 */
async function signJwtRs256(privateKeyPem: string, clientEmail: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: clientEmail,
    scope: CALENDAR_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }

  const encHeader = stringToBase64Url(JSON.stringify(header))
  const encPayload = stringToBase64Url(JSON.stringify(payload))
  const signingInput = `${encHeader}.${encPayload}`

  const keyData = pemPrivateKeyToPkcs8(privateKeyPem)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  )

  const encSig = bytesToBase64Url(signature)
  return `${signingInput}.${encSig}`
}

/** Exchange signed JWT for an OAuth2 access_token (Bearer for Calendar API). */
async function getGoogleAccessToken(jwtAssertion: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwtAssertion,
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Google token endpoint ${res.status}: ${text.slice(0, 800)}`)
  }

  const json = JSON.parse(text) as { access_token?: string }
  if (!json.access_token) {
    throw new Error('Token response missing access_token')
  }
  return json.access_token
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v || !v.trim()) {
    throw new Error(`Missing or empty secret: ${name}`)
  }
  return v.trim()
}

/** Load and normalize PEM: Supabase secrets often store newlines as literal "\\n". */
function loadServiceAccountPrivateKey(): string {
  const raw = requireEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  return raw.replace(/\\n/g, '\n')
}

async function fetchCalendarAccessToken(): Promise<string> {
  const email = requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const pem = loadServiceAccountPrivateKey()
  const jwt = await signJwtRs256(pem, email)
  return await getGoogleAccessToken(jwt)
}

function calendarIdEncoded(): string {
  return encodeURIComponent(requireEnv('GOOGLE_CALENDAR_ID'))
}

/** Today's calendar date (YYYY-MM-DD) in Europe/Prague — matches timed deadline semantics. */
function todayYmdPrague(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: PRAGUE_TZ })
}

/** Whole calendar days from `fromYmd` to `toYmd` (can be negative if to is before from). */
function calendarDaysBetween(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split('-').map(Number)
  const [ty, tm, td] = toYmd.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86_400_000)
}

/** Add signed calendar days to YYYY-MM-DD (UTC date arithmetic, no time-of-day). */
function addCalendarDays(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays))
  return dt.toISOString().slice(0, 10)
}

/** Google all-day events use exclusive end date (midnight next day). */
function allDayEventEndExclusive(startYmd: string): string {
  return addCalendarDays(startYmd, 1)
}

const REMINDERS_30MIN = {
  useDefault: false,
  overrides: [{ method: 'popup' as const, minutes: 30 }],
}

async function calendarInsertEvent(
  accessToken: string,
  calendarId: string,
  eventBody: Record<string, unknown>,
): Promise<string> {
  const url = `${CALENDAR_API_BASE}/calendars/${calendarId}/events`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventBody),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Calendar insert ${res.status}: ${text.slice(0, 800)}`)
  }
  const json = JSON.parse(text) as { id?: string }
  if (!json.id) throw new Error('Calendar insert response missing id')
  return json.id
}

/** DELETE event; returns true if removed or already absent (404/410). */
async function calendarDeleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const eid = encodeURIComponent(eventId)
  const url = `${CALENDAR_API_BASE}/calendars/${calendarId}/events/${eid}`
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.status === 404 || res.status === 410) return
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      // Spec: do not fail the whole delete flow for missing/stale IDs
      console.warn(`calendar-sync delete non-ok ${res.status}: ${t.slice(0, 200)}`)
    }
  } catch (e) {
    console.warn('calendar-sync delete error:', e)
  }
}

/**
 * Core creation logic: up to 3 events based on how far the deadline is from today (Prague).
 * Returns null IDs for skipped slots; deadline key is null only when deadline is in the past.
 */
async function createTaskEvents(
  accessToken: string,
  calendarId: string,
  title: string,
  deadline: string,
  taskId: string,
): Promise<EventIds> {
  const today = todayYmdPrague()
  const daysUntil = calendarDaysBetween(today, deadline)

  const empty: EventIds = {
    week_before: null,
    two_days_before: null,
    deadline: null,
  }

  if (daysUntil < 0) {
    return empty
  }

  let weekBeforeId: string | null = null
  let twoDaysBeforeId: string | null = null
  let deadlineId: string | null = null

  const descFooter = `Rodinný Mozek — task_id: ${taskId}`

  if (daysUntil >= 7) {
    const day = addCalendarDays(deadline, -7)
    weekBeforeId = await calendarInsertEvent(accessToken, calendarId, {
      summary: `📋 Za týden: ${title}`,
      description: descFooter,
      reminders: REMINDERS_30MIN,
      start: { date: day, timeZone: PRAGUE_TZ },
      end: { date: allDayEventEndExclusive(day), timeZone: PRAGUE_TZ },
    })
  }

  if (daysUntil >= 2) {
    const day = addCalendarDays(deadline, -2)
    twoDaysBeforeId = await calendarInsertEvent(accessToken, calendarId, {
      summary: `⏰ Pozítří: ${title}`,
      description: descFooter,
      reminders: REMINDERS_30MIN,
      start: { date: day, timeZone: PRAGUE_TZ },
      end: { date: allDayEventEndExclusive(day), timeZone: PRAGUE_TZ },
    })
  }

  deadlineId = await calendarInsertEvent(accessToken, calendarId, {
    summary: `🔴 Dnes: ${title}`,
    description: descFooter,
    reminders: REMINDERS_30MIN,
    start: {
      dateTime: `${deadline}T09:00:00`,
      timeZone: PRAGUE_TZ,
    },
    end: {
      dateTime: `${deadline}T10:00:00`,
      timeZone: PRAGUE_TZ,
    },
  })

  return {
    week_before: weekBeforeId,
    two_days_before: twoDaysBeforeId,
    deadline: deadlineId,
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function parseOptionalEventId(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string' || !v.trim()) return null
  return v.trim()
}

function parseEventIds(raw: unknown): EventIds | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  return {
    week_before: parseOptionalEventId(o.week_before),
    two_days_before: parseOptionalEventId(o.two_days_before),
    deadline: parseOptionalEventId(o.deadline),
  }
}

async function handleCreate(body: Record<string, unknown>): Promise<Response> {
  if (!isNonEmptyString(body.task_id)) {
    return jsonResponse({ success: false, error: 'Missing or invalid task_id' }, 400)
  }
  if (!isNonEmptyString(body.title)) {
    return jsonResponse({ success: false, error: 'Missing or invalid title' }, 400)
  }
  if (!isNonEmptyString(body.deadline)) {
    return jsonResponse({ success: false, error: 'Missing or invalid deadline (expected YYYY-MM-DD)' }, 400)
  }

  const calendarId = calendarIdEncoded()

  try {
    const accessToken = await fetchCalendarAccessToken()
    const event_ids = await createTaskEvents(
      accessToken,
      calendarId,
      body.title.trim(),
      body.deadline.trim(),
      body.task_id.trim(),
    )
    return jsonResponse({ success: true, event_ids })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: msg }, 500)
  }
}

async function handleUpdate(body: Record<string, unknown>): Promise<Response> {
  if (!isNonEmptyString(body.task_id)) {
    return jsonResponse({ success: false, error: 'Missing or invalid task_id' }, 400)
  }
  if (!isNonEmptyString(body.title)) {
    return jsonResponse({ success: false, error: 'Missing or invalid title' }, 400)
  }
  if (!isNonEmptyString(body.deadline)) {
    return jsonResponse({ success: false, error: 'Missing or invalid deadline (expected YYYY-MM-DD)' }, 400)
  }
  const existing = parseEventIds(body.event_ids)
  if (!existing) {
    return jsonResponse({ success: false, error: 'Missing or invalid event_ids object' }, 400)
  }

  const calendarId = calendarIdEncoded()

  try {
    const accessToken = await fetchCalendarAccessToken()

    for (const id of [existing.week_before, existing.two_days_before, existing.deadline]) {
      if (id) await calendarDeleteEvent(accessToken, calendarId, id)
    }

    const event_ids = await createTaskEvents(
      accessToken,
      calendarId,
      body.title.trim(),
      body.deadline.trim(),
      body.task_id.trim(),
    )
    return jsonResponse({ success: true, event_ids })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: msg }, 500)
  }
}

async function handleDelete(body: Record<string, unknown>): Promise<Response> {
  const existing = parseEventIds(body.event_ids)
  if (!existing) {
    return jsonResponse({ success: false, error: 'Missing or invalid event_ids object' }, 400)
  }

  let calendarId: string
  try {
    calendarId = calendarIdEncoded()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: msg }, 500)
  }

  try {
    const accessToken = await fetchCalendarAccessToken()
    for (const id of [existing.week_before, existing.two_days_before, existing.deadline]) {
      if (id) await calendarDeleteEvent(accessToken, calendarId, id)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: msg }, 500)
  }

  return jsonResponse({ success: true })
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
  const allowed = new Set(['create', 'update', 'delete'])
  if (typeof mode !== 'string' || !allowed.has(mode)) {
    return jsonResponse(
      {
        success: false,
        error: "Invalid mode: must be 'create', 'update', or 'delete'",
      },
      400,
    )
  }

  try {
    if (mode === 'create') return await handleCreate(body)
    if (mode === 'update') return await handleUpdate(body)
    return await handleDelete(body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: `Unhandled error: ${msg}` }, 500)
  }
})
