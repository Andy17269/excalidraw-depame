import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { findNearestSnapIndex, RAIL_SPRING, stepSpring, type SpringState } from '../services/springPhysics';

export interface SpringRailItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ReactNode;
  title?: string;
  disabled?: boolean;
}

interface SpringRailProps<T extends string = string> {
  items: ReadonlyArray<SpringRailItem<T>>;
  activeId: T | null;
  onSelect: (id: T) => void;
  ariaLabel: string;
  role?: 'tablist' | 'radiogroup' | 'group';
  itemRole?: 'tab' | 'radio';
  tabIdPrefix?: string;
  ariaSelectionAttr?: 'aria-selected' | 'aria-checked' | 'aria-pressed';
  className?: string;
  style?: CSSProperties;
  visible?: boolean;
  inert?: boolean;
  ariaHidden?: boolean;
  containerRef?: RefObject<HTMLDivElement | null>;
  preventFocusOnPointerDown?: boolean;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function SpringRail<T extends string = string>({
  items,
  activeId,
  onSelect,
  ariaLabel,
  role = 'tablist',
  itemRole,
  tabIdPrefix,
  ariaSelectionAttr = 'aria-selected',
  className = '',
  style,
  visible = true,
  inert,
  ariaHidden,
  containerRef,
  preventFocusOnPointerDown = false,
}: SpringRailProps<T>) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const xRef = useRef<SpringState>({ value: 0, velocity: 0 });
  const wRef = useRef<SpringState>({ value: 0, velocity: 0 });
  const targetRef = useRef<{ x: number; w: number; hasTarget: boolean }>({ x: 0, w: 0, hasTarget: false });
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const initializedRef = useRef(false);
  const wasVisibleRef = useRef(visible);
  const snapTimerRef = useRef(0);
  const programmaticScrollUntilRef = useRef(0);
  const syncPillRef = useRef<(snap: boolean) => void>(() => {});

  const setContainerNode = useCallback((node: HTMLDivElement | null) => {
    localRef.current = node;
    if (containerRef) containerRef.current = node;
  }, [containerRef]);

  const applyPill = useCallback((x: number, w: number, shown: boolean) => {
    const pill = pillRef.current;
    if (!pill) return;
    pill.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    pill.style.width = `${Math.max(0, w).toFixed(2)}px`;
    pill.style.opacity = shown && w > 0 ? '1' : '0';
  }, []);

