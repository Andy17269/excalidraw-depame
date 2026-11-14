export type TemplatePlatform = 'mobile-app' | 'mobile-web' | 'pc-web' | 'pc-app';
export type TemplateCategory = 'page' | 'navigation' | 'form' | 'list' | 'dashboard' | 'overlay';

export interface TemplateLabelSpec {
  text: string;
  fontSize?: number;
  strokeColor?: string;
}

export interface TemplateRectSpec {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: 'hachure' | 'cross-hatch' | 'solid';
  strokeWidth?: number;
  roughness?: number;
  roundness?: { type: 2 | 3 } | null;
  opacity?: number;
  label?: TemplateLabelSpec;
}

export interface TemplateEllipseSpec {
  type: 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: 'hachure' | 'cross-hatch' | 'solid';
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
}

export interface TemplateTextSpec {
  type: 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text: string;
  fontSize?: number;
  strokeColor?: string;
  opacity?: number;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

export interface TemplateLineSpec {
  type: 'line';
  x: number;
  y: number;
  points: readonly [number, number][];
  strokeColor?: string;
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
}

export type TemplateElementSpec =
  | TemplateRectSpec
  | TemplateEllipseSpec
  | TemplateTextSpec
  | TemplateLineSpec;

export interface UiTemplate {
  id: string;
  name: string;
  platform: TemplatePlatform;
  category: TemplateCategory;
  width: number;
  height: number;
  description: string;
  keywords: readonly string[];
  elements: readonly TemplateElementSpec[];
}

export const TEMPLATE_PLATFORMS: ReadonlyArray<{ id: TemplatePlatform; label: string }> = [
  { id: 'mobile-app', label: '手机应用' },
  { id: 'mobile-web', label: '手机网页' },
  { id: 'pc-web', label: '电脑网页' },
  { id: 'pc-app', label: '电脑应用' },
];

export const TEMPLATE_CATEGORIES: ReadonlyArray<{ id: 'all' | TemplateCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'page', label: '整页' },
  { id: 'navigation', label: '导航' },
  { id: 'form', label: '表单' },
  { id: 'list', label: '列表' },
  { id: 'dashboard', label: '看板' },
  { id: 'overlay', label: '弹窗' },
];

const INK = '#1e293b';
const BODY = '#334155';
const MUTED = '#64748b';
const BORDER = '#cbd5e1';
const BORDER_DARK = '#94a3b8';
const ACCENT = '#2196f3';
const ACCENT_SOFT = '#e3f2fd';
const SURFACE = '#ffffff';
const SURFACE_ALT = '#f8fafc';
const SURFACE_MUTED = '#f1f5f9';

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  opts: Partial<Omit<TemplateRectSpec, 'type' | 'x' | 'y' | 'width' | 'height'>> = {},
): TemplateRectSpec {
  return {
    type: 'rectangle',
    x,
    y,
    width,
    height,
    strokeColor: opts.strokeColor ?? BORDER_DARK,
    backgroundColor: opts.backgroundColor ?? SURFACE,
    fillStyle: opts.fillStyle ?? 'solid',
    strokeWidth: opts.strokeWidth ?? 1,
    roughness: opts.roughness ?? 0,
    roundness: opts.roundness === undefined ? { type: 3 } : opts.roundness,
    ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
    ...(opts.label ? { label: opts.label } : {}),
  };
}

function circle(
  x: number,
  y: number,
  size: number,
  opts: Partial<Omit<TemplateEllipseSpec, 'type' | 'x' | 'y' | 'width' | 'height'>> = {},
): TemplateEllipseSpec {
  return {
    type: 'ellipse',
    x,
    y,
    width: size,
    height: size,
    strokeColor: opts.strokeColor ?? BORDER_DARK,
    backgroundColor: opts.backgroundColor ?? SURFACE_ALT,
    fillStyle: opts.fillStyle ?? 'solid',
    strokeWidth: opts.strokeWidth ?? 1,
    roughness: opts.roughness ?? 0,
    ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
  };
}

