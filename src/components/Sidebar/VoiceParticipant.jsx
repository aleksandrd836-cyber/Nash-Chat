import React, { memo } from 'react';
import { Headphones, MicOff } from 'lucide-react';
import { getUserAvatar } from '../../lib/avatar';

const PLATFORM_CREATOR_IDS = new Set([
  '43751682-690e-4934-a9f2-7300a816b92d',
  '1380ae20-201a-4c77-aed3-93b3cb96f8d5'
]);

export const VoiceParticipant = memo(({ participant, isMe, isActuallySpeaking, isOwner, onCtxMenu }) => {
  const { imageUrl } = getUserAvatar(participant.username);
  const isCreator = PLATFORM_CREATOR_IDS.has(participant.userId);

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-2xl transition-all duration-200 border ${
        !isMe ? 'hover:bg-ds-hover/45 hover:border-white/5 cursor-context-menu' : 'border-transparent'
      } ${isActuallySpeaking ? 'bg-ds-green/5 border-ds-green/20' : 'border-transparent'}`}
      onContextMenu={(event) => onCtxMenu(event, participant)}
      title={!isMe ? 'ПКМ для регулировки громкости' : ''}
    >
      <div
        className={`w-[30px] h-[30px] rounded-full bg-ds-bg overflow-hidden flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
          isActuallySpeaking
            ? 'ring-2 ring-ds-green shadow-[0_0_12px_rgba(35,165,89,0.7)] scale-105'
            : 'border border-white/5 opacity-80'
        }`}
      >
        <img src={imageUrl} alt={participant.username} className="w-full h-full object-cover select-none" />
      </div>

      <span
        className={`text-[13px] font-medium truncate flex-1 transition-colors duration-300 ${
          isActuallySpeaking ? 'text-ds-green font-bold' : 'text-ds-muted group-hover:text-ds-text'
        }`}
        style={{ color: isOwner ? '#ff4444' : undefined }}
      >
        {participant.username}
        {isCreator && (
          <span className="ml-1 px-1 py-0 rounded bg-ds-accent/10 border border-ds-accent/30 text-[7px] font-black text-ds-accent uppercase tracking-tighter vibe-glow-blue align-middle vibe-creator-badge">
            СОЗДАТЕЛЬ
          </span>
        )}
      </span>

      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
        {participant.isDeafened && (
          <div className="slashed-container w-3.5 h-3.5 text-ds-red flex-shrink-0 animate-fade-in">
            <Headphones className="w-full h-full" />
            <div className="slashed-icon-line" style={{ height: '1.5px' }} />
          </div>
        )}
        {participant.isMuted && !participant.isDeafened && (
          <MicOff className="w-3.5 h-3.5 text-ds-red flex-shrink-0 animate-fade-in" />
        )}
      </div>
    </div>
  );
});

VoiceParticipant.displayName = 'VoiceParticipant';
