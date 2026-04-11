import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Globe, Link, Plus } from 'lucide-react';

const normalizeServerInviteCode = (value) =>
  value?.toUpperCase().replace(/[\s-]+/g, '').trim() ?? '';

function formatServerFlowError(rawError, target) {
  if (rawError?.code === '42501') {
    return `Supabase пока не разрешает ${target}. Обычно это значит, что в базе ещё не применён свежий SQL для tables servers и server_members.`;
  }

  return rawError?.message || `Не удалось выполнить действие: ${target}.`;
}

export function ServerEntryModal({ currentUserId, onClose, onServerJoined }) {
  const [mode, setMode] = useState('choose');
  const [serverName, setServerName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate() {
    if (!serverName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const { data: server, error: serverError } = await supabase
        .from('servers')
        .insert({ name: serverName.trim(), owner_id: currentUserId })
        .select()
        .single();

      if (serverError) {
        throw new Error(formatServerFlowError(serverError, 'создание сервера'));
      }

      const { error: memberError } = await supabase
        .from('server_members')
        .insert({ server_id: server.id, user_id: currentUserId, role: 'owner' });

      if (memberError) {
        throw new Error(formatServerFlowError(memberError, 'добавление владельца'));
      }

      onServerJoined(server);
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const normalizedCode = normalizeServerInviteCode(inviteCode);
      const { data, error: rpcError } = await supabase.rpc('join_server_by_invite', {
        p_invite_code: normalizedCode
      });

      if (rpcError) {
        throw rpcError;
      }

      if (data?.error === 'not_found') {
        setError('Код не найден. Проверь правильность ввода.');
        return;
      }

      if (data?.error === 'already_member') {
        setError('Ты уже состоишь на этом сервере.');
        return;
      }

      onServerJoined(data);
      onClose();
    } catch (requestError) {
      setError(requestError.message || 'Не удалось войти по коду.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="rounded-[2.5rem] w-full max-w-sm shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-ds-border overflow-hidden animate-slide-up flex flex-col relative vibe-panel-strong">
        <div className="absolute top-0 inset-x-0 h-1 vibe-moving-glow opacity-30" />

        <div className="p-8 space-y-8">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue border border-ds-accent/20 mx-auto mb-4">
              <Globe size={32} />
            </div>
            <h2 className="text-ds-text font-black text-2xl uppercase tracking-tighter">VIBE</h2>
            <p className="text-[10px] text-ds-muted font-black uppercase tracking-[0.2em] mt-1">
              Создай или присоединись
            </p>
          </div>

          <div className="space-y-4">
            {mode === 'choose' && (
              <div className="flex flex-col gap-4 animate-fade-in">
                <button
                  onClick={() => {
                    setError(null);
                    setMode('create');
                  }}
                  className="group flex items-center gap-4 p-5 border border-ds-border hover:border-ds-accent/30 rounded-3xl transition-all vibe-panel"
                >
                  <div className="w-14 h-14 rounded-2xl bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue group-hover:scale-110 transition-transform">
                    <Plus size={28} strokeWidth={3} />
                  </div>
                  <div className="text-left">
                    <p className="text-ds-text font-black uppercase text-sm tracking-tight group-hover:text-ds-accent transition-colors">
                      Создать сервер
                    </p>
                    <p className="text-[10px] text-ds-muted font-black uppercase tracking-widest mt-0.5">
                      Собственное пространство
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setError(null);
                    setMode('join');
                  }}
                  className="group flex items-center gap-4 p-5 border border-ds-border hover:border-ds-accent/30 rounded-3xl transition-all vibe-panel"
                >
                  <div className="w-14 h-14 rounded-2xl bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue group-hover:scale-110 transition-transform">
                    <Link size={28} strokeWidth={3} />
                  </div>
                  <div className="text-left">
                    <p className="text-ds-text font-black uppercase text-sm tracking-tight group-hover:text-ds-accent transition-colors">
                      Войти по коду
                    </p>
                    <p className="text-[10px] text-ds-muted font-black uppercase tracking-widest mt-0.5">
                      Ключ от сообщества
                    </p>
                  </div>
                </button>
              </div>
            )}

            {mode === 'create' && (
              <div className="space-y-6 animate-fade-in">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-ds-muted uppercase tracking-[0.2em] ml-2">
                    Название
                  </p>
                  <input
                    type="text"
                    value={serverName}
                    onChange={(event) => setServerName(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && handleCreate()}
                    placeholder="Например: Вайб"
                    autoFocus
                    className="w-full border border-ds-border rounded-2xl px-5 py-4 text-ds-text text-sm font-bold placeholder-ds-muted/30 focus:border-ds-accent/30 transition-all outline-none vibe-panel"
                  />
                </div>

                {error && <p className="text-ds-red text-[10px] font-black uppercase text-center">{error}</p>}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setError(null);
                      setMode('choose');
                    }}
                    className="w-16 h-14 flex items-center justify-center border border-ds-border rounded-2xl text-ds-muted hover:text-ds-text transition-all vibe-panel"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={loading || !serverName.trim()}
                    className="flex-1 font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 vibe-primary-button"
                  >
                    {loading ? 'Создание...' : 'Создать сервер'}
                  </button>
                </div>
              </div>
            )}

            {mode === 'join' && (
              <div className="space-y-6 animate-fade-in">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-ds-muted uppercase tracking-[0.2em] ml-2">
                    Код приглашения
                  </p>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(normalizeServerInviteCode(event.target.value))}
                    onKeyDown={(event) => event.key === 'Enter' && handleJoin()}
                    placeholder="Например: OC9B806C"
                    autoFocus
                    spellCheck={false}
                    className="w-full border border-ds-border rounded-2xl px-5 py-4 text-ds-text text-sm font-black tracking-[0.18em] uppercase placeholder:tracking-normal focus:border-ds-accent/30 transition-all outline-none vibe-panel"
                  />
                </div>

                {error && <p className="text-ds-red text-[10px] font-black uppercase text-center">{error}</p>}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setError(null);
                      setMode('choose');
                    }}
                    className="w-16 h-14 flex items-center justify-center border border-ds-border rounded-2xl text-ds-muted hover:text-ds-text transition-all vibe-panel"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <button
                    onClick={handleJoin}
                    disabled={loading || !inviteCode.trim()}
                    className="flex-1 font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 vibe-primary-button"
                  >
                    {loading ? 'Подключение...' : 'Войти на сервер'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