function txt(
  x: number,
  y: number,
  text: string,
  fontSize = 14,
  strokeColor = INK,
  opts: Partial<Pick<TemplateTextSpec, 'width' | 'height' | 'textAlign' | 'verticalAlign' | 'opacity'>> = {},
): TemplateTextSpec {
  return { type: 'text', x, y, text, fontSize, strokeColor, ...opts };
}

function centeredTxt(
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  fontSize = 14,
  strokeColor = INK,
): TemplateTextSpec {
  return {
    type: 'text',
    x,
    y,
    width,
    height,
    text,
    fontSize,
    strokeColor,
    textAlign: 'center',
    verticalAlign: 'middle',
  };
}

function hline(x: number, y: number, length: number, strokeColor = BORDER): TemplateLineSpec {
  return {
    type: 'line',
    x,
    y,
    points: [[0, 0], [length, 0]],
    strokeColor,
    strokeWidth: 1,
    roughness: 0,
  };
}

function button(
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  variant: 'primary' | 'secondary' | 'ghost' = 'primary',
): TemplateRectSpec {
  const palette = variant === 'primary'
    ? { strokeColor: ACCENT, backgroundColor: ACCENT, textColor: '#ffffff' }
    : variant === 'secondary'
      ? { strokeColor: ACCENT, backgroundColor: ACCENT_SOFT, textColor: ACCENT }
      : { strokeColor: BORDER_DARK, backgroundColor: SURFACE, textColor: BODY };
  return rect(x, y, width, height, {
    strokeColor: palette.strokeColor,
    backgroundColor: palette.backgroundColor,
    strokeWidth: variant === 'primary' ? 2 : 1,
    label: { text, fontSize: 14, strokeColor: palette.textColor },
  });
}

function inputBox(x: number, y: number, width: number, height: number, placeholder: string): TemplateRectSpec {
  return rect(x, y, width, height, {
    strokeColor: BORDER,
    backgroundColor: SURFACE_ALT,
    label: { text: placeholder, fontSize: 13, strokeColor: MUTED },
  });
}

function block(
  x: number,
  y: number,
  width: number,
  height: number,
  label?: string,
  accent = false,
): TemplateRectSpec {
  return rect(x, y, width, height, {
    strokeColor: accent ? ACCENT : BORDER_DARK,
    backgroundColor: accent ? ACCENT_SOFT : SURFACE,
    fillStyle: accent ? 'hachure' : 'solid',
    strokeWidth: accent ? 2 : 1,
    ...(label ? { label: { text: label, fontSize: 14, strokeColor: accent ? INK : BODY } } : {}),
  });
}

const MOBILE_W = 390;
const MOBILE_PAD = 16;
const MOBILE_INNER_W = MOBILE_W - MOBILE_PAD * 2; // 358
const MOBILE_GAP = 12;
const MOBILE_COL_W = (MOBILE_INNER_W - MOBILE_GAP) / 2; // 173
const MOBILE_COL_RIGHT_X = MOBILE_PAD + MOBILE_COL_W + MOBILE_GAP; // 201

function mobileAppShell(height: number, navTitle?: string, showBack = false): TemplateElementSpec[] {
  const items: TemplateElementSpec[] = [
    rect(0, 0, MOBILE_W, height, { strokeColor: INK, backgroundColor: SURFACE_ALT, strokeWidth: 2 }),
    rect((MOBILE_W - 120) / 2, 10, 120, 20, { strokeColor: INK, backgroundColor: INK }),
    txt(MOBILE_PAD, 13, '9:41', 12, INK),
    rect((MOBILE_W - 134) / 2, height - 16, 134, 5, { strokeColor: BORDER_DARK, backgroundColor: BORDER_DARK }),
  ];
  if (navTitle) {
    items.push(
      rect(1, 42, MOBILE_W - 2, 44, { strokeColor: 'transparent', backgroundColor: SURFACE, roundness: null }),
      hline(0, 86, MOBILE_W),
    );
    if (showBack) {
      items.push(txt(MOBILE_PAD, 42, '< 返回', 14, BODY, { height: 44, verticalAlign: 'middle' }));
      items.push(centeredTxt(MOBILE_PAD, 42, MOBILE_INNER_W, 44, navTitle, 18, INK));
    } else {
      items.push(txt(MOBILE_PAD, 42, navTitle, 18, INK, { height: 44, verticalAlign: 'middle' }));
    }
  }
  return items;
}

