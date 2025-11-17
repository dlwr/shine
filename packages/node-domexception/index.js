/*! Local DOMException shim used to avoid deprecated registry package */

if (!globalThis.DOMException) {
  try {
    const {MessageChannel} = require('worker_threads');
    const port = new MessageChannel().port1;
    const ab = new ArrayBuffer();
    port.postMessage(ab, [ab, ab]);
  } catch (error) {
    if (error && error.constructor && error.constructor.name === 'DOMException') {
      globalThis.DOMException = error.constructor;
    }
  }
}

module.exports = globalThis.DOMException;
