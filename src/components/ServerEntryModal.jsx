import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Globe, Link, Plus } from 'lucide-react';

const TEXT = {
  subtitle: '\u0421\u043e\u0437\u0434\u0430\u0439 \u0438\u043b\u0438 \u043f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u0438\u0441\u044c',
  createServer: '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0441\u0435\u0440\u0432\u0435\u0440',
  createServerHint: '\u0421\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e',
  joinByCode: '\u0412\u043e\u0439\u0442\u0438 \u043f\u043e \u043a\u043e\u0434\u0443',
  joinByCodeHint: '\u041a\u043b\u044e\u0447 \u043e\u0442 \u0441\u043e\u043e\u0431\u0449\u0435\u0441\u0442\u0432\u0430',
  name: '\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435',
  createPlaceholder: '\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \u0412\u0430\u0439\u0431',
  creating: '\u0421\u043e\u0437\u0434\u0430\u043d\u0438\u0435...',
  createAction: '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0441\u0435\u0440\u0432\u0435\u0440',
  inviteCode: '\u041a\u043e\u0434 \u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f',
  joinPlaceholder: '\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: OC9B806C',
  joining: '\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435...',
  joinAction: '\u0412\u043e\u0439\u0442\u0438 \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440',
  notFound: '\u041a\u043e\u0434 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d. \u041f\u0440\u043e\u0432\u0435\u0440\u044c \u043f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u043e\u0441\u0442\u044c \u0432\u0432\u043e\u0434\u0430.',
  alreadyMember: '\u0422\u044b \u0443\u0436\u0435 \u0441\u043e\u0441\u0442\u043e\u0438\u0448\u044c \u043d\u0430 \u044d\u0442\u043e\u043c \u0441\u0435\u0440\u0432\u0435\u0440\u0435.',
  joinFailed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u043e\u0439\u0442\u0438 \u043f\u043e \u043a\u043e\u0434\u0443.',
  createTarget: '\u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0435 \u0441\u0435\u0440\u0432\u0435\u0440\u0430',
  ownerTarget: '\u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0430',
  rlsMessagePrefix:
    'Supabase \u043f\u043e\u043a\u0430 \u043d\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0430\u0435\u0442 ',
  rlsMessageSuffix:
    '. \u041e\u0431\u044b\u0447\u043d\u043e \u044d\u0442\u043e \u0437\u043d\u0430\u0447\u0438\u0442, \u0447\u0442\u043e \u0432 \u0431\u0430\u0437\u0435 \u0435\u0449\u0451 \u043d\u0435 \u043f\u0440\u0438\u043c\u0435\u043d\u0451\u043d \u0441\u0432\u0435\u0436\u0438\u0439 SQL \u0434\u043b\u044f tables servers \u0438 server_members.',
  genericErrorPrefix: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435: '
};

const normalizeServerInviteCode = (value) =>
  value?.toUpperCase().replace(/[\s-]+/g, '').trim() ?? '';

function formatServerFlowError(rawError, target) {
  if (rawError?.code === '42501') {
    return `${TEXT.rlsMessagePrefix}${target}${TEXT.rlsMessageSuffix}`;
  }

  return rawError?.message || `${TEXT.genericErrorPrefix}${target}.`;
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
        throw new Error(formatServerFlowError(serverError, TEXT.createTarget));
      }

      const { error: memberError } = await supabase
        .from('server_members')
        .insert({ server_id: server.id, user_id: currentUserId, role: 'owner' });

      if (memberError) {
        throw new Error(formatServerFlowError(memberError, TEXT.ownerTarget));
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
        setError(TEXT.notFound);
        return;
      }

      if (data?.error === 'already_member') {
        setError(TEXT.alreadyMember);
        return;
      }

      onServerJoined(data);
      onClose();
    } catch (requestError) {
      setError(requestError.message || TEXT.joinFailed);
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
              {TEXT.subtitle}
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
                      {TEXT.createServer}
                    </p>
                    <p className="text-[10px] text-ds-muted font-black uppercase tracking-widest mt-0.5">
                      {TEXT.createServerHint}
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
                      {TEXT.joinByCode}
                    </p>
                    <p className="text-[10px] text-ds-muted font-black uppercase tracking-widest mt-0.5">
                      {TEXT.joinByCodeHint}
                    </p>
                  </div>
                </button>
              </div>
            )}

            {mode === 'create' && (
              <div className="space-y-6 animate-fade-in">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-ds-muted uppercase tracking-[0.2em] ml-2">
                    {TEXT.name}
                  </p>
                  <input
                    type="text"
                    value={serverName}
                    onChange={(event) => setServerName(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && handleCreate()}
                    placeholder={TEXT.createPlaceholder}
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
                    {loading ? TEXT.creating : TEXT.createAction}
                  </button>
                </div>
              </div>
            )}

            {mode === 'join' && (
              <div className="space-y-6 animate-fade-in">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-ds-muted uppercase tracking-[0.2em] ml-2">
                    {TEXT.inviteCode}
                  </p>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(normalizeServerInviteCode(event.target.value))}
                    onKeyDown={(event) => event.key === 'Enter' && handleJoin()}
                    placeholder={TEXT.joinPlaceholder}
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
                    {loading ? TEXT.joining : TEXT.joinAction}
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
