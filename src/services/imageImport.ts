import { CaptureUpdateAction, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { getCanvasRevision } from './canvasBridge';

import { isExcalidrawFile, isHeicFile as isHeic, isImageFile } from './fileTypes';

export { isExcalidrawFile, isImageFile };

export async function importImage(file: File, api: ExcalidrawImperativeAPI, point?: { x: number; y: number }): Promise<void> {
  const revision = getCanvasRevision();
  if (!isImageFile(file) || file.size > 32 * 1024 * 1024) throw new Error('图片无效');
  let blob: Blob = file;
  if (isHeic(file)) {
    const response = await fetch('/api/images/convert', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('转换失败');
    blob = await response.blob();
  }
  const dataURL = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
  });
  const image = new Image();
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject; image.src = dataURL;
  });
  const state = api.getAppState();
  if (revision !== getCanvasRevision()) throw new Error('画布已切换');
  const zoom = state.zoom.value;
  const scale = Math.min(1, state.width * .7 / (size.width * zoom), state.height * .7 / (size.height * zoom));
  const width = size.width * scale;
  const height = size.height * scale;
  const center = point ?? { x: state.offsetLeft + state.width / 2, y: state.offsetTop + state.height / 2 };
  const fileId = crypto.randomUUID() as BinaryFileData['id'];
  api.addFiles([{ id: fileId, dataURL: dataURL as BinaryFileData['dataURL'], mimeType: (blob.type || 'image/png') as BinaryFileData['mimeType'], created: Date.now(), lastRetrieved: Date.now() }]);
  const elements = convertToExcalidrawElements([{ type: 'image', fileId, x: (center.x - state.offsetLeft) / zoom - state.scrollX - width / 2, y: (center.y - state.offsetTop) / zoom - state.scrollY - height / 2, width, height }]);
  api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...elements], appState: { selectedElementIds: Object.fromEntries(elements.map(element => [element.id, true])) }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  api.setActiveTool({ type: 'selection' });
}

export interface ImportFilesOptions {
  point?: { x: number; y: number };
  onOpenExcalidraw?: (file: File) => void | Promise<void>;
  onError?: () => void;
}

const hasFileDragPayload = (dataTransfer: DataTransfer | null | undefined): boolean => {
  if (!dataTransfer) return false;
  if (dataTransfer.files?.length) return true;
  return Array.from(dataTransfer.types ?? []).includes('Files');
};

export async function importFiles(
  files: Iterable<File>,
  api: ExcalidrawImperativeAPI,
  options?: ImportFilesOptions,
): Promise<boolean> {
  const list = Array.from(files);
  if (!list.length) return false;

  const excalidrawFile = list.find(isExcalidrawFile);
  if (excalidrawFile && options?.onOpenExcalidraw) {
    await options.onOpenExcalidraw(excalidrawFile);
    return true;
  }

  const imageFiles = list.filter(isImageFile);
  if (imageFiles.length) {
    for (const file of imageFiles) {
      await importImage(file, api, options?.point);
    }
    return true;
  }

  options?.onError?.();
  return false;
}

interface PickerFileSystemHandle {
  getFile: () => Promise<File>;
}

type WindowWithOpenPicker = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<PickerFileSystemHandle[]>;
};

export async function pickAndImportFiles(
  api: ExcalidrawImperativeAPI,
  options?: Omit<ImportFilesOptions, 'point'>,
): Promise<boolean> {
  const picker = (window as WindowWithOpenPicker).showOpenFilePicker;
  if (typeof picker === 'function') {
    try {
      const handles = await picker({
        multiple: true,
        types: [
          {
            description: '图片与白板文件',
            accept: {
              'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.avif', '.heic', '.heif'],
              'application/vnd.excalidraw+json': ['.excalidraw', '.json'],
            },
          },
        ],
      });
      const files = await Promise.all(handles.map((handle) => handle.getFile()));
      return await importFiles(files, api, options);
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return false;
    }
  }

  return await new Promise<boolean>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.avif,.heic,.heif,.excalidraw,.json';
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) {
        finish(false);
        return;
      }
      void importFiles(files, api, options).then(finish, () => {
        options?.onError?.();
        finish(false);
      });
    }, { once: true });
    input.addEventListener('cancel', () => finish(false), { once: true });
    input.click();
  });
}

export function attachImageImport(
  host: HTMLElement,
  api: ExcalidrawImperativeAPI,
  onError: () => void,
  onOpenExcalidraw?: (file: File) => void | Promise<void>,
): () => void {
  let active = true;
  let dragDepth = 0;

  const setDragOver = (dragging: boolean) => {
    host.classList.toggle('is-file-drag-over', dragging);
  };

  const process = async (files: File[], point?: { x: number; y: number }) => {
    try {
      for (const file of files) {
        if (!active) break;
        if (isExcalidrawFile(file) && onOpenExcalidraw) {
          await onOpenExcalidraw(file);
          break;
        }
        if (isImageFile(file)) {
          await importImage(file, api, point);
        }
      }
    } catch {
      onError();
    }
  };

  const dragEnter = (event: DragEvent) => {
    if (!hasFileDragPayload(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth += 1;
    setDragOver(true);
  };

  const dragOver = (event: DragEvent) => {
    if (!hasFileDragPayload(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const dragLeave = (event: DragEvent) => {
    if (!hasFileDragPayload(event.dataTransfer)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0 || !event.relatedTarget || !host.contains(event.relatedTarget as Node)) {
      dragDepth = 0;
      setDragOver(false);
    }
  };

  const drop = (event: DragEvent) => {
    dragDepth = 0;
    setDragOver(false);
    const files = [...(event.dataTransfer?.files ?? [])].filter(
      (file) => isImageFile(file) || (Boolean(onOpenExcalidraw) && isExcalidrawFile(file)),
    );
    if (!files.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void process(files, { x: event.clientX, y: event.clientY });
  };

  const paste = (event: ClipboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const files = [...(event.clipboardData?.files ?? [])].filter(isImageFile);
    if (!files.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void process(files);
  };

  host.addEventListener('dragenter', dragEnter, true);
  host.addEventListener('dragover', dragOver, true);
  host.addEventListener('dragleave', dragLeave, true);
  host.addEventListener('drop', drop, true);
  host.addEventListener('paste', paste, true);
  return () => {
    active = false;
    dragDepth = 0;
    setDragOver(false);
    host.removeEventListener('dragenter', dragEnter, true);
    host.removeEventListener('dragover', dragOver, true);
    host.removeEventListener('dragleave', dragLeave, true);
    host.removeEventListener('drop', drop, true);
    host.removeEventListener('paste', paste, true);
  };
}
