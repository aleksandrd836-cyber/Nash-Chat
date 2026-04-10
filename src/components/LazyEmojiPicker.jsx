import React, { Suspense, lazy } from 'react';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

const EmojiPickerFallback = () => (
  <div className="w-[350px] h-[435px] bg-ds-sidebar border border-ds-divider/30 rounded-2xl shadow-2xl flex items-center justify-center">
    <div className="flex flex-col items-center gap-3 opacity-70">
      <div className="w-8 h-8 border-2 border-ds-accent border-t-transparent rounded-full animate-spin" />
      <span className="text-[10px] text-ds-muted font-black uppercase tracking-[0.2em]">Эмодзи</span>
    </div>
  </div>
);

export function LazyEmojiPicker(props) {
  return (
    <Suspense fallback={<EmojiPickerFallback />}>
      <EmojiPicker emojiStyle="apple" skinTonesDisabled {...props} />
    </Suspense>
  );
}
