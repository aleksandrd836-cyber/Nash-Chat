import React, { useState } from 'react';
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
  // Храним ник локально, чтобы он обновлялся сразу после сохранения в настройках
  const [localUsername, setLocalUsername]     = useState(null);

  const displayUsername = localUsername ?? auth.username;

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
          />
        ) : (
          <VoiceChannel
            channel={selectedChannel}
            user={auth.user}
            username={displayUsername}
            voice={voice}
          />
        )}
      </main>

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          user={auth.user}
          username={displayUsername}
          onClose={() => setSettingsOpen(false)}
          onUsernameChange={(newName) => setLocalUsername(newName)}
        />
      )}

      {/* Version badge */}
      <div className="fixed bottom-2 right-3 z-50 pointer-events-none select-none">
        <span className="text-[10px] text-ds-muted/50 font-mono tracking-wide">
          v{APP_VERSION}
        </span>
      </div>
    </div>
  );
}
