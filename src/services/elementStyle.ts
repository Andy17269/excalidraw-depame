interface StyleElement {
  id: string;
  type: string;
  locked?: boolean;
  isDeleted?: boolean;
  containerId?: string | null;
}

export function collectTextColorIds(elements: readonly StyleElement[], selected: Readonly<Record<string, boolean>>): Set<string> {
  const containers = new Set(elements.filter(el => selected[el.id] && !el.locked && !el.isDeleted).map(el => el.id));
  return new Set(elements.filter(el => el.type === 'text' && !el.locked && !el.isDeleted
    && (selected[el.id] || (el.containerId && containers.has(el.containerId)))).map(el => el.id));
}

export function clampImageRadius(value: number, width: number, height: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(value, Math.min(Math.abs(width), Math.abs(height)) / 4)) : 0;
}

export function getImageRadius(element: { width: number; height: number; roundness?: { type: number; value?: number } | null }): number {
  if (!element.roundness) return 0;
  return clampImageRadius(element.roundness.type === 3 ? element.roundness.value ?? 32 : Math.min(element.width, element.height) / 4, element.width, element.height);
}
