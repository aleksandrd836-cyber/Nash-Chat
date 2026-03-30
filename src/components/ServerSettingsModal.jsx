import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getUserAvatar } from '../lib/avatar';
import { 
  X, Settings, Copy, RefreshCw, UserPlus, Trash2, 
  Shield, Crown, User, Check, AlertCircle 
} from 'lucide-react';

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
  const [inviteCode, setInviteCode]   = useState(server.invite_code || '');
  const [codeLoading, setCodeLoading] = useState(!server.invite_code);

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
    setLoading(true);
    // Используем RPC-функцию для обхода проблем RLS/Joins
    const { data, error } = await supabase
      .rpc('get_server_members', { p_server_id: server.id });
    
    if (!error && data) {
      setMembers(data);
    } else {
      console.error('[ServerSettings] Ошибка загрузки участников:', error);
    }
    setLoading(false);
  }, [server.id]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  async function handleKickMember(userId) {
    if (!window.confirm('Исключить этого участника?')) return;
    await supabase
      .from('server_members')
      .delete()
      .eq('server_id', server.id)
      .eq('user_id', userId);
    setMembers(prev => prev.filter(m => m.id !== userId));
  }

  async function handleRegenerateCode() {
    if (!window.confirm('Сгенерировать новый код доступа?')) return;
    const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
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
    if (!window.confirm(`Удалить сервер «${server.name}» полностью?`)) return;
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
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#050505] rounded-[2.5rem] w-full max-w-lg h-[80vh] shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden animate-slide-up flex flex-col relative">
        <div className="absolute top-0 inset-x-0 h-1 vibe-moving-glow opacity-30" />
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 bg-black/20 backdrop-blur-xl border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-2xl bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue border border-ds-accent/20">
              <Settings size={22} />
            </div>
            <div>
              <h2 className="text-white font-black text-xl uppercase tracking-tighter">Сервер</h2>
              <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.2em] -mt-0.5">Управление пространством</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all active:scale-90"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-8 space-y-10">
          
          {/* General Section */}
          <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em] mb-4 ml-1">Основное</h3>
            <div className="space-y-1.5">
              <p className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-2">Название</p>
              <div className="flex gap-2">
                <input
                  type="text" value={serverName} onChange={e => setServerName(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/5 rounded-2xl px-4 py-3 text-white text-sm font-bold focus:border-ds-accent/30 transition-all outline-none"
                />
                <button
                  onClick={handleSaveName} disabled={savingName || !serverName.trim() || serverName === server.name}
                  className="px-6 bg-ds-accent text-black font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-ds-accent/20 vibe-glow-blue disabled:opacity-40"
                >
                  {savingName ? '...' : 'OK'}
                </button>
              </div>
            </div>
          </section>

          {/* Invite Section */}
          <section className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em]">Код доступа</h3>
              <button onClick={handleRegenerateCode} className="text-ds-accent/60 hover:text-ds-accent transition-colors">
                <RefreshCw size={14} className={codeLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            
            <div className="p-8 bg-black/40 border border-white/5 rounded-[2rem] flex flex-col items-center gap-6 relative group">
              <div className="absolute inset-0 vibe-moving-glow opacity-10" />
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue mb-2">
                   <UserPlus size={24} />
                </div>
                <code className="text-3xl font-black text-white tracking-[0.3em] uppercase drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">
                  {inviteCode || '········'}
                </code>
              </div>
              <button
                onClick={handleCopy} disabled={!inviteCode}
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] transition-all flex items-center justify-center gap-3
                  ${copied ? 'bg-ds-accent text-black vibe-glow-blue' : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'}`}
              >
                {copied ? <Check size={18} strokeWidth={3} /> : <Copy size={18} />}
                {copied ? 'КОПИЯ СНЯТА' : 'СКОПИРОВАТЬ КЛЮЧ'}
              </button>
            </div>
          </section>

          {/* Members Section */}
          <section className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <h3 className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em] mb-4 ml-1">
              Участники — {members.length}
            </h3>
            <div className="space-y-1 bg-white/[0.02] border border-white/5 rounded-[2rem] overflow-hidden p-2">
              {loading ? (
                <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-ds-accent border-t-transparent rounded-full animate-spin" /></div>
              ) : members.map((member, i) => {
                const isOwner = member.id === server.owner_id;
                const isMe = member.id === currentUserId;
                const { imageUrl } = getUserAvatar(member.username || '?');

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-white/5 transition-all group animate-fade-in"
                    style={{ animationDelay: `${0.4 + i * 0.05}s` }}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-black/40 overflow-hidden border border-white/10 flex-shrink-0 shadow-lg">
                      <img src={imageUrl} alt={member.username} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate text-white" style={member.color ? { color: member.color } : {}}>
                        {member.username}
                        {isMe && <span className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-2">(ВЫ)</span>}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isOwner ? <Crown size={10} className="text-ds-accent" /> : <User size={10} className="text-white/20" />}
                        <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.1em]">
                          {isOwner ? 'Основатель' : 'Участник'}
                        </span>
                      </div>
                    </div>
                    {!isOwner && !isMe && (
                      <button
                        onClick={() => handleKickMember(member.id)}
                        className="opacity-0 group-hover:opacity-100 w-10 h-10 rounded-xl flex items-center justify-center text-white/20 hover:text-ds-red hover:bg-ds-red/10 transition-all active:scale-90"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Danger Zone */}
          <section className="pt-10 border-t border-white/5 animate-fade-in" style={{ animationDelay: '0.5s' }}>
            <div className="flex items-center gap-2 mb-4 text-ds-red/60 px-1 font-black text-[10px] uppercase tracking-widest">
               <AlertCircle size={14} />
               Опасная зона
            </div>
            <button
              onClick={handleDeleteServer}
              className="w-full py-4 rounded-2xl bg-ds-red/10 border border-ds-red/30 text-ds-red font-black uppercase tracking-[0.2em] text-[11px] transition-all hover:bg-ds-red hover:text-white group"
            >
              УДАЛИТЬ СЕРВЕР ПОЛНОСТЬЮ
            </button>
          </section>

        </div>
      </div>
    </div>
  );
}
