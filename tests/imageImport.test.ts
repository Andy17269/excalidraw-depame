import assert from 'node:assert/strict';
import test from 'node:test';
import { isExcalidrawFile, isImageFile } from '../src/services/fileTypes.ts';

function fakeFile(name: string, type = ''): File {
  return { name, type, size: 128 } as unknown as File;
}

test('isImageFile matches both MIME types and file extensions when OS drag drops omit MIME type', () => {
  assert.equal(isImageFile(fakeFile('photo.png', 'image/png')), true);
  assert.equal(isImageFile(fakeFile('photo.jpg', '')), true);
  assert.equal(isImageFile(fakeFile('photo.JPEG', '')), true);
  assert.equal(isImageFile(fakeFile('vector.svg', '')), true);
  assert.equal(isImageFile(fakeFile('mobile.heic', '')), true);
  assert.equal(isImageFile(fakeFile('notes.txt', 'text/plain')), false);
  assert.equal(isImageFile(fakeFile('board.excalidraw', '')), false);
});

test('isExcalidrawFile matches .excalidraw, .json, and excalidraw MIME types', () => {
  assert.equal(isExcalidrawFile(fakeFile('board.excalidraw', '')), true);
  assert.equal(isExcalidrawFile(fakeFile('board.EXCALIDRAW', '')), true);
  assert.equal(isExcalidrawFile(fakeFile('scene.json', 'application/json')), true);
  assert.equal(isExcalidrawFile(fakeFile('untitled', 'application/vnd.excalidraw+json')), true);
  assert.equal(isExcalidrawFile(fakeFile('photo.png', 'image/png')), false);
});
