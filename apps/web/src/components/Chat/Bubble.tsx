import type { ReactNode } from 'react';
import { copy } from '../../copy';

export function Bubble({ from, children }: { from: 'user' | 'assistant'; children: ReactNode }) {
  const isUser = from === 'user';
  return (
    <div className={`msg msg--${from}`}>
      <span className="msg__who">{isUser ? copy.conversation.youSaid : copy.conversation.assistantName}</span>
      <div className="bubble">{children}</div>
    </div>
  );
}
