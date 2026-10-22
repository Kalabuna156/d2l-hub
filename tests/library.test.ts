import { describe, expect, it } from 'vitest';
import { directTopicDownloadUrl } from '../server/library';
import { groupLibraryFiles } from '../shared/library';

describe('directTopicDownloadUrl', () => {
  const viewer = 'https://courses.torontomu.ca/d2l/le/content/1199306/viewContent/7279200/View';

  it('turns a topic viewer link into the Download button route', () => {
    expect(directTopicDownloadUrl(viewer)).toBe(
      'https://courses.torontomu.ca/d2l/le/content/1199306/topics/files/download/7279200/DirectFileTopicDownload',
    );
  });

  it('accepts viewer links without the trailing View segment', () => {
    expect(directTopicDownloadUrl('https://example.d2l/d2l/le/content/42/viewContent/7')).toBe(
      'https://example.d2l/d2l/le/content/42/topics/files/download/7/DirectFileTopicDownload',
    );
  });

  it('leaves other links alone so they fall back to the viewer scrape', () => {
    expect(directTopicDownloadUrl('https://example.d2l/d2l/le/content/42/Home')).toBeNull();
    expect(directTopicDownloadUrl('https://example.d2l/d2l/home/42')).toBeNull();
    expect(directTopicDownloadUrl('not a url')).toBeNull();
  });
});

describe('groupLibraryFiles', () => {
  const NOTES = 'Dr. Majed Alqasas Class Notes';
  const files = [
    { title: '(9) section 3.1-Defining the Derivative', folder: NOTES },
    { title: '(6) section 2.2-Limits', folder: NOTES },
    { title: 'Chapter 1 Review', folder: NOTES },
    { title: '(10) section 3.2-The derivative as a function(2)Sep30', folder: NOTES },
    { title: '(7) section 2.3-Basic Limit Laws', folder: NOTES },
    { title: '3.2-3.3 (1)', folder: 'Unit 3' },
    { title: 'Course Outline 2026', folder: null },
  ];

  it('reads a D2L "(n) section x.y" name as chapter x', () => {
    const sections = groupLibraryFiles(files);

    expect(sections.map((section) => section.label)).toEqual([
      'Chapter 1',
      'Chapter 2',
      'Chapter 3',
      'Unit 3',
      'Other files',
    ]);
    expect(sections[1].files.map((file) => file.title)).toEqual([
      '(6) section 2.2-Limits',
      '(7) section 2.3-Basic Limit Laws',
    ]);
    expect(sections[2].files).toHaveLength(2);
  });

  it('sorts topic counters as numbers, so 9 comes before 10', () => {
    const chapterThree = groupLibraryFiles(files).find((section) => section.label === 'Chapter 3');
    expect(chapterThree?.files.map((file) => file.title)).toEqual([
      '(9) section 3.1-Defining the Derivative',
      '(10) section 3.2-The derivative as a function(2)Sep30',
    ]);
  });

  it('keeps a file in the unit it was dropped into, even when the name says otherwise', () => {
    const sections = groupLibraryFiles([
      { title: 'Unit 4 - stray note', folder: 'Unit 3', folderPinned: true },
      { title: 'Unit 4 - stray note', folder: 'Unit 3' },
    ]);

    expect(sections.map((section) => section.label)).toEqual(['Unit 3', 'Unit 4']);
    expect(sections[0].files).toHaveLength(1);
    expect(sections[1].files).toHaveLength(1);
  });

  it('still groups unit, week and module handouts', () => {
    const sections = groupLibraryFiles([
      { title: 'Week 2 - Reading', folder: null },
      { title: 'Module 4 quiz', folder: null },
    ]);
    expect(sections.map((section) => section.label)).toEqual(['Week 2', 'Module 4']);
  });
});
