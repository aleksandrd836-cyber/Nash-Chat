import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  X, Plus, Link, ArrowLeft, Globe, 
  Sparkles, Check, Hash, Shield
} from 'lucide-react';

/**
 * Модалка для создания нового сервера или вступления по коду.
 * Обновлена под стиль VIBE.
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
      const { data: server, error: serverErr } = await supabase
        .from('servers')
        .insert({ name: serverName.trim(), owner_id: currentUserId })
        .select()
        .single();
      if (serverErr) throw serverErr;

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
      const { data, error: rpcErr } = await supabase
        .rpc('join_server_by_invite', { p_invite_code: inviteCode.trim().toLowerCase() });

      if (rpcErr) throw rpcErr;

      if (data?.error === 'not_found') {
        setError('Код не найден. Проверь правильность ввода.');
        setLoading(false);
        return;
      }

      if (data?.error === 'already_member') {
        setError('Ты уже на этом сервере.');
        setLoading(false);
        return;
      }

      onServerJoined(data);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#050505] rounded-[2.5rem] w-full max-w-sm shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden animate-slide-up flex flex-col relative">
        <div className="absolute top-0 inset-x-0 h-1 vibe-moving-glow opacity-30" />

        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-2">
          <div className="flex items-center gap-2 text-ds-accent vibe-glow-blue bg-ds-accent/10 p-2 rounded-xl">
             <Globe size={18} />
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all active:scale-90"
          >
            <X size={24} />
          </button>
        </div>

        <div className="px-8 pb-10">
          {/* Title Area */}
          <div className="mb-8">
            <h2 className="text-white font-black text-2xl uppercase tracking-tighter leading-tight">
              {mode === 'choose' ? 'Новый мир' :
               mode === 'create' ? 'Создать' : 'Вступить'}
            </h2>
            <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em] mt-1">
              {mode === 'choose' ? 'Выбери свой путь VIBE' :
               mode === 'create' ? 'Создай своё пространство' : 'Присоединяйся к сообществу'}
            </p>
          </div>

          {/* Mode Tabs / Content */}
          <div className="space-y-4">
            {mode === 'choose' && (
              <div className="flex flex-col gap-4 animate-fade-in">
                <button
                  onClick={() => setMode('create')}
                  className="group flex items-center gap-4 p-5 bg-white/[0.02] hover:bg-ds-accent/5 border border-white/5 hover:border-ds-accent/30 rounded-3xl transition-all"
                >
                  <div className="w-14 h-14 rounded-2xl bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue group-hover:scale-110 transition-transform">
                    <Plus size={28} strokeWidth={3} />
                  </div>
                  <div className="text-left">
                    <p className="text-white font-black uppercase text-sm tracking-tight group-hover:text-ds-accent transition-colors">Создать сервер</p>
                    <p className="text-[10px] text-white/20 font-black uppercase tracking-widest mt-0.5">Властное пространство</p>
                  </div>
                </button>

                <button
                  onClick={() => setMode('join')}
                  className="group flex items-center gap-4 p-5 bg-white/[0.02] hover:bg-ds-accent/5 border border-white/5 hover:border-ds-accent/30 rounded-3xl transition-all"
                >
                  <div className="w-14 h-14 rounded-2xl bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue group-hover:scale-110 transition-transform">
                    <Link size={28} strokeWidth={3} />
                  </div>
                  <div className="text-left">
                    <p className="text-white font-black uppercase text-sm tracking-tight group-hover:text-ds-accent transition-colors">Войти по коду</p>
                    <p className="text-[10px] text-white/20 font-black uppercase tracking-widest mt-0.5">Ключ от сообщества</p>
                  </div>
                </button>
              </div>
            )}

            {/* Create Flow */}
            {mode === 'create' && (
              <div className="space-y-6 animate-fade-in">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] ml-2">Название</p>
                  <input
                    type="text" value={serverName} onChange={e => setServerName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    placeholder="Моя Вселенная Vibe"
                    autoFocus
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white text-sm font-bold focus:border-ds-accent/30 transition-all outline-none"
                  />
                </div>
                {error && <p className="text-ds-red text-[10px] font-black uppercase text-center">{error}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setMode('choose')} className="w-16 h-14 flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl text-white/40 hover:text-white transition-all">
                    <ArrowLeft size={20} />
                  </button>
                  <button
                    onClick={handleCreate} disabled={loading || !serverName.trim()}
                    className="flex-1 bg-ds-accent text-black font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-ds-accent/20 vibe-glow-blue disabled:opacity-40"
                  >
                    {loading ? 'СОЗДАНИЕ...' : 'СОЗДАТЬ СЕРВЕР'}
                  </button>
                </div>
              </div>
            )}

            {/* Join Flow */}
            {mode === 'join' && (
              <div className="space-y-6 animate-fade-in">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] ml-2">Код приглашения</p>
                  <input
                    type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                    placeholder="КЛЮЧ ХХХХ"
                    autoFocus
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white text-sm font-black tracking-[0.3em] uppercase placeholder:tracking-normal focus:border-ds-accent/30 transition-all outline-none"
                  />
                </div>
                {error && <p className="text-ds-red text-[10px] font-black uppercase text-center">{error}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setMode('choose')} className="w-16 h-14 flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl text-white/40 hover:text-white transition-all">
                    <ArrowLeft size={20} />
                  </button>
                  <button
                    onClick={handleJoin} disabled={loading || !inviteCode.trim()}
                    className="flex-1 bg-ds-accent text-black font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-ds-accent/20 vibe-glow-blue disabled:opacity-40"
                  >
                    {loading ? 'ПРОВЕРКА...' : 'ВОЙТИ НА СЕРВЕР'}
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
