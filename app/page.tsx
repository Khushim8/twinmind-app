'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, RefreshCw, Settings, Download, Send } from 'lucide-react';
import { useSettings } from '@/components/SettingsProvider';
import { useAudioRecorder, TranscriptChunk } from '@/components/useAudioRecorder';

type SuggestionType = 'question' | 'answer' | 'fact' | 'point' | 'clarify';

interface Suggestion {
  type: SuggestionType;
  preview: string;
  title: string;
}

interface SuggestionBatch {
  id: string;
  suggestions: Suggestion[];
  timestamp: Date;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

function getWords(chunks: TranscriptChunk[], maxWords: number): string {
  const full = chunks.map(c => c.text).join(' ');
  const words = full.trim().split(/\s+/).filter(Boolean);
  return words.slice(-maxWords).join(' ');
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const TYPE_META: Record<SuggestionType, { label: string; color: string }> = {
  question: { label: '❓ Question to Ask',     color: 'var(--accent)' },
  answer:   { label: '💡 Answer Available',    color: 'var(--accent2)' },
  fact:     { label: '📌 Fact Check',          color: 'var(--accent3)' },
  point:    { label: '🎯 Talking Point',        color: '#f59e0b' },
  clarify:  { label: '🔍 Needs Clarification', color: '#a78bfa' },
};

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^• (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^(.+)$/, '<p>$1</p>');
}

async function streamChat(
  messages: { role: string; content: string }[],
  transcript: string,
  systemPrompt: string,
  apiKey: string,
  onDelta: (delta: string) => void,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, transcript, systemPrompt, apiKey }),
  });
  if (!res.ok) throw new Error(`Chat API error: ${res.status}`);
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) return;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try { const { delta } = JSON.parse(line.slice(6)); if (delta) onDelta(delta); } catch {}
      }
    }
  }
}

