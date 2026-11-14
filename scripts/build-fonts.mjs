import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const directory = resolve('node_modules/@excalidraw/excalidraw/dist/dev');
let source;
for (const name of await readdir(directory)) {
  if (!name.endsWith('.js')) continue;
  const text = await readFile(resolve(directory, name), 'utf8');
  if (text.includes('var ExcalifontFontFaces =')) { source = text; break; }
}
if (!source) throw new Error('Excalidraw font metadata not found');
const urls = Object.fromEntries([...source.matchAll(/var (\w+_default) = "(\.\/fonts\/[^"\n]+\.woff2)";/g)].map(match => [match[1], match[2]]));
let css = '';
for (const family of ['Excalifont', 'Xiaolai', 'Virgil']) {
  const match = source.match(new RegExp(`var ${family}FontFaces = (\\[[\\s\\S]*?\\n\\]);`));
  if (!match) throw new Error(`${family} font metadata not found`);
  const faces = runInNewContext(`(${match[1]})`, urls, { timeout: 1000 });
  for (const face of faces) css += `@font-face{font-family:${family};src:url("${face.uri}") format("woff2");font-style:normal;font-weight:400;font-display:swap;${face.descriptors?.unicodeRange ? `unicode-range:${face.descriptors.unicodeRange};` : ''}}\n`;
}
await writeFile('public/excalidraw-assets/fonts.css', css);
