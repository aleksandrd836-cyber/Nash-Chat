import { create } from 'zustand';

/**
 * Глобальное хранилище состояния приложения Vibe.
 * Позволяет компонентам подписываться только на нужные изменения,
 * избавляя App.jsx от лишних ререндеров.
 */
export const useStore = create((set) => ({
  // ── UI Состояние ──
  theme: localStorage.getItem('theme') || 'dark',
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    set({ theme });
  },

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  serverEntryOpen: false,
  setServerEntryOpen: (open) => set({ serverEntryOpen: open }),

  serverSettingsOpen: false,
  setServerSettingsOpen: (open) => set({ serverSettingsOpen: open }),

  isDMHubOpen: false,
  setIsDMHubOpen: (open) => set({ isDMHubOpen: open }),

  // ── Навигация ──
  selectedServer: null,
  setSelectedServer: (server) => set({ 
    selectedServer: server,
    selectedChannel: null,
    activeDM: null,
    isDMHubOpen: false 
  }),

  selectedChannel: null,
  setSelectedChannel: (channel) => set({ 
    selectedChannel: channel,
    activeDM: null 
  }),

  activeDM: null,
  setActiveDM: (dm) => set({ 
    activeDM: dm,
    selectedChannel: null 
  }),

  // Дополнительно: триггер для обновления сайдбаров
  serverRefresh: 0,
  triggerServerRefresh: () => set((state) => ({ serverRefresh: state.serverRefresh + 1 })),

  // ── Пользовательские данные ──
  localUsername: null,
  setLocalUsername: (name) => set({ localUsername: name }),

  localColor: null,
  setLocalColor: (color) => set({ localColor: color }),
}));
