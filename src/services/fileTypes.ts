const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg|bmp|avif|heic|heif)$/i;
const EXCALIDRAW_EXT_RE = /\.(excalidraw|json)$/i;

export const isHeicFile = (file: Pick<File, 'name' | 'type'>): boolean =>
  /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]/i.test(file.type);

export const isImageFile = (file: Pick<File, 'name' | 'type'>): boolean =>
  isHeicFile(file)
  || /^image\/(png|jpe?g|webp|gif|svg\+xml|bmp|avif)$/i.test(file.type)
  || IMAGE_EXT_RE.test(file.name);

export const isExcalidrawFile = (file: Pick<File, 'name' | 'type'>): boolean =>
  EXCALIDRAW_EXT_RE.test(file.name)
  || file.type === 'application/vnd.excalidraw+json';
