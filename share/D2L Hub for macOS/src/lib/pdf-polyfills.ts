/**
 * pdf.js 5 uses Uint8Array.prototype.toHex/toBase64, which Chromium only grew
 * in 133. The desktop shell is newer, but the dev preview and older Electron
 * builds need them before the library is imported.
 */
function install(): void {
  const proto = Uint8Array.prototype as Uint8Array & {
    toHex?: () => string;
    toBase64?: () => string;
  };

  if (typeof proto.toHex !== 'function') {
    Object.defineProperty(proto, 'toHex', {
      configurable: true,
      writable: true,
      value(this: Uint8Array) {
        let hex = '';
        for (const byte of this) hex += byte.toString(16).padStart(2, '0');
        return hex;
      },
    });
  }

  if (typeof proto.toBase64 !== 'function') {
    Object.defineProperty(proto, 'toBase64', {
      configurable: true,
      writable: true,
      value(this: Uint8Array) {
        let binary = '';
        const chunk = 0x8000;
        for (let index = 0; index < this.length; index += chunk) {
          binary += String.fromCharCode(...this.subarray(index, index + chunk));
        }
        return btoa(binary);
      },
    });
  }
}

// Importing this module is enough: the worker entry needs it before pdf.js loads.
install();
