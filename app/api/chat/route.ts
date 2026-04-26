import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'openai/gpt-oss-120b';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messages, transcript, systemPrompt, apiKey } = body as {
    messages: { role: string; content: string }[];
    transcript: string;
    systemPrompt: string;
    apiKey: string;
  };

  if (!apiKey) return new Response('apiKey required', { status: 400 });

  const groq = new Groq({ apiKey });
  const filledSystem = systemPrompt.replace('{transcript}', transcript || 'No transcript yet.');

  const stream = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: filledSystem },
      ...(messages as { role: 'user' | 'assistant'; content: string }[]),
    ],
    max_tokens: 1200,
    temperature: 0.5,
    stream: true,
  });

  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (e) { controller.error(e); }
        finally { controller.close(); }
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } }
  );
}