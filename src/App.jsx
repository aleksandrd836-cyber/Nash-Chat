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
import { Globe, Sparkles, Hash, Download } from 'lucide-react';

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
                <img src="/logo.png" alt="Vibe Logo" className="w-14 h-14 object-contain animate-pulse mix-blend-screen" />
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
          isOwner={selectedServer.owner_id === auth.user.id}
          onOpenServerSettings={() => setServerSettingsOpen(true)}
        />
      ) : (
        // Заглушка если сервер не выбран
        <div className="w-60 flex-shrink-0 bg-ds-sidebar flex flex-col border-r border-white/5 relative">
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
          />
        </div>
      )}

      {/* ── Основной контент ── */}
      <main className="flex-1 flex min-w-0 overflow-hidden">
        {!selectedServer ? (
          // Экран приветствия когда нет сервера
          <div className="flex-1 flex flex-col items-center justify-center gap-10 text-center p-12 bg-ds-servers/40 backdrop-blur-[40px] relative overflow-hidden">
            <div className="relative group/glow">
               <div className="w-32 h-32 rounded-[3.5rem] bg-black/40 flex items-center justify-center border-2 border-white/10 relative z-10 overflow-hidden shadow-2xl transition-transform hover:scale-105 duration-500">
                  <img src="/logo.png" alt="Vibe Logo" className="w-20 h-20 object-contain mix-blend-screen" />
                  <div className="absolute inset-0 vibe-moving-glow opacity-20" />
               </div>
               <div className="absolute inset-[-10px] bg-ds-accent/10 blur-2xl rounded-full opacity-40 animate-vibe-pulse" />
            </div>
            <div className="relative z-10 max-w-sm">
              <h2 className="text-ds-text font-black text-4xl tracking-tighter mb-4 uppercase">Привет, {displayUsername}!</h2>
              <p className="text-ds-muted text-xs font-bold leading-relaxed uppercase tracking-widest">
                 Твоя атмосфера начинается здесь. Настрой сервер и пригласи друзей в мир VIBE.
              </p>
            </div>
            {!isElectron && (
              <a
                href={downloadUrl}
                className="relative z-10 px-8 py-4 bg-ds-accent text-black font-black uppercase tracking-widest text-xs rounded-2xl transition-all hover:scale-[1.05] active:scale-95 shadow-2xl shadow-ds-accent/30 vibe-glow-blue group flex items-center gap-3"
              >
                <Download size={20} strokeWidth={3} className="group-hover:-translate-y-1 transition-transform" />
                СКАЧАТЬ ДЛЯ WINDOWS
              </a>
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
               <img src="/logo.png" alt="Vibe Logo" className="w-14 h-14 object-contain mix-blend-screen opacity-80" />
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
            username={displayUsername}
            userColor={displayColor}
            downloadUrl={downloadUrl}
          />
        ) : (
          <VoiceChannel
            channel={selectedChannel}
            user={auth.user}
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