function mobileTabBar(y: number, count = 4): TemplateElementSpec[] {
  const items: TemplateElementSpec[] = [
    rect(MOBILE_PAD, y, MOBILE_INNER_W, 58, { strokeColor: BORDER_DARK, backgroundColor: SURFACE }),
  ];
  const slotW = MOBILE_INNER_W / count;
  for (let i = 0; i < count; i++) {
    const active = i === 0;
    const cx = Math.round(MOBILE_PAD + i * slotW + (slotW - 28) / 2);
    items.push(
      circle(cx, y + 15, 28, {
        strokeColor: active ? ACCENT : BORDER_DARK,
        backgroundColor: active ? ACCENT_SOFT : SURFACE_ALT,
      }),
    );
  }
  return items;
}

function mobileWebShell(height: number, url: string): TemplateElementSpec[] {
  return [
    rect(0, 0, MOBILE_W, height, { strokeColor: INK, backgroundColor: SURFACE, strokeWidth: 2 }),
    rect(1, 1, MOBILE_W - 2, 68, { strokeColor: 'transparent', backgroundColor: SURFACE_MUTED, roundness: null }),
    rect(MOBILE_PAD, 22, MOBILE_INNER_W, 34, { strokeColor: BORDER, backgroundColor: SURFACE, label: { text: url, fontSize: 12, strokeColor: MUTED } }),
    hline(0, 69, MOBILE_W),
    rect((MOBILE_W - 134) / 2, height - 16, 134, 5, { strokeColor: BORDER_DARK, backgroundColor: BORDER_DARK }),
  ];
}

function pcBrowserShell(width: number, height: number, url: string): TemplateElementSpec[] {
  return [
    rect(0, 0, width, height, { strokeColor: INK, backgroundColor: SURFACE, strokeWidth: 2 }),
    rect(1, 1, width - 2, 46, { strokeColor: 'transparent', backgroundColor: SURFACE_MUTED, roundness: null }),
    circle(20, 17, 12, { strokeColor: '#ef4444', backgroundColor: '#fca5a5' }),
    circle(40, 17, 12, { strokeColor: '#f59e0b', backgroundColor: '#fde68a' }),
    circle(60, 17, 12, { strokeColor: '#10b981', backgroundColor: '#a7f3d0' }),
    rect(180, 9, width - 360, 28, { strokeColor: BORDER, backgroundColor: SURFACE, label: { text: url, fontSize: 12, strokeColor: MUTED } }),
    hline(0, 47, width),
  ];
}

function pcAppShell(width: number, height: number, title: string): TemplateElementSpec[] {
  return [
    rect(0, 0, width, height, { strokeColor: INK, backgroundColor: SURFACE_ALT, strokeWidth: 2 }),
    rect(1, 1, width - 2, 44, { strokeColor: 'transparent', backgroundColor: SURFACE, roundness: null }),
    circle(20, 16, 12, { strokeColor: '#ef4444', backgroundColor: '#fca5a5' }),
    circle(40, 16, 12, { strokeColor: '#f59e0b', backgroundColor: '#fde68a' }),
    circle(60, 16, 12, { strokeColor: '#10b981', backgroundColor: '#a7f3d0' }),
    txt(92, 14, title, 14, INK),
    hline(0, 45, width),
  ];
}

