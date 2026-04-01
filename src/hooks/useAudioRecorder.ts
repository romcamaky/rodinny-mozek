import { useCallback, useEffect, useRef, useState } from 'react'

const MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return ''
  }

  // Safari on iOS prefers MP4/AAC, while Chromium browsers typically use WebM/Opus.
  for (const mimeType of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }

  return ''
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const durationTimerRef = useRef<number | null>(null)

  const stopTimer = useCallback(() => {
    if (durationTimerRef.current) {
      window.clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }
  }, [])

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const resetState = useCallback(() => {
    setAudioBlob(null)
    setError(null)
    setRecordingDuration(0)
    chunksRef.current = []
  }, [])

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Tento prohlížeč nepodporuje nahrávání zvuku.')
      return
    }

    resetState()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = getSupportedMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setError('Nahrávání selhalo. Zkus to prosím znovu.')
      }

      recorder.onstop = () => {
        stopTimer()

        const type = mimeType || chunksRef.current[0]?.type || 'audio/mp4'
        if (chunksRef.current.length > 0) {
          setAudioBlob(new Blob(chunksRef.current, { type }))
        }

        stopTracks()
        setIsRecording(false)
      }

      recorder.start()
      setIsRecording(true)
      setRecordingDuration(0)
      durationTimerRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      stopTracks()

      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Mikrofon je zablokovaný. Povol přístup v nastavení prohlížeče.')
        return
      }

      if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('Mikrofon nebyl nalezen.')
        return
      }

      setError('Nepodařilo se spustit nahrávání.')
    }
  }, [resetState, stopTimer, stopTracks])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder) {
      return
    }

    if (recorder.state !== 'inactive') {
      recorder.stop()
    }
  }, [])

  useEffect(() => {
    return () => {
      stopTimer()
      stopTracks()
    }
  }, [stopTimer, stopTracks])

  return {
    isRecording,
    startRecording,
    stopRecording,
    audioBlob,
    error,
    recordingDuration,
  }
}
