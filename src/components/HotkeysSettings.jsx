import React, { useState, useEffect } from 'react';
import { Keyboard } from 'lucide-react';

export function HotkeysSettings() {
  const [muteKey, setMuteKey] = useState(() => localStorage.getItem('vibe_hotkey_mute') || '');
  const [deafenKey, setDeafenKey] = useState(() => localStorage.getItem('vibe_hotkey_deafen') || '');
  const [recordingTarget, setRecordingTarget] = useState(null);

  useEffect(() => {
    if (!recordingTarget) return;

    const handleKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      let keys = [];
      if (e.ctrlKey) keys.push('Control');
      if (e.shiftKey) keys.push('Shift');
      if (e.altKey) keys.push('Alt');
      if (e.metaKey) keys.push('Command');
      
      let finalKey = e.key.toUpperCase();
      if (finalKey === ' ') finalKey = 'Space';
      keys.push(finalKey);

      const accelerator = keys.join('+');
      
      if (recordingTarget === 'mute') {
        setMuteKey(accelerator);
        localStorage.setItem('vibe_hotkey_mute', accelerator);
      } else {
        setDeafenKey(accelerator);
        localStorage.setItem('vibe_hotkey_deafen', accelerator);
      }

      if (window.electronAPI) {
        window.electronAPI.registerHotkeys({ 
          mute: recordingTarget === 'mute' ? accelerator : muteKey, 
          deafen: recordingTarget === 'deafen' ? accelerator : deafenKey 
        });
      }
      setRecordingTarget(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recordingTarget, muteKey, deafenKey]);

  if (!window.electronAPI) return null;

  return (
    <section className="animate-fade-in border-t border-white/5 pt-12">
      <div className="space-y-6">
        <h3 className="text-[11px] font-black text-ds-muted uppercase tracking-[0.3em] flex items-center gap-2">
          Глобальные горячие клавиши
          <span className="px-1.5 py-0.5 rounded-full bg-ds-accent/10 text-ds-accent text-[8px] border border-ds-accent/20 tracking-normal">Desktop Exclusive</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-6 bg-black/40 rounded-[2rem] border border-white/5 space-y-4">
            <p className="text-[10px] font-black text-ds-muted uppercase tracking-widest text-center">Выключение микрофона</p>
            <button
              onClick={() => setRecordingTarget('mute')}
              className={`w-full py-4 rounded-2xl border-2 border-dashed transition-all font-black text-lg ${
                recordingTarget === 'mute' 
                ? 'border-ds-accent bg-ds-accent/10 text-ds-accent animate-pulse' 
                : 'border-white/10 hover:border-white/20 text-ds-text'
              }`}
            >
              {recordingTarget === 'mute' ? 'НАЖМИ КЛАВИШУ...' : (muteKey || 'НЕ НАЗНАЧЕНО')}
            </button>
          </div>

          <div className="p-6 bg-black/40 rounded-[2rem] border border-white/5 space-y-4">
            <p className="text-[10px] font-black text-ds-muted uppercase tracking-widest text-center">Выключение звука</p>
            <button
              onClick={() => setRecordingTarget('deafen')}
              className={`w-full py-4 rounded-2xl border-2 border-dashed transition-all font-black text-lg ${
                recordingTarget === 'deafen' 
                ? 'border-ds-accent bg-ds-accent/10 text-ds-accent animate-pulse' 
                : 'border-white/10 hover:border-white/20 text-ds-text'
              }`}
            >
              {recordingTarget === 'deafen' ? 'НАЖМИ КЛАВИШУ...' : (deafenKey || 'НЕ НАЗНАЧЕНО')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