  const stopAnimation = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    lastTimeRef.current = 0;
  }, []);

  const startAnimation = useCallback(() => {
    if (rafRef.current) return;
    lastTimeRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      const target = targetRef.current;
      if (!target.hasTarget) {
        rafRef.current = 0;
        return;
      }
      const nextX = stepSpring(xRef.current, target.x, dt, RAIL_SPRING);
      const nextW = stepSpring(wRef.current, target.w, dt, RAIL_SPRING);
      xRef.current = { value: nextX.value, velocity: nextX.velocity };
      wRef.current = { value: nextW.value, velocity: nextW.velocity };
      applyPill(nextX.value, nextW.value, true);

      if (nextX.settled && nextW.settled) {
        rafRef.current = 0;
        lastTimeRef.current = 0;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [applyPill]);

  const centerActiveItem = useCallback((activeButton: HTMLButtonElement, smooth: boolean) => {
    const rail = localRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth + 2) return;
    const targetLeft = activeButton.offsetLeft + activeButton.offsetWidth / 2 - rail.clientWidth / 2;
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const clamped = Math.max(0, Math.min(maxScroll, targetLeft));
    if (Math.abs(rail.scrollLeft - clamped) < 1) return;
    programmaticScrollUntilRef.current = performance.now() + 420;
    rail.scrollTo({ left: clamped, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
  }, []);

  const syncPillToActive = useCallback((snap: boolean) => {
    const activeIndex = activeId ? items.findIndex(item => item.id === activeId) : -1;
    const activeButton = activeIndex >= 0 ? buttonRefs.current[activeIndex] : null;
    if (!activeButton) {
      targetRef.current.hasTarget = false;
      stopAnimation();
      applyPill(xRef.current.value, wRef.current.value, false);
      return;
    }

    const nextX = activeButton.offsetLeft;
    const nextW = activeButton.offsetWidth;
    targetRef.current = { x: nextX, w: nextW, hasTarget: true };
    centerActiveItem(activeButton, !snap);

    if (snap || !initializedRef.current || prefersReducedMotion()) {
      initializedRef.current = true;
      stopAnimation();
      xRef.current = { value: nextX, velocity: 0 };
      wRef.current = { value: nextW, velocity: 0 };
      applyPill(nextX, nextW, true);
      return;
    }
    startAnimation();
  }, [activeId, applyPill, centerActiveItem, items, startAnimation, stopAnimation]);

  syncPillRef.current = syncPillToActive;

  useLayoutEffect(() => {
    const becameVisible = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    syncPillToActive(becameVisible || !initializedRef.current);
  }, [items, activeId, visible, syncPillToActive]);

  useEffect(() => {
    const rail = localRef.current;
    if (!rail || typeof ResizeObserver === 'undefined') return;
    let lastWidth = rail.clientWidth;
    let lastHeight = rail.clientHeight;
    const observer = new ResizeObserver(() => {
      const nextWidth = rail.clientWidth;
      const nextHeight = rail.clientHeight;
      if (nextWidth === lastWidth && nextHeight === lastHeight) return;
      lastWidth = nextWidth;
      lastHeight = nextHeight;
      syncPillRef.current(true);
    });
    observer.observe(rail);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    stopAnimation();
    window.clearTimeout(snapTimerRef.current);
  }, [stopAnimation]);

  const snapToNearestOnScrollEnd = useCallback(() => {
    const rail = localRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth + 2) return;
    if (performance.now() < programmaticScrollUntilRef.current) return;
    const viewportCenter = rail.scrollLeft + rail.clientWidth / 2;
    const centers = items.map((_, index) => {
      const btn = buttonRefs.current[index];
      return btn ? btn.offsetLeft + btn.offsetWidth / 2 : Infinity;
    });
    const nearestIndex = findNearestSnapIndex(centers, viewportCenter);
    const nearestItem = nearestIndex >= 0 ? items[nearestIndex] : null;
    if (!nearestItem || nearestItem.disabled) return;
    if (nearestItem.id !== activeId) {
      onSelect(nearestItem.id);
    } else {
      const btn = buttonRefs.current[nearestIndex];
      if (btn) centerActiveItem(btn, true);
    }
  }, [activeId, centerActiveItem, items, onSelect]);

  const handleScroll = useCallback(() => {
    if (performance.now() < programmaticScrollUntilRef.current) return;
    window.clearTimeout(snapTimerRef.current);
    snapTimerRef.current = window.setTimeout(snapToNearestOnScrollEnd, 110);
  }, [snapToNearestOnScrollEnd]);

  return (
    <div
      ref={setContainerNode}
      className={`spring-rail ${className}`.trim()}
      style={style}
      role={role}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
      inert={inert}
      onScroll={handleScroll}
    >
      <span ref={pillRef} className="spring-rail-pill" aria-hidden="true" />
      {items.map((item, index) => {
        const selected = activeId === item.id;
        const selectionProp = { [ariaSelectionAttr]: selected };
        return (
          <button
            key={item.id}
            ref={node => { buttonRefs.current[index] = node; }}
            type="button"
            role={itemRole}
            id={tabIdPrefix ? `${tabIdPrefix}-tab-${item.id}` : undefined}
            aria-controls={tabIdPrefix ? `${tabIdPrefix}-panel-${item.id}` : undefined}
            tabIndex={itemRole === 'tab' ? (selected ? 0 : -1) : undefined}
            {...selectionProp}
            className={`spring-rail-item ${selected ? 'is-active' : ''}`}
            title={item.title}
            disabled={item.disabled}
            onMouseDown={preventFocusOnPointerDown ? event => event.preventDefault() : undefined}
            onClick={() => onSelect(item.id)}
            onKeyDown={itemRole === 'tab' ? event => {
              const enabled = items.map((entry, i) => ({ entry, i })).filter(({ entry }) => !entry.disabled);
              const current = enabled.findIndex(({ i }) => i === index);
              const next = event.key === 'ArrowRight' ? (current + 1) % enabled.length
                : event.key === 'ArrowLeft' ? (current + enabled.length - 1) % enabled.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : null;
              if (next === null || !enabled[next]) return;
              event.preventDefault();
              onSelect(enabled[next].entry.id);
              buttonRefs.current[enabled[next].i]?.focus();
            } : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
