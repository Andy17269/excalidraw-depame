const { parentPort, workerData } = require('node:worker_threads');
const convert = require('heic-convert');
convert({ buffer: new Uint8Array(workerData), format: 'PNG' }).then(
  result => parentPort.postMessage({ png: new Uint8Array(result) }),
  () => parentPort.postMessage({ error: '转换失败' }),
);