export default function App() {
  const { settings, setShowSettings } = useSettings();

  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const [batches, setBatches] = useState<SuggestionBatch[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [nextRefreshIn, setNextRefreshIn] = useState<number | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<TranscriptChunk[]>([]);
  chunksRef.current = transcriptChunks;
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  chatMessagesRef.current = chatMessages;
  const forceFlushRef = useRef<() => void>(() => {});

  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcriptChunks]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const fetchSuggestions = useCallback(async () => {
    if (!settings.groqApiKey || chunksRef.current.length === 0) return;
    setLoadingSuggestions(true);
    try {
      const transcript = getWords(chunksRef.current, settings.suggestionContextWords);
      const summary = chunksRef.current.length > 10 ? getWords(chunksRef.current.slice(0, -5), 200) : '';
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, summary, prompt: settings.suggestionsPrompt, apiKey: settings.groqApiKey }),
      });
      const data = await res.json();
      if (data.suggestions?.length) {
        setBatches(prev => [{ id: crypto.randomUUID(), suggestions: data.suggestions.slice(0, 3), timestamp: new Date() }, ...prev]);
      }
    } catch (e) { console.error('Suggestions error:', e); }
    finally { setLoadingSuggestions(false); }
  }, [settings]);

  const startAutoRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    const ms = settings.refreshIntervalMs;
    let remaining = Math.round(ms / 1000);
    setNextRefreshIn(remaining);
    countdownRef.current = setInterval(() => { remaining = Math.max(0, remaining - 1); setNextRefreshIn(remaining); }, 1000);
    refreshTimerRef.current = setInterval(() => {
      forceFlushRef.current();
      fetchSuggestions();
      remaining = Math.round(ms / 1000);
      setNextRefreshIn(remaining);
    }, ms);
  }, [settings.refreshIntervalMs, fetchSuggestions]);

  const stopAutoRefresh = useCallback(() => {
    if (refreshTimerRef.current) { clearInterval(refreshTimerRef.current); refreshTimerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setNextRefreshIn(null);
  }, []);

  const handleNewChunk = useCallback((chunk: TranscriptChunk) => {
    setTranscriptChunks(prev => [...prev, chunk]);
  }, []);

  const { isRecording, isTranscribing, error: micError, start, stop, forceFlush } = useAudioRecorder(settings.groqApiKey, handleNewChunk);
  useEffect(() => { forceFlushRef.current = forceFlush; }, [forceFlush]);

  const toggleMic = async () => {
    if (isRecording) { stop(); stopAutoRefresh(); }
    else { await start(); startAutoRefresh(); }
  };

  const handleManualRefresh = () => { forceFlush(); fetchSuggestions(); startAutoRefresh(); };

  const appendStreamingMessage = useCallback((userContent: string, systemPrompt: string) => {
    if (!settings.groqApiKey || chatSending) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: userContent, timestamp: new Date() };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), streaming: true };
    setChatMessages(prev => [...prev, userMsg, assistantMsg]);
    setChatSending(true);
    const history = [...chatMessagesRef.current, userMsg].map(m => ({ role: m.role, content: m.content }));
    const transcript = getWords(chunksRef.current, settings.chatContextWords);
    streamChat(history, transcript, systemPrompt, settings.groqApiKey, delta => {
      setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + delta } : m));
    })
      .catch(() => { setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: 'Something went wrong. Please try again.', streaming: false } : m)); })
      .finally(() => {
        setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m));
        setChatSending(false);
      });
  }, [settings, chatSending]);

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    appendStreamingMessage(text, settings.chatPrompt);
  };

  const handleSuggestionClick = (s: Suggestion) => {
    const detailSystemPrompt = settings.detailPrompt
      .replace('{suggestionType}', s.type)
      .replace('{suggestionTitle}', s.title)
      .replace('{suggestionPreview}', s.preview);
    const displayText = `**[${TYPE_META[s.type].label}]** ${s.title}\n\n${s.preview}`;
    appendStreamingMessage(displayText, detailSystemPrompt);
  };

  const exportSession = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      transcript: transcriptChunks.map(c => ({ timestamp: c.timestamp.toISOString(), text: c.text })),
      suggestionBatches: batches.map(b => ({ timestamp: b.timestamp.toISOString(), suggestions: b.suggestions })),
      chat: chatMessages.map(m => ({ role: m.role, timestamp: m.timestamp.toISOString(), content: m.content })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twinmind-session-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-grid">

      {/* LEFT: Transcript */}
      <div className="col">
        <div className="col-header">
          <h2>Transcript</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isTranscribing && <span style={{ fontSize: 10, color: 'var(--accent2)' }}>transcribing…</span>}
            {isRecording && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--accent3)' }}>
                <span className="recording-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent3)', display: 'inline-block' }} />
                REC
              </span>
            )}
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setShowSettings(true)}>
              <Settings size={12} style={{ display: 'inline', marginRight: 4 }} />
              Settings
            </button>
          </div>
        </div>

        <div className="col-body">
          {transcriptChunks.length === 0
            ? <div className="empty-state">Click the mic below to start.<br />Transcript chunks appear every ~30s.</div>
            : transcriptChunks.map(chunk => (
              <div key={chunk.id} className="transcript-chunk">
                <div className="transcript-meta">{formatTime(chunk.timestamp)}</div>
                {chunk.text}
              </div>
            ))}
          <div ref={transcriptEndRef} />
        </div>

        <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            {isRecording && (
              <span className="pulse-ring" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--accent)', pointerEvents: 'none' }} />
            )}
            <button className={`mic-btn ${isRecording ? 'recording' : ''}`} onClick={toggleMic}>
              {isRecording ? <MicOff size={22} style={{ color: 'var(--accent3)' }} /> : <Mic size={22} style={{ color: 'var(--text-muted)' }} />}
            </button>
          </div>
        </div>

        {micError && <div className="status-bar" style={{ color: 'var(--accent3)', borderTop: '1px solid var(--border)' }}>⚠ {micError}</div>}

        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11 }} onClick={exportSession}>
            <Download size={11} style={{ display: 'inline', marginRight: 4 }} />
            Export Session (JSON)
          </button>
        </div>
      </div>

      {/* MIDDLE: Live Suggestions */}
      <div className="col">
        <div className="col-header">
          <h2>Live Suggestions</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {nextRefreshIn !== null && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{nextRefreshIn}s</span>
            )}
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={handleManualRefresh} disabled={loadingSuggestions}>
              <RefreshCw size={11} style={{ display: 'inline', marginRight: 4 }} />
              {loadingSuggestions ? 'Thinking…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="col-body">
          {batches.length === 0
            ? <div className="empty-state">{isRecording ? `Suggestions auto-refresh every ${settings.refreshIntervalMs / 1000}s.\nClick Refresh for immediate results.` : 'Start recording to get live suggestions.'}</div>
            : batches.map((batch, bi) => (
              <div key={batch.id} className={`suggestion-batch ${bi === 0 ? 'suggestion-enter' : ''}`}>
                <div className="batch-label">{formatTime(batch.timestamp)}</div>
                {batch.suggestions.map((s, si) => {
                  const meta = TYPE_META[s.type] ?? { label: s.type, color: 'var(--text-muted)' };
                  return (
                    <div key={si} className={`suggestion-card type-${s.type}`} onClick={() => handleSuggestionClick(s)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && handleSuggestionClick(s)}>
                      <div className="suggestion-type" style={{ color: meta.color }}>{meta.label}</div>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, fontFamily: 'Syne, sans-serif' }}>{s.title}</div>
                      <div className="suggestion-preview">{s.preview}</div>
                      <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>Click for detailed answer →</div>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
      </div>

      {/* RIGHT: Chat */}
      <div className="col">
        <div className="col-header">
          <h2>Chat</h2>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{chatMessages.length} message{chatMessages.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="col-body">
          {chatMessages.length === 0
            ? <div className="empty-state">Click any suggestion for a detailed answer,<br />or type a question about the conversation.</div>
            : chatMessages.map(msg => (
              <div key={msg.id} className={`chat-message ${msg.role}`}>
                <div className={`chat-bubble ${msg.role} ${msg.streaming ? 'streaming-cursor' : ''}`}>
                  {msg.role === 'assistant'
                    ? <div style={{ fontSize: 12, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: msg.content ? renderMarkdown(msg.content) : '' }} />
                    : <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.content}</div>}
                  {!msg.streaming && (
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                      {formatTime(msg.timestamp)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-row">
          <textarea
            className="chat-input"
            placeholder="Ask anything about this conversation… (Enter to send)"
            rows={2}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
            disabled={chatSending}
          />
          <button className="btn btn-primary" onClick={sendChat} disabled={!chatInput.trim() || chatSending} style={{ alignSelf: 'flex-end' }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}