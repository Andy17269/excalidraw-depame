import { memo, useEffect, useReducer, useRef, useState } from 'react';
import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { Icon } from './Icon';
import { setTextSize } from '../services/textSize';
import { getImageRadius } from '../services/elementStyle';
import { setImageRadius, setTextColor } from '../services/selectionStyle';

function SizeInput({ label, value, onCommit, min = 1, max = Infinity, disabled = false }: { label: string; value: number; onCommit: (value: number) => void; min?: number; max?: number; disabled?: boolean }) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  const cancelled = useRef(false);
  useEffect(() => setDraft(String(Math.round(value))), [value]);
  return <input aria-label={label} disabled={disabled} inputMode="decimal" value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => { const next = Number(draft); if (!cancelled.current && draft.trim() && next >= min && Number.isFinite(next)) { const normalized = Math.min(max, next); setDraft(String(Math.round(normalized))); onCommit(normalized); } else setDraft(String(Math.round(value))); cancelled.current = false; }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur(); } }} />;
}

function TextColorInput({ value, onCommit }: { value: string; onCommit: (color: string) => void }) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  return <input aria-label="自定义文字颜色" className="text-color-input" value={draft} maxLength={7} spellCheck={false}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => { const color = draft.trim(); if (!cancelled.current && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) onCommit(color); else setDraft(value); cancelled.current = false; }}
    onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur(); } }} />;
}

const COLORS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00'];
const FILLS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99'];

function Opacity({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; value: number } | null>(null);
  const frame = useRef(0);
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const update = (x: number, commit = false) => {
    const rect = track.current!.getBoundingClientRect();
    const next = Math.round(Math.max(0, Math.min(100, (x - rect.left - 7) / Math.max(rect.width - 14, 1) * 100)));
    if (drag.current) drag.current.value = next;
    cancelAnimationFrame(frame.current);
    if (commit) latest.current(next);
    else frame.current = requestAnimationFrame(() => latest.current(next));
  };
  return <div className="opacity-row">
    <span>透明</span>
    <div ref={track} role="slider" tabIndex={0} aria-label="透明度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="opacity-slider"
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { pointer: event.pointerId, value }; update(event.clientX); }}
      onPointerMove={event => { if (drag.current?.pointer === event.pointerId) update(event.clientX); }}
      onPointerUp={event => { if (drag.current?.pointer !== event.pointerId) return; update(event.clientX, true); drag.current = null; }}
      onLostPointerCapture={() => { if (drag.current) { cancelAnimationFrame(frame.current); latest.current(drag.current.value); drag.current = null; } }}
      onPointerCancel={() => { cancelAnimationFrame(frame.current); if (drag.current) latest.current(drag.current.value); drag.current = null; }}
      onKeyDown={event => {
        const delta = event.shiftKey ? 10 : 1;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 100 : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? value - delta : ['ArrowRight', 'ArrowUp'].includes(event.key) ? value + delta : null;
        if (next !== null) { event.preventDefault(); event.stopPropagation(); onChange(Math.max(0, Math.min(100, next))); }
      }}>
      <span className="opacity-track" /><span className="opacity-fill" style={{ width: `${value}%` }} /><span className="opacity-thumb" style={{ left: `${value * .88}%` }} />
    </div>
    <output>{value}</output>
  </div>;
}

