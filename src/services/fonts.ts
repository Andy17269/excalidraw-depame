const loading = new WeakMap<FontFace, Promise<FontFace>>();

function containsGlyph(range: string, code: number): boolean {
  return range.split(',').some(part => {
    const [start, end = start] = part.trim().replace(/^U\+/i, '').split('-');
    return code >= parseInt(start.replace(/\?/g, '0'), 16) && code <= parseInt(end.replace(/\?/g, 'F'), 16);
  });
}

export async function ensureHandDrawnFonts(text: string): Promise<void> {
  if (!document.fonts) return;
  if (!Array.from(document.fonts).some(face => face.family.replace(/["']/g, '') === 'Excalifont')) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const codes = [...new Set(Array.from(text, char => char.codePointAt(0)!))];
  const faces: FontFace[] = [];
  document.fonts.forEach(face => {
    if (['Excalifont', 'Xiaolai'].includes(face.family.replace(/["']/g, '')) && face.status !== 'loaded' && codes.some(code => containsGlyph(face.unicodeRange, code))) faces.push(face);
  });
  const loaded = await Promise.all(faces.map(face => {
    let pending = loading.get(face);
    if (!pending) { pending = face.load().catch(error => { loading.delete(face); throw error; }); loading.set(face, pending); }
    return pending;
  }));
  if (loaded.length) {
    const event = new Event('loadingdone');
    Object.defineProperty(event, 'fontfaces', { value: loaded });
    document.fonts.dispatchEvent(event);
  }
}

export function attachFontLoading(host: HTMLElement): () => void {
  let timer = 0;
  const input = (event: Event) => {
    if (!(event.target instanceof HTMLTextAreaElement)) return;
    const text = event.target.value;
    clearTimeout(timer);
    timer = window.setTimeout(() => { void ensureHandDrawnFonts(text).catch(() => {}); }, 80);
  };
  requestAnimationFrame(() => { void ensureHandDrawnFonts('Aa白板文字你好').catch(() => {}); });
  host.addEventListener('input', input, true);
  return () => { clearTimeout(timer); host.removeEventListener('input', input, true); };
}
