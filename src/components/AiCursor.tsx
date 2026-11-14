import { useEffect, useRef } from 'react';
import { getAiCursorState, subscribeAiCursor, type AiCursorState } from '../services/canvasAnimator';

export function AiCursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apply = (cursor: AiCursorState) => {
      const node = ref.current;
      if (!node) return;
      node.classList.toggle('is-visible', cursor.visible);
      node.classList.toggle('is-drawing', cursor.phase === 'drawing');
      node.style.transform = `translate3d(${Math.round(cursor.x)}px, ${Math.round(cursor.y)}px, 0)`;
    };
    apply(getAiCursorState());
    return subscribeAiCursor(apply);
  }, []);

  return (
    <div
      ref={ref}
      className="ai-cursor"
      style={{ transform: 'translate3d(0px, 0px, 0)' }}
      aria-hidden="true"
    >
      <svg className="ai-cursor-pointer" width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M4.5 3.5L11.5 20L14.2 13.8L20.5 11.2L4.5 3.5Z"
          fill="var(--accent)"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <span className="ai-cursor-badge">AI</span>
    </div>
  );
}
