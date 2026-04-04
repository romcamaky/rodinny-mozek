// Edge Function: voice-router
// Purpose: Receives audio (for Whisper transcription) or text input,
// sends transcript to Claude for classification and data extraction,
// returns structured result to the frontend.
//
// Flow: Audio/Text → Whisper (if audio) → Claude classification → structured response

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// CORS headers — required for browser requests from our PWA.
// The browser sends an OPTIONS preflight before POST requests with custom headers.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Call OpenAI Whisper API to transcribe Czech audio.
// Whisper is used because it has excellent Czech language support.
// Cost: ~$0.006 per minute of audio.
async function transcribeAudio(audioBlob: Blob, fileName: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', audioBlob, fileName)
  formData.append('model', 'whisper-1')
  formData.append('language', 'cs') // Czech language
  formData.append('response_format', 'json')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Whisper API error: ${response.status} — ${error}`)
  }

  const result = await response.json()
  return result.text
}

// Call Claude API to classify the transcript and extract structured data.
// Claude decides: is this a task, note, place, or milestone?
// Then extracts the relevant fields for that type.
async function classifyAndExtract(transcript: string) {
  // Build today's date context in Prague timezone (same calendar as users expect for "zítra", "v pondělí").
  const now = new Date()
  const pragueDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Prague' }))
  const today = pragueDate.toLocaleDateString('en-CA') // YYYY-MM-DD

  const czechDays = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota']
  const todayCzechDay = czechDays[pragueDate.getDay()]

  // Next 7 days starting from tomorrow — explicit ISO + Czech day name so the model does not miscount weekdays.
  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(pragueDate)
    d.setDate(d.getDate() + i + 1) // tomorrow through +7 days from today
    const dayName = czechDays[d.getDay()]
    const iso = d.toLocaleDateString('en-CA')
    return `"v ${dayName}" nebo "do ${dayName}" = ${iso}`
  }).join('\n  ')

  const nextWeekPrague = new Date(pragueDate)
  nextWeekPrague.setDate(nextWeekPrague.getDate() + 7)
  const nextWeekIso = nextWeekPrague.toLocaleDateString('en-CA')

  const systemPrompt = `Jsi AI asistent pro českou rodinu. Tvým úkolem je analyzovat text a rozhodnout:
1. Kam patří (task/note/place/milestone)
2. Extrahovat strukturovaná data

PRAVIDLA KLASIFIKACE:
- "task" (úkol): Jakýkoli úkol, povinnost, věc k udělání, nákup, objednávka. Klíčová slova: udělat, koupit, objednat, zařídit, nezapomenout, musím, potřebuji, má (ve smyslu povinnosti), reklamovat.
- "note" (poznámka): Myšlenka, nápad, informace k zapamatování, poznámka. Klíčová slova: poznámka, nápad, zapsat si, zapamatovat, přemýšlím.
- "place" (místo): Tip na místo, výlet, restauraci, aktivitu. Klíčová slova: místo, restaurace, kavárna, výlet, navštívit, podívat se na, tip na.
- "milestone" (milník): Záznam o vývoji dětí — poprvé něco udělaly, naučily se, dosáhly. Klíčová slova: poprvé, naučila se, zvládla, dnes udělala.

PRAVIDLA PRO ÚKOLY:
- assigned_to: Pokud text říká "Petr má..." nebo "řekni Petrovi..." → "petr". Pokud "musím" nebo "mám" (= mluvčí je Romi) → "romi". Pokud "Romi má..." nebo "Romi musí..." → "romi". Pokud není jasné → "both".
- deadline: Pokud text obsahuje datum nebo relativní čas, převeď na ISO datum (YYYY-MM-DD). Dnešní datum je: ${today} (den v týdnu v Praze: ${todayCzechDay}).
  Přesný kalendář pro příští dny (POUŽIJ PŘESNĚ TATO DATA, nepočítej sám):
  ${next7Days}
  Další pravidla:
  - "zítra" = první datum z kalendáře výše
  - "pozítří" = druhé datum z kalendáře výše
  - "příští týden" = ${nextWeekIso}
  - "do konce [měsíce]" = poslední den daného měsíce
  - "příští [den]" = výskyt daného dne za 7-13 dní
  Pokud žádný termín nerozpoznáš → null.

PRAVIDLA PRO POZNÁMKY:
- category: Vyber nejlepší kategorii: "idea" (nápad), "trip" (výlet, cestování), "kids" (děti, výchova), "personal" (osobní), "project" (projekt, práce), "other" (ostatní).

PRAVIDLA PRO MÍSTA:
- tags: Vyber relevantní štítky z tohoto seznamu: "kids-friendly", "outdoor", "indoor", "farma", "hřiště", "muzeum", "příroda", "restaurace", "kavárna", "výlet", "zdarma", "víkend", "čas ve dvou", "hernička". Buď velkorysý — přidej všechny štítky, které se hodí. Pokud je místo vhodné pro děti, VŽDY přidej "kids-friendly".
- source: Pokud text zmiňuje Instagram nebo vypadá jako Instagram post (hashtagy, @zmínky) → "instagram". Pokud zmiňuje kamaráda/tip od někoho → "friend". Pokud zmiňuje web/odkaz/URL → "web". Jinak → "own_experience".
- address: VŽDY se pokus extrahovat nebo odvodit adresu. Pokud text obsahuje ulici, město, nebo lokaci (např. "v Letňanech", "na Moravě", "Praha 7"), vytvoř co nejpřesnější adresu. Pokud znáš skutečnou adresu daného místa, uveď ji. Pokud text obsahuje jen oblast (např. "na Moravě"), uveď alespoň tu.
- website: Pokud text obsahuje URL, extrahuj ji. Pokud text obsahuje název konkrétního podniku (kavárna, restaurace, muzeum) a ty znáš jeho webovou stránku, uveď ji. Pokud URL neznáš, nastav null.
- notes: Zahrň jakékoli užitečné detaily z textu — doporučení, tipy, co tam dělat, hodnocení, speciality.
- visit_duration_minutes: Pokud je možné odhadnout dobu návštěvy (kavárna ~60, muzeum ~120, hřiště ~90, restaurace ~90), uveď odhad. Jinak null.

FORMÁT ODPOVĚDI — odpověz POUZE validním JSON, bez markdown, bez vysvětlení:
{
  "target": "task" | "note" | "place" | "milestone",
  "confidence": 0.0-1.0,
  "data": { ... strukturovaná data podle typu ... }
}

Příklady data podle typu:
- task: {"title": "...", "description": "..." nebo null, "assigned_to": "romi"|"petr"|"both", "deadline": "2026-01-15" nebo null}
- note: {"text": "...", "category": "idea"|"trip"|"kids"|"personal"|"project"|"other"}
- place: {"name": "...", "address": "..." nebo null, "tags": [...], "notes": "..." nebo null, "source": "instagram"|"friend"|"web"|"own_experience", "website": "..." nebo null, "visit_duration_minutes": number nebo null}
- milestone: {"title": "...", "description": "..."}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        { role: 'user', content: transcript }
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude API error: ${response.status} — ${error}`)
  }

  const result = await response.json()
  // Claude returns content as an array of blocks — extract text from the first block
  const textContent = result.content[0]?.text
  if (!textContent) {
    throw new Error('Claude returned empty response')
  }

  // Parse Claude's JSON response — strip any accidental markdown fences
  const cleaned = textContent.replace(/```json\n?|```\n?/g, '').trim()
  return JSON.parse(cleaned)
}

// Main handler — orchestrates the voice routing pipeline
Deno.serve(async (req: Request) => {
  // Handle CORS preflight — MUST be first, before any other logic.
  // Browsers send OPTIONS before POST requests with custom headers.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let transcript: string

    // Determine input type: audio (FormData) or text (JSON)
    // Audio comes as multipart/form-data, text as application/json
    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      // Audio input — transcribe with Whisper first
      const formData = await req.formData()
      const audioFile = formData.get('audio')
      if (!audioFile || !(audioFile instanceof File)) {
        return new Response(
          JSON.stringify({ error: 'Chybí audio soubor' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      // Transcribe the audio using OpenAI Whisper
      transcript = await transcribeAudio(audioFile, audioFile.name || 'audio.mp4')
    } else {
      // Text input — use the text directly, skip Whisper
      const body = await req.json()
      if (!body.textInput || typeof body.textInput !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Chybí textový vstup' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      transcript = body.textInput
    }

    // Classify and extract structured data using Claude
    const classification = await classifyAndExtract(transcript)

    // Return the transcript + classification to the frontend
    return new Response(
      JSON.stringify({
        transcript,
        classification,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    // Log the error server-side for debugging
    console.error('Voice router error:', error)
    // Return a user-friendly error to the frontend
    return new Response(
      JSON.stringify({
        error: 'Chyba při zpracování',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