export const UI_TEMPLATES: readonly UiTemplate[] = [
  // ==================== 手机应用 (5) ====================
  {
    id: 'mobile-app-home',
    name: '应用首页信息流',
    platform: 'mobile-app',
    category: 'page',
    width: MOBILE_W,
    height: 844,
    description: '顶栏标题、主推大卡、双列内容块、悬浮播放条与底部导航骨架',
    keywords: ['home', 'music', 'feed', '首页', '音乐', '信息流', '推荐'],
    elements: [
      ...mobileAppShell(844),
      txt(MOBILE_PAD, 52, 'Home', 26, INK),
      circle(MOBILE_W - MOBILE_PAD - 38, 48, 38, { strokeColor: ACCENT, backgroundColor: ACCENT_SOFT }),
      txt(MOBILE_PAD, 110, 'Top Picks', 16, INK),
      block(MOBILE_PAD, 142, 234, 280, 'New Music 推荐大卡', true),
      block(MOBILE_PAD + 234 + MOBILE_GAP, 142, MOBILE_INNER_W - 234 - MOBILE_GAP, 280, 'Focus'),
      txt(MOBILE_PAD, 446, 'Recently Played', 16, INK),
      block(MOBILE_PAD, 478, MOBILE_COL_W, 150, '专辑封面 1'),
      block(MOBILE_COL_RIGHT_X, 478, MOBILE_COL_W, 150, '专辑封面 2'),
      block(MOBILE_PAD, 650, MOBILE_INNER_W, 54, '音乐播放条 (Mini Player)'),
      ...mobileTabBar(720, 5),
    ],
  },
  {
    id: 'mobile-app-login',
    name: '应用登录注册页',
    platform: 'mobile-app',
    category: 'form',
    width: MOBILE_W,
    height: 844,
    description: '品牌标志占位、账号与密码输入区、主操作按钮与辅助入口',
    keywords: ['login', 'auth', '登录', '注册', '表单'],
    elements: [
      ...mobileAppShell(844),
      circle((MOBILE_W - 80) / 2, 110, 80, { strokeColor: ACCENT, backgroundColor: ACCENT_SOFT }),
      centeredTxt(MOBILE_PAD, 210, MOBILE_INNER_W, 32, '欢迎回来', 22, INK),
      inputBox(MOBILE_PAD, 284, MOBILE_INNER_W, 48, '账号输入区'),
      inputBox(MOBILE_PAD, 350, MOBILE_INNER_W, 48, '密码 / 验证码区'),
      button(MOBILE_PAD, 428, MOBILE_INNER_W, 50, '立即登录', 'primary'),
      block(MOBILE_PAD, 520, MOBILE_INNER_W, 96, '第三方登录入口区'),
    ],
  },
  {
    id: 'mobile-app-detail',
    name: '应用内容详情页',
    platform: 'mobile-app',
    category: 'page',
    width: MOBILE_W,
    height: 844,
    description: '返回顶栏、主视觉占位、信息摘要块与底部操作栏',
    keywords: ['detail', 'product', '详情页', '内容'],
    elements: [
      ...mobileAppShell(844, '详情', true),
      block(MOBILE_PAD, 104, MOBILE_INNER_W, 236, '头图 / 封面预览区', true),
      block(MOBILE_PAD, 358, MOBILE_INNER_W, 96, '标题与核心参数区'),
      block(MOBILE_PAD, 472, MOBILE_INNER_W, 240, '图文详情与评价区'),
      rect(1, 744, MOBILE_W - 2, 72, { strokeColor: 'transparent', backgroundColor: SURFACE, roundness: null }),
      hline(0, 744, MOBILE_W),
      button(MOBILE_PAD, 758, 114, 44, '次操作', 'ghost'),
      button(MOBILE_PAD + 114 + MOBILE_GAP, 758, MOBILE_INNER_W - 114 - MOBILE_GAP, 44, '主操作', 'primary'),
    ],
  },
  {
    id: 'mobile-app-profile',
    name: '应用个人中心',
    platform: 'mobile-app',
    category: 'list',
    width: MOBILE_W,
    height: 844,
    description: '个人信息卡、数据概览条、分组列表区与底部导航',
    keywords: ['profile', 'mine', '个人中心', '设置'],
    elements: [
      ...mobileAppShell(844, '我的'),
      block(MOBILE_PAD, 104, MOBILE_INNER_W, 112, '用户头像与会员信息卡', true),
      block(MOBILE_PAD, 234, MOBILE_INNER_W, 84, '三栏数据概览区'),
      block(MOBILE_PAD, 338, MOBILE_INNER_W, 176, '常用功能列表组'),
      block(MOBILE_PAD, 532, MOBILE_INNER_W, 168, '系统设置列表组'),
      ...mobileTabBar(720, 4),
    ],
  },
  {
    id: 'mobile-app-navbar',
    name: '应用导航栏套件',
    platform: 'mobile-app',
    category: 'navigation',
    width: MOBILE_W,
    height: 300,
    description: '标准顶栏、分段切换栏与底部导航栏 骨架组合',
    keywords: ['nav', 'tabbar', '导航', '顶栏'],
    elements: [
      rect(0, 0, MOBILE_W, 300, { strokeColor: BORDER, backgroundColor: SURFACE_ALT }),
      block(MOBILE_PAD, 24, MOBILE_INNER_W, 52, 'Top Bar（返回 / 标题 / 操作）'),
      block(MOBILE_PAD, 104, MOBILE_INNER_W, 52, 'Segmented Control 分段滑轨', true),
      ...mobileTabBar(196, 4),
    ],
  },

  // ==================== 手机网页 (5) ====================
  {
    id: 'mobile-web-landing',
    name: 'H5 活动落地页',
    platform: 'mobile-web',
    category: 'page',
    width: MOBILE_W,
    height: 844,
    description: '浏览器壳、首屏主视觉、卖点卡片区与吸底行动栏',
    keywords: ['h5', 'landing', '营销', '活动页'],
    elements: [
      ...mobileWebShell(844, 'm.example.com/event'),
      block(MOBILE_PAD, 86, MOBILE_INNER_W, 240, 'Hero 主视觉与核心 CTA', true),
      block(MOBILE_PAD, 346, MOBILE_INNER_W, 136, '核心亮点区 A'),
      block(MOBILE_PAD, 500, MOBILE_INNER_W, 136, '核心亮点区 B'),
      block(MOBILE_PAD, 654, MOBILE_INNER_W, 80, '底部转化栏'),
    ],
  },
  {
    id: 'mobile-web-form',
    name: 'H5 表单收集页',
    platform: 'mobile-web',
    category: 'form',
    width: MOBILE_W,
    height: 844,
    description: '步骤标题、信息录入卡片、选项区块与提交按钮',
    keywords: ['form', 'survey', '表单', '预约'],
    elements: [
      ...mobileWebShell(844, 'm.example.com/form'),
      block(MOBILE_PAD, 90, MOBILE_INNER_W, 76, '表单标题与进度条', true),
      block(MOBILE_PAD, 186, MOBILE_INNER_W, 220, '基础信息录入区'),
      block(MOBILE_PAD, 426, MOBILE_INNER_W, 176, '选项 / 补充说明区'),
      button(MOBILE_PAD, 646, MOBILE_INNER_W, 48, '提交表单', 'primary'),
    ],
  },
  {
    id: 'mobile-web-article',
    name: 'H5 资讯阅读页',
    platform: 'mobile-web',
    category: 'page',
    width: MOBILE_W,
    height: 844,
    description: '文章标题区、封面图、正文排版块与底部互动栏',
    keywords: ['article', 'blog', '文章', '阅读'],
    elements: [
      ...mobileWebShell(844, 'm.example.com/post'),
      block(MOBILE_PAD, 90, MOBILE_INNER_W, 92, '文章大标题与作者栏'),
      block(MOBILE_PAD, 198, MOBILE_INNER_W, 172, '正文配图区', true),
      block(MOBILE_PAD, 388, MOBILE_INNER_W, 320, '正文内容排版区'),
      block(MOBILE_PAD, 728, MOBILE_INNER_W, 56, '底部点赞 / 评论 / 分享栏'),
    ],
  },
  {
    id: 'mobile-web-shop-list',
    name: 'H5 商品瀑布流',
    platform: 'mobile-web',
    category: 'list',
    width: MOBILE_W,
    height: 844,
    description: '搜索筛选条、双列商品卡片骨架',
    keywords: ['shop', 'ecommerce', '商品', '列表'],
    elements: [
      ...mobileWebShell(844, 'm.shop.example.com'),
      block(MOBILE_PAD, 86, MOBILE_INNER_W, 46, '搜索与排序筛选条'),
      block(MOBILE_PAD, 150, MOBILE_COL_W, 250, '商品卡 1', true),
      block(MOBILE_COL_RIGHT_X, 150, MOBILE_COL_W, 220, '商品卡 2'),
      block(MOBILE_PAD, 418, MOBILE_COL_W, 230, '商品卡 3'),
      block(MOBILE_COL_RIGHT_X, 388, MOBILE_COL_W, 260, '商品卡 4'),
    ],
  },
  {
    id: 'mobile-web-sheet',
    name: 'H5 底部弹窗套件',
    platform: 'mobile-web',
    category: 'overlay',
    width: MOBILE_W,
    height: 600,
    description: '半透明遮罩背景与底部上滑 操作面板 容器',
    keywords: ['sheet', 'modal', '弹窗', '遮罩'],
    elements: [
      rect(0, 0, MOBILE_W, 600, { strokeColor: INK, backgroundColor: SURFACE_MUTED, strokeWidth: 2 }),
      block(MOBILE_PAD, 28, MOBILE_INNER_W, 180, '底层页面预览区'),
      rect(1, 240, MOBILE_W - 2, 359, { strokeColor: BORDER_DARK, backgroundColor: SURFACE, strokeWidth: 2 }),
      rect((MOBILE_W - 54) / 2, 254, 54, 5, { strokeColor: BORDER, backgroundColor: BORDER }),
      block(MOBILE_PAD, 280, MOBILE_INNER_W, 190, '弹窗核心内容区', true),
      button(MOBILE_PAD, 502, MOBILE_INNER_W, 46, '确认', 'primary'),
    ],
  },

  // ==================== 电脑网页 (5) ====================
  {
    id: 'pc-web-hero',
    name: '电脑官网落地页',
    platform: 'pc-web',
    category: 'page',
    width: 1200,
    height: 760,
    description: '顶部导航栏、主视觉区与三栏特性卡片骨架',
    keywords: ['landing', 'hero', '官网', '首页'],
    elements: [
      ...pcBrowserShell(1200, 760, 'https://example.com'),
      block(24, 64, 1152, 56, '页头（标志 / 导航 / 登录）'),
      block(24, 140, 1152, 300, '主视觉与双操作按钮', true),
      block(24, 468, 368, 240, '核心能力 1'),
      block(416, 468, 368, 240, '核心能力 2'),
      block(808, 468, 368, 240, '核心能力 3'),
    ],
  },
  {
    id: 'pc-web-admin-table',
    name: '电脑后台列表页',
    platform: 'pc-web',
    category: 'list',
    width: 1200,
    height: 760,
    description: '左侧菜单栏、顶部筛选条、数据表格区与分页栏',
    keywords: ['admin', 'table', '后台', '表格'],
    elements: [
      ...pcBrowserShell(1200, 760, 'https://admin.example.com'),
      block(20, 68, 210, 668, '侧边导航菜单'),
      block(250, 68, 930, 76, '筛选搜索与新建操作条', true),
      block(250, 164, 930, 512, '数据表格主内容区'),
      block(250, 692, 930, 44, '底部分页栏'),
    ],
  },
  {
    id: 'pc-web-login',
    name: '电脑分栏登录页',
    platform: 'pc-web',
    category: 'form',
    width: 1080,
    height: 680,
    description: '左侧品牌展示区与右侧居中的登录表单卡',
    keywords: ['login', 'auth', '登录', 'pc'],
    elements: [
      ...pcBrowserShell(1080, 680, 'https://app.example.com/login'),
      block(24, 70, 500, 584, '左侧品牌视觉与标语区', true),
      block(556, 130, 500, 440, '右侧登录表单卡片'),
      button(588, 440, 436, 46, '登录工作台', 'primary'),
    ],
  },
  {
    id: 'pc-web-pricing',
    name: '电脑定价方案页',
    platform: 'pc-web',
    category: 'page',
    width: 1200,
    height: 760,
    description: '标题切换区与三档对比定价卡片',
    keywords: ['pricing', 'plan', '定价', '套餐'],
    elements: [
      ...pcBrowserShell(1200, 760, 'https://example.com/pricing'),
      block(220, 76, 760, 108, '标题与计费周期切换'),
      block(24, 214, 368, 496, '基础版方案卡'),
      block(416, 214, 368, 496, '专业版推荐方案卡', true),
      block(808, 214, 368, 496, '企业版方案卡'),
    ],
  },
  {
    id: 'pc-web-header',
    name: '电脑顶栏导航组合',
    platform: 'pc-web',
    category: 'navigation',
    width: 1120,
    height: 220,
    description: '单行官网导航与后台搜索顶栏骨架',
    keywords: ['header', 'navbar', '导航栏'],
    elements: [
      rect(0, 0, 1120, 220, { strokeColor: BORDER, backgroundColor: SURFACE_ALT }),
      block(24, 28, 1072, 68, '官网导航栏（标志 + 菜单 + 操作按钮）', true),
      block(24, 124, 860, 68, '应用顶栏（面包屑 + 全局搜索）'),
      block(904, 124, 192, 68, '用户头像与操作区'),
    ],
  },

  // ==================== 电脑应用 (5) ====================
  {
    id: 'pc-app-dashboard',
    name: '在线应用数据仪表盘',
    platform: 'pc-app',
    category: 'dashboard',
    width: 1200,
    height: 760,
    description: '侧边栏、关键指标行、主图表区与右侧明细列表骨架',
    keywords: ['dashboard', 'analytics', '仪表盘', '看板'],
    elements: [
      ...pcAppShell(1200, 760, '数据工作台'),
      block(20, 64, 200, 672, '主导航侧边栏'),
      block(240, 64, 223, 108, '指标卡片 1', true),
      block(479, 64, 223, 108, '指标卡片 2'),
      block(718, 64, 223, 108, '指标卡片 3'),
      block(957, 64, 223, 108, '指标卡片 4'),
      block(240, 192, 608, 320, '核心趋势图表区'),
      block(864, 192, 316, 320, '分布 / 占比卡'),
      block(240, 532, 940, 204, '底部最近动态 / 明细表'),
    ],
  },
  {
    id: 'pc-app-workspace',
    name: '三栏桌面工作区',
    platform: 'pc-app',
    category: 'page',
    width: 1200,
    height: 760,
    description: '经典目录树 + 主编辑画布 + 右侧属性检查器三栏布局',
    keywords: ['workspace', 'ide', '三栏', '工作台'],
    elements: [
      ...pcAppShell(1200, 760, '工作区'),
      block(16, 60, 220, 680, '左侧文件 / 图层目录'),
      block(252, 60, 680, 680, '主画布 / 内容编辑区', true),
      block(948, 60, 236, 680, '右侧属性检查器'),
    ],
  },
  {
    id: 'pc-app-settings',
    name: '桌面应用设置中心',
    platform: 'pc-app',
    category: 'form',
    width: 960,
    height: 640,
    description: '左侧设置分组导航与右侧配置表单面板',
    keywords: ['settings', 'preferences', '设置', '偏好'],
    elements: [
      ...pcAppShell(960, 640, '系统设置'),
      block(20, 64, 220, 552, '设置分组导航'),
      block(260, 64, 680, 250, '基础配置区', true),
      block(260, 334, 680, 210, '高级选项区'),
      button(824, 566, 116, 40, '保存设置', 'primary'),
    ],
  },
  {
    id: 'pc-app-chat',
    name: 'AI 协作对话界面',
    platform: 'pc-app',
    category: 'page',
    width: 1120,
    height: 740,
    description: '历史会话侧栏、消息流区域与底部多模态输入底座',
    keywords: ['chat', 'ai', '对话', '助手'],
    elements: [
      ...pcAppShell(1120, 740, '智能助手'),
      block(16, 60, 250, 660, '会话历史侧边栏'),
      block(282, 60, 822, 520, '对话消息流区域'),
      block(282, 598, 822, 122, '多模态输入框与发送工具栏', true),
    ],
  },
  {
    id: 'pc-app-modal',
    name: '桌面弹窗与抽屉',
    platform: 'pc-app',
    category: 'overlay',
    width: 960,
    height: 620,
    description: '模态对话框与右侧滑出抽屉组件骨架',
    keywords: ['modal', 'drawer', '弹窗', '抽屉'],
    elements: [
      ...pcAppShell(960, 620, '浮层组件'),
      block(20, 108, 510, 380, '居中模态弹窗 （对话框）', true),
      block(550, 60, 390, 540, '右侧滑出抽屉 （抽屉）'),
    ],
  },
];

