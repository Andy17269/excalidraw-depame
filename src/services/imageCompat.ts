export function installImageCompat(): void {
  const proto = HTMLImageElement.prototype;
  const source = Object.getOwnPropertyDescriptor(proto, 'src');
  if (!source?.set || !source.configurable) return;
  let staging: HTMLDivElement | undefined;
  const pending = new WeakSet<HTMLImageElement>();
  Object.defineProperty(proto, 'src', { ...source, set(this: HTMLImageElement, value: string) {
    // acdert loads data images only while connected; Excalidraw caches detached images.
    if (!this.isConnected && /^(data:|blob:)/i.test(value) && !pending.has(this)) {
      if (!staging) {
        staging = document.createElement('div');
        staging.setAttribute('aria-hidden', 'true');
        Object.assign(staging.style, { position: 'fixed', left: '-10000px', top: '0', width: '1px', height: '1px', overflow: 'hidden', pointerEvents: 'none' });
        document.body.appendChild(staging);
      }
      pending.add(this);
      const finish = () => {
        pending.delete(this);
        this.removeEventListener('load', finish);
        this.removeEventListener('error', finish);
        if (this.parentNode === staging) this.remove();
      };
      this.addEventListener('load', finish);
      this.addEventListener('error', finish);
      staging.appendChild(this);
    }
    source.set!.call(this, value);
  } });
}
