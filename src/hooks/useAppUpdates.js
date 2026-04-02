import { useState, useEffect } from 'react';

/**
 * Хук для управления обновлениями Electron приложения
 */
export function useAppUpdates(isElectron) {
  const [updateStatus, setUpdateStatus] = useState('idle');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError, setUpdateError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('https://github.com/aleksandrd836-cyber/Nash-Chat/releases/latest');

  // Получение прямой ссылки на скачивание для веб-версии
  useEffect(() => {
    if (isElectron) return;
    fetch('https://api.github.com/repos/aleksandrd836-cyber/Nash-Chat/releases/latest')
      .then(res => res.json())
      .then(data => {
        const asset = data.assets?.find(a => a.name.endsWith('.exe'));
        if (asset) setDownloadUrl(asset.browser_download_url);
      })
      .catch((err) => console.error('[UpdateHook] Fetch error:', err));
  }, [isElectron]);

  // Слушатели событий Electron
  useEffect(() => {
    if (!isElectron) return;
    const api = window.electronAPI;
    if (!api) return;

    const removeUpdateAvailable = api.onUpdateAvailable((info) => { 
      setUpdateInfo(info); 
      setUpdateStatus('available'); 
    });
    
    const removeUpdateProgress = api.onUpdateProgress?.((p) => { 
      setUpdateProgress(Math.round(p.percent)); 
      setUpdateStatus('downloading'); 
    });
    
    const removeUpdateDownloaded = api.onUpdateDownloaded?.(() => setUpdateStatus('ready'));
    
    const removeUpdateError = api.onUpdateError?.((msg) => { 
      setUpdateError(msg); 
      setUpdateStatus('error'); 
    });

    return () => {
      // Пытаемся вызвать отписку, если API это поддерживает
      if (typeof removeUpdateAvailable === 'function') removeUpdateAvailable();
      if (typeof removeUpdateProgress === 'function') removeUpdateProgress();
      if (typeof removeUpdateDownloaded === 'function') removeUpdateDownloaded();
      if (typeof removeUpdateError === 'function') removeUpdateError();
    };
  }, [isElectron]);

  const handleCheckUpdate = async () => {
    if (!isElectron) return;
    setUpdateStatus('checking');
    setUpdateError('');
    try { 
      await window.electronAPI.checkForUpdates(); 
    } catch (e) { 
      setUpdateError(e?.message || String(e)); 
      setUpdateStatus('error'); 
    }
    // Автосброс статуса "обновлений нет"
    setTimeout(() => setUpdateStatus(s => s === 'checking' ? 'uptodate' : s), 3000);
    setTimeout(() => setUpdateStatus(s => s === 'uptodate' ? 'idle' : s), 6000);
  };

  const handleDownload = async () => { 
    if (!isElectron) return;
    setUpdateStatus('downloading'); 
    await window.electronAPI.downloadUpdate(); 
  };

  const handleInstall = () => {
    if (!isElectron) return;
    window.electronAPI.installUpdate();
  };

  return {
    updateStatus,
    updateInfo,
    updateProgress,
    updateError,
    downloadUrl,
    handleCheckUpdate,
    handleDownload,
    handleInstall
  };
}
