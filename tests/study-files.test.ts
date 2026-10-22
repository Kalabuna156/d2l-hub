import { describe, expect, it } from 'vitest';
import type { LibraryFile } from '../shared/types';
import { studyFileList, type StudyTopic } from '../server/study';

const savedFile: LibraryFile = {
  id: 'saved-1',
  courseId: '123456',
  courseCode: 'MTH140_F26_01',
  courseName: 'MTH140 - Calculus I - F2026',
  title: 'Unit 3.2 - Derivatives',
  fileName: 'unit-3-2.pdf',
  mime: 'application/pdf',
  size: 2048,
  source: 'd2l',
  sourceUrl: 'https://courses.example.edu/d2l/le/content/123456/viewContent/1/View',
  folder: 'Unit 3 - Derivatives',
  downloadedAt: '2026-10-20T12:00:00.000Z',
};

describe('studyFileList', () => {
  it('lists D2L course files before anything is downloaded', () => {
    const topics: StudyTopic[] = [
      {
        title: 'Unit 3.2 - Derivatives',
        type: 'PDF document',
        url: 'https://courses.example.edu/d2l/le/content/123456/viewContent/2/View',
        folder: 'Unit 3 - Derivatives',
      },
      {
        title: 'Unit 3.3 - Differentiation Rules',
        type: 'PDF document',
        url: 'https://courses.example.edu/d2l/le/content/123456/viewContent/3/View',
        folder: 'Unit 3 - Derivatives',
      },
    ];

    const files = studyFileList([], topics);

    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      title: 'Unit 3.2 - Derivatives',
      source: 'd2l',
      canOpen: false,
      folder: 'Unit 3 - Derivatives',
    });
    expect(files[0].url).toContain('/viewContent/2/');
  });

  it('puts saved files first and does not list the same lecture twice', () => {
    const topics: StudyTopic[] = [
      {
        title: 'Unit 3.2 — Derivatives.pdf',
        type: 'PDF document',
        url: 'https://courses.example.edu/d2l/le/content/123456/viewContent/2/View',
        folder: 'Unit 3 - Derivatives',
      },
      {
        title: 'Unit 3.3 - Differentiation Rules',
        type: 'PDF document',
        url: 'https://courses.example.edu/d2l/le/content/123456/viewContent/3/View',
        folder: 'Unit 3 - Derivatives',
      },
    ];

    const files = studyFileList([savedFile], topics);

    expect(files.map((file) => file.title)).toEqual([
      'Unit 3.2 - Derivatives',
      'Unit 3.3 - Differentiation Rules',
    ]);
    expect(files[0]).toMatchObject({
      id: 'saved-1',
      source: 'library',
      canOpen: true,
      folder: 'Unit 3 - Derivatives',
    });
    expect(files[0].url).toBe('/api/library/file/saved-1');
  });

  it('is empty when neither local files nor D2L content exist', () => {
    expect(studyFileList([], [])).toEqual([]);
  });
});
