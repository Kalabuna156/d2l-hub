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

  // pdf.js 5.7 caches page resources with Map.prototype.getOrInsertComputed.
  // That landed in newer Chromium than the dev preview and some Electron builds.
  type UpsertingMap = {
    getOrInsertComputed?: <T>(key: unknown, create: (key: unknown) => T) => T;
  };
  const mapProto = Map.prototype as unknown as UpsertingMap;
  if (typeof mapProto.getOrInsertComputed !== 'function') {
    Object.defineProperty(mapProto, 'getOrInsertComputed', {
      configurable: true,
      writable: true,
      value<T>(this: Map<unknown, T>, key: unknown, create: (key: unknown) => T): T {
        if (this.has(key)) return this.get(key) as T;
        const value = create(key);
        this.set(key, value);
        return value;
      },
    });
  }

  // pdf.js also uses Math.sumPrecise in its text layout on newer builds.
  const math = Math as Math & { sumPrecise?: (values: Iterable<number>) => number };
  if (typeof math.sumPrecise !== 'function') {
    Object.defineProperty(math, 'sumPrecise', {
      configurable: true,
      writable: true,
      value(values: Iterable<number>): number {
        let sum = 0;
        let compensation = 0;
        for (const value of values) {
          const adjusted = value - compensation;
          const next = sum + adjusted;
          compensation = next - sum - adjusted;
          sum = next;
        }
        return sum;
      },
    });
  }

  const promise = Promise as PromiseConstructor & {
    try?: <T>(callback: (...args: never[]) => T | PromiseLike<T>, ...args: never[]) => Promise<T>;
  };
  if (typeof promise.try !== 'function') {
    Object.defineProperty(promise, 'try', {
      configurable: true,
      writable: true,
      value<T>(callback: (...args: never[]) => T | PromiseLike<T>, ...args: never[]): Promise<T> {
        return new Promise<T>((resolve) => resolve(callback(...args)));
      },
    });
  }
}

// Importing this module is enough: the worker entry needs it before pdf.js loads.
install();
