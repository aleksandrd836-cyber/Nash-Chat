import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getUserAvatar } from '../lib/avatar';

/**
 * Панель управления сервером для его владельца.
 * Позволяет: видеть инвайт-код, управлять участниками, удалить сервер.
 */
export function ServerSettingsModal({ server, currentUserId, onClose, onServerDeleted }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [serverName, setServerName] = useState(server.name);
  const [savingName, setSavingName] = useState(false);

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
    await supabase.from('servers').update({ invite_code: newCode }).eq('id', server.id);
    server.invite_code = newCode; // обновляем локально
    setCopied(false);
  }

  async function handleSaveName() {
    if (!serverName.trim() || serverName === server.name) return;
    setSavingName(true);
    await supabase.from('servers').update({ name: serverName.trim() }).eq('id', server.id);
    server.name = serverName.trim();
    setSavingName(false);
  }

  async function handleDeleteServer() {
    if (!window.confirm(`Удалить сервер «${server.name}»? Это удалит ВСЕ каналы и историю. Действие нельзя отменить!`)) return;
    await supabase.from('servers').delete().eq('id', server.id);
    onServerDeleted();
    onClose();
  }

  function copyInviteCode() {
    navigator.clipboard.writeText(server.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
              <div className="flex items-center gap-3">
                <code className="flex-1 text-2xl font-mono font-bold text-ds-accent tracking-widest uppercase text-center">
                  {server.invite_code}
                </code>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={copyInviteCode}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      copied
                        ? 'bg-ds-green/20 text-ds-green'
                        : 'bg-ds-hover hover:bg-ds-divider text-ds-text'
                    }`}
                  >
                    {copied ? '✓ Скопировано' : 'Скопировать'}
                  </button>
                  <button
                    onClick={handleRegenerateCode}
                    className="px-3 py-1.5 bg-ds-hover hover:bg-ds-divider text-ds-muted text-xs font-semibold rounded-lg transition-colors"
                  >
                    Обновить
                  </button>
                </div>
              </div>
              <p className="text-ds-muted text-xs mt-3 text-center">
                Отправь этот код другу — он введёт его в приложении для входа на сервер.
              </p>
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
              ) : members.map(member => {
                const { imageUrl } = getUserAvatar(member.username ?? '?');
                const isOwner = member.id === server.owner_id;
                const isMe = member.id === currentUserId;

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ds-hover transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-full bg-ds-bg overflow-hidden flex-shrink-0">
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
                          <path d="M10 9V7l-2 2 2 2V9h5v2l2-2-2-2v2h-5zm-5 6h14c.55 0 1-.45 1-1v-1c0-2.33-4.67-3.5-7-3.5S5 10.67 5 13v1c0 .55.45 1 1 1z"/>
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
