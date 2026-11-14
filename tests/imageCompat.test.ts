import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installImageCompat } from '../src/services/imageCompat.ts';

test('native detached image loading connects temporarily and respects later ownership', () => {
  class Element extends EventTarget {
    style = {};
    parentNode: Element | null = null;
    get isConnected(): boolean { return this === body || !!this.parentNode?.isConnected; }
    appendChild(child: Element) { child.parentNode = this; }
    setAttribute() {}
    remove() { this.parentNode = null; }
  }
  class Image extends Element {
    url = '';
    connectedAtLoad = false;
    get src() { return this.url; }
    set src(value: string) { this.connectedAtLoad = this.isConnected; this.url = value; }
  }
  const body = new Element();
  Object.assign(globalThis, { HTMLImageElement: Image, document: { body, createElement: () => new Element() } });
  installImageCompat();
  const image = new Image();
  image.src = 'data:image/png;base64,AA==';
  assert.equal(image.connectedAtLoad, true);
  image.dispatchEvent(new Event('load'));
  assert.equal(image.parentNode, null);
  image.src = 'blob:test';
  assert.equal(image.connectedAtLoad, true);
  body.appendChild(image);
  image.dispatchEvent(new Event('error'));
  assert.equal(image.parentNode, body);
  const remote = new Image();
  remote.src = 'https://example.com/image.png';
  assert.equal(remote.parentNode, null);
});
