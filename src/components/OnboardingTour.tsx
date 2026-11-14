import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface OnboardingStep {
  id: string;
  category: '功能区域' | '核心功能';
  title: string;
  description: string;
  tip?: string;
  selectors: readonly string[];
  padding?: number;
}

export const ONBOARDING_STEPS: ReadonlyArray<OnboardingStep> = [
  {
    id: 'file-capsule',
    category: '功能区域',
    title: '文件与主菜单',
    description: '左上角集合了文件管理与状态指示。点击菜单按钮可新建、打开、保存、管理历史快照或进入设置；点击文件名可随时重命名并查看画布元素统计。',
    tip: '绿色圆点表示已保存，橙色表示有未保存更改',
    selectors: ['.file-capsule'],
    padding: 8,
  },
  {
    id: 'drawing-tools',
    category: '功能区域',
    title: '绘图工具与 界面素材库',
    description: '底部左侧提供选择、矩形、菱形、箭头、画笔、文字与橡皮等基础绘图工具；在设置中开启演示模式后，还可从「UI 组件模板」插入手机/PC 页面组件。',
    tip: '选中画布中的元素时，右侧会自动弹出属性面板',
    selectors: ['.tools', '.library-trigger'],
    padding: 8,
  },
  {
    id: 'zoom-controls',
    category: '功能区域',
    title: '画布视口与缩放',
    description: '右下角可切换抓手平移模式、缩放画布或点击百分比一键重置为 100%，同时也支持触控板双指捏合与滑动平移。',
    tip: '按住空格键可临时拖拽平移画布',
    selectors: ['.zoom-capsule'],
    padding: 8,
  },
  {
    id: 'ai-dock',
    category: '功能区域',
    title: 'AI 创作岛',
    description: '底部右侧是 AI 创作中心。聚焦输入框可切换「自动 / 图表 / 编辑 / UI草图」四种模式，配合语音输入与联网搜索，直接描述想法即可流式绘图。',
    tip: '按住 Alt 键或长按麦克风按钮即可语音输入',
    selectors: ['.dock-ai-row'],
    padding: 8,
  },
  {
    id: 'mindmap-generation',
    category: '核心功能',
    title: '思维导图与图表生成',
    description: '在输入框切换「图表」模式并输入主题，AI 会自动规划结构并逐元素流式绘制可编辑的思维导图与系统架构图。',
    tip: '生成过程支持自动平滑缩放跟随，随时点击画布可中断并立即提交',
    selectors: ['.generate-form'],
    padding: 8,
  },
  {
    id: 'vision-ui',
    category: '核心功能',
    title: 'AI 界面草图（界面导图）',
    description: '在画布随手绘制线框草图（演示模式下也可从预设菜单插入示例）后，点击「UI草图」按钮或框选草图点击悬浮角标，AI 将识别布局并填充真实素材生成高保真 UI。',
    tip: '演示模式下可结合「UI 组件模板」快速拼装页面原型',
    selectors: ['.vision-button'],
    padding: 8,
  },
  {
    id: 'mcp-support',
    category: '核心功能',
    title: 'MCP 扩展与外部协作',
    description: '打开「菜单 → 设置 → MCP 管理」，可接入 Filesystem、Memory 或自定义 stdio / HTTP / SSE 服务，让 AI 读取本地资料绘图；也可开启本地画布 MCP 供外部 Agent 协同操作。',
    tip: '在「设置 → 通用 → 使用引导」中可随时重温本引导',
    selectors: ['.menu-trigger'],
    padding: 10,
  },
];

interface TargetRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

interface CardPosition {
  left: number;
  top: number;
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
}

function measureCombinedRect(selectors: readonly string[], padding: number): TargetRect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    found = true;
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.right);
    maxY = Math.max(maxY, rect.bottom);
  }

  if (!found) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(4, minX - padding);
  const top = Math.max(4, minY - padding);
  const right = Math.min(vw - 4, maxX + padding);
  const bottom = Math.min(vh - 4, maxY + padding);
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function computeCardPosition(
  target: TargetRect | null,
  cardWidth: number,
  cardHeight: number,
): CardPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 16;
  const gap = 14;

  const clampX = (x: number) => Math.max(margin, Math.min(vw - cardWidth - margin, x));
  const clampY = (y: number) => Math.max(margin, Math.min(vh - cardHeight - margin, y));

  if (!target) {
    return {
      left: clampX((vw - cardWidth) / 2),
      top: clampY((vh - cardHeight) / 2),
      placement: 'center',
    };
  }

  const spaceBelow = vh - target.bottom - margin;
  const spaceAbove = target.top - margin;
  const spaceRight = vw - target.right - margin;
  const spaceLeft = target.left - margin;

  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;

  if (spaceBelow >= cardHeight + gap) {
    return {
      left: clampX(targetCenterX - cardWidth / 2),
      top: target.bottom + gap,
      placement: 'bottom',
    };
  }
  if (spaceAbove >= cardHeight + gap) {
    return {
      left: clampX(targetCenterX - cardWidth / 2),
      top: target.top - cardHeight - gap,
      placement: 'top',
    };
  }
  if (spaceRight >= cardWidth + gap) {
    return {
      left: target.right + gap,
      top: clampY(targetCenterY - cardHeight / 2),
      placement: 'right',
    };
  }
  if (spaceLeft >= cardWidth + gap) {
    return {
      left: target.left - cardWidth - gap,
      top: clampY(targetCenterY - cardHeight / 2),
      placement: 'left',
    };
  }

  const preferTop = spaceAbove > spaceBelow;
  return {
    left: clampX(targetCenterX - cardWidth / 2),
    top: clampY(preferTop ? target.top - cardHeight - gap : target.bottom + gap),
    placement: preferTop ? 'top' : 'bottom',
  };
}

