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

export default function App() {
  const auth  = useAuth();
  const voice = useVoice();

  const [selectedChannel, setSelectedChannel] = useState(null);
  const [settingsOpen, setSettingsOpen]       = useState(false);
  const [localUsername, setLocalUsername]     = useState(null);
  const [localColor, setLocalColor]           = useState(null);

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
      <div className="min-h-screen bg-ds-servers flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-ds-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-ds-muted text-sm">Загрузка...</p>
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
    <div className="flex h-screen overflow-hidden bg-ds-bg">

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
        <div className="w-60 flex-shrink-0 bg-ds-sidebar flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-ds-hover flex items-center justify-center">
              <span className="text-3xl">🏠</span>
            </div>
            <p className="text-ds-text font-semibold">Выбери или создай сервер</p>
            <p className="text-ds-muted text-xs">Нажми «+» слева чтобы создать сервер или войти по коду от друга</p>
            <button
              onClick={() => setServerEntryOpen(true)}
              className="mt-2 px-4 py-2 bg-ds-accent hover:bg-ds-accent/90 text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-ds-accent/20"
            >
              Создать / Войти
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
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-20 h-20 rounded-full bg-ds-sidebar flex items-center justify-center">
              <span className="text-4xl">👋</span>
            </div>
            <div>
              <p className="text-ds-text text-xl font-bold">Привет, {displayUsername}!</p>
              <p className="text-ds-muted text-sm mt-1">Создай свой сервер или войди по коду друга</p>
            </div>
            {!isElectron && (
              <a
                href={downloadUrl}
                className="mt-4 flex items-center gap-3 px-6 py-3 bg-ds-green hover:bg-ds-green/90 text-white font-bold rounded-xl transition-all shadow-xl shadow-ds-green/20 group"
              >
                <svg className="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12L12 16.5m0 0l4.5-4.5M12 16.5V3" />
                </svg>
                Скачать Vibe для Windows
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
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-20 h-20 rounded-full bg-ds-sidebar flex items-center justify-center">
              <span className="text-4xl">👋</span>
            </div>
            <div>
              <p className="text-ds-text text-xl font-bold">Добро пожаловать на сервер «{selectedServer.name}»!</p>
              <p className="text-ds-muted text-sm mt-1">Выбери канал слева, чтобы начать общение</p>
            </div>
            {!isElectron && (
              <a
                href={downloadUrl}
                className="mt-2 flex items-center gap-3 px-6 py-3 bg-ds-green hover:bg-ds-green/90 text-white font-bold rounded-xl transition-all shadow-xl shadow-ds-green/20 group"
              >
                <svg className="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12L12 16.5m0 0l4.5-4.5M12 16.5V3" />
                </svg>
                Скачать Vibe для Windows
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
          onUsernameChange={(newName, newColor) => {
            setLocalUsername(newName);
            setLocalColor(newColor || null);
            auth.refreshUser?.();
          }}
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
  );
}
