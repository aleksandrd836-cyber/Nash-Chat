import React from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  PlusCircle, 
  Zap, 
  MessageSquare, 
  Download 
} from 'lucide-react';
import { getUserAvatar } from '../lib/avatar';

/**
 * Hub Component — Главная панель управления (Дашборд)
 * Когда не выбран конкретный сервер или личный чат.
 */
export function Hub({
  isDMHubOpen,
  setIsDMHubOpen,
  recentLoading,
  recentConvs,
  user,
  displayUsername,
  displayColor,
  setServerEntryOpen,
  setActiveDM,
  isElectron,
  downloadUrl
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-transparent relative overflow-hidden animate-fade-in group">
      {/* Фрагменты атмосферы */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-ds-accent/5 rounded-full blur-[120px] animate-vibe-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-[100px] animate-aurora-shift pointer-events-none" />
      <div className="absolute inset-0 vibe-moving-glow opacity-[0.02] pointer-events-none" />

      {isDMHubOpen ? (
        // ── Раздел Личных Сообщений ── 
        <div className="relative z-10 w-full max-w-4xl flex flex-col items-center animate-slide-up flex-1 min-h-0 pt-4">
           <div className="flex items-center justify-between w-full mb-8 px-6 flex-shrink-0">
              <button 
                onClick={() => setIsDMHubOpen(false)}
                className="group flex items-center gap-3 text-ds-muted hover:text-ds-text transition-all px-4 py-2 rounded-2xl border border-white/5 vibe-panel"
              >
                <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-widest">Назад в Хаб</span>
              </button>
              <h2 className="text-ds-text font-black text-2xl tracking-tighter uppercase mr-auto ml-10">Личные сообщения</h2>
           </div>

           {recentLoading ? (
             <div className="flex-1 flex flex-col items-center justify-center gap-4">
               <div className="w-10 h-10 border-2 border-ds-accent border-t-transparent rounded-full animate-spin" />
               <p className="text-[10px] text-ds-muted font-black uppercase tracking-widest">Загрузка переписок...</p>
             </div>
           ) : recentConvs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-8 opacity-40">
                 <h1 className="text-ds-text font-black text-7xl tracking-tighter uppercase text-center leading-none">ОЙ.<br/>ТУТ ПУСТО</h1>
                 <p className="text-ds-muted font-black uppercase tracking-[0.3em] text-[10px]">Пока нет активных диалогов</p>
              </div>
           ) : (
              <div className="w-full space-y-3 overflow-y-auto pr-2 flex-1 scrollbar-hide">
                 {recentConvs.map(conv => {
                   const { imageUrl } = getUserAvatar(conv.username);
                   return (
                     <button 
                       key={conv.id}
                       onClick={() => { setActiveDM(conv); setIsDMHubOpen(false); }}
                       className="w-full group/item relative border border-white/5 rounded-3xl p-5 flex items-center gap-5 transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-2xl flex-shrink-0 vibe-panel"
                     >
                       <div className="relative flex-shrink-0">
                         <img src={imageUrl} alt={conv.username} className="w-14 h-14 rounded-2xl object-cover border border-white/10 group-hover/item:scale-110 transition-transform duration-500" />
                         {!conv.isRead && <div className="absolute -top-1 -right-1 w-4 h-4 bg-ds-accent rounded-full border-4 border-ds-bg vibe-glow-blue" />}
                       </div>
                       <div className="flex-1 text-left min-w-0">
                         <div className="flex items-center justify-between mb-1">
                           <h4 className="text-ds-text font-black text-[15px] truncate" style={conv.color ? { color: conv.color } : {}}>{conv.username}</h4>
                           <span className="text-[10px] text-ds-muted font-bold opacity-30">{new Date(conv.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                         </div>
                         <p className="text-[12px] text-ds-muted font-medium truncate opacity-60 group-hover/item:opacity-100 transition-opacity">
                           {conv.lastMessage || 'Нажмите, чтобы начать общение'}
                         </p>
                       </div>
                       <ChevronRight size={20} className="text-ds-muted opacity-0 group-hover/item:opacity-100 group-hover/item:translate-x-1 transition-all" />
                     </button>
                   );
                 })}
              </div>
           )}
        </div>
      ) : (
        // ── Главные карточки Хаба ──
        <>
          <div className="relative z-10 text-center mb-12 transform group-hover:scale-[1.02] transition-transform duration-700">
            <div className="w-28 h-28 flex items-center justify-center relative mx-auto mb-8 shadow-2xl group/star vibe-icon-tile rounded-[2.5rem]">
               <div className="absolute inset-0 vibe-moving-glow opacity-20" />
               <img 
                 src={getUserAvatar(displayUsername).imageUrl} 
                 alt={displayUsername} 
                 className="w-full h-full object-contain z-10 transition-all duration-500 scale-125 group-hover/star:scale-[1.35] vibe-logo-glow" 
               />
            </div>
            <h2 className="text-ds-text font-black text-5xl tracking-tighter mb-4 uppercase drop-shadow-[0_0_15px_rgba(var(--ds-accent-rgb),0.3)]">
              Привет, <span className="text-ds-accent">{displayUsername}</span>!
            </h2>
            <p className="text-ds-muted text-[11px] font-black uppercase tracking-[0.3em] max-w-sm mx-auto leading-relaxed opacity-60">
               Твоя персональная станция ожидания. Настрой всё под себя и начинай общение.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl px-4 animate-slide-up">
            <button 
              onClick={() => setServerEntryOpen(true)}
              className="group/card relative rounded-[2rem] border border-white/5 p-8 flex flex-col items-center gap-6 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] vibe-panel"
            >
              <div className="absolute inset-0 transition-opacity opacity-0 group-hover/card:opacity-100 pointer-events-none bg-gradient-to-t from-ds-accent/5 to-transparent rounded-[2rem]" />
              <div className="w-16 h-16 flex items-center justify-center text-ds-accent vibe-icon-tile group-hover/card:scale-110 transition-transform">
                <PlusCircle size={32} />
              </div>
              <div className="text-center">
                <h4 className="text-ds-text font-black text-xs uppercase tracking-widest mb-2">Создать мир</h4>
                <p className="text-[10px] text-ds-muted font-bold uppercase tracking-tight opacity-50">Начни своё приключение прямо сейчас</p>
              </div>
            </button>

            <div className="group/card relative rounded-[2rem] border border-white/5 p-8 flex flex-col items-center gap-6 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] vibe-panel">
              <div className="absolute inset-0 transition-opacity opacity-0 group-hover/card:opacity-100 pointer-events-none bg-gradient-to-t from-purple-500/5 to-transparent rounded-[2rem]" />
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20 group-hover/card:scale-110 transition-transform">
                <Zap size={32} />
              </div>
              <div className="text-center w-full">
                <h4 className="text-ds-text font-black text-xs uppercase tracking-widest mb-3">Что нового</h4>
                <div className="space-y-1.5 opacity-60">
                  <p className="text-[9px] font-black uppercase tracking-tighter text-ds-accent">V2.1: Статус Создателя</p>
                  <p className="text-[9px] font-black uppercase tracking-tighter text-white">Улучшена светлая тема</p>
                  <p className="text-[9px] font-black uppercase tracking-tighter text-white/50">Плавность Хаба</p>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setIsDMHubOpen(true)}
            className="group/card relative rounded-[2rem] border border-white/5 p-8 flex flex-col items-center gap-6 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] vibe-panel"
            >
              <div className="absolute inset-0 transition-opacity opacity-0 group-hover/card:opacity-100 pointer-events-none bg-gradient-to-t from-ds-accent/5 to-transparent rounded-[2rem]" />
              <div className="w-16 h-16 flex items-center justify-center text-ds-accent vibe-icon-tile group-hover/card:scale-110 transition-transform">
                <MessageSquare size={32} />
              </div>
              <div className="text-center">
                 <h4 className="text-ds-text font-black text-xs uppercase tracking-widest mb-2">Личные сообщения</h4>
                 <p className="text-[10px] text-ds-muted font-bold uppercase tracking-tight opacity-50">Твои недавние диалоги и переписки</p>
              </div>
            </button>
          </div>
        </>
      )}

      {/* Футер-кнопка */}
      {!isElectron && (
        <div className="mt-10 mb-6 animate-fade-in delay-500 flex-shrink-0">
          <a
            href={downloadUrl}
            className="group relative px-10 py-5 font-black uppercase tracking-widest text-[11px] transition-all hover:scale-[1.05] active:scale-95 shadow-2xl animate-vibe-btn overflow-hidden block vibe-primary-button"
          >
            <div className="absolute inset-0 vibe-moving-glow opacity-30 group-hover:opacity-100 transition-opacity" />
            <span className="relative z-10 flex items-center gap-3">
              <Download size={20} strokeWidth={3} />
              СКАЧАТЬ ДЛЯ WINDOWS
            </span>
          </a>
        </div>
      )}
    </div>
  );
}
