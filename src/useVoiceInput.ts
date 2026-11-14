import { useEffect, useRef, useState } from 'react';
import { load } from '@dopame/acde-api';
import { encodeWav } from './services/audio';
import { getCanvasRevision } from './services/canvasBridge';

export function useVoiceInput(onText: (text: string) => void, onError: () => void, disabled: boolean) {
  const [phase, setPhase] = useState<'idle' | 'listening' | 'transcribing'>('idle');
  const [supported, setSupported] = useState(!!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined');
  const callbacks = useRef({ onText, onError, disabled });
  callbacks.current = { onText, onError, disabled };
  const state = useRef({ held: false, id: 0, revision: 0, context: null as AudioContext | null, stream: null as MediaStream | null, processor: null as ScriptProcessorNode | null, chunks: [] as Float32Array[], timer: 0, abort: null as AbortController | null, disposed: false });

  function releaseAudio() {
    const current = state.current;
    clearTimeout(current.timer);
    if (current.processor) { current.processor.onaudioprocess = null; current.processor.disconnect(); current.processor = null; }
    current.stream?.getTracks().forEach(track => track.stop()); current.stream = null;
    if (current.context) { void current.context.close().catch(() => {}); current.context = null; }
  }
  function cancel() {
    const current = state.current;
    current.held = false; current.id++; current.abort?.abort(); current.abort = null;
    releaseAudio(); current.chunks = [];
    if (!current.disposed) setPhase('idle');
  }
  async function begin() {
    const current = state.current;
    if (!supported || current.held || current.abort || callbacks.current.disabled) return;
    current.held = true;
    const id = ++current.id;
    const revision = getCanvasRevision(); current.revision = revision;
    setPhase('listening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (current.disposed || !current.held || current.id !== id || revision !== getCanvasRevision()) { stream.getTracks().forEach(track => track.stop()); if (current.id === id) cancel(); return; }
      current.stream = stream;
      const context = new AudioContext(); current.context = context;
      await context.resume();
      if (!current.held || current.id !== id) return;
      if (revision !== getCanvasRevision()) { cancel(); return; }
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1); current.processor = processor;
      const silent = context.createGain(); silent.gain.value = 0;
      current.chunks = [];
      processor.onaudioprocess = event => { if (current.held) current.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0))); };
      source.connect(processor); processor.connect(silent); silent.connect(context.destination);
      current.timer = window.setTimeout(() => { void end(); }, 120000);
    } catch { if (current.id === id) { cancel(); if (revision === getCanvasRevision()) callbacks.current.onError(); } }
  }
  async function end() {
    const current = state.current;
    if (!current.held) return;
    current.held = false;
    const id = ++current.id;
    const chunks = current.chunks;
    const revision = current.revision;
    const rate = current.context?.sampleRate ?? 48000;
    releaseAudio(); current.chunks = [];
    if (revision !== getCanvasRevision() || chunks.reduce((sum, chunk) => sum + chunk.length, 0) < rate * .2) { setPhase('idle'); return; }
    const controller = new AbortController(); current.abort = controller;
    setPhase('transcribing');
    try {
      const response = await fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: encodeWav(chunks, rate), signal: controller.signal });
      const result = await response.json();
      if (!response.ok || typeof result.text !== 'string') throw new Error('识别失败');
      if (current.id === id && !current.disposed) { setPhase('idle'); if (revision === getCanvasRevision()) callbacks.current.onText(result.text); }
    } catch { if (!controller.signal.aborted && current.id === id) { setPhase('idle'); if (revision === getCanvasRevision()) callbacks.current.onError(); } }
    finally { if (current.id === id) current.abort = null; }
  }
  const actions = useRef({ begin, end, cancel }); actions.current = { begin, end, cancel };
  useEffect(() => {
    let disposed = false;
    state.current.disposed = false;
    void load('capabilities').then(capabilities => { if (!disposed && capabilities?.get('microphone').state === 'unsupported') setSupported(false); }).catch(() => {});
    const down = (event: KeyboardEvent) => { if (!event.repeat && event.key === 'Fn' && event.location !== 2) { event.preventDefault(); void actions.current.begin(); } };
    const up = (event: KeyboardEvent) => { if (event.key === 'Fn') { event.preventDefault(); void actions.current.end(); } };
    const blur = () => actions.current.cancel();
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true); window.addEventListener('blur', blur);
    return () => { disposed = true; state.current.disposed = true; actions.current.cancel(); window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur); };
  }, []);
  return { phase, supported, begin, end, cancel };
}