export const Properties = memo(function Properties({
  api,
  subscribe,
}: {
  api: ExcalidrawImperativeAPI;
  subscribe: (listener: () => void) => () => void;
}) {
  const [, forceUpdate] = useReducer(count => count + 1, 0);
  const [rounding, setRounding] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => subscribe(forceUpdate), [subscribe]);
  const state = api.getAppState();
  const elements = api.getSceneElements();
  const selected = elements.filter(element => state.selectedElementIds[element.id]);
  const visible = selected.length > 0 || ['rectangle', 'diamond', 'arrow', 'freedraw', 'text'].includes(state.activeTool.type);
  const opacity = selected[0]?.opacity ?? state.currentItemOpacity;
  const stroke = selected[0]?.strokeColor ?? state.currentItemStrokeColor;
  const fill = selected[0]?.backgroundColor ?? state.currentItemBackgroundColor;
  const text = elements.find(element => element.type === 'text' && (state.selectedElementIds[element.id] || (element.containerId && state.selectedElementIds[element.containerId])));
  const fontSize = text?.type === 'text' ? text.fontSize : state.currentItemFontSize;
  const images = selected.filter(element => element.type === 'image' && !element.locked);
  const onlyImages = selected.length > 0 && selected.every(element => element.type === 'image');
  const onlyText = selected.length > 0 ? selected.every(element => element.type === 'text') : state.activeTool.type === 'text';
  const imageRadius = images[0] ? getImageRadius(images[0]) : 0;
  const textColor = text?.strokeColor ?? state.currentItemStrokeColor;
  const roundImages = async (radius: number) => {
    setError(''); setRounding(true);
    try { await setImageRadius(api, radius); }
    catch (error) { setError(error instanceof Error ? error.message : '图片圆角设置失败'); }
    finally { setRounding(false); }
  };
  const resizeTarget = selected.length === 1 && ['rectangle', 'diamond', 'ellipse', 'image'].includes(selected[0].type) && !selected[0].boundElements?.length && !selected[0].locked ? selected[0] : null;
  const resize = (key: 'width' | 'height', value: number) => {
    if (!resizeTarget || value > 100000) return;
    api.updateScene({ elements: api.getSceneElementsIncludingDeleted().map(element => element.id === resizeTarget.id ? newElementWith(element, { [key]: value }) : element), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };
  const change = (key: 'opacity' | 'strokeColor' | 'backgroundColor' | 'strokeWidth', value: number | string) => {
    const current = api.getAppState();
    const selectedIds = new Set(Object.keys(current.selectedElementIds).filter(id => current.selectedElementIds[id]));
    if (key === 'opacity') for (const element of api.getSceneElements()) {
      if (selectedIds.has(element.id)) for (const bound of element.boundElements ?? []) if (bound.type === 'text') selectedIds.add(bound.id);
    }
    api.updateScene({
      elements: api.getSceneElementsIncludingDeleted().map(element => selectedIds.has(element.id) ? newElementWith(element, { [key]: value }) : element),
      appState: {
        currentItemOpacity: key === 'opacity' ? value as number : current.currentItemOpacity,
        currentItemStrokeColor: key === 'strokeColor' ? value as string : current.currentItemStrokeColor,
        currentItemBackgroundColor: key === 'backgroundColor' ? value as string : current.currentItemBackgroundColor,
        currentItemStrokeWidth: key === 'strokeWidth' ? value as number : current.currentItemStrokeWidth,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };
  return <aside
    className={`properties glass ${visible ? 'is-open' : ''}`}
    aria-label="属性"
    aria-hidden={!visible}
    inert={!visible}
    onWheel={event => event.stopPropagation()}
    onPointerDown={event => event.stopPropagation()}
  >
    {(text || state.activeTool.type === 'text') && <div className="size-row"><span>字号</span><SizeInput label="字号" value={fontSize} onCommit={value => void setTextSize(api, Math.min(500, value)).catch(() => {})} />{[16, 24, 36].map((size, index) => <button key={size} title="字号" aria-label={`字号 ${size}`} aria-pressed={fontSize === size} onClick={() => void setTextSize(api, size).catch(() => {})}>{['小', '中', '大'][index]}</button>)}</div>}
    {resizeTarget && <div className="size-row"><span>宽</span><SizeInput label="宽" value={resizeTarget.width} onCommit={value => resize('width', value)} /><span>高</span><SizeInput label="高" value={resizeTarget.height} onCommit={value => resize('height', value)} /></div>}
    {images.length > 0 && <div className="size-row image-radius-row" aria-busy={rounding}><span>圆角</span><SizeInput label="图片圆角" min={0} max={Math.min(images[0].width, images[0].height) / 4} disabled={rounding} value={imageRadius} onCommit={value => void roundImages(value)} />{[0, 12, 24].map(radius => <button key={radius} disabled={rounding} aria-label={`图片圆角 ${radius}`} aria-pressed={imageRadius === radius} onClick={() => void roundImages(radius)}>{radius === 0 ? '直角' : radius}</button>)}</div>}
    {(text || state.activeTool.type === 'text') && <>
      <div className="color-row"><span>文字</span>{[...COLORS.slice(0, 4), '#ffffff'].map(color => <button key={color} className={`swatch ${textColor === color ? 'selected' : ''}`} title="文字颜色" aria-label={`文字颜色 ${color}`} aria-pressed={textColor === color} onClick={() => setTextColor(api, color)}><span className="swatch-color" style={{ background: color }} aria-hidden="true" /></button>)}</div>
      <div className="size-row"><span>色值</span><TextColorInput value={textColor} onCommit={color => setTextColor(api, color)} /></div>
    </>}
    {!onlyImages && !onlyText && <>
      <div className="color-row"><span>描边</span>{COLORS.map(color => <button key={color} className={`swatch ${stroke === color ? 'selected' : ''}`} title="描边" aria-label={`描边 ${color}`} aria-pressed={stroke === color} onClick={() => change('strokeColor', color)}><span className="swatch-color" style={{ background: color }} aria-hidden="true" /></button>)}</div>
      <div className="color-row"><span>填充</span>{FILLS.map(color => <button key={color} className={`swatch ${fill === color ? 'selected' : ''}`} title={color === 'transparent' ? '无色' : '填充'} aria-label={`填充 ${color}`} aria-pressed={fill === color} onClick={() => change('backgroundColor', color)}><span className="swatch-color" style={{ background: color }} aria-hidden="true" />{color === 'transparent' ? <Icon name="empty" /> : null}</button>)}</div>
      <div className="width-row"><span>线宽</span>{[1, 2, 4].map(width => <button key={width} title="线宽" aria-label={`线宽 ${width}`} aria-pressed={(selected[0]?.strokeWidth ?? state.currentItemStrokeWidth) === width} onClick={() => change('strokeWidth', width)}><span style={{ height: width }} /></button>)}</div>
    </>}
    <Opacity value={opacity} onChange={value => change('opacity', value)} />
    {error && <span className="property-error" role="status">{error}</span>}
  </aside>;
});
