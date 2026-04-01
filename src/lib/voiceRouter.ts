export interface VoiceRouterRequest {
  audioBlob?: Blob
  textInput?: string
}

export interface TaskData {
  title: string
  description?: string
  assigned_to: 'romi' | 'petr' | 'both'
  deadline?: string
}

export interface NoteData {
  text: string
  category: 'idea' | 'trip' | 'kids' | 'personal' | 'project' | 'other'
}

export interface PlaceData {
  name: string
  address?: string
  tags: string[]
  notes?: string
  source: 'instagram' | 'friend' | 'web' | 'own_experience'
}

export interface VoiceRouterResponse {
  transcript: string
  classification: {
    target: 'task' | 'note' | 'place' | 'milestone'
    confidence: number
    data: TaskData | NoteData | PlaceData
  }
}

// Send input to the voice-router Supabase Edge Function
// For audio: sends as multipart/form-data (the Edge Function runs Whisper transcription)
// For text: sends as JSON (Edge Function skips Whisper, goes straight to Claude)
export async function sendToVoiceRouter(
  request: VoiceRouterRequest,
): Promise<VoiceRouterResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const functionUrl = `${supabaseUrl}/functions/v1/voice-router`

  let response: Response

  if (request.audioBlob) {
    // Audio input — send as FormData so the Edge Function can forward to Whisper.
    // FormData lets the browser set multipart boundaries; a manual Content-Type would break uploads.
    const formData = new FormData()
    // Use the correct file extension based on the audio MIME type
    const extension = request.audioBlob.type.includes('mp4') ? 'mp4' : 'webm'
    formData.append('audio', request.audioBlob, `recording.${extension}`)

    response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      // Don't set Content-Type manually — browser sets it with boundary for FormData
      body: formData,
    })
  } else if (request.textInput) {
    // Text input — send as JSON, Edge Function skips Whisper
    response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ textInput: request.textInput }),
    })
  } else {
    throw new Error('No audio or text input provided')
  }

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({
      error: 'Unknown error',
    }))) as { error?: string }
    throw new Error(errorData.error ?? `Edge Function error: ${response.status}`)
  }

  const data = await response.json()
  return data as VoiceRouterResponse
}
