import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getUserAvatar } from '../lib/avatar';
import {
  AlertCircle,
  Camera,
  Check,
  Copy,
  Crown,
  RefreshCw,
  Settings,
  Trash2,
  User,
  UserPlus,
  X
} from 'lucide-react';
import { compressImage } from '../lib/image';

const PLATFORM_CREATOR_IDS = new Set([
  '43751682-690e-4934-a9f2-7300a816b92d',
  '1380ae20-201a-4c77-aed3-93b3cb96f8d5'
]);

function normalizeServerInviteCode(value) {
  return value?.toUpperCase().replace(/[\s-]+/g, '').trim() ?? '';
}

async function copyTextToClipboard(value) {
  const text = typeof value === 'string' ? value : String(value ?? '');

  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn('[ServerSettings] Clipboard API failed, using fallback copy.', error);
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;

  try {
    copied = document.execCommand('copy');
  } catch (error) {
    console.error('[ServerSettings] Fallback copy failed.', error);
  } finally {
    document.body.removeChild(textarea);
  }

  return copied;
}

export function ServerSettingsModal({ server, currentUserId, onClose, onServerDeleted }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [serverName, setServerName] = useState(server.name);
  const [savingName, setSavingName] = useState(false);
  const [inviteCode, setInviteCode] = useState(() => normalizeServerInviteCode(server.invite_code || ''));
  const [codeLoading, setCodeLoading] = useState(!server.invite_code);
  const [iconUrl, setIconUrl] = useState(server.icon_url || '');
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef(null);
  const inviteCodeInputRef = useRef(null);

  useEffect(() => {
    if (!server.invite_code) {
      supabase
        .from('servers')
        .select('invite_code')
        .eq('id', server.id)
        .single()
        .then(({ data }) => {
          if (data?.invite_code) {
            setInviteCode(normalizeServerInviteCode(data.invite_code));
          }

          setCodeLoading(false);
        });
      return;
    }

    setCodeLoading(false);
  }, [server.id, server.invite_code]);

  const fetchMembers = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase.rpc('get_server_members', {
      p_server_id: server.id
    });

    if (!error && data) {
      setMembers(data);
    } else {
      console.error('[ServerSettings] Failed to load members:', error);
    }

    setLoading(false);
  }, [server.id]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function handleKickMember(userId) {
    if (!window.confirm('Удалить этого участника с сервера?')) return;

    await supabase.from('server_members').delete().eq('server_id', server.id).eq('user_id', userId);
    setMembers((prev) => prev.filter((member) => member.id !== userId));
  }

  async function handleRegenerateCode() {
    if (!window.confirm('Обновить код доступа? Старый код перестанет работать.')) return;

    const newCode = normalizeServerInviteCode(Math.random().toString(36).substring(2, 10).toUpperCase());
    const { error } = await supabase.from('servers').update({ invite_code: newCode }).eq('id', server.id);

    if (error) {
      alert(`Не удалось обновить код сервера:\n${error.message}`);
      return;
    }

    setInviteCode(newCode);
    setCopied(false);
    server.invite_code = newCode;
  }

  async function handleSaveName() {
    if (!serverName.trim() || serverName === server.name) return;

    setSavingName(true);

    const { error } = await supabase.from('servers').update({ name: serverName.trim() }).eq('id', server.id);

    if (!error) {
      server.name = serverName.trim();
    }

    setSavingName(false);
  }

  async function handleAvatarUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type === 'image/gif') {
      alert('Гифки здесь не поддерживаются. Лучше используй JPG или PNG.');
      return;
    }

    setUploading(true);

    try {
      const finalFile = await compressImage(file);
      const ext = finalFile.name.split('.').pop();
      const fileName = `${server.id}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, finalFile, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const publicUrl = data.publicUrl;

      const { error: dbError } = await supabase.from('servers').update({ icon_url: publicUrl }).eq('id', server.id);

      if (dbError) throw dbError;

      setIconUrl(publicUrl);
      server.icon_url = publicUrl;
    } catch (error) {
      console.error('[ServerSettings] Avatar upload failed:', error);
      alert('Не удалось загрузить аватар сервера. Проверь настройки Storage в Supabase.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function handleDeleteServer() {
    if (!window.confirm(`Удалить сервер «${server.name}» полностью?`)) return;

    await supabase.from('servers').delete().eq('id', server.id);
    onServerDeleted();
    onClose();
  }

  async function handleCopy() {
    if (!inviteCode) return;

    inviteCodeInputRef.current?.focus();
    inviteCodeInputRef.current?.select();

    const success = await copyTextToClipboard(inviteCode);

    if (!success) {
      window.prompt('Скопируй код вручную:', inviteCode);
      return;
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="vibe-panel-strong rounded-[2.5rem] w-full max-w-lg h-[80vh] shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden animate-slide-up flex flex-col relative">
        <div className="absolute top-0 inset-x-0 h-1 vibe-moving-glow opacity-30" />

        <div className="flex items-center justify-between px-8 py-6 vibe-panel border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue border border-ds-accent/20">
              <Settings size={22} />
            </div>
            <div>
              <h2 className="text-ds-text font-black text-xl uppercase tracking-tighter">Настройки</h2>
              <p className="text-[10px] text-ds-muted font-black uppercase tracking-[0.2em] -mt-0.5">
                Управление пространством сервера
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-ds-muted hover:text-ds-text hover:bg-ds-sidebar/5 transition-all active:scale-90"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-8 space-y-10">
          <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-[11px] font-black text-ds-muted uppercase tracking-[0.3em] mb-4 ml-1">
              Общие
            </h3>

            <div className="flex items-center gap-8 mb-8 pb-8 border-b border-white/5">
              <div className="relative group/avatar">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-24 h-24 rounded-[2rem] bg-ds-bg/60 border-2 border-ds-border overflow-hidden flex items-center justify-center transition-all cursor-pointer shadow-2xl relative ${
                    uploading
                      ? 'opacity-50 pointer-events-none'
                      : 'hover:scale-105 active:scale-95 group-hover/avatar:border-ds-accent/40'
                  }`}
                >
                  {iconUrl ? (
                    <img src={iconUrl} alt="Иконка сервера" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-black text-ds-muted uppercase tracking-tighter">
                      {server.name?.[0] || '?'}
                    </span>
                  )}

                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                    <Camera className="text-white drop-shadow-lg" size={24} />
                  </div>

                  {uploading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-ds-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                />
              </div>

              <div className="flex-1 space-y-4">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-ds-muted uppercase tracking-widest ml-1">
                    Название сервера
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={serverName}
                      onChange={(event) => setServerName(event.target.value)}
                      className="vibe-form-field flex-1 rounded-2xl px-4 py-3 text-sm font-bold"
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={savingName || !serverName.trim() || serverName === server.name}
                      className="vibe-primary-button px-6 font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                    >
                      {savingName ? '...' : 'OK'}
                    </button>
                  </div>
                </div>

                <p className="text-[9px] text-ds-muted uppercase tracking-[0.1em] leading-relaxed">
                  Рекомендуемый размер иконки: 128x128. Лучше всего работают квадратные изображения без лишнего мелкого текста.
                </p>
              </div>
            </div>
          </section>

          <section className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-[11px] font-black text-ds-muted uppercase tracking-[0.3em]">Код доступа</h3>
              <button onClick={handleRegenerateCode} className="text-ds-accent/60 hover:text-ds-accent transition-colors">
                <RefreshCw size={14} className={codeLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="vibe-panel p-8 rounded-[2rem] flex flex-col items-center gap-6 relative group">
              <div className="absolute inset-0 vibe-moving-glow opacity-10" />

              <div className="flex flex-col items-center gap-2 w-full">
                <div className="w-12 h-12 rounded-full bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue mb-2">
                  <UserPlus size={24} />
                </div>

                <input
                  ref={inviteCodeInputRef}
                  type="text"
                  readOnly
                  spellCheck={false}
                  value={inviteCode || ''}
                  onFocus={(event) => event.target.select()}
                  onClick={(event) => event.target.select()}
                  className="w-full max-w-[260px] bg-transparent text-center text-3xl font-black text-ds-text tracking-[0.3em] uppercase outline-none select-all cursor-text"
                  placeholder="········"
                />
              </div>

              <button
                onClick={handleCopy}
                disabled={!inviteCode}
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] transition-all flex items-center justify-center gap-3 ${
                  copied ? 'vibe-primary-button text-ds-bg vibe-glow-blue' : 'vibe-secondary-button text-ds-muted hover:text-ds-text'
                }`}
              >
                {copied ? <Check size={18} strokeWidth={3} /> : <Copy size={18} />}
                {copied ? 'Код скопирован' : 'Скопировать ключ'}
              </button>
            </div>
          </section>

          <section className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <h3 className="text-[11px] font-black text-ds-muted uppercase tracking-[0.3em] mb-4 ml-1">
              Участники — {members.length}
            </h3>

            <div className="vibe-panel space-y-1 rounded-[2rem] overflow-hidden p-2">
              {loading ? (
                <div className="py-8 flex justify-center">
                  <div className="w-6 h-6 border-2 border-ds-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                members.map((member, index) => {
                  const isOwner = member.id === server.owner_id;
                  const isMe = member.id === currentUserId;
                  const isCreator = PLATFORM_CREATOR_IDS.has(member.id);
                  const { imageUrl } = getUserAvatar(member.username || '?');

                  return (
                    <div
                      key={member.id}
                      className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-white/5 transition-all group animate-fade-in"
                      style={{ animationDelay: `${0.4 + index * 0.05}s` }}
                    >
                      <div className="w-10 h-10 rounded-2xl vibe-panel overflow-hidden flex-shrink-0 shadow-lg">
                        <img src={imageUrl} alt={member.username} className="w-full h-full object-cover" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-bold truncate text-ds-text"
                          style={member.color ? { color: member.color } : {}}
                        >
                          {member.username}
                          {isCreator && (
                            <span className="ml-2 px-1.5 py-0.5 rounded-md bg-ds-accent/10 border border-ds-accent/30 text-[8px] font-black text-ds-accent uppercase tracking-tighter vibe-glow-blue align-middle vibe-creator-badge">
                              Создатель
                            </span>
                          )}
                          {isMe && (
                            <span className="text-[9px] font-black text-ds-muted uppercase tracking-widest ml-2">
                              (вы)
                            </span>
                          )}
                        </p>

                        <div className="flex items-center gap-1.5 mt-0.5">
                          {isOwner ? <Crown size={10} className="text-ds-accent" /> : <User size={10} className="text-ds-muted" />}
                          <span className="text-[9px] font-black text-ds-muted uppercase tracking-[0.1em]">
                            {isOwner ? 'Владелец' : 'Участник'}
                          </span>
                        </div>
                      </div>

                      {!isOwner && !isMe && (
                        <button
                          onClick={() => handleKickMember(member.id)}
                          className="opacity-0 group-hover:opacity-100 w-10 h-10 rounded-xl flex items-center justify-center text-ds-muted hover:text-ds-red hover:bg-ds-red/10 transition-all active:scale-90"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="pt-10 border-t border-white/5 animate-fade-in" style={{ animationDelay: '0.5s' }}>
            <div className="flex items-center gap-2 mb-4 text-ds-red/60 px-1 font-black text-[10px] uppercase tracking-widest">
              <AlertCircle size={14} />
              Опасная зона
            </div>

            <button
              onClick={handleDeleteServer}
              className="w-full py-4 rounded-2xl bg-ds-red/10 border border-ds-red/30 text-ds-red font-black uppercase tracking-[0.2em] text-[11px] transition-all hover:bg-ds-red hover:text-white group"
            >
              Полностью удалить сервер
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