export const UI_TEMPLATE_MAP = new Map<string, UiTemplate>(
  UI_TEMPLATES.map(item => [item.id, item]),
);

export function queryUiTemplates(filters: {
  platform?: TemplatePlatform | 'all';
  category?: TemplateCategory | 'all';
  query?: string;
} = {}): UiTemplate[] {
  const { platform = 'all', category = 'all', query = '' } = filters;
  const q = query.trim().toLowerCase();
  return UI_TEMPLATES.filter(item => {
    if (platform !== 'all' && item.platform !== platform) return false;
    if (category !== 'all' && item.category !== category) return false;
    if (!q) return true;
    const haystack = `${item.name} ${item.description} ${item.keywords.join(' ')} ${item.platform}`.toLowerCase();
    return haystack.includes(q);
  });
}

export function collectTemplateLabels(template: UiTemplate): string {
  const parts: string[] = [];
  for (const el of template.elements) {
    if (el.type === 'text' && el.text) parts.push(el.text);
    else if (el.type === 'rectangle' && el.label?.text) parts.push(el.label.text);
  }
  return parts.join(' ');
}

export interface ViewportSnapshot {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  zoom: number;
}

export interface BoxBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computeTemplateOrigin(
  size: { width: number; height: number },
  viewport: ViewportSnapshot,
  existingBounds: readonly BoxBounds[],
  gap = 48,
): { x: number; y: number } {
  const zoom = Math.max(0.1, viewport.zoom || 1);
  const centerX = viewport.width / (2 * zoom) - viewport.scrollX;
  const centerY = viewport.height / (2 * zoom) - viewport.scrollY;
  const candX = Math.round(centerX - size.width / 2);
  const candY = Math.round(centerY - size.height / 2);

  if (existingBounds.length === 0) return { x: candX, y: candY };

  const overlaps = (x: number, y: number, b: BoxBounds) =>
    x < b.maxX + gap && x + size.width + gap > b.minX &&
    y < b.maxY + gap && y + size.height + gap > b.minY;

  const hits = existingBounds.filter(b => overlaps(candX, candY, b));
  if (hits.length === 0) return { x: candX, y: candY };

  let maxRight = -Infinity;
  for (const b of existingBounds) {
    if (b.maxX > maxRight) maxRight = b.maxX;
  }
  return {
    x: Math.round(maxRight + gap),
    y: Math.round(hits[0]!.minY),
  };
}
