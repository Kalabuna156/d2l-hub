export interface LibrarySectionFile {
  title: string;
  /** Module or Drive folder path the file was saved from. */
  folder?: string | null;
  /** A folder the user picked: it wins over a unit mentioned in the name. */
  folderPinned?: boolean;
}

export interface LibrarySection<T extends LibrarySectionFile> {
  key: string;
  label: string;
  /** Units/week numbers sort naturally; folders and the catch-all come after. */
  order: number;
  files: T[];
}

interface Match {
  key: string;
  label: string;
  order: number;
}

const OTHER_LABEL = 'Other files';

function cleanName(value: string): string {
  return value
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * D2L numbers topics with their position, e.g. "(6) section 2.2-Limits". The
 * counter says nothing about the subject, so drop it before looking for units.
 */
function stripCounters(text: string): string {
  let current = text;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = current.replace(/^[(\[{]\s*\d{1,3}\s*[)\]}]\s*/, '');
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * Finds the section a file belongs to from its own name, then its module or
 * folder name. "Unit 3.3 - 3.6" and "3.3 - 3.6" both land in "Unit 3", so a
 * module split into many small handouts still reads as one unit.
 */
function matchSection(name: string): Match | null {
  const text = stripCounters(cleanName(name));
  if (!text) return null;

  const named: [RegExp, string][] = [
    [/\bunit\s*[-_ ]?(\d+)(?:\.\d+)?/i, 'Unit'],
    [/\bweek\s*[-_ ]?(\d+)(?:\.\d+)?/i, 'Week'],
    [/\bmodule\s*[-_ ]?(\d+)(?:\.\d+)?/i, 'Module'],
    [/\bchapter\s*[-_ ]?(\d+)(?:\.\d+)?/i, 'Chapter'],
  ];

  for (const [pattern, prefix] of named) {
    const hit = pattern.exec(text);
    if (hit) {
      const number = Number(hit[1]);
      if (Number.isFinite(number)) {
        return {
          key: `${prefix.toLowerCase()}:${number}`,
          label: `${prefix} ${number}`,
          order: number,
        };
      }
    }
  }

  // A chapter's handout usually says "section 2.3", which belongs to chapter 2.
  const section = /^sections?\s*(\d{1,2})(?:\.\d{1,2})?\b/i.exec(text);
  if (section) {
    const number = Number(section[1]);
    if (number > 0 && number <= 99) {
      return { key: `chapter:${number}`, label: `Chapter ${number}`, order: number };
    }
  }

  // Bare numbered handouts: "3.2 Volumes", "3.3 - 3.6 Practice", "4 Review".
  const numbered = /^(?:[A-Z]{2,6}\s?\d{2,4}[A-Z]?\s*[-–:]?\s*)?(\d{1,2})(?:\.\d{1,2})?\b/.exec(
    text,
  );
  if (numbered) {
    const number = Number(numbered[1]);
    if (Number.isFinite(number) && number > 0 && number <= 99) {
      return { key: `unit:${number}`, label: `Unit ${number}`, order: number };
    }
  }

  return null;
}

/**
 * Split a course's downloaded handouts into sections. Files named after the
 * same unit are grouped even when the individual titles differ.
 */
export function groupLibraryFiles<T extends LibrarySectionFile>(files: T[]): LibrarySection<T>[] {
  const sections = new Map<string, LibrarySection<T>>();

  for (const file of files) {
    // Dropping or typing a unit is an explicit choice; only an automatic folder
    // (a D2L module) lets the file's own name decide its section.
    const own = file.folderPinned ? null : matchSection(file.title);
    const folder = file.folder ? cleanName(file.folder) : '';
    const fromFolder = own ?? (folder ? matchSection(folder) : null);

    let section: LibrarySection<T>;
    if (fromFolder) {
      section = sections.get(fromFolder.key) ?? {
        key: fromFolder.key,
        label: fromFolder.label,
        order: fromFolder.order,
        files: [],
      };
    } else if (folder) {
      section = sections.get(`folder:${folder}`) ?? {
        key: `folder:${folder}`,
        label: folder,
        order: Number.MAX_SAFE_INTEGER - 1,
        files: [],
      };
    } else {
      section = sections.get('other') ?? {
        key: 'other',
        label: OTHER_LABEL,
        order: Number.MAX_SAFE_INTEGER,
        files: [],
      };
    }

    section.files.push(file);
    sections.set(section.key, section);
  }

  return [...sections.values()]
    .map((section) => ({
      ...section,
      files: section.files.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }),
      ),
    }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}
