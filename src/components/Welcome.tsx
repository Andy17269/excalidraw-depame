import { useEffect, useRef } from 'react';
import appIcon from '../assets/startup/icon.png';
import intelligence from '../assets/startup/apple.intelligence.svg?raw';
import drawing from '../assets/startup/pencil.and.scribble.svg?raw';
import connection from '../assets/startup/powerplug.portrait.fill.svg?raw';

const FEATURES = [
  { icon: intelligence, title: '由 AI 驱动', description: '描述想法，实现奇思妙想。' },
  { icon: drawing, title: '自由绘制', description: '随手绘制，让思路自由延展。' },
  { icon: connection, title: 'MCP 支持', description: '连接智能体，协作完成项目。' },
];

interface WelcomeProps {
  ready: boolean;
  busy: boolean;
  leaving: boolean;
  trapFocus?: boolean;
  onContinue: () => void;
  onSkip: () => void;
}

export function Welcome({ ready, busy, leaving, trapFocus = true, onContinue, onSkip }: WelcomeProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const disabled = !ready || busy || leaving;

  useEffect(() => {
    if (!disabled && trapFocus) continueButton.current?.focus({ preventScroll: true });
  }, [disabled, trapFocus]);

  useEffect(() => {
    if (!trapFocus) return;
    const containFocus = (event: FocusEvent) => {
      if (dialog.current && !dialog.current.contains(event.target as Node)) {
        if (disabled) dialog.current.focus({ preventScroll: true });
        else continueButton.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('focusin', containFocus);
    return () => document.removeEventListener('focusin', containFocus);
  }, [disabled, trapFocus]);

  return <div
    className={`welcome-screen ${leaving ? 'is-leaving' : ''}`}
    onPointerDown={event => event.stopPropagation()}
    onMouseDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()}
    onWheel={event => event.stopPropagation()}
  >
    <div className="welcome-backdrop" aria-hidden="true" />
    <div ref={dialog} className="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title" aria-busy={busy || !ready} tabIndex={-1}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape' && !disabled) { event.preventDefault(); onSkip(); }
        if (event.key !== 'Tab') return;
        const buttons = Array.from(dialog.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        if (!buttons.length) { event.preventDefault(); return; }
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.shiftKey && index <= 0) { event.preventDefault(); buttons.at(-1)!.focus(); }
        else if (!event.shiftKey && index === buttons.length - 1) { event.preventDefault(); buttons[0].focus(); }
      }}>
      <div className="welcome-content">
        <img className="welcome-app-icon" src={appIcon} alt="" aria-hidden="true" />
        <h1 id="welcome-title"><span>欢迎使用</span><br /><strong>Excalidraw+</strong></h1>
        <div className="welcome-features">
          {FEATURES.map(feature => <div className="welcome-feature" key={feature.title}>
            <span className="welcome-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: feature.icon }} />
            <div><h2>{feature.title}</h2><p>{feature.description}</p></div>
          </div>)}
        </div>
      </div>
      <div className="welcome-actions">
        <button type="button" className="welcome-skip" disabled={disabled} onClick={onSkip}>
          跳过引导
        </button>
        <button ref={continueButton} className="welcome-continue" disabled={disabled} onClick={onContinue}>继续</button>
      </div>
    </div>
  </div>;
}
