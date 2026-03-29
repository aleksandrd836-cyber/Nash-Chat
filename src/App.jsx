import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useVoice } from './hooks/useVoice';
import { useMembers } from './hooks/useMembers';
import { useUnreadDMs } from './hooks/useUnreadDMs';
import { AuthPage } from './components/AuthPage';
import { Sidebar } from './components/Sidebar';
import { TextChannel } from './components/TextChannel';
import { VoiceChannel } from './components/VoiceChannel';
import { SettingsModal } from './components/SettingsModal';
import { MembersPanel } from './components/MembersPanel';
import { DirectMessagePanel } from './components/DirectMessagePanel';

export default function App() {
  const auth  = useAuth();
  const voice = useVoice();

  const [selectedChannel, setSelectedChannel] = useState(null);
  const [settingsOpen, setSettingsOpen]       = useState(false);
  const [localUsername, setLocalUsername]     = useState(null);
  const [localColor, setLocalColor]           = useState(null);

  // DM: открытый диалог с участником
  const [activeDM, setActiveDM] = useState(null);  // member object | null

  // Инициализируем localColor из user_metadata при первом получении данных пользователя
  useEffect(() => {
    if (auth.user && localColor === null) {
      const savedColor = auth.user.user_metadata?.user_color;
      if (savedColor) setLocalColor(savedColor);
    }
  }, [auth.user]);

  // Состояние обновления: idle | checking | available | downloading | ready | uptodate | error
  const [updateStatus,   setUpdateStatus]   = useState('idle');
  const [updateInfo,     setUpdateInfo]     = useState(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError,    setUpdateError]    = useState('');
  const [downloadUrl,    setDownloadUrl]    = useState('https://github.com/aleksandrd836-cyber/Nash-Chat/releases/latest');

  const isElectron = !!window.electronAPI;

  // Автоматическое получение ссылки на актуальный .exe для сайта
  useEffect(() => {
    if (isElectron) return;
    fetch('https://api.github.com/repos/aleksandrd836-cyber/Nash-Chat/releases/latest')
      .then(res => res.json())
      .then(data => {
        const asset = data.assets?.find(a => a.name.endsWith('.exe'));
        if (asset) setDownloadUrl(asset.browser_download_url);
      })
      .catch(err => console.error('GitHub API error:', err));
  }, [isElectron]);

  useEffect(() => {
    if (!isElectron) return;
    const api = window.electronAPI;

    api.onUpdateAvailable((info) => {
      setUpdateInfo(info);
      setUpdateStatus('available');
    });
    api.onUpdateProgress?.((p) => {
      setUpdateProgress(Math.round(p.percent));
      setUpdateStatus('downloading');
    });
    api.onUpdateDownloaded?.(() => setUpdateStatus('ready'));
    api.onUpdateError?.((msg) => {
      setUpdateError(msg);
      setUpdateStatus('error');
    });
  }, [isElectron]);

  const handleCheckUpdate = async () => {
    setUpdateStatus('checking');
    setUpdateError('');
    try { await window.electronAPI.checkForUpdates(); }
    catch (e) { setUpdateError(e?.message || String(e)); setUpdateStatus('error'); }
    // Если нет новой версии — показать "актуальная версия" на 3с
    setTimeout(() => setUpdateStatus(s => s === 'checking' ? 'uptodate' : s), 3000);
    setTimeout(() => setUpdateStatus(s => s === 'uptodate'  ? 'idle'    : s), 6000);
  };

  const handleDownload = async () => {
    setUpdateStatus('downloading');
    await window.electronAPI.downloadUpdate();
  };

  const handleInstall = () => window.electronAPI.installUpdate();

  const displayUsername = localUsername ?? auth.user?.user_metadata?.username ?? auth.username;
  const displayColor    = localColor || null;

  function handleSelectChannel(channel) {
    setActiveDM(null);   // закрываем DM при переходе в канал
    setSelectedChannel(channel);
  }

  function handleOpenDM(member) {
    setActiveDM(member);
    setSelectedChannel(null);  // сбрасываем выбранный канал
    markAsRead(member.id);     // помечаем как прочитанные
  }

  function handleCloseDM() {
    setActiveDM(null);
  }

  // Загрузка зарегистрированных пользователей
  const { members } = useMembers(auth.user);
  
  // Получаем непрочитанные ЛС
  const { unreadCounts, markAsRead } = useUnreadDMs(auth.user?.id, activeDM?.id);

  // Загрузка сессии
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

  // Не авторизован
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

  // Основной интерфейс
  return (
    <div className="flex h-screen overflow-hidden bg-ds-bg">
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
      />

      <main className="flex-1 flex min-w-0 overflow-hidden">
        {activeDM ? (
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
              <p className="text-ds-text text-xl font-bold">Привет, {displayUsername}!</p>
              <p className="text-ds-muted text-sm mt-1">Выбери канал слева, чтобы начать общение</p>
            </div>
            
            {!isElectron && (
              <a 
                href={downloadUrl}
                className="mt-4 flex items-center gap-3 px-6 py-3 bg-ds-green hover:bg-ds-green/90 text-white font-bold rounded-xl transition-all shadow-xl shadow-ds-green/20 group animate-pulse-soft"
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

      {/* Right members panel */}
      <MembersPanel
        members={members}
        loading={false}
        currentUserId={auth.user?.id}
        onOpenDM={handleOpenDM}
        unreadCounts={unreadCounts}
      />

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          user={auth.user}
          username={displayUsername}
          userColor={displayColor}
          onClose={() => setSettingsOpen(false)}
          onUsernameChange={(newName, newColor) => {
            setLocalUsername(newName);
            setLocalColor(newColor || null);
            // Принудительно обновляем auth.user, чтобы user_metadata подтянулся
            auth.refreshUser?.();
          }}
        />
      )}
    </div>
  );
}
