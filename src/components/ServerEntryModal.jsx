import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  X, Plus, Link, ArrowLeft, Globe, 
  Sparkles, Check, Hash, Shield
} from 'lucide-react';

/**
 * РњРѕРґР°Р»РєР° РґР»СЏ СЃРѕР·РґР°РЅРёСЏ РЅРѕРІРѕРіРѕ СЃРµСЂРІРµСЂР° РёР»Рё РІСЃС‚СѓРїР»РµРЅРёСЏ РїРѕ РєРѕРґСѓ.
 * РћР±РЅРѕРІР»РµРЅР° РїРѕРґ СЃС‚РёР»СЊ VIBE.
 */
export function ServerEntryModal({ currentUserId, onClose, onServerJoined }) {
  const [mode, setMode] = useState('choose'); // 'choose' | 'create' | 'join'
  const [serverName, setServerName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const normalizeServerInviteCode = (value) =>
    value?.toUpperCase().replace(/[\s-]+/g, '').trim() ?? '';

  const mapServerFlowError = (rawError, target) => {
    if (rawError?.code === '42501') {
      return `Supabase РїРѕРєР° РЅРµ СЂР°Р·СЂРµС€Р°РµС‚ ${target}. РќСѓР¶РЅРѕ РїСЂРёРјРµРЅРёС‚СЊ СЃРІРµР¶РёР№ SQL РґР»СЏ tables servers Рё server_members.`;
    }
    return rawError?.message || `РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РїРѕР»РЅРёС‚СЊ РґРµР№СЃС‚РІРёРµ: ${target}.`;
  };

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
      if (serverErr) throw new Error(mapServerFlowError(serverErr, 'СЃРѕР·РґР°РЅРёРµ СЃРµСЂРІРµСЂР°'));

      const { error: memberErr } = await supabase
        .from('server_members')
        .insert({ server_id: server.id, user_id: currentUserId, role: 'owner' });
      if (memberErr) throw new Error(mapServerFlowError(memberErr, 'РґРѕР±Р°РІР»РµРЅРёРµ РІР»Р°РґРµР»СЊС†Р°'));

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
      const normalizedCode = normalizeServerInviteCode(inviteCode);
      const { data, error: rpcErr } = await supabase
        .rpc('join_server_by_invite', { p_invite_code: normalizedCode });

      if (rpcErr) throw rpcErr;

      if (data?.error === 'not_found') {
        setError('РљРѕРґ РЅРµ РЅР°Р№РґРµРЅ. РџСЂРѕРІРµСЂСЊ РїСЂР°РІРёР»СЊРЅРѕСЃС‚СЊ РІРІРѕРґР°.');
        setLoading(false);
        return;
      }

      if (data?.error === 'already_member') {
        setError('РўС‹ СѓР¶Рµ РЅР° СЌС‚РѕРј СЃРµСЂРІРµСЂРµ.');
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
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-[2.5rem] w-full max-w-sm shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-ds-border overflow-hidden animate-slide-up flex flex-col relative vibe-panel-strong">
        <div className="absolute top-0 inset-x-0 h-1 vibe-moving-glow opacity-30" />
        
        <div className="p-8 space-y-8">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue border border-ds-accent/20 mx-auto mb-4">
              <Globe size={32} />
            </div>
            <h2 className="text-ds-text font-black text-2xl uppercase tracking-tighter">VIBE</h2>
            <p className="text-[10px] text-ds-muted font-black uppercase tracking-[0.2em] mt-1">РЎРѕР·РґР°Р№ РёР»Рё РїСЂРёСЃРѕРµРґРёРЅРёСЃСЊ</p>
          </div>

          {/* Mode Tabs / Content */}
          <div className="space-y-4">
            {mode === 'choose' && (
              <div className="flex flex-col gap-4 animate-fade-in">
                <button
                  onClick={() => setMode('create')}
                  className="group flex items-center gap-4 p-5 border border-ds-border hover:border-ds-accent/30 rounded-3xl transition-all vibe-panel"
                >
                  <div className="w-14 h-14 rounded-2xl bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue group-hover:scale-110 transition-transform">
                    <Plus size={28} strokeWidth={3} />
                  </div>
                  <div className="text-left">
                    <p className="text-ds-text font-black uppercase text-sm tracking-tight group-hover:text-ds-accent transition-colors">РЎРѕР·РґР°С‚СЊ СЃРµСЂРІРµСЂ</p>
                    <p className="text-[10px] text-ds-muted font-black uppercase tracking-widest mt-0.5">Р’Р»Р°СЃС‚РЅРѕРµ РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ</p>
                  </div>
                </button>

                <button
                  onClick={() => setMode('join')}
                  className="group flex items-center gap-4 p-5 border border-ds-border hover:border-ds-accent/30 rounded-3xl transition-all vibe-panel"
                >
                  <div className="w-14 h-14 rounded-2xl bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue group-hover:scale-110 transition-transform">
                    <Link size={28} strokeWidth={3} />
                  </div>
                  <div className="text-left">
                    <p className="text-ds-text font-black uppercase text-sm tracking-tight group-hover:text-ds-accent transition-colors">Р’РѕР№С‚Рё РїРѕ РєРѕРґСѓ</p>
                    <p className="text-[10px] text-ds-muted font-black uppercase tracking-widest mt-0.5">РљР»СЋС‡ РѕС‚ СЃРѕРѕР±С‰РµСЃС‚РІР°</p>
                  </div>
                </button>
              </div>
            )}

            {/* Create Flow */}
            {mode === 'create' && (
              <div className="space-y-6 animate-fade-in">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-ds-muted uppercase tracking-[0.2em] ml-2">РќР°Р·РІР°РЅРёРµ</p>
                  <input
                    type="text" value={serverName} onChange={e => setServerName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    placeholder="РЈР»СЊС‚СЂР° РЎРµСЂРІРµСЂ"
                    autoFocus
                    className="w-full border border-ds-border rounded-2xl px-5 py-4 text-ds-text text-sm font-bold placeholder-ds-muted/30 focus:border-ds-accent/30 transition-all outline-none vibe-panel"
                  />
                </div>
                {error && <p className="text-ds-red text-[10px] font-black uppercase text-center">{error}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setMode('choose')} className="w-16 h-14 flex items-center justify-center border border-ds-border rounded-2xl text-ds-muted hover:text-ds-text transition-all vibe-panel">
                    <ArrowLeft size={20} />
                  </button>
                  <button
                    onClick={handleCreate} disabled={loading || !serverName.trim()}
                    className="flex-1 font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 vibe-primary-button"
                  >
                    {loading ? 'РЎРћР—Р”РђРќРР•...' : 'РЎРћР—Р”РђРўР¬ РЎР•Р Р’Р•Р '}
                  </button>
                </div>
              </div>
            )}

            {/* Join Flow */}
            {mode === 'join' && (
              <div className="space-y-6 animate-fade-in">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-ds-muted uppercase tracking-[0.2em] ml-2">РљРѕРґ РїСЂРёРіР»Р°С€РµРЅРёСЏ</p>
                  <input
                    type="text" value={inviteCode} onChange={e => setInviteCode(normalizeServerInviteCode(e.target.value))}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                    placeholder="РљР›Р®Р§ РҐРҐРҐРҐ"
                    autoFocus
                    className="w-full border border-ds-border rounded-2xl px-5 py-4 text-ds-text text-sm font-black tracking-[0.18em] uppercase placeholder:tracking-normal focus:border-ds-accent/30 transition-all outline-none vibe-panel"
                  />
                </div>
                {error && <p className="text-ds-red text-[10px] font-black uppercase text-center">{error}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setMode('choose')} className="w-16 h-14 flex items-center justify-center border border-ds-border rounded-2xl text-ds-muted hover:text-ds-text transition-all vibe-panel">
                    <ArrowLeft size={20} />
                  </button>
                  <button
                    onClick={handleJoin} disabled={loading || !inviteCode.trim()}
                    className="flex-1 font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 vibe-primary-button"
                  >
                    {loading ? 'РџР РћР’Р•Р РљРђ...' : 'Р’РћР™РўР РќРђ РЎР•Р Р’Р•Р '}
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

