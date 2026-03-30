import React from 'react';
import { UserPanel } from './UserPanel';

/**
 * Объединенный компонент профиля и виджета обновлений.
 * Используется в Sidebar и в App (когда сервер не выбран).
 */
export function ProfileFooter({ 
  username, userColor, onSignOut, voice, onOpenSettings,
  updateStatus, updateInfo, updateProgress, updateError, isElectron, onCheckUpdate, onDownload, onInstall, appVersion 
}) {
  return (
    <div className="flex flex-col flex-shrink-0">
      <UserPanel 
        username={username} 
        userColor={userColor} 
        onSignOut={onSignOut} 
        voice={voice} 
        onOpenSettings={onOpenSettings} 
      />

      <div className="flex items-center gap-2 px-3 pb-2 bg-ds-servers text-ds-muted/50 flex-shrink-0 relative z-10 -mt-1 pt-1">
        <span className="text-[10px] font-mono select-none">
          v{isElectron ? (window.electronAPI?.version || '...') : (appVersion || 'web')}
        </span>

        {isElectron && (
          <div className="ml-auto pointer-events-auto">
            {updateStatus === 'idle' && (
              <button
                onClick={onCheckUpdate}
                title="Проверить обновления"
                className="text-[10px] hover:text-ds-accent transition-colors cursor-pointer"
              >
                ↑ обновления
              </button>
            )}

            {updateStatus === 'checking' && (
              <span className="text-[10px] animate-pulse">проверка...</span>
            )}

            {updateStatus === 'uptodate' && (
              <span className="text-[10px] text-ds-green/70">✓ актуально</span>
            )}

            {updateStatus === 'available' && (
              <button
                onClick={onDownload}
                className="text-[10px] bg-ds-accent text-white px-2 py-0.5 rounded font-semibold hover:opacity-90"
              >
                ↓ v{updateInfo?.version}
              </button>
            )}

            {updateStatus === 'downloading' && (
              <span className="text-[10px] text-ds-accent animate-pulse">
                ↓ {updateProgress}%
              </span>
            )}

            {updateStatus === 'ready' && (
              <button
                onClick={onInstall}
                className="text-[10px] bg-ds-green text-white px-2 py-0.5 rounded font-semibold hover:opacity-90 animate-pulse"
              >
                ↻ обновить
              </button>
            )}

            {updateStatus === 'error' && (
              <button
                onClick={onCheckUpdate}
                title={updateError || 'Ошибка'}
                className="text-[10px] text-ds-red/70 hover:text-ds-red"
              >
                ошибка
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
