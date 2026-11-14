export function installCanvasCompat(): void {
  const proto = CanvasRenderingContext2D.prototype;
  const alpha = Object.getOwnPropertyDescriptor(proto, 'globalAlpha');
  if (!alpha?.get || !alpha.set || !alpha.configurable) return;
  type ContextState = { alpha: number; stack: number[]; hasPoint: boolean; cx: number; cy: number; sx: number; sy: number };
  const states = new WeakMap<CanvasRenderingContext2D, ContextState>();
  const canvases = new WeakMap<HTMLCanvasElement, ContextState>();
  const state = (context: CanvasRenderingContext2D) => {
    let current = states.get(context);
    if (!current) {
      current = { alpha: alpha.get!.call(context), stack: [], hasPoint: false, cx: 0, cy: 0, sx: 0, sy: 0 };
      states.set(context, current);
      canvases.set(context.canvas, current);
    }
    return current;
  };
  // acdert leaks its render layer at alpha 0; keep zero in JS and skip invisible drawing.
  Object.defineProperty(proto, 'globalAlpha', {
    ...alpha,
    get(this: CanvasRenderingContext2D) { return state(this).alpha; },
    set(this: CanvasRenderingContext2D, value: number) {
      if (!Number.isFinite(value) || value < 0 || value > 1) return;
      state(this).alpha = value;
      alpha.set!.call(this, value === 0 ? 1 : value);
    },
  });
  const save = proto.save;
  const restore = proto.restore;
  proto.save = function () { const current = state(this); current.stack.push(current.alpha); save.call(this); };
  proto.restore = function () { const current = state(this); const previous = current.stack.pop(); if (previous !== undefined) current.alpha = previous; restore.call(this); };
  const nativeClear = typeof proto.clearRect === 'function' ? proto.clearRect : null;
  const isOpaqueFill = (style: unknown): boolean => {
    if (typeof style !== 'string') return false;
    const s = style.trim().toLowerCase();
    if (!s || s === 'transparent' || s.includes('/')) return false;
    if (s.startsWith('rgba(') || s.startsWith('hsla(')) return false;
    if (s.startsWith('#') && (s.length === 5 || s.length === 9)) return false;
    return true;
  };
  const coversCanvas = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): boolean => {
    const canvas = ctx.canvas;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return false;
    if (typeof ctx.getTransform === 'function') {
      const m = ctx.getTransform();
      if (m.b !== 0 || m.c !== 0) return false;
      const x0 = m.a * x + m.e;
      const x1 = m.a * (x + w) + m.e;
      const y0 = m.d * y + m.f;
      const y1 = m.d * (y + h) + m.f;
      return Math.min(x0, x1) <= 1 && Math.min(y0, y1) <= 1
        && Math.max(x0, x1) >= canvas.width - 1 && Math.max(y0, y1) >= canvas.height - 1;
    }
    return x <= 0 && y <= 0 && w >= canvas.width && h >= canvas.height;
  };
  for (const name of ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage'] as const) {
    const native = proto[name];
    Object.defineProperty(proto, name, { configurable: true, writable: true, value: function (this: CanvasRenderingContext2D, ...args: unknown[]) {
      const current = state(this);
      if (current.alpha === 0) return;
      if (
        name === 'fillRect'
        && nativeClear
        && current.alpha >= 1
        && (this.globalCompositeOperation === undefined || this.globalCompositeOperation === 'source-over')
        && typeof args[0] === 'number' && typeof args[1] === 'number' && typeof args[2] === 'number' && typeof args[3] === 'number'
        && isOpaqueFill(this.fillStyle)
        && coversCanvas(this, args[0], args[1], args[2], args[3])
      ) {
        nativeClear.call(this, args[0], args[1], args[2], args[3]);
      }
      return Reflect.apply(native, this, args);
    } });
  }
  // CoreGraphics/WebKit stroke expansion can emit horizontal spikes on long, nearly-flat cubic Beziers.
  const nativeBeginPath = typeof proto.beginPath === 'function' ? proto.beginPath : null;
  const nativeMoveTo = typeof proto.moveTo === 'function' ? proto.moveTo : null;
  const nativeLineTo = typeof proto.lineTo === 'function' ? proto.lineTo : null;
  const nativeQuadTo = typeof proto.quadraticCurveTo === 'function' ? proto.quadraticCurveTo : null;
  const nativeBezierTo = typeof proto.bezierCurveTo === 'function' ? proto.bezierCurveTo : null;
  const nativeClosePath = typeof proto.closePath === 'function' ? proto.closePath : null;
  const setPoint = (s: ContextState, x: number, y: number, start = false) => {
    s.hasPoint = true; s.cx = x; s.cy = y;
    if (start) { s.sx = x; s.sy = y; }
  };
  const perpDist = (px: number, py: number, x0: number, y0: number, x3: number, y3: number) => {
    const dx = x3 - x0, dy = y3 - y0, len = Math.hypot(dx, dy);
    return len < 1e-6 ? Math.hypot(px - x0, py - y0) : Math.abs((px - x0) * dy - (py - y0) * dx) / len;
  };
  if (nativeBeginPath) proto.beginPath = function () { state(this).hasPoint = false; return nativeBeginPath.call(this); };
  if (nativeMoveTo) proto.moveTo = function (x: number, y: number) { setPoint(state(this), x, y, true); return nativeMoveTo.call(this, x, y); };
  if (nativeLineTo) proto.lineTo = function (x: number, y: number) { setPoint(state(this), x, y); return nativeLineTo.call(this, x, y); };
  if (nativeQuadTo) proto.quadraticCurveTo = function (cpx: number, cpy: number, x: number, y: number) { setPoint(state(this), x, y); return nativeQuadTo.call(this, cpx, cpy, x, y); };
  if (nativeClosePath) proto.closePath = function () { const s = state(this); if (s.hasPoint) { s.cx = s.sx; s.cy = s.sy; } return nativeClosePath.call(this); };
  if (nativeBezierTo && nativeLineTo) {
    proto.bezierCurveTo = function (cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
      const s = state(this);
      if (s.hasPoint) {
        const x0 = s.cx, y0 = s.cy;
        const chord = Math.hypot(x - x0, y - y0);
        const maxD = Math.max(perpDist(cp1x, cp1y, x0, y0, x, y), perpDist(cp2x, cp2y, x0, y0, x, y));
        if (chord > 16 && maxD < 3) {
          const steps = Math.max(4, Math.min(24, Math.ceil(chord / 32)));
          for (let i = 1; i <= steps; i++) {
            const t = i / steps, u = 1 - t;
            const px = i === steps ? x : u * u * u * x0 + 3 * u * u * t * cp1x + 3 * u * t * t * cp2x + t * t * t * x;
            const py = i === steps ? y : u * u * u * y0 + 3 * u * u * t * cp1y + 3 * u * t * t * cp2y + t * t * t * y;
            nativeLineTo.call(this, px, py);
          }
          setPoint(s, x, y);
          return;
        }
      }
      setPoint(s, x, y);
      return nativeBezierTo.call(this, cp1x, cp1y, cp2x, cp2y, x, y);
    };
  }
  for (const name of ['width', 'height'] as const) {
    const size = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, name);
    if (!size?.set || !size.configurable) continue;
    Object.defineProperty(HTMLCanvasElement.prototype, name, { ...size, set(this: HTMLCanvasElement, value: number) {
      size.set!.call(this, value);
      const current = canvases.get(this);
      if (current) { current.alpha = 1; current.stack.length = 0; current.hasPoint = false; }
    } });
  }
}
