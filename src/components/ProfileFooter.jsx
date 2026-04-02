import React, { memo } from 'react';
import { UserPanel } from './UserPanel';
import { useStore } from '../store/useStore';

/**
 * Объединенный компонент профиля и виджета обновлений.
 * Используется в Sidebar и в App (когда сервер не выбран).
 */
export const ProfileFooter = memo(({ 
  onSignOut, voice,
  updateStatus, updateInfo, updateProgress, updateError, isElectron, onCheckUpdate, onDownload, onInstall, appVersion,
  ownerId, currentUserId
}) => {
  const { localUsername: username, localColor: userColor } = useStore();

  return (
    <div className="flex flex-col flex-shrink-0 bg-ds-sidebar border-t border-white/5 relative z-10 transition-all duration-300">
      <UserPanel 
        onSignOut={onSignOut} 
        voice={voice} 
        ownerId={ownerId}
        currentUserId={currentUserId}
      />

      <div className="flex items-center gap-2 px-3 pb-2 text-ds-muted flex-shrink-0 pt-0.5">
        <span className="text-[10px] font-mono select-none tracking-tighter opacity-80 hover:opacity-100 transition-opacity">
          V{isElectron ? (window.electronAPI?.version || '...') : (appVersion || 'WEB')}
        </span>
 
        {isElectron && (
          <div className="ml-auto flex items-center">
            {updateStatus === 'idle' && (
              <button
                onClick={onCheckUpdate}
                title="Проверить обновления"
                className="text-[9px] font-bold uppercase tracking-widest hover:text-ds-accent transition-all cursor-pointer opacity-70 hover:opacity-100"
              >
                CHECK UPDATE
              </button>
            )}

            {updateStatus === 'checking' && (
              <span className="text-[9px] font-bold uppercase tracking-widest animate-pulse text-ds-accent">SEARCHING...</span>
            )}

            {updateStatus === 'uptodate' && (
              <span className="text-[9px] font-bold uppercase tracking-widest text-ds-green/40">LATEST VERSION</span>
            )}

            {updateStatus === 'available' && (
              <button
                onClick={onDownload}
                className="text-[10px] bg-ds-accent text-black px-2 py-0.5 rounded-full font-bold hover:brightness-110 vibe-glow-blue transition-all"
              >
                UPDATE v{updateInfo?.version}
              </button>
            )}

            {updateStatus === 'downloading' && (
              <div className="flex items-center gap-2">
                <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                   <div className="h-full bg-ds-accent vibe-glow-blue" style={{ width: `${updateProgress}%` }} />
                </div>
                <span className="text-[9px] font-bold text-ds-accent">{updateProgress}%</span>
              </div>
            )}

            {updateStatus === 'ready' && (
              <button
                onClick={onInstall}
                className="text-[10px] bg-ds-green text-white px-3 py-1 rounded-full font-bold hover:brightness-110 vibe-glow-blue animate-bounce"
              >
                RESTART TO UPDATE
              </button>
            )}

            {updateStatus === 'error' && (
              <button
                onClick={onCheckUpdate}
                title={updateError || 'Ошибка'}
                className="text-[9px] font-bold text-ds-red/50 hover:text-ds-red uppercase tracking-widest"
              >
                UPDATE FAILED
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
