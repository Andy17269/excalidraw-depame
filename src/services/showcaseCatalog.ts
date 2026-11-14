export const SHOWCASE_EXAMPLES = [
  { id: 'music', title: '音乐 App', description: '推荐歌单、专辑封面与播放控制', width: 390, height: 844 },
  { id: 'travel', title: '旅行发现 App', description: '目的地探索、海岸灵感与周末路线', width: 390, height: 844 },
  { id: 'commerce', title: '电商运营工作台', description: '经营指标、销售趋势与订单管理', width: 1120, height: 740 },
] as const;
export type ShowcaseId = (typeof SHOWCASE_EXAMPLES)[number]['id'];

export function showcaseMetadata(id: ShowcaseId, instance: string, role: 'frame' | 'part', elementId: string) {
  return { showcase: { id, instance, role, elementId } };
}

interface SourceElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  isDeleted?: boolean;
  customData?: Record<string, unknown>;
}

function readMetadata(el: SourceElement) {
  const value = el.customData?.showcase;
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (!SHOWCASE_EXAMPLES.some(item => item.id === data.id) || typeof data.instance !== 'string'
    || typeof data.elementId !== 'string' || !data.elementId || !data.instance || !['frame', 'part'].includes(String(data.role))) return null;
  return data as { id: ShowcaseId; instance: string; role: 'frame' | 'part'; elementId: string };
}

/** Only full, explicitly inserted sketches qualify. Text keywords never select a demo. */
export function resolveShowcase(source: readonly SourceElement[], all: readonly SourceElement[]) {
  const frames = source.filter(el => !el.isDeleted && readMetadata(el)?.role === 'frame');
  if (frames.length > 1) throw new Error('请先选择一个完整示例，再生成界面');
  const frame = frames[0];
  if (!frame || frame.type !== 'rectangle' || !(frame.width! > 0) || !(frame.height! > 0)) return null;
  if (frame.angle) throw new Error('请先将示例外框旋转回正，再生成界面');
  const meta = readMetadata(frame)!;
  if (meta.elementId !== frame.id) throw new Error('此示例已被复制，请从精选示例重新插入后生成');
  const duplicateFrames = all.filter(el => !el.isDeleted && readMetadata(el)?.instance === meta.instance && readMetadata(el)?.role === 'frame');
  if (duplicateFrames.length > 1) throw new Error('此示例已被复制，请从精选示例重新插入后生成');
  const elementIds = new Set(all.filter(el => {
    const item = readMetadata(el);
    return !el.isDeleted && item?.instance === meta.instance && item.id === meta.id && item.elementId === el.id;
  }).map(el => el.id));
  return { id: meta.id, elementIds, bounds: { x: frame.x, y: frame.y, width: frame.width!, height: frame.height! } };
}
