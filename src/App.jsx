import React, { useState, useEffect, lazy, Suspense, startTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { useVoice } from './hooks/useVoice';
import { useMembers } from './hooks/useMembers';
import { useUnreadDMs } from './hooks/useUnreadDMs';
import { useRecentConversations } from './hooks/useRecentConversations';
import { useAppUpdates } from './hooks/useAppUpdates';
import { useStore } from './store/useStore';

import { ErrorBoundary } from './components/ErrorBoundary';
import { ServerSidebar } from './components/ServerSidebar';
import { Sidebar } from './components/Sidebar';
import { ProfileFooter } from './components/ProfileFooter';

import { Globe, MessageSquare } from 'lucide-react';

// Ленивая загрузка тяжелых компонентов
const AuthPage = lazy(() => import('./components/AuthPage').then(m => ({ default: m.AuthPage })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const ServerEntryModal = lazy(() => import('./components/ServerEntryModal').then(m => ({ default: m.ServerEntryModal })));
const ServerSettingsModal = lazy(() => import('./components/ServerSettingsModal').then(m => ({ default: m.ServerSettingsModal })));
const TextChannel = lazy(() => import('./components/TextChannel').then(m => ({ default: m.TextChannel })));
const VoiceChannel = lazy(() => import('./components/VoiceChannel').then(m => ({ default: m.VoiceChannel })));
const MembersPanel = lazy(() => import('./components/MembersPanel').then(m => ({ default: m.MembersPanel })));
const DirectMessagePanel = lazy(() => import('./components/DirectMessagePanel').then(m => ({ default: m.DirectMessagePanel })));
const Hub = lazy(() => import('./components/Hub').then(m => ({ default: m.Hub })));

/** Глобальный спиннер для ленивой загрузки */
const LoadingFallback = () => (
  <div className="flex items-center justify-center p-20 opacity-50">
    <div className="w-8 h-8 border-2 border-ds-accent border-t-transparent rounded-full animate-spin" />
  </div>
);

const PanelLoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center bg-ds-servers/40 backdrop-blur-[40px]">
    <div className="flex flex-col items-center gap-4 opacity-70">
      <div className="w-10 h-10 border-2 border-ds-accent border-t-transparent rounded-full animate-spin" />
      <span className="text-[10px] text-ds-muted font-black uppercase tracking-[0.3em]">Загрузка</span>
    </div>
  </div>
);

export default function AppWithBoundary() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}

function App() {
  const auth  = useAuth();
  const voice = useVoice();

  const {
    theme, setTheme,
    settingsOpen, setSettingsOpen,
    serverEntryOpen, setServerEntryOpen,
    serverSettingsOpen, setServerSettingsOpen,
    isDMHubOpen, setIsDMHubOpen,
    selectedServer, setSelectedServer,
    selectedChannel, setSelectedChannel,
    activeDM, setActiveDM,
    serverRefresh, triggerServerRefresh,
    localUsername, setLocalUsername,
    localColor, setLocalColor
  } = useStore();

  const [centerImageError, setCenterImageError] = useState(false);

  const { conversations: recentConvs, loading: recentLoading } = useRecentConversations(auth.user?.id);

  // Глобальный счетчик непрочитанных ЛС для баджей
  const unreadDMs = useUnreadDMs(auth.user?.id, null);
  const totalUnreadDMs = Object.values(unreadDMs.unreadCounts).reduce((a, b) => a + b, 0);

  // Сброс состояния хаба при переключении на сервер
  useEffect(() => {
    if (selectedServer) setIsDMHubOpen(false);
  }, [selectedServer, setIsDMHubOpen]);
  
  // DM
  // (Логика уже в сторе)

  useEffect(() => {
    if (auth.user) {
      if (localColor === null) {
        const savedColor = auth.user.user_metadata?.user_color;
        if (savedColor) setLocalColor(savedColor);
      }
      if (localUsername === null) {
        const savedName = auth.user.user_metadata?.username || auth.username;
        if (savedName) setLocalUsername(savedName);
      }
    }
  }, [auth.user, localUsername, localColor, setLocalColor, setLocalUsername, auth.username]);

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
  const isElectron = !!window.electronAPI;
  const updates = useAppUpdates(isElectron);

  const displayUsername = localUsername ?? auth.user?.user_metadata?.username ?? auth.username;
  const displayColor    = localColor || null;

  function handleSelectChannel(channel) {
    startTransition(() => {
      setSelectedChannel(channel);
    });
  }

  function handleOpenDM(member) {
    startTransition(() => {
      setActiveDM(member);
    });
    unreadDMs.markAsRead(member.id);
  }

  function handleCloseDM() {
    startTransition(() => {
      setActiveDM(null);
    });
  }

  // При смене сервера — сбрасываем канал и DM
  function handleSelectServer(server) {
    startTransition(() => {
      setSelectedServer(server);
    });
    setCenterImageError(false); // Сброс ошибки при смене сервера
  }

  function handleOpenSettings() {
    startTransition(() => {
      setSettingsOpen(true);
    });
  }

  function handleOpenServerEntry() {
    startTransition(() => {
      setServerEntryOpen(true);
    });
  }

  function handleOpenServerSettings() {
    startTransition(() => {
      setServerSettingsOpen(true);
    });
  }

  function handleOpenHome() {
    startTransition(() => {
      setSelectedServer(null);
      setActiveDM(null);
    });
  }

  function handleOpenDMHub() {
    startTransition(() => {
      setSelectedServer(null);
      setIsDMHubOpen(true);
    });
  }

  const { members } = useMembers(auth.user, selectedServer?.id);

  if (auth.loading) {
    return (
      <div className="min-h-screen bg-ds-bg flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-ds-accent/10 rounded-full animate-pulse-soft opacity-30" />
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
      <Suspense fallback={<div className="h-screen bg-ds-bg" />}>
        <AuthPage
          onSignIn={auth.signIn}
          onSignUp={auth.signUp}
          error={auth.error}
          setError={auth.setError}
        />
      </Suspense>
    );
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-ds-bg select-none">
      {/* Global Vibe Atmosphere */}
      <div className="vibe-background-nebula">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] bg-ds-accent/20 rounded-full animate-vibe-pulse mix-blend-screen" />
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-ds-accent/15 via-transparent to-purple-500/15 animate-aurora-sweep opacity-50" />
          <div className="absolute bottom-0 right-0 w-[80%] h-[80%] bg-gradient-to-bl from-blue-500/15 via-transparent to-ds-accent/15 animate-aurora-shift opacity-60" />
          <div className="absolute -top-20 -left-20 w-[45%] h-[45%] bg-purple-600/15 rounded-full animate-vibe-pulse opacity-30 mix-blend-screen" />
      </div>

      <div className="flex w-full h-full relative z-10">
        <ServerSidebar
          currentUserId={auth.user.id}
          selectedServerId={selectedServer?.id}
          onSelectServer={handleSelectServer}
          onCreateServer={handleOpenServerEntry}
          onHomeClick={handleOpenHome}
          refreshTrigger={serverRefresh}
        />

        {selectedServer ? (
          <Sidebar
            username={displayUsername}
            userColor={displayColor}
            currentUserId={auth.user?.id}
            selectedChannel={selectedChannel}
            onSelectChannel={handleSelectChannel}
            onSignOut={auth.signOut}
            voice={voice}
            onOpenSettings={handleOpenSettings}
            updateStatus={updates.updateStatus}
            updateInfo={updates.updateInfo}
            updateProgress={updates.updateProgress}
            updateError={updates.updateError}
            isElectron={isElectron}
            onCheckUpdate={updates.handleCheckUpdate}
            onDownload={updates.handleDownload}
            onInstall={updates.handleInstall}
            appVersion={typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''}
            selectedServer={selectedServer}
            ownerId={selectedServer?.owner_id}
            isOwner={selectedServer.owner_id === auth.user.id}
            onOpenServerSettings={handleOpenServerSettings}
          />
        ) : (
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
                onClick={handleOpenServerEntry}
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
              onOpenSettings={handleOpenSettings}
              updateStatus={updates.updateStatus}
              updateInfo={updates.updateInfo}
              updateProgress={updates.updateProgress}
              updateError={updates.updateError}
              isElectron={isElectron}
              onCheckUpdate={updates.handleCheckUpdate}
              onDownload={updates.handleDownload}
              onInstall={updates.handleInstall}
              appVersion={typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''}
              ownerId={null}
              currentUserId={auth.user?.id}
            />
          </div>
        )}

        <main className="flex-1 flex min-w-0 overflow-hidden relative">
          <Suspense fallback={<PanelLoadingFallback />}>
          {!selectedServer && !activeDM ? (
            <Hub
              isDMHubOpen={isDMHubOpen}
              setIsDMHubOpen={setIsDMHubOpen}
              recentLoading={recentLoading}
              recentConvs={recentConvs}
              user={auth.user}
              displayUsername={displayUsername}
              displayColor={displayColor}
              setServerEntryOpen={setServerEntryOpen}
              setActiveDM={setActiveDM}
              isElectron={isElectron}
              downloadUrl={updates.downloadUrl}
            />
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
                 {selectedServer.icon_url && !centerImageError ? (
                   <img 
                     src={selectedServer.icon_url} 
                     alt={selectedServer.name} 
                     onError={() => setCenterImageError(true)}
                     className="w-full h-full object-cover z-10 transition-transform duration-500 group-hover:scale-110" 
                   />
                 ) : (
                   <span className="text-5xl font-black text-ds-accent uppercase tracking-tighter z-10 transition-transform duration-500 group-hover:scale-110 drop-shadow-[0_0_15px_rgba(0,240,255,0.5)]">
                     {selectedServer.name?.[0]?.toUpperCase() ?? '?'}
                   </span>
                 )}
              </div>
              <div className="max-w-xs">
                <h3 className="text-ds-text font-black text-2xl tracking-tighter mb-2 uppercase">Сервер «{selectedServer.name}»</h3>
                <p className="text-ds-muted text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed">
                   Выбери текстовый или голосовой канал слева, чтобы окунуться в общение.
                </p>
              </div>
            </div>
          ) : selectedChannel.type === 'text' ? (
            <TextChannel
              channel={selectedChannel}
              user={auth.user}
              ownerId={selectedServer?.owner_id}
              username={displayUsername}
              userColor={displayColor}
              downloadUrl={updates.downloadUrl}
            />
          ) : (
            <VoiceChannel
              channel={selectedChannel}
              user={auth.user}
              ownerId={selectedServer?.owner_id}
              username={displayUsername}
              userColor={displayColor}
              voice={voice}
              downloadUrl={updates.downloadUrl}
            />
          )}
          </Suspense>

          {/* Floating Action Button (FAB) */}
          <button
             onClick={handleOpenDMHub}
             className="absolute bottom-40 right-10 w-16 h-16 rounded-full bg-ds-bg/60 backdrop-blur-3xl flex items-center justify-center text-ds-accent vibe-fab z-50 group hover:rotate-[360deg] duration-700 transition-all border border-ds-accent/30 shadow-[0_0_20px_rgba(var(--ds-accent-rgb),0.3)]"
             title="Личные сообщения"
          >
             <div className="absolute inset-0 vibe-moving-glow opacity-20 rounded-full" />
             <MessageSquare size={28} className="relative z-10 drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]" />
             {totalUnreadDMs > 0 && (
               <div className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 bg-ds-red text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-ds-bg shadow-lg animate-bounce z-20">
                 {totalUnreadDMs}
               </div>
             )}
          </button>
        </main>

        {selectedServer && (
          <Suspense fallback={<LoadingFallback />}>
            <MembersPanel
              members={members}
              loading={false}
              currentUserId={auth.user?.id}
              ownerId={selectedServer?.owner_id}
              onOpenDM={handleOpenDM}
              unreadCounts={unreadDMs.unreadCounts}
            />
          </Suspense>
        )}

        {/* ── Модалки (с ленивой загрузкой) ── */}
        <AnimatePresence>
          <Suspense fallback={<LoadingFallback />}>
            {settingsOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[100]"
              >
                <SettingsModal
                  user={auth.user}
                  username={displayUsername}
                  userColor={displayColor}
                  ownerId={selectedServer?.owner_id}
                  onClose={() => setSettingsOpen(false)}
                  onSignOut={auth.signOut}
                  onUsernameChange={(nextUsername, nextColor) => {
                    setLocalUsername(nextUsername);
                    setLocalColor(nextColor ?? null);
                    auth.refreshUser?.();
                  }}
                  theme={theme}
                  onThemeChange={setTheme}
                />
              </motion.div>
            )}

            {serverEntryOpen && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed inset-0 z-[100]"
              >
                <ServerEntryModal
                  currentUserId={auth.user.id}
                  onClose={() => setServerEntryOpen(false)}
                  onServerJoined={(server) => {
                    setServerEntryOpen(false);
                    triggerServerRefresh();
                    handleSelectServer(server);
                  }}
                />
              </motion.div>
            )}

            {serverSettingsOpen && selectedServer && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="fixed inset-0 z-[100]"
              >
                <ServerSettingsModal
                  server={selectedServer}
                  currentUserId={auth.user.id}
                  onClose={() => setServerSettingsOpen(false)}
                  onServerDeleted={() => {
                    startTransition(() => {
                      setSelectedServer(null);
                      setSelectedChannel(null);
                    });
                  }}
                />
              </motion.div>
            )}
          </Suspense>
        </AnimatePresence>
      </div>
    </div>
  );
}
