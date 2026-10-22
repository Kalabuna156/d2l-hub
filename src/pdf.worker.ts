// The polyfill must evaluate before pdf.js' worker does, hence the import order.
import './lib/pdf-polyfills';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