export function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [positionReady, setPositionReady] = useState(false);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [cardPos, setCardPos] = useState<CardPosition>({ left: 20, top: 20, placement: 'center' });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  const step = ONBOARDING_STEPS[stepIndex] ?? ONBOARDING_STEPS[0];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;

  useLayoutEffect(() => {
    if (open) setStepIndex(0);
    setPositionReady(false);
    if (!open) return;
    // Measure the first anchor before enabling movement between steps.
    const raf = requestAnimationFrame(() => setPositionReady(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const updateLayout = useCallback(() => {
    if (!open) return;
    const rect = measureCombinedRect(step.selectors, step.padding ?? 8);
    setTargetRect(rect);
    const cardEl = cardRef.current;
    const cardW = cardEl?.offsetWidth || Math.min(380, window.innerWidth - 32);
    const cardH = cardEl?.offsetHeight || 240;
    setCardPos(computeCardPosition(rect, cardW, cardH));
  }, [open, step]);

  useLayoutEffect(() => {
    if (!open) return;
    updateLayout();
    const raf = requestAnimationFrame(updateLayout);
    window.addEventListener('resize', updateLayout);
    window.addEventListener('scroll', updateLayout, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('scroll', updateLayout, true);
    };
  }, [open, updateLayout]);

  useEffect(() => {
    if (!open) return;
    nextBtnRef.current?.focus({ preventScroll: true });
    const containFocus = (event: FocusEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        nextBtnRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('focusin', containFocus);
    return () => document.removeEventListener('focusin', containFocus);
  }, [open]);

  if (!open) return null;

  const handleNext = () => {
    if (isLast) onClose();
    else setStepIndex(i => Math.min(ONBOARDING_STEPS.length - 1, i + 1));
  };

  const handlePrev = () => {
    setStepIndex(i => Math.max(0, i - 1));
  };

  return (
    <div
      className={`onboarding-tour-overlay ${positionReady ? 'is-positioned' : ''}`}
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
    >
      {targetRect ? (
        <div
          className="onboarding-spotlight-ring"
          aria-hidden="true"
          style={{
            left: `${targetRect.left}px`,
            top: `${targetRect.top}px`,
            width: `${targetRect.width}px`,
            height: `${targetRect.height}px`,
          }}
        />
      ) : (
        <div className="onboarding-tour-backdrop" aria-hidden="true" />
      )}

      <div
        ref={cardRef}
        className={`onboarding-card glass is-${cardPos.placement}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        style={{
          left: `${cardPos.left}px`,
          top: `${cardPos.top}px`,
        }}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            handleNext();
            return;
          }
          if (event.key === 'ArrowLeft' && !isFirst) {
            event.preventDefault();
            handlePrev();
            return;
          }
          if (event.key !== 'Tab') return;
          const buttons = Array.from(cardRef.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          if (!buttons.length) {
            event.preventDefault();
            return;
          }
          const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (event.shiftKey && idx <= 0) {
            event.preventDefault();
            buttons.at(-1)!.focus();
          } else if (!event.shiftKey && idx === buttons.length - 1) {
            event.preventDefault();
            buttons[0].focus();
          }
        }}
      >
        <div className="onboarding-card-header">
          <span className={`onboarding-badge ${step.category === '核心功能' ? 'is-highlight' : ''}`}>
            {step.category === '核心功能' && <Icon name="sparkle" />}
            <span>{step.category}</span>
          </span>
          <span className="onboarding-step-count" aria-live="polite">
            {stepIndex + 1} / {ONBOARDING_STEPS.length}
          </span>
        </div>

        <h2 key={`${step.id}-title`} id={titleId} className="onboarding-card-title">{step.title}</h2>
        <p key={`${step.id}-desc`} id={descId} className="onboarding-card-desc">{step.description}</p>

        {step.tip && (
          <div key={`${step.id}-tip`} className="onboarding-card-tip">
            <Icon name="info" />
            <span>{step.tip}</span>
          </div>
        )}

        <div className="onboarding-progress" aria-hidden="true">
          {ONBOARDING_STEPS.map((item, idx) => (
            <span
              key={item.id}
              className={`onboarding-dot ${idx === stepIndex ? 'is-active' : idx < stepIndex ? 'is-done' : ''}`}
            />
          ))}
        </div>

        <div className="onboarding-card-actions">
          <button type="button" className="onboarding-skip" onClick={onClose}>
            跳过引导
          </button>
          <div className="onboarding-nav-group">
            {!isFirst && (
              <button type="button" className="onboarding-prev" onClick={handlePrev}>
                上一步
              </button>
            )}
            <button ref={nextBtnRef} type="button" className="onboarding-next" onClick={handleNext}>
              {isLast ? '开始使用' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
