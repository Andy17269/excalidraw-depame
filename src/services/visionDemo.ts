import { FONT_FAMILY, convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw';
import { ensureHandDrawnFonts } from './fonts';

const DEMO_LABELS = 'Home Top Picks 新歌推荐 Focus 最近播放 音乐播放条 底部导航';

export async function buildMusicDemoSketch() {
  await ensureHandDrawnFonts(DEMO_LABELS);
  const elements = convertToExcalidrawElements([
    // 手机线框外壳
    { type: 'rectangle', x: 0, y: 0, width: 390, height: 844, strokeColor: '#1e293b', backgroundColor: 'transparent', strokeWidth: 2, roughness: 1, roundness: { type: 3 } },
    // 顶部栏：Home + 头像
    { type: 'text', x: 24, y: 46, text: '首页', fontSize: 28, fontFamily: FONT_FAMILY.Excalifont, strokeColor: '#1e293b' },
    { type: 'ellipse', x: 324, y: 42, width: 42, height: 42, strokeColor: '#2196f3', backgroundColor: 'transparent', strokeWidth: 2, roughness: 1 },
    // Top Picks 区域
    { type: 'text', x: 24, y: 112, text: '为你精选', fontSize: 16, fontFamily: FONT_FAMILY.Excalifont, strokeColor: '#334155' },
    { type: 'rectangle', x: 24, y: 144, width: 228, height: 290, strokeColor: '#2196f3', backgroundColor: '#e3f2fd', fillStyle: 'hachure', strokeWidth: 2, roughness: 1, roundness: { type: 3 }, label: { text: '新歌推荐 推荐大卡', fontSize: 16, fontFamily: FONT_FAMILY.Excalifont, strokeColor: '#1e293b' } },
    { type: 'rectangle', x: 266, y: 144, width: 100, height: 290, strokeColor: '#64748b', backgroundColor: 'transparent', strokeWidth: 2, roughness: 1, roundness: { type: 3 }, label: { text: '专注', fontSize: 15, fontFamily: FONT_FAMILY.Excalifont, strokeColor: '#334155' } },
    // 最近播放 区域
    { type: 'text', x: 24, y: 466, text: '最近播放', fontSize: 16, fontFamily: FONT_FAMILY.Excalifont, strokeColor: '#334155' },
    { type: 'rectangle', x: 24, y: 500, width: 162, height: 150, strokeColor: '#475569', backgroundColor: 'transparent', strokeWidth: 2, roughness: 1, roundness: { type: 3 }, label: { text: '专辑封面 1', fontSize: 14, fontFamily: FONT_FAMILY.Excalifont, strokeColor: '#334155' } },
    { type: 'rectangle', x: 202, y: 500, width: 164, height: 150, strokeColor: '#475569', backgroundColor: 'transparent', strokeWidth: 2, roughness: 1, roundness: { type: 3 }, label: { text: '专辑封面 2', fontSize: 14, fontFamily: FONT_FAMILY.Excalifont, strokeColor: '#334155' } },
    // 悬浮音乐播放条
    { type: 'rectangle', x: 20, y: 676, width: 350, height: 54, strokeColor: '#475569', backgroundColor: 'transparent', strokeWidth: 2, roughness: 1, roundness: { type: 3 }, label: { text: '音乐播放条', fontSize: 15, fontFamily: FONT_FAMILY.Excalifont, strokeColor: '#334155' } },
    // 底部导航栏草图
    { type: 'rectangle', x: 20, y: 748, width: 350, height: 64, strokeColor: '#64748b', backgroundColor: 'transparent', strokeWidth: 1, roughness: 1, roundness: { type: 3 } },
    { type: 'ellipse', x: 52, y: 764, width: 32, height: 32, strokeColor: '#2196f3', backgroundColor: 'transparent', strokeWidth: 2, roughness: 1 },
    { type: 'ellipse', x: 179, y: 764, width: 32, height: 32, strokeColor: '#64748b', backgroundColor: 'transparent', strokeWidth: 2, roughness: 1 },
    { type: 'ellipse', x: 306, y: 764, width: 32, height: 32, strokeColor: '#64748b', backgroundColor: 'transparent', strokeWidth: 2, roughness: 1 },
  ], { regenerateIds: true }).map(element =>
    element.type === 'text' ? newElementWith(element, { fontFamily: FONT_FAMILY.Excalifont }) : element,
  );

  return elements;
}
