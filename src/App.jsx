import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useVoice } from './hooks/useVoice';
import { AuthPage } from './components/AuthPage';
import { Sidebar } from './components/Sidebar';
import { TextChannel } from './components/TextChannel';
import { VoiceChannel } from './components/VoiceChannel';
import { SettingsModal } from './components/SettingsModal';

export default function App() {
  const auth  = useAuth();
  const voice = useVoice();

  const [selectedChannel, setSelectedChannel] = useState(null);
  const [settingsOpen, setSettingsOpen]       = useState(false);
  const [localUsername, setLocalUsername]     = useState(null);
  const [localColor, setLocalColor]           = useState(null);

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
    setSelectedChannel(channel);
  }

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
      />

      <main className="flex-1 flex min-w-0 overflow-hidden">
        {!selectedChannel ? (
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

      {/* Version + Update widget */}
      <div className="fixed bottom-2 right-3 z-50 flex items-center gap-2">
        {/* Версия — видна всегда */}
        <span className="text-[10px] text-ds-muted/50 font-mono">
          v{isElectron ? window.electronAPI.version : APP_VERSION}
        </span>

        {/* Кнопка обновления — только в Electron */}
        {isElectron && updateStatus === 'idle' && (
          <button
            onClick={handleCheckUpdate}
            title="Проверить обновления"
            className="text-[10px] text-ds-muted/40 hover:text-ds-accent transition-colors cursor-pointer"
          >
            ↑ обновления
          </button>
        )}

        {isElectron && updateStatus === 'checking' && (
          <span className="text-[10px] text-ds-muted animate-pulse">проверка...</span>
        )}

        {isElectron && updateStatus === 'uptodate' && (
          <span className="text-[10px] text-ds-green/70">✓ актуальная версия</span>
        )}

        {isElectron && updateStatus === 'available' && (
          <button
            onClick={handleDownload}
            className="text-[10px] bg-ds-accent text-white px-2 py-0.5 rounded font-semibold hover:opacity-90 transition-opacity"
          >
            ↓ v{updateInfo?.version}
          </button>
        )}

        {isElectron && updateStatus === 'downloading' && (
          <span className="text-[10px] text-ds-accent animate-pulse">
            ↓ {updateProgress}%
          </span>
        )}

        {isElectron && updateStatus === 'ready' && (
          <button
            onClick={handleInstall}
            className="text-[10px] bg-ds-green text-white px-2 py-0.5 rounded font-semibold hover:opacity-90 transition-opacity animate-pulse"
          >
            ↻ перезапустить
          </button>
        )}

        {isElectron && updateStatus === 'error' && (
          <button
            onClick={handleCheckUpdate}
            title={updateError || 'Неизвестная ошибка'}
            className="text-[10px] text-ds-red/70 hover:text-ds-red transition-colors"
          >
            ошибка, повторить
          </button>
        )}
      </div>
    </div>
  );
}
