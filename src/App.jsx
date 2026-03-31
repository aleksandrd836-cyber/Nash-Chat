import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useVoice } from './hooks/useVoice';
import { useMembers } from './hooks/useMembers';
import { useUnreadDMs } from './hooks/useUnreadDMs';
import { AuthPage } from './components/AuthPage';
import { ServerSidebar } from './components/ServerSidebar';
import { Sidebar } from './components/Sidebar';
import { TextChannel } from './components/TextChannel';
import { VoiceChannel } from './components/VoiceChannel';
import { SettingsModal } from './components/SettingsModal';
import { MembersPanel } from './components/MembersPanel';
import { DirectMessagePanel } from './components/DirectMessagePanel';
import { ServerEntryModal } from './components/ServerEntryModal';
import { UserPanel } from './components/UserPanel';
import { ProfileFooter } from './components/ProfileFooter';
import { ServerSettingsModal } from './components/ServerSettingsModal';
import { Globe, Sparkles, Hash, Download, PlusCircle, Compass, Zap, Activity, Star, Users } from 'lucide-react';

/** Global React Error Boundary — вместо чёрного экрана показывает ошибку */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, info: null }; }
  componentDidCatch(error, info) { this.setState({ error, info }); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'monospace' }}>
          <div style={{ maxWidth: 700, width: '100%', background: '#0d0d0d', border: '1px solid rgba(255,0,0,0.3)', borderRadius: 16, padding: '2rem', boxShadow: '0 0 40px rgba(255,0,0,0.1)' }}>
            <h1 style={{ color: '#ff4444', fontSize: 16, fontWeight: 900, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.2em' }}>⚠ Ошибка Приложения</h1>
            <p style={{ color: '#ff6666', fontSize: 13, marginBottom: 16, wordBreak: 'break-word' }}>{String(this.state.error)}</p>
            <pre style={{ background: '#000', color: '#888', fontSize: 10, padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.info?.componentStack}</pre>
            <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 24px', background: '#00f0ff', color: '#000', border: 'none', borderRadius: 8, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Перезагрузить</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}


export default function AppWithBoundary() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}

function App() {
  const auth  = useAuth();
  const voice = useVoice();

  const [selectedChannel, setSelectedChannel] = useState(null);
  const [settingsOpen, setSettingsOpen]       = useState(false);
  const [localUsername, setLocalUsername]     = useState(null);
  const [localColor, setLocalColor]           = useState(null);
  const [theme, setTheme]                     = useState(() => localStorage.getItem('theme') || 'dark');

  // ── Серверы ──
  const [selectedServer, setSelectedServer]         = useState(null);
  const [serverEntryOpen, setServerEntryOpen]       = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [serverRefresh, setServerRefresh]           = useState(0); // триггер для обновления ServerSidebar

  // DM
  const [activeDM, setActiveDM] = useState(null);

  useEffect(() => {
    if (auth.user && localColor === null) {
      const savedColor = auth.user.user_metadata?.user_color;
      if (savedColor) setLocalColor(savedColor);
    }
  }, [auth.user]);

  // ── Управление Темой ──
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // ── Автообновление (Electron) ──
  const [updateStatus,   setUpdateStatus]   = useState('idle');
  const [updateInfo,     setUpdateInfo]     = useState(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError,    setUpdateError]    = useState('');
  const [downloadUrl,    setDownloadUrl]    = useState('https://github.com/aleksandrd836-cyber/Nash-Chat/releases/latest');

  const isElectron = !!window.electronAPI;

  useEffect(() => {
    if (isElectron) return;
    fetch('https://api.github.com/repos/aleksandrd836-cyber/Nash-Chat/releases/latest')
      .then(res => res.json())
      .then(data => {
        const asset = data.assets?.find(a => a.name.endsWith('.exe'));
        if (asset) setDownloadUrl(asset.browser_download_url);
      })
      .catch(() => {});
  }, [isElectron]);

  useEffect(() => {
    if (!isElectron) return;
    const api = window.electronAPI;
    api.onUpdateAvailable((info) => { setUpdateInfo(info); setUpdateStatus('available'); });
    api.onUpdateProgress?.((p) => { setUpdateProgress(Math.round(p.percent)); setUpdateStatus('downloading'); });
    api.onUpdateDownloaded?.(() => setUpdateStatus('ready'));
    api.onUpdateError?.((msg) => { setUpdateError(msg); setUpdateStatus('error'); });
  }, [isElectron]);

  const handleCheckUpdate = async () => {
    setUpdateStatus('checking');
    setUpdateError('');
    try { await window.electronAPI.checkForUpdates(); }
    catch (e) { setUpdateError(e?.message || String(e)); setUpdateStatus('error'); }
    setTimeout(() => setUpdateStatus(s => s === 'checking' ? 'uptodate' : s), 3000);
    setTimeout(() => setUpdateStatus(s => s === 'uptodate'  ? 'idle'    : s), 6000);
  };
  const handleDownload = async () => { setUpdateStatus('downloading'); await window.electronAPI.downloadUpdate(); };
  const handleInstall  = () => window.electronAPI.installUpdate();

  const displayUsername = localUsername ?? auth.user?.user_metadata?.username ?? auth.username;
  const displayColor    = localColor || null;

  function handleSelectChannel(channel) {
    setActiveDM(null);
    setSelectedChannel(channel);
  }

  function handleOpenDM(member) {
    setActiveDM(member);
    setSelectedChannel(null);
    markAsRead(member.id);
  }

  function handleCloseDM() { setActiveDM(null); }

  // При смене сервера — сбрасываем канал и DM
  function handleSelectServer(server) {
    setSelectedServer(server);
    setSelectedChannel(null);
    setActiveDM(null);
  }

  const { members } = useMembers(auth.user, selectedServer?.id);
  const { unreadCounts, markAsRead } = useUnreadDMs(auth.user?.id, activeDM?.id);

  if (auth.loading) {
    return (
      <div className="min-h-screen bg-ds-bg flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-ds-accent/10 rounded-full blur-[120px] animate-pulse-soft opacity-30" />
        </div>
        <div className="flex flex-col items-center gap-8 relative z-10">
          <div className="relative group">
             <div className="w-24 h-24 border-[4px] border-white/5 border-t-ds-accent rounded-full animate-spin shadow-[0_0_40px_rgba(0,240,255,0.2)]" />
             <div className="absolute inset-0 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-14 h-14 drop-shadow-[0_0_15px_rgba(0,240,255,0.8)] animate-pulse">
                  <path fill="#00f0ff" d="M12 2L14.4 8.6H21L15.6 12.7L18 19.3L12 15.2L6 19.3L8.4 12.7L3 8.6H9.6L12 2Z" />
                </svg>
             </div>
             <div className="absolute inset-0 vibe-glow-blue blur-xl rounded-full opacity-30 animate-vibe-pulse" />
          </div>
          <div className="flex flex-col items-center gap-2 mt-4">
            <h2 className="text-ds-text font-black text-2xl tracking-[0.3em] uppercase">VIBE</h2>
            <div className="h-1 w-12 bg-ds-accent rounded-full animate-pulse-soft" />
          </div>
          <p className="text-[10px] text-ds-muted/60 font-black uppercase tracking-[0.4em] animate-pulse">Загрузка системы...</p>
        </div>
      </div>
    );
  }

  if (!auth.user) {
    return (
      <AuthPage
        onSignIn={auth.signIn}
        onSignUp={auth.signUp}
        error={auth.error}
        setError={auth.setError}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-ds-bg relative">
      {/* Global Vibe Atmosphere */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          {/* Core Nebula Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] bg-ds-accent/15 rounded-full blur-[140px] animate-vibe-pulse mix-blend-screen" />
          
          {/* Aurora Layers */}
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-ds-accent/10 via-transparent to-purple-500/10 blur-[120px] animate-aurora-sweep opacity-30" />
          <div className="absolute bottom-0 right-0 w-[80%] h-[80%] bg-gradient-to-bl from-blue-500/10 via-transparent to-ds-accent/10 blur-[100px] animate-aurora-shift opacity-40" />
          
          {/* Top-Left Purple Glow (Requested Refinement) */}
          <div className="absolute -top-20 -left-20 w-[45%] h-[45%] bg-purple-600/10 rounded-full blur-[130px] animate-vibe-pulse opacity-25 mix-blend-screen" />
      </div>

      <div className="flex w-full h-full relative z-10">

      {/* ── Панель серверов (крайняя левая) ── */}
      <ServerSidebar
        currentUserId={auth.user.id}
        selectedServerId={selectedServer?.id}
        onSelectServer={handleSelectServer}
        onCreateServer={() => setServerEntryOpen(true)}
        refreshTrigger={serverRefresh}
      />

      {/* ── Канальная панель ── */}
      {selectedServer ? (
        <Sidebar
          username={displayUsername}
          userColor={displayColor}
          currentUserId={auth.user?.id}
          selectedChannel={selectedChannel}
          onSelectChannel={handleSelectChannel}
          onSignOut={auth.signOut}
          voice={voice}
          onOpenSettings={() => setSettingsOpen(true)}
          updateStatus={updateStatus}
          updateInfo={updateInfo}
          updateProgress={updateProgress}
          updateError={updateError}
          isElectron={isElectron}
          onCheckUpdate={handleCheckUpdate}
          onDownload={handleDownload}
          onInstall={handleInstall}
          appVersion={typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''}
          selectedServer={selectedServer}
          ownerId={selectedServer?.owner_id}
          isOwner={selectedServer.owner_id === auth.user.id}
          onOpenServerSettings={() => setServerSettingsOpen(true)}
        />
      ) : (
        // Заглушка если сервер не выбран
        <div className="w-72 flex-shrink-0 bg-ds-sidebar/92 backdrop-blur-[40px] flex flex-col shadow-2xl z-10 transition-all duration-300 relative select-none">
          <div className="absolute top-0 left-0 bottom-0 vibe-vertical-divider opacity-30 z-50 pointer-events-none" />
          <div className="absolute top-0 right-0 bottom-0 vibe-vertical-divider opacity-30 z-50 pointer-events-none" />
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue border border-ds-accent/20">
               <Globe size={40} strokeWidth={2} />
            </div>
            <div>
               <p className="text-ds-text font-black uppercase tracking-tight text-sm">Начни Путешествие</p>
               <p className="text-[10px] text-ds-muted font-black uppercase tracking-[0.15em] mt-2 leading-relaxed">Создай свой сервер или вступи по коду от друга</p>
            </div>
            <button
              onClick={() => setServerEntryOpen(true)}
              className="w-full py-4 bg-ds-accent text-black font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-ds-accent/20 vibe-glow-blue"
            >
              СОЗДАТЬ / ВОЙТИ
            </button>
          </div>

          <ProfileFooter
            username={displayUsername}
            userColor={displayColor}
            onSignOut={auth.signOut}
            voice={voice}
            onOpenSettings={() => setSettingsOpen(true)}
            updateStatus={updateStatus}
            updateInfo={updateInfo}
            updateProgress={updateProgress}
            updateError={updateError}
            isElectron={isElectron}
            onCheckUpdate={handleCheckUpdate}
            onDownload={handleDownload}
            onInstall={handleInstall}
            appVersion={typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''}
            ownerId={null}
            currentUserId={auth.user?.id}
          />
        </div>
      )}

      {/* ── Основной контент ── */}
      <main className="flex-1 flex min-w-0 overflow-hidden">
        {!selectedServer && !activeDM ? (
          // Экран ХАБА когда нет сервера
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-transparent relative overflow-hidden animate-fade-in group">
            {/* Фрагменты атмосферы */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-ds-accent/5 rounded-full blur-[120px] animate-vibe-pulse pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-[100px] animate-aurora-shift pointer-events-none" />
            <div className="absolute inset-0 vibe-moving-glow opacity-[0.02] pointer-events-none" />

            {/* Заголовок */}
            <div className="relative z-10 text-center mb-12 transform group-hover:scale-[1.02] transition-transform duration-700">
              <div className="w-24 h-24 rounded-[2.5rem] bg-ds-bg/40 flex items-center justify-center border-2 border-ds-accent/10 relative mx-auto mb-8 shadow-2xl group/star">
                 <div className="absolute inset-0 vibe-moving-glow opacity-20" />
                 <Star size={56} className="text-ds-accent vibe-logo-glow transition-all duration-500 group-hover/star:scale-110" fill="currentColor" strokeWidth={1} />
              </div>
              <h2 className="text-ds-text font-black text-5xl tracking-tighter mb-4 uppercase drop-shadow-[0_0_15px_rgba(var(--ds-accent-rgb),0.3)]">
                Привет, <span className="text-ds-accent">{displayUsername}</span>!
              </h2>
              <p className="text-ds-muted text-[11px] font-black uppercase tracking-[0.3em] max-w-sm mx-auto leading-relaxed opacity-60">
                 Твоя персональная станция ожидания. Настрой всё под себя и начинай общение.
              </p>
            </div>

            {/* Сетка карточек */}
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl px-4 animate-slide-up">
              
              {/* Карточка 1: Создать */}
              <button 
                onClick={() => setServerEntryOpen(true)}
                className="group/card relative rounded-[2rem] bg-white/[0.03] border border-white/5 p-8 flex flex-col items-center gap-6 transition-all duration-500 hover:bg-white/[0.08] hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)]"
              >
                <div className="absolute inset-0 transition-opacity opacity-0 group-hover/card:opacity-100 pointer-events-none bg-gradient-to-t from-ds-accent/5 to-transparent rounded-[2rem]" />
                <div className="w-16 h-16 rounded-2xl bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue border border-ds-accent/20 group-hover/card:scale-110 transition-transform">
                  <PlusCircle size={32} />
                </div>
                <div className="text-center">
                  <h4 className="text-ds-text font-black text-xs uppercase tracking-widest mb-2">Создать мир</h4>
                  <p className="text-[10px] text-ds-muted font-bold uppercase tracking-tight opacity-50">Начни своё приключение прямо сейчас</p>
                </div>
              </button>

              {/* Карточка 2: Обновления */}
              <div className="group/card relative rounded-[2rem] bg-white/[0.03] border border-white/5 p-8 flex flex-col items-center gap-6 transition-all duration-500 hover:bg-white/[0.08] hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
                <div className="absolute inset-0 transition-opacity opacity-0 group-hover/card:opacity-100 pointer-events-none bg-gradient-to-t from-purple-500/5 to-transparent rounded-[2rem]" />
                <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20 group-hover/card:scale-110 transition-transform">
                  <Zap size={32} />
                </div>
                <div className="text-center w-full">
                  <h4 className="text-ds-text font-black text-xs uppercase tracking-widest mb-3">Что нового</h4>
                  <div className="space-y-1.5 opacity-60">
                    <p className="text-[9px] font-black uppercase tracking-tighter text-ds-accent">V2.1: Статус Создателя</p>
                    <p className="text-[9px] font-black uppercase tracking-tighter text-white">Улучшена светлая тема</p>
                    <p className="text-[9px] font-black uppercase tracking-tighter text-white/50">Плавность Хаба</p>
                  </div>
                </div>
              </div>

              {/* Карточка 3: Статистика */}
              <div className="group/card relative rounded-[2rem] bg-white/[0.03] border border-white/5 p-8 flex flex-col items-center gap-6 transition-all duration-500 hover:bg-white/[0.08] hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
                <div className="absolute inset-0 transition-opacity opacity-0 group-hover/card:opacity-100 pointer-events-none bg-gradient-to-t from-ds-green/5 to-transparent rounded-[2rem]" />
                <div className="w-16 h-16 rounded-2xl bg-ds-green/10 flex items-center justify-center text-ds-green border border-ds-green/20 group-hover/card:scale-110 transition-transform vibe-glow-green">
                  <Globe size={32} />
                </div>
                <div className="text-center">
                   <h4 className="text-ds-text font-black text-xs uppercase tracking-widest mb-3">Статистика</h4>
                   <div className="flex flex-col gap-1 items-center">
                     <span className="text-[14px] font-black text-ds-green tracking-tighter">42 Участника</span>
                     <span className="text-[9px] text-ds-muted font-bold uppercase tracking-[0.2em] opacity-50">В сети по всему миру</span>
                   </div>
                </div>
              </div>

            </div>

            {/* Футер-кнопка */}
            {!isElectron && (
              <div className="mt-16 animate-fade-in delay-500">
                <a
                  href={downloadUrl}
                  className="group relative px-10 py-5 bg-ds-accent text-black font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all hover:scale-[1.05] active:scale-95 shadow-2xl animate-vibe-btn overflow-hidden block"
                >
                  <div className="absolute inset-0 vibe-moving-glow opacity-30 group-hover:opacity-100 transition-opacity" />
                  <span className="relative z-10 flex items-center gap-3">
                    <Download size={20} strokeWidth={3} />
                    СКАЧАТЬ ДЛЯ WINDOWS
                  </span>
                </a>
              </div>
            )}
          </div>
        ) : activeDM ? (
          <DirectMessagePanel
            currentUser={auth.user}
            username={displayUsername}
            userColor={displayColor}
            targetMember={members.find(m => m.id === activeDM.id) ?? activeDM}
            onClose={handleCloseDM}
          />
        ) : !selectedChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-10 text-center p-12 bg-ds-servers/40 backdrop-blur-[40px] relative animate-fade-in overflow-hidden">
            <div className="w-28 h-28 rounded-[2.5rem] bg-ds-bg/40 flex items-center justify-center border-2 border-ds-accent/10 relative overflow-hidden group shadow-2xl shadow-ds-accent/5">
               <div className="absolute inset-0 vibe-moving-glow opacity-10" />
               <svg viewBox="0 0 24 24" className="w-14 h-14 drop-shadow-[0_0_12px_rgba(0,240,255,0.6)] contrast-125">
                 <path fill="#00f0ff" d="M12 2L14.4 8.6H21L15.6 12.7L18 19.3L12 15.2L6 19.3L8.4 12.7L3 8.6H9.6L12 2Z" />
               </svg>
            </div>
            <div className="max-w-xs">
              <h3 className="text-ds-text font-black text-2xl tracking-tighter mb-2 uppercase">Сервер «{selectedServer.name}»</h3>
              <p className="text-ds-muted text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed">
                 Выбери текстовый или голосовой канал слева, чтобы окунуться в общение.
              </p>
            </div>
            {!isElectron && (
              <a
                href={downloadUrl}
                className="relative px-10 py-4 bg-ds-accent text-black font-black uppercase tracking-widest text-[13px] rounded-full transition-all active:scale-95 shadow-2xl animate-vibe-btn overflow-hidden group"
              >
                <div className="absolute inset-0 vibe-moving-glow opacity-40 group-hover:opacity-100 transition-opacity" />
                <span className="relative z-10">НУЖНО ПРИЛОЖЕНИЕ? ТЫКАЙ СЮДА</span>
              </a>
            )}
          </div>
        ) : selectedChannel.type === 'text' ? (
          <TextChannel
            channel={selectedChannel}
            user={auth.user}
            ownerId={selectedServer?.owner_id}
            username={displayUsername}
            userColor={displayColor}
            downloadUrl={downloadUrl}
          />
        ) : (
          <VoiceChannel
            channel={selectedChannel}
            user={auth.user}
            ownerId={selectedServer?.owner_id}
            username={displayUsername}
            userColor={displayColor}
            voice={voice}
            downloadUrl={downloadUrl}
          />
        )}
      </main>

      {/* ── Участники сервера (справа) ── */}
      {selectedServer && (
        <MembersPanel
          members={members}
          loading={false}
          currentUserId={auth.user?.id}
          ownerId={selectedServer?.owner_id}
          onOpenDM={handleOpenDM}
          unreadCounts={unreadCounts}
        />
      )}

      {/* ── Модалки ── */}
      {settingsOpen && (
        <SettingsModal
          user={auth.user}
          username={displayUsername}
          userColor={displayColor}
          ownerId={selectedServer?.owner_id}
          onClose={() => setSettingsOpen(false)}
          onSignOut={auth.signOut}
          onUsernameChange={(newName, newColor) => {
            auth.refreshUser?.();
          }}
          theme={theme}
          onThemeChange={setTheme}
        />
      )}

      {serverEntryOpen && (
        <ServerEntryModal
          currentUserId={auth.user.id}
          onClose={() => setServerEntryOpen(false)}
          onServerJoined={(server) => {
            setServerEntryOpen(false);
            setServerRefresh(r => r + 1); // триггерим обновление панели серверов
            handleSelectServer(server);
          }}
        />
      )}

      {serverSettingsOpen && selectedServer && (
        <ServerSettingsModal
          server={selectedServer}
          currentUserId={auth.user.id}
          onClose={() => setServerSettingsOpen(false)}
          onServerDeleted={() => {
            setSelectedServer(null);
            setSelectedChannel(null);
          }}
        />
      )}
      </div>
    </div>
  );
}
