'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DEFAULT_SETTINGS, Settings } from '@/lib/defaults';
import { X } from 'lucide-react';

const STORAGE_KEY = 'twinmind_settings';

interface SettingsCtx {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
    } catch {}
  }, []);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (!settings.groqApiKey) setShowSettings(true);
  }, [settings.groqApiKey]);

  return (
    <Ctx.Provider value={{ settings, updateSettings, showSettings, setShowSettings }}>
      {children}
      {showSettings && (
        <SettingsModal settings={settings} updateSettings={updateSettings} onClose={() => setShowSettings(false)} />
      )}
    </Ctx.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings must be within SettingsProvider');
  return ctx;
}

function SettingsModal({ settings, updateSettings, onClose }: {
  settings: Settings;
  updateSettings: (p: Partial<Settings>) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState(settings);
  const set = (k: keyof Settings, v: any) => setLocal(prev => ({ ...prev, [k]: v }));
  const save = () => { updateSettings(local); onClose(); };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2>Settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">Groq API Key *</label>
          <input className="form-input" type="password" placeholder="gsk_..."
            value={local.groqApiKey} onChange={e => set('groqApiKey', e.target.value)} />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            Get yours free at console.groq.com — stored in your browser only
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Suggestion Context (words)</label>
            <input className="form-input" type="number" value={local.suggestionContextWords}
              onChange={e => set('suggestionContextWords', parseInt(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Chat Context (words)</label>
            <input className="form-input" type="number" value={local.chatContextWords}
              onChange={e => set('chatContextWords', parseInt(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Refresh Interval (ms)</label>
            <input className="form-input" type="number" value={local.refreshIntervalMs}
              onChange={e => set('refreshIntervalMs', parseInt(e.target.value))} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Live Suggestions Prompt</label>
          <textarea className="form-textarea" rows={6} value={local.suggestionsPrompt}
            onChange={e => set('suggestionsPrompt', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Detailed Answer Prompt (on card click)</label>
          <textarea className="form-textarea" rows={5} value={local.detailPrompt}
            onChange={e => set('detailPrompt', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Chat Prompt</label>
          <textarea className="form-textarea" rows={4} value={local.chatPrompt}
            onChange={e => set('chatPrompt', e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}