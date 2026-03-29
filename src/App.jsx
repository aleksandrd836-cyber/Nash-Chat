import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useVoice } from './hooks/useVoice';
import { useMembers } from './hooks/useMembers';
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

  const isElectron = !!window.electronAPI;

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
  }

  function handleCloseDM() {
    setActiveDM(null);
  }

  // Загрузка зарегистрированных пользователей
  const { members } = useMembers(auth.user);

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
          </div>
        ) : selectedChannel.type === 'text' ? (
          <TextChannel
            channel={selectedChannel}
            user={auth.user}
            username={displayUsername}
            userColor={displayColor}
          />
        ) : (
          <VoiceChannel
            channel={selectedChannel}
            user={auth.user}
            username={displayUsername}
            userColor={displayColor}
            voice={voice}
          />
        )}
      </main>

      {/* Right members panel */}
      <MembersPanel
        members={members}
        loading={false}
        currentUserId={auth.user?.id}
        onOpenDM={handleOpenDM}
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
