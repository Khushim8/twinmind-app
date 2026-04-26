import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'openai/gpt-oss-120b';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, summary, prompt, apiKey } = body;
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 400 });
    if (!transcript?.trim()) return NextResponse.json({ suggestions: [] });

    const groq = new Groq({ apiKey });
    const filledPrompt = prompt
      .replace('{transcript}', transcript)
      .replace('{summary}', summary || 'No prior context.');

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: filledPrompt }],
      max_tokens: 800,
      temperature: 0.6,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    return NextResponse.json({ suggestions: parsed.suggestions || [] });
  } catch (err: any) {
    console.error('Suggestions error:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}