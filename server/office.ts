/**
 * Word and PowerPoint files are ZIPs of XML. Reading their text keeps lecture
 * slides usable for outline scans and AI study plans without a new dependency.
 */

import zlib from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_ENTRY = 12 * 1024 * 1024;

function findEndOfCentralDirectory(buffer: Buffer): number {
  const start = Math.max(0, buffer.length - 66_000);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD) return offset;
  }
  return -1;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

function readEntries(buffer: Buffer): ZipEntry[] | null {
  const end = findEndOfCentralDirectory(buffer);
  if (end < 0) return null;

  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL) break;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8')
      .replace(/\\/g, '/');

    entries.push({
      name,
      method: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      localOffset: buffer.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function inflateEntry(buffer: Buffer, entry: ZipEntry): Buffer | null {
  const header = entry.localOffset;
  if (header + 30 > buffer.length || buffer.readUInt32LE(header) !== LOCAL) return null;
  const nameLength = buffer.readUInt16LE(header + 26);
  const extraLength = buffer.readUInt16LE(header + 28);
  const start = header + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + entry.compressedSize);
  if (data.length === 0) return null;

  try {
    if (entry.method === 0) return data.subarray(0, MAX_ENTRY);
    if (entry.method === 8) {
      return zlib.inflateRawSync(data, { maxOutputLength: MAX_ENTRY }) as Buffer;
    }
  } catch {
    return null;
  }
  return null;
}

/** Paragraph text from WordprocessingML or DrawingML. */
function xmlText(xml: string): string {
  const paragraphs = xml.split(/<\/w:p>|<\/a:p>/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const runs = [...paragraph.matchAll(/<(?:w|a):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:w|a):t>/g)];
    const line = runs.map((run) => decodeEntities(run[1])).join(' ').replace(/\s+/g, ' ').trim();
    if (line) lines.push(line);
  }
  return lines.join('\n');
}

/** Text of a .docx/.pptx file, or null when it is not a readable Office file. */
export function officeText(buffer: Buffer): string | null {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== LOCAL) return null;
  const entries = readEntries(buffer);
  if (!entries || entries.length === 0) return null;

  const parts = entries
    .filter((entry) => {
      const name = entry.name.toLowerCase();
      return name === 'word/document.xml' || /^ppt\/slides\/slide\d+\.xml$/.test(name);
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const chunks: string[] = [];
  let total = 0;
  for (const entry of parts.slice(0, 80)) {
    const data = inflateEntry(buffer, entry);
    if (!data) continue;
    const text = xmlText(data.toString('utf8'));
    if (!text) continue;
    chunks.push(text);
    total += text.length;
    if (total > MAX_ENTRY) break;
  }

  const text = chunks.join('\n\n').trim();
  return text.length > 0 ? text : null;
}
