import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Модалка для создания нового сервера или вступления по коду.
 */
export function ServerEntryModal({ currentUserId, onClose, onServerJoined }) {
  const [mode, setMode] = useState('choose'); // 'choose' | 'create' | 'join'
  const [serverName, setServerName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate() {
    if (!serverName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Создаём сервер
      const { data: server, error: serverErr } = await supabase
        .from('servers')
        .insert({ name: serverName.trim(), owner_id: currentUserId })
        .select()
        .single();
      if (serverErr) throw serverErr;

      // 2. Добавляем создателя как владельца
      const { error: memberErr } = await supabase
        .from('server_members')
        .insert({ server_id: server.id, user_id: currentUserId, role: 'owner' });
      if (memberErr) throw memberErr;

      onServerJoined(server);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // Ищем сервер по коду
      const { data: server, error: findErr } = await supabase
        .from('servers')
        .select('*')
        .eq('invite_code', inviteCode.trim().toLowerCase())
        .single();
      if (findErr || !server) {
        setError('Сервер с таким кодом не найден.');
        setLoading(false);
        return;
      }

      // Добавляем участника
      const { error: memberErr } = await supabase
        .from('server_members')
        .insert({ server_id: server.id, user_id: currentUserId, role: 'member' });
      if (memberErr) {
        if (memberErr.code === '23505') {
          setError('Вы уже являетесь участником этого сервера.');
        } else {
          throw memberErr;
        }
        setLoading(false);
        return;
      }

      onServerJoined(server);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-ds-sidebar rounded-2xl w-full max-w-sm shadow-2xl border border-white/10 overflow-hidden animate-slide-up">

        {/* Кнопка закрытия */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <h2 className="text-ds-text font-bold text-xl">
            {mode === 'choose' ? 'Присоединиться к серверу' :
             mode === 'create' ? 'Создать сервер' : 'Войти по коду приглашения'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-ds-muted hover:text-ds-text hover:bg-ds-hover transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6">

          {/* Выбор режима */}
          {mode === 'choose' && (
            <div className="space-y-3 mt-4">
              <p className="text-ds-muted text-sm mb-5">Создай своё пространство или войди на уже существующий сервер.</p>

              <button
                onClick={() => setMode('create')}
                className="w-full flex items-center gap-4 p-4 bg-ds-bg hover:bg-ds-hover rounded-xl border border-ds-divider/50 hover:border-ds-accent transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-ds-accent/20 flex items-center justify-center group-hover:bg-ds-accent/30 transition-colors">
                  <svg className="w-6 h-6 text-ds-accent" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-ds-text font-semibold">Создать сервер</p>
                  <p className="text-ds-muted text-xs mt-0.5">Создай своё пространство для общения</p>
                </div>
              </button>

              <button
                onClick={() => setMode('join')}
                className="w-full flex items-center gap-4 p-4 bg-ds-bg hover:bg-ds-hover rounded-xl border border-ds-divider/50 hover:border-ds-green transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-ds-green/20 flex items-center justify-center group-hover:bg-ds-green/30 transition-colors">
                  <svg className="w-6 h-6 text-ds-green" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-ds-text font-semibold">Войти по коду</p>
                  <p className="text-ds-muted text-xs mt-0.5">Введи код от друга и присоединяйся</p>
                </div>
              </button>
            </div>
          )}

          {/* Создание сервера */}
          {mode === 'create' && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ds-muted uppercase tracking-wider mb-2">
                  Название сервера
                </label>
                <input
                  type="text"
                  value={serverName}
                  onChange={e => setServerName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="Мой крутой сервер"
                  maxLength={50}
                  autoFocus
                  className="w-full bg-ds-bg border border-ds-divider rounded-xl px-4 py-3 text-ds-text text-sm placeholder-ds-muted/50 focus:outline-none focus:border-ds-accent focus:ring-1 focus:ring-ds-accent transition-colors"
                />
              </div>
              {error && <p className="text-ds-red text-xs">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setMode('choose'); setError(null); }} className="flex-1 py-2.5 bg-ds-hover hover:bg-ds-divider text-ds-text text-sm font-semibold rounded-xl transition-colors">
                  Назад
                </button>
                <button
                  onClick={handleCreate}
                  disabled={loading || !serverName.trim()}
                  className="flex-1 py-2.5 bg-ds-accent hover:bg-ds-accent/90 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-ds-accent/20"
                >
                  {loading ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </div>
          )}

          {/* Вход по коду */}
          {mode === 'join' && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ds-muted uppercase tracking-wider mb-2">
                  Код приглашения
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  placeholder="a3f7d9bc"
                  maxLength={8}
                  autoFocus
                  className="w-full bg-ds-bg border border-ds-divider rounded-xl px-4 py-3 text-ds-text text-sm placeholder-ds-muted/50 focus:outline-none focus:border-ds-green focus:ring-1 focus:ring-ds-green transition-colors font-mono tracking-widest uppercase"
                />
              </div>
              {error && <p className="text-ds-red text-xs">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setMode('choose'); setError(null); }} className="flex-1 py-2.5 bg-ds-hover hover:bg-ds-divider text-ds-text text-sm font-semibold rounded-xl transition-colors">
                  Назад
                </button>
                <button
                  onClick={handleJoin}
                  disabled={loading || !inviteCode.trim()}
                  className="flex-1 py-2.5 bg-ds-green hover:bg-ds-green/90 text-black text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-ds-green/20"
                >
                  {loading ? 'Проверка...' : 'Войти'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
