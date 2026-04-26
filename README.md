# TwinMind Live Suggestions

Live demo: https://twinmind-app-gules.vercel.app

---

## What it does

Three-column meeting copilot. Left column transcribes everything you say in real time. Middle column surfaces 3 suggestions every 30 seconds based on what's actually being discussed. Right column is a chat panel — click a suggestion for a deep-dive, or just type a question directly.

The hard part isn't the plumbing. It's knowing what to surface and when. That's what I focused on.

---

## Running it locally

```bash
npm install
npm run dev
```

Open localhost:3000, go to Settings, paste a Groq API key (free at console.groq.com). Click the mic and start talking.

---

## Stack

- **Next.js 14** — API routes live next to the frontend, one-command Vercel deploy
- **Groq Whisper Large V3** — transcription. Fast enough that 30s chunks feel responsive
- **openai/gpt-oss-120b on Groq** — suggestions and chat. Strong reasoning, low latency
- **Custom CSS** — DM Mono + Syne. Kept it simple, no component library

---

## How the suggestion system works

This is the part I spent the most time on.

Each refresh, the model sees the last 400 words of transcript (roughly 2 minutes of speech). I intentionally don't send the full transcript — older context dilutes what's actually relevant right now. If someone mentioned something important 10 minutes ago, that's not what they need help with in this moment.

The model picks from 5 suggestion types:

- **question** — something was glossed over and deserves a follow-up
- **answer** — someone just asked something and the model can answer it
- **fact** — a specific claim or number was stated that should be verified or remembered
- **point** — a key angle is being missed, worth raising before the conversation moves on
- **clarify** — something vague that could cause problems later if not addressed

The important thing is the model isn't forced to use all 5 types or distribute them evenly. If the best response to this moment is 2 answers and 1 question, that's what it returns. Forcing variety for its own sake produces worse suggestions.

I also put a hard constraint on the preview text: it has to be useful even if the user never clicks. The card itself should deliver value. Clicking just gives more detail.

JSON mode is used for suggestions so the output is always parseable without any string manipulation.

---

## Prompt decisions I'd defend

**400 words for suggestions, 1500 for chat** — suggestions need recency, chat needs completeness. These are different tasks and deserve different context windows.

**Temperature 0.6 for suggestions** — low enough to stay grounded in what was actually said, high enough to occasionally surface a non-obvious angle.

**Temperature 0.5 for chat** — more reliable for factual Q&A where the user wants a straight answer.

**SSE streaming for chat** — the first token shows up fast even if the full response takes a couple seconds. Feels much more responsive than waiting for the complete answer.

**30s audio chunks** — shorter chunks mean more transcription requests with more overhead between them. 30s hits the right balance between freshness and efficiency.

---

## File structure

```
app/
  page.tsx                  — the whole UI (transcript, suggestions, chat)
  providers.tsx             — wraps the app in settings context
  api/
    transcribe/route.ts     — receives audio, sends to Groq Whisper
    suggestions/route.ts    — sends transcript, gets back 3 suggestions
    chat/route.ts           — streaming chat responses via SSE
components/
  SettingsProvider.tsx      — settings modal + localStorage persistence
  useAudioRecorder.ts       — MediaRecorder hook, handles 30s chunking
lib/
  defaults.ts               — all prompts and default values in one place
```

---

## Settings

Everything is editable in-app — prompts, context window sizes, refresh interval. The defaults are what I found work best. Changes persist to localStorage so they survive page refreshes.

---

## What I'd improve with more time

The summary field in the suggestion prompt currently only kicks in after 10+ transcript chunks. A proper rolling summary that compresses older context would make suggestions smarter in longer meetings without blowing up the context window.

I'd also add speaker diarization — knowing who said what would let the suggestions be much more targeted (e.g. "the other person just asked X, here's how to answer it" vs just detecting that a question was asked).