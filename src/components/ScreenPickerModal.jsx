import React, { useState, useEffect } from 'react';
import { Monitor, X } from 'lucide-react';

/**
 * Модальное окно выбора экрана или окна для трансляции (только для Electron).
 * Показывает сетку превью всех доступных источников.
 */
export function ScreenPickerModal({ onClose, onSelect }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('window'); // 'window' | 'screen'

  useEffect(() => {
    async function fetchSources() {
      if (window.electronAPI?.getDesktopSources) {
        try {
          const s = await window.electronAPI.getDesktopSources();
          setSources(s);
        } catch (err) {
          console.error('Failed to fetch desktop sources:', err);
        } finally {
          setLoading(false);
        }
      }
    }
    fetchSources();

    // Обновляем список каждые 5 секунд, пока открыто окно
    const interval = setInterval(fetchSources, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredSources = sources.filter(s => {
    if (tab === 'window') return s.id.startsWith('window:');
    if (tab === 'screen') return s.id.startsWith('screen:');
    return true;
  });

  const [withAudio, setWithAudio] = useState(true);

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-ds-sidebar rounded-2xl w-full max-w-3xl h-[600px] flex flex-col shadow-2xl border border-white/10 overflow-hidden animate-slide-up">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-ds-divider/50 flex items-center justify-between bg-ds-servers/50">
          <div>
            <h2 className="text-ds-text font-bold text-xl">Выберите что транслировать</h2>
            <p className="text-ds-muted text-xs mt-0.5">Выберите окно приложения или весь экран</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-ds-muted hover:text-ds-text hover:bg-white/10 transition-all"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-4 gap-6 bg-ds-servers/30">
          <button 
            onClick={() => setTab('window')}
            className={`pb-3 text-sm font-bold transition-all border-b-2 ${
              tab === 'window' ? 'text-ds-accent border-ds-accent' : 'text-ds-muted border-transparent hover:text-ds-text'
            }`}
          >
            Приложения
          </button>
          <button 
            onClick={() => setTab('screen')}
            className={`pb-3 text-sm font-bold transition-all border-b-2 ${
              tab === 'screen' ? 'text-ds-accent border-ds-accent' : 'text-ds-muted border-transparent hover:text-ds-text'
            }`}
          >
            Экраны
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {loading ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-ds-muted">
              <div className="w-8 h-8 border-4 border-ds-accent/30 border-t-ds-accent rounded-full animate-spin" />
              <p className="text-sm font-medium">Загрузка окон...</p>
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-ds-muted gap-2 opacity-50">
              <svg className="w-16 h-16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Источники не найдены</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {filteredSources.map(source => (
                <button
                  key={source.id}
                  onClick={() => onSelect(source.id, withAudio)}
                  className="group flex flex-col bg-ds-servers/50 rounded-xl overflow-hidden hover:ring-2 hover:ring-ds-accent transition-all animate-fade-in"
                >
                  <div className="w-full h-[130px] shrink-0 bg-ds-input flex items-center justify-center overflow-hidden border-b border-white/5 relative">
                    {source.thumbnail ? (
                      <img 
                        src={source.thumbnail} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 block" 
                        alt=""
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 opacity-20 group-hover:opacity-40 transition-opacity">
                         {source.appIcon ? (
                           <img src={source.appIcon} className="w-12 h-12" alt="" />
                         ) : (
                           <Monitor size={32} />
                         )}
                      </div>
                    )}
                    
                    {/* Fallback overlay if thumbnail is just a black placeholder */}
                    {!source.thumbnail && source.appIcon && (
                      <div className="absolute inset-0 flex items-center justify-center bg-ds-bg/60 backdrop-blur-sm z-10">
                         <img src={source.appIcon} className="w-12 h-12 shadow-2xl" alt="" />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-black/0 group-hover:bg-ds-accent/5 transition-colors" />
                  </div>
                  {/* Footer */}
                  <div className="p-3 flex items-center gap-2 text-left bg-ds-bg/40">
                    {source.appIcon && (
                      <img src={source.appIcon} className="w-4 h-4 rounded-sm flex-shrink-0" alt="" />
                    )}
                    <span className="text-ds-text text-[11px] font-semibold truncate leading-tight flex-1">
                      {source.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-ds-bg/50 border-t border-white/5 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer group">
            <div className="relative flex items-center">
              <input 
                type="checkbox" 
                checked={withAudio}
                onChange={e => setWithAudio(e.target.checked)}
                className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-ds-divider bg-ds-servers transition-all checked:bg-ds-accent checked:border-ds-accent"
              />
              <svg className="absolute w-4 h-4 text-white pointer-events-none hidden peer-checked:block left-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <span className="text-sm font-semibold text-ds-muted group-hover:text-ds-text transition-colors">
              Транслировать системный звук
            </span>
          </label>
          <div className="flex gap-4">
            <button 
              onClick={onClose}
              className="px-6 py-2 text-sm font-bold text-ds-text hover:underline transition-all"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
