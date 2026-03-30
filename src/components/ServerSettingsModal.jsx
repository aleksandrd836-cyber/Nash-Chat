import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getUserAvatar } from '../lib/avatar';

/**
 * Надёжная функция копирования — работает и в браузере, и в Electron
 */
function copyToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  } else {
    legacyCopy(text);
  }
}

function legacyCopy(text) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  el.style.top = '-9999px';
  document.body.appendChild(el);
  el.focus();
  el.select();
  try { document.execCommand('copy'); } catch (e) { console.error('copy failed', e); }
  document.body.removeChild(el);
}

export function ServerSettingsModal({ server, currentUserId, onClose, onServerDeleted }) {
  const [members, setMembers]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [copied, setCopied]           = useState(false);
  const [serverName, setServerName]   = useState(server.name);
  const [savingName, setSavingName]   = useState(false);
  // Свой state для кода — не мутируем props
  const [inviteCode, setInviteCode]   = useState(server.invite_code || '');
  const [codeLoading, setCodeLoading] = useState(!server.invite_code);

  // Если код не пришёл через props — загружаем из БД
  useEffect(() => {
    if (!server.invite_code) {
      supabase
        .from('servers')
        .select('invite_code')
        .eq('id', server.id)
        .single()
        .then(({ data }) => {
          if (data?.invite_code) setInviteCode(data.invite_code);
          setCodeLoading(false);
        });
    }
  }, [server.id, server.invite_code]);

  const fetchMembers = useCallback(async () => {
    const { data, error } = await supabase
      .from('server_members')
      .select('user_id, role, joined_at, profiles(id, username, color)')
      .eq('server_id', server.id);
    if (!error && data) {
      setMembers(data.map(m => ({ ...m.profiles, role: m.role, joined_at: m.joined_at })));
    }
    setLoading(false);
  }, [server.id]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  async function handleKickMember(userId) {
    if (!window.confirm('Удалить этого участника с сервера?')) return;
    await supabase
      .from('server_members')
      .delete()
      .eq('server_id', server.id)
      .eq('user_id', userId);
    setMembers(prev => prev.filter(m => m.id !== userId));
  }

  async function handleRegenerateCode() {
    if (!window.confirm('Сгенерировать новый код? Старый перестанет работать.')) return;
    const newCode = Math.random().toString(36).substring(2, 10);
    const { error } = await supabase
      .from('servers')
      .update({ invite_code: newCode })
      .eq('id', server.id);
    if (!error) {
      setInviteCode(newCode);
      setCopied(false);
    }
  }

  async function handleSaveName() {
    if (!serverName.trim() || serverName === server.name) return;
    setSavingName(true);
    const { error } = await supabase
      .from('servers')
      .update({ name: serverName.trim() })
      .eq('id', server.id);
    if (!error) server.name = serverName.trim();
    setSavingName(false);
  }

  async function handleDeleteServer() {
    if (!window.confirm(`Удалить сервер «${server.name}»? Это удалит ВСЕ каналы и историю. Нельзя отменить!`)) return;
    await supabase.from('servers').delete().eq('id', server.id);
    onServerDeleted();
    onClose();
  }

  function handleCopy() {
    if (!inviteCode) return;
    copyToClipboard(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-ds-sidebar rounded-2xl w-full max-w-md shadow-2xl border border-white/10 overflow-hidden animate-slide-up">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ds-divider/50">
          <h2 className="text-ds-text font-bold text-lg">Управление сервером</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-ds-muted hover:text-ds-text hover:bg-ds-hover transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto max-h-[80vh] p-6 space-y-6">

          {/* Название */}
          <section>
            <h3 className="text-xs font-semibold text-ds-muted uppercase tracking-wider mb-3">Название сервера</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={serverName}
                onChange={e => setServerName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                className="flex-1 bg-ds-bg border border-ds-divider rounded-lg px-3 py-2 text-ds-text text-sm focus:outline-none focus:border-ds-accent focus:ring-1 focus:ring-ds-accent transition-colors"
              />
              <button
                onClick={handleSaveName}
                disabled={savingName || !serverName.trim() || serverName === server.name}
                className="px-4 py-2 bg-ds-accent hover:bg-ds-accent/90 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-40"
              >
                {savingName ? '...' : 'Сохранить'}
              </button>
            </div>
          </section>

          {/* Инвайт-код */}
          <section>
            <h3 className="text-xs font-semibold text-ds-muted uppercase tracking-wider mb-3">Код приглашения</h3>
            <div className="bg-ds-bg border border-ds-divider/50 rounded-xl p-4">
              {codeLoading ? (
                <div className="flex items-center justify-center py-3">
                  <div className="w-5 h-5 border-2 border-ds-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <code className="flex-1 text-2xl font-mono font-bold text-ds-accent tracking-widest uppercase text-center select-all bg-ds-hover/50 rounded-lg px-3 py-2">
                      {inviteCode || '—'}
                    </code>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopy}
                      disabled={!inviteCode}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                        copied
                          ? 'bg-ds-green/20 text-ds-green border border-ds-green/30'
                          : 'bg-ds-hover hover:bg-ds-divider text-ds-text border border-transparent'
                      } disabled:opacity-40`}
                    >
                      {copied ? '✓ Скопировано!' : '📋 Скопировать'}
                    </button>
                    <button
                      onClick={handleRegenerateCode}
                      className="px-3 py-2 bg-ds-hover hover:bg-ds-divider text-ds-muted text-sm font-semibold rounded-lg transition-colors border border-transparent"
                    >
                      🔄 Обновить
                    </button>
                  </div>
                  <p className="text-ds-muted text-xs mt-3 text-center">
                    Отправь этот код другу — он введёт его, нажав «+» в левой панели.
                  </p>
                </>
              )}
            </div>
          </section>

          {/* Участники */}
          <section>
            <h3 className="text-xs font-semibold text-ds-muted uppercase tracking-wider mb-3">
              Участники ({members.length})
            </h3>
            <div className="space-y-1">
              {loading ? (
                <p className="text-ds-muted text-sm text-center py-4">Загрузка...</p>
              ) : members.length === 0 ? (
                <p className="text-ds-muted text-sm text-center py-4">Пока никого нет</p>
              ) : members.map(member => {
                const { imageUrl } = getUserAvatar(member.username ?? '?');
                const isOwner = member.id === server.owner_id;
                const isMe = member.id === currentUserId;

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ds-hover transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-full bg-ds-bg overflow-hidden flex-shrink-0 flex items-center justify-center">
                      <img src={imageUrl} alt={member.username} className="w-[130%] h-[130%] -mt-[15%] -ml-[15%]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold truncate"
                        style={member.color ? { color: member.color } : { color: '#e3e5e8' }}
                      >
                        {member.username ?? 'Без имени'}
                        {isMe && <span className="text-ds-muted font-normal text-xs ml-1">(вы)</span>}
                      </p>
                      <p className="text-xs text-ds-muted">
                        {isOwner ? '👑 Основатель' : '👤 Участник'}
                      </p>
                    </div>
                    {!isOwner && !isMe && (
                      <button
                        onClick={() => handleKickMember(member.id)}
                        title="Исключить с сервера"
                        className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-ds-muted hover:text-ds-red hover:bg-ds-red/10 transition-all"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M13 8c0-2.21-1.79-4-4-4S5 5.79 5 8s1.79 4 4 4 4-1.79 4-4zm2 2v2h3v3h2v-3h3v-2h-3V7h-2v3h-3zM1 18v2h16v-2c0-2.66-5.33-4-8-4s-8 1.34-8 4z"/>
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Опасная зона */}
          <section className="border-t border-ds-divider/50 pt-4">
            <h3 className="text-xs font-semibold text-ds-red uppercase tracking-wider mb-3">Опасная зона</h3>
            <button
              onClick={handleDeleteServer}
              className="w-full py-2.5 bg-ds-red/10 hover:bg-ds-red/20 text-ds-red text-sm font-semibold rounded-xl border border-ds-red/30 transition-colors"
            >
              Удалить сервер
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
