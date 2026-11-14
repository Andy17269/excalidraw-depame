import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installCanvasCompat } from '../src/services/canvasCompat.ts';

test('transparent drawing never sends alpha zero to native renderer and restores nested state', () => {
  class Canvas {
    context?: Context;
    get width() { return 100; }
    set width(_value: number) { if (this.context) this.context.nativeAlpha = 1; }
    get height() { return 100; }
    set height(_value: number) { if (this.context) this.context.nativeAlpha = 1; }
  }
  class Context {
    canvas = new Canvas();
    nativeAlpha = 1;
    stack: number[] = [];
    draws = 0;
    constructor() { this.canvas.context = this; }
    get globalAlpha() { return this.nativeAlpha; }
    set globalAlpha(value: number) { this.nativeAlpha = value; }
    save() { this.stack.push(this.nativeAlpha); }
    restore() { this.nativeAlpha = this.stack.pop() ?? this.nativeAlpha; }
    fill() { this.draws++; }
    stroke() { this.draws++; }
    fillRect() { this.draws++; }
    strokeRect() { this.draws++; }
    fillText() { this.draws++; }
    strokeText() { this.draws++; }
    drawImage() { this.draws++; }
  }
  Object.assign(globalThis, { CanvasRenderingContext2D: Context, HTMLCanvasElement: Canvas });
  installCanvasCompat();
  const context = new Context();
  context.save(); context.globalAlpha = 0;
  assert.equal(context.globalAlpha, 0);
  assert.equal(context.nativeAlpha, 1);
  context.fill(); context.drawImage(); assert.equal(context.draws, 0);
  context.save(); context.globalAlpha = .5; context.fill(); context.restore();
  assert.equal(context.globalAlpha, 0);
  context.stroke(); assert.equal(context.draws, 1);
  context.restore(); context.fill(); assert.equal(context.draws, 2);
  context.globalAlpha = 0; context.canvas.width = 100;
  assert.equal(context.globalAlpha, 1);
});

test('opaque full-canvas fillRect clears first under scaled transform while partial/translucent fills do not', () => {
  class ScaledCanvas {
    width = 2880;
    height = 1736;
  }
  class ScaledContext {
    canvas = new ScaledCanvas();
    nativeAlpha = 1;
    fillStyle: unknown = '#ffffff';
    globalCompositeOperation = 'source-over';
    calls: string[] = [];
    get globalAlpha() { return this.nativeAlpha; }
    set globalAlpha(value: number) { this.nativeAlpha = value; }
    save() {}
    restore() {}
    getTransform() { return { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }; }
    clearRect(x: number, y: number, w: number, h: number) { this.calls.push(`clear:${x},${y},${w},${h}`); }
    fill() {}
    stroke() {}
    fillRect(x: number, y: number, w: number, h: number) { this.calls.push(`fill:${x},${y},${w},${h}`); }
    strokeRect() {}
    fillText() {}
    strokeText() {}
    drawImage() {}
  }
  Object.assign(globalThis, { CanvasRenderingContext2D: ScaledContext, HTMLCanvasElement: ScaledCanvas });
  installCanvasCompat();
  const ctx = new ScaledContext();
  ctx.fillRect(0, 0, 1440, 868);
  ctx.fillRect(10, 10, 100, 100);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, 1440, 868);
  assert.deepEqual(ctx.calls, [
    'clear:0,0,1440,868',
    'fill:0,0,1440,868',
    'fill:10,10,100,100',
    'fill:0,0,1440,868',
  ]);
});

test('flattens long nearly-flat cubic Beziers to lineTo while preserving curved Beziers', () => {
  class PathCanvas { width = 800; height = 600; }
  class PathContext {
    canvas = new PathCanvas();
    nativeAlpha = 1;
    calls: string[] = [];
    get globalAlpha() { return this.nativeAlpha; }
    set globalAlpha(v: number) { this.nativeAlpha = v; }
    save() {}
    restore() {}
    fill() {}
    stroke() {}
    fillRect() {}
    strokeRect() {}
    fillText() {}
    strokeText() {}
    drawImage() {}
    beginPath() { this.calls.push('beginPath'); }
    moveTo(x: number, y: number) { this.calls.push(`moveTo:${x},${y}`); }
    lineTo(x: number, y: number) { this.calls.push(`lineTo:${Math.round(x)},${Math.round(y)}`); }
    quadraticCurveTo() {}
    bezierCurveTo(_x1: number, _y1: number, _x2: number, _y2: number, x: number, y: number) {
      this.calls.push(`bezier:${x},${y}`);
    }
    closePath() {}
  }
  Object.assign(globalThis, { CanvasRenderingContext2D: PathContext, HTMLCanvasElement: PathCanvas });
  installCanvasCompat();
  const ctx = new PathContext();
  ctx.beginPath();
  ctx.moveTo(568, 450);
  ctx.bezierCurveTo(376.4, 450.62, 184.26, 450.45, 32, 450);
  assert.ok(ctx.calls.some(c => c.startsWith('lineTo:')), 'expected flat bezier to flatten to lineTo');
  assert.ok(!ctx.calls.some(c => c.startsWith('bezier:')), 'expected flat bezier not to call native bezierCurveTo');
  assert.equal(ctx.calls.at(-1), 'lineTo:32,450');

  ctx.calls.length = 0;
  ctx.beginPath();
  ctx.moveTo(600, 418);
  ctx.bezierCurveTo(600, 439.33, 589.33, 450, 568, 450);
  assert.deepEqual(ctx.calls, ['beginPath', 'moveTo:600,418', 'bezier:568,450']);
});
