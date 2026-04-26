import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioBlob = formData.get('audio') as Blob;
    const apiKey = formData.get('apiKey') as string;

    if (!audioBlob || !apiKey) {
      return NextResponse.json({ error: 'Missing audio or apiKey' }, { status: 400 });
    }

    const groqForm = new FormData();
    const audioFile = new File([audioBlob], 'audio.webm', {
      type: audioBlob.type || 'audio/webm',
    });
    groqForm.append('file', audioFile);
    groqForm.append('model', 'whisper-large-v3');
    groqForm.append('response_format', 'json');
    groqForm.append('language', 'en');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: groqForm,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Groq transcribe error:', err);
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text || '' });
  } catch (err: any) {
    console.error('Transcription error:', err);
    return NextResponse.json({ error: err?.message || 'Transcription failed' }, { status: 500 });
  }
}