const MUSIC_KEYWORD_RE = /音乐|music/i;

export interface MusicSourceElementLike {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  containerId?: string | null;
  isDeleted?: boolean;
}

/**
 * Checks whether the selected elements (including bound text labels and any text
 * inside the selection's bounding box) or prompt contain `音乐` / `Music` / `music`.
 */
export function hasMusicKeyword(
  sourceElements: readonly MusicSourceElementLike[],
  allElements: readonly MusicSourceElementLike[],
  bounds: readonly [number, number, number, number],
  prompt = '',
): boolean {
  if (MUSIC_KEYWORD_RE.test(prompt)) return true;

  const selectedIds = new Set(sourceElements.map(el => el.id));
  const [left, top, right, bottom] = bounds;

  for (const el of sourceElements) {
    if (el.isDeleted) continue;
    if (typeof el.text === 'string' && MUSIC_KEYWORD_RE.test(el.text)) {
      return true;
    }
  }

  for (const el of allElements) {
    if (el.isDeleted || typeof el.text !== 'string' || !el.text) continue;
    if (el.containerId && selectedIds.has(el.containerId) && MUSIC_KEYWORD_RE.test(el.text)) {
      return true;
    }
    const cx = el.x + (el.width ?? 0) / 2;
    const cy = el.y + (el.height ?? 0) / 2;
    if (cx >= left - 4 && cx <= right + 4 && cy >= top - 4 && cy <= bottom + 4) {
      if (MUSIC_KEYWORD_RE.test(el.text)) return true;
    }
  }

  return false;
}

/**
 * Collects IDs of all elements belonging to the selected region (including bound text
 * and inner wireframe items enclosed by the selected frame) so replacing the sketch leaves no stray lines.
 */
export function collectMusicReplacedIds(
  sourceElements: readonly MusicSourceElementLike[],
  allElements: readonly MusicSourceElementLike[],
  bounds: readonly [number, number, number, number],
): Set<string> {
  const ids = new Set(sourceElements.map(el => el.id));
  const [left, top, right, bottom] = bounds;
  for (const el of allElements) {
    if (el.isDeleted) continue;
    if (el.containerId && ids.has(el.containerId)) {
      ids.add(el.id);
      continue;
    }
    const elRight = el.x + (el.width ?? 0);
    const elBottom = el.y + (el.height ?? 0);
    if (el.x >= left - 6 && el.y >= top - 6 && elRight <= right + 6 && elBottom <= bottom + 6) {
      ids.add(el.id);
    }
  }
  return ids;
}

/** Picks `count` distinct items in random order. */
export function pickDistinctRandom<T>(items: readonly T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, count);
}
