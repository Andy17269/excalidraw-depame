import type { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ShowcaseId } from './showcaseCatalog';

export type SceneSkeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];
export interface ShowcaseImage { key: string; path: string; x: number; y: number; width: number; height: number; }
export interface ShowcaseLayout { elements: SceneSkeleton[]; images: ShowcaseImage[]; }

const TRAVEL = { paper: '#fafaf7', ink: '#203b35', accent: '#214d43', muted: '#64746c', border: '#dce5df', tint: '#eaf0e9' };
const COMMERCE = { paper: '#f4f6fa', ink: '#243449', accent: '#3869db', muted: '#6d7a8d', border: '#e2e7ee', sidebar: '#203549' };

/** Sketch and finished UI share all major region coordinates. */
export function buildShowcaseLayout(id: Exclude<ShowcaseId, 'music'>, sketch: boolean): ShowcaseLayout {
  const elements: SceneSkeleton[] = [];
  const images: ShowcaseImage[] = [];
  const c = id === 'travel' ? TRAVEL : COMMERCE;
  const box = (x: number, y: number, width: number, height: number, fill = '#ffffff', border = c.border, rounded = true) => {
    elements.push({ type: 'rectangle', x, y, width, height, backgroundColor: sketch ? 'transparent' : fill,
      strokeColor: sketch ? '#87938d' : border, fillStyle: 'solid', strokeWidth: 1, roughness: sketch ? 1 : 0,
      roundness: rounded ? { type: 3 } : null });
  };
  const text = (x: number, y: number, value: string, size = 14, color = c.ink) => {
    elements.push({ type: 'text', x, y, text: value, fontSize: size, strokeColor: sketch ? '#40544c' : color });
  };
  const line = (x: number, y: number, points: [number, number][], color = c.border, width = 1) => {
    elements.push({ type: 'line', x, y, points, strokeColor: sketch ? '#87938d' : color, strokeWidth: width, roughness: sketch ? 1 : 0 });
  };
  const dot = (x: number, y: number, size: number, fill: string) => {
    elements.push({ type: 'ellipse', x, y, width: size, height: size, backgroundColor: sketch ? 'transparent' : fill, strokeColor: sketch ? '#87938d' : fill, fillStyle: 'solid', strokeWidth: 1, roughness: sketch ? 1 : 0 });
  };
  const photo = (key: string, x: number, y: number, width: number, height: number, label: string) => {
    if (sketch) {
      box(x, y, width, height, '#ffffff', c.border, false);
      line(x + 10, y + 10, [[0, 0], [width - 20, height - 20]]);
      line(x + width - 10, y + 10, [[0, 0], [-width + 20, height - 20]]);
      text(x + 14, y + height / 2 - 10, label, 14);
    } else images.push({ key, path: key === 'bay' ? 'showcase-assets/bay.jpg' : 'showcase-assets/coast.jpg', x, y, width, height });
  };

  if (id === 'travel') {
    box(0, 0, 390, 844, c.paper);
    text(26, 17, '09:41', 13);
    line(306, 21, [[0, 6], [0, 3], [5, 3], [5, -1], [10, -1], [10, -5]], c.ink, 2);
    box(335, 18, 25, 11, c.paper, c.ink, false);
    if (!sketch) box(338, 21, 17, 5, c.ink, c.ink, false);
    text(24, 57, '山海之间', 27);
    text(24, 97, '把周末，留给远方。', 13, c.muted);
    dot(328, 59, 36, TRAVEL.tint);
    text(338, 67, '山', 15, c.accent);
    box(24, 133, 342, 44, '#f0f3ee');
    elements.push({ type: 'ellipse', x: 40, y: 146, width: 13, height: 13, backgroundColor: 'transparent', strokeColor: c.muted, strokeWidth: 1.5, roughness: sketch ? 1 : 0 });
    line(51, 157, [[0, 0], [5, 5]], c.muted, 1.5);
    text(68, 146, '搜索目的地、路线', 13, c.muted);
    ['为你推荐', '海岸', '山野', '城市'].forEach((label, i) => {
      const x = [24, 132, 212, 292][i]!;
      box(x, 192, i === 0 ? 96 : 72, 34, i === 0 ? c.accent : c.paper, i === 0 ? c.accent : c.border);
      text(x + (i === 0 ? 14 : 20), 201, label, 13, i === 0 ? '#ffffff' : c.muted);
    });
    photo('hero', 24, 246, 342, 236, '海岸目的地大图');
    // Separate dark editorial caption retains readable contrast regardless of photograph.
    box(24, 482, 342, 83, c.accent, c.accent, false);
    text(40, 495, sketch ? '目的地名称' : '沿着海岸，慢一点', 23, '#ffffff');
    text(40, 532, '海岸漫游  /  3 天 2 晚', 12, '#e1e9df');
    text(330, 514, '↗', 23, '#ffffff');
    text(24, 589, '周末灵感', 20);
    text(306, 595, '查看全部', 12, c.muted);
    photo('trail', 24, 628, 162, 87, '海边步道');
    photo('bay', 204, 628, 162, 87, '日落海湾');
    text(24, 723, '沿海步道', 15);
    text(204, 723, '静谧海湾', 15);
    text(24, 747, '轻徒步 · 半日路线', 11, c.muted);
    text(204, 747, '慢旅行 · 周末出发', 11, c.muted);
    line(24, 779, [[0, 0], [342, 0]]);
    ['发现', '心愿', '行程', '我的'].forEach((label, i) => {
      if (i === 0) dot(36 + i * 86, 800, 6, c.accent);
      text(50 + i * 86, 794, label, 13, i === 0 ? c.accent : c.muted);
    });
    box(147, 830, 96, 4, c.ink, c.ink);
  } else {
    const d = COMMERCE;
    box(0, 0, 1120, 740, d.paper);
    box(0, 0, 184, 740, d.sidebar, d.sidebar, false);
    box(24, 28, 28, 28, '#b8d8f4', '#b8d8f4');
    text(31, 32, '云', 18, d.sidebar);
    text(65, 31, '云栈商家', 19, '#ffffff');
    text(24, 80, '经营空间', 12, '#bac7d6');
    ['经营概览', '订单管理', '商品库存', '客户运营', '营销活动'].forEach((label, i) => {
      if (i === 0) box(14, 112 + i * 48, 156, 38, '#35526e', '#35526e');
      box(28, 124 + i * 48, 13, 13, 'transparent', i === 0 ? '#ffffff' : '#a2b4c8', false);
      text(54, 121 + i * 48, label, 14, i === 0 ? '#ffffff' : '#bac7d6');
    });
    line(24, 639, [[0, 0], [136, 0]], '#496073');
    dot(24, 666, 32, '#45637c');
    text(32, 673, '林', 14, '#ffffff');
    text(68, 665, '林间生活', 14, '#ffffff');
    text(68, 689, '品牌旗舰店', 11, '#bac7d6');
    box(184, 0, 936, 78, '#ffffff', d.border, false);
    text(216, 27, '工作台  /  经营概览', 16);
    text(879, 31, '帮助中心', 12, d.muted);
    dot(1018, 22, 32, '#e7edf9');
    text(1026, 30, '林', 13, d.accent);
    text(216, 106, '经营概览', 28);
    text(216, 149, '每一笔生意，都看得清楚。', 13, d.muted);
    box(849, 112, 239, 36, '#ffffff');
    text(865, 122, '11 月 9 日 — 11 月 15 日', 13, d.muted);
    const metrics = [
      ['本周成交额', '¥ 128,640', '较上周 +12.8%'],
      ['支付订单', '1,248', '较上周 +8.2%'],
      ['客单价', '¥ 103.08', '较上周 +4.3%'],
      ['退款率', '1.28%', '较上周 -0.4%'],
    ];
    metrics.forEach(([label, value, delta], i) => {
      const x = 216 + i * 224;
      box(x, 186, 200, 116);
      text(x + 16, 202, label!, 13, d.muted);
      text(x + 16, 231, sketch ? '核心指标' : value!, 25);
      text(x + 16, 273, sketch ? '趋势变化' : delta!, 11, '#2e7b68');
    });
    box(216, 322, 552, 222);
    text(236, 339, '成交趋势', 17);
    text(661, 344, '本周 · 元', 11, d.muted);
    if (sketch) {
      text(310, 425, '周一至周日成交额折线图', 18);
      line(282, 479, [[0, 0], [54, -20], [116, -8], [177, -55], [240, -44], [300, -91], [360, -78]], d.accent, 2);
    } else {
      [0, 1, 2].forEach(i => {
        line(284, 391 + i * 45, [[0, 0], [450, 0]], d.border);
        text(236, 385 + i * 45, ['24k', '16k', '8k'][i]!, 10, d.muted);
      });
      // Seven daily totals sum to the headline revenue: 128,640.
      const values = [12600, 16400, 15200, 19800, 17400, 24800, 22440];
      const points = values.map((v, i) => [i * 75, (24000 - v) / 16000 * 90] as [number, number]);
      line(284, 391, points, d.accent, 2.6);
      points.forEach(([x, y]) => dot(281 + x, 388 + y, 6, d.accent));
      ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].forEach((label, i) => text(272 + i * 75, 511, label, 11, d.muted));
    }
    box(792, 322, 296, 222);
    text(812, 339, '成交来源', 17);
    const channels = [['自然访问', 48, '#3869db'], ['活动转化', 32, '#62a89c'], ['老客复购', 20, '#a4b8df']] as const;
    channels.forEach(([label, percentage, color], i) => {
      const y = 383 + i * 49;
      text(812, y, label, 12, d.muted);
      text(1028, y, sketch ? '占比' : `${percentage}%`, 12);
      box(812, y + 23, 254, 7, '#edf0f5', '#edf0f5');
      if (!sketch) box(812, y + 23, 254 * percentage / 100, 7, color, color);
    });
    box(216, 566, 872, 148);
    text(236, 581, '最近订单', 17);
    text(1008, 586, '查看全部', 12, d.accent);
    ['订单编号', '商品', '金额', '状态', '下单时间'].forEach((value, i) => text([236, 416, 724, 842, 966][i]!, 617, value, 11, d.muted));
    line(236, 639, [[0, 0], [832, 0]]);
    const rows = [['#YS-20261115-018', '山野随行保温杯 · 雾松绿', '¥ 129.00', '待发货', '14:32'], ['#YS-20261115-017', '轻量帆布手提袋 · 岩白', '¥ 89.00', '已发货', '14:26']];
    rows.forEach((row, i) => {
      const y = 650 + i * 32;
      row.forEach((value, j) => {
        if (j === 3) box(835, y - 2, 68, 23, i === 0 ? '#fff2db' : '#e6f1eb', 'transparent');
        text([236, 416, 724, 847, 976][j]!, y, sketch && j === 1 ? '商品名称与规格' : value, 11, j === 3 ? (i === 0 ? '#986015' : '#28664e') : d.ink);
      });
    });
    text(966, 724, '示例经营数据', 10, d.muted);
  }
  return { elements, images };
}
