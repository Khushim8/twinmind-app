'use client';

import { useRef, useState, useCallback } from 'react';

export interface TranscriptChunk {
  id: string;
  text: string;
  timestamp: Date;
}

const SUPPORTED_MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];

function getSupportedMimeType(): string {
  return SUPPORTED_MIME.find(m => MediaRecorder.isTypeSupported(m)) ?? '';
}

export function useAudioRecorder(
  apiKey: string,
  onChunk: (chunk: TranscriptChunk) => void
) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const blobPartsRef = useRef<Blob[]>([]);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(false);
  const mimeTypeRef = useRef('');
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  const transcribeBlob = useCallback(async (blob: Blob) => {
    if (blob.size < 2000) return;
    setIsTranscribing(true);
    try {
      const ext = mimeTypeRef.current.includes('ogg') ? 'ogg'
        : mimeTypeRef.current.includes('mp4') ? 'mp4' : 'webm';
      const form = new FormData();
      form.append('audio', blob, `chunk.${ext}`);
      form.append('apiKey', apiKey);
      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.text?.trim()) {
        onChunkRef.current({ id: crypto.randomUUID(), text: data.text.trim(), timestamp: new Date() });
      }
    } catch (e) {
      console.error('[Transcribe] error:', e);
    } finally {
      setIsTranscribing(false);
    }
  }, [apiKey]);

  const startFreshRecorder = useCallback((stream: MediaStream) => {
    const mimeType = mimeTypeRef.current;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    blobPartsRef.current = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) blobPartsRef.current.push(e.data); };
    recorder.start(1000);
    recorderRef.current = recorder;
  }, []);

  const rotateSegment = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    const mimeType = mimeTypeRef.current;
    const parts = blobPartsRef.current.slice();
    blobPartsRef.current = [];
    recorder.onstop = () => {
      transcribeBlob(new Blob(parts, { type: mimeType || 'audio/webm' }));
      if (activeRef.current && streamRef.current) startFreshRecorder(streamRef.current);
    };
    recorder.stop();
  }, [transcribeBlob, startFreshRecorder]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      mimeTypeRef.current = getSupportedMimeType();
      streamRef.current = stream;
      activeRef.current = true;
      startFreshRecorder(stream);
      chunkIntervalRef.current = setInterval(rotateSegment, 30_000);
      setIsRecording(true);
    } catch (e: any) {
      setError(e?.message ?? 'Microphone access denied');
    }
  }, [startFreshRecorder, rotateSegment]);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (chunkIntervalRef.current) { clearInterval(chunkIntervalRef.current); chunkIntervalRef.current = null; }
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      const mimeType = mimeTypeRef.current;
      const parts = blobPartsRef.current.slice();
      blobPartsRef.current = [];
      recorder.onstop = () => { if (parts.length) transcribeBlob(new Blob(parts, { type: mimeType || 'audio/webm' })); };
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }, [transcribeBlob]);

  const forceFlush = useCallback(() => {
    if (activeRef.current) rotateSegment();
  }, [rotateSegment]);

  return { isRecording, isTranscribing, error, start, stop, forceFlush };
}