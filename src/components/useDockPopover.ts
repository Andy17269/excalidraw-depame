import { useEffect, useRef, useState } from 'react';

/** Shared dismissal and focus behavior for the bottom dock's non-modal popovers. */
export function useDockPopover(menu = false) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const dismissOutside = (event: Event) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (menu && event.key === 'Tab') {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
        return;
      }
      if (!menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const buttons = [...(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    };
    window.addEventListener('pointerdown', dismissOutside, true);
    window.addEventListener('focusin', dismissOutside);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', dismissOutside, true);
      window.removeEventListener('focusin', dismissOutside);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, menu]);

  // Render outside the dock's backdrop-filter surface: acdert clips nested popovers there.
  const host = containerRef.current?.closest<HTMLElement>('.dock-shell') ?? null;
  const anchor = open ? containerRef.current?.getBoundingClientRect() : null;
  const bounds = open ? host?.getBoundingClientRect() : null;
  const placement = anchor && bounds ? {
    bottom: bounds.bottom - anchor.top + 12,
    left: anchor.left - bounds.left,
    right: bounds.right - anchor.right,
  } : null;
  return { open, setOpen, containerRef, triggerRef, panelRef, host, placement };
}
