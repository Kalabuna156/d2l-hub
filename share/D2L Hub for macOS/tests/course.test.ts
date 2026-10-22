import { describe, expect, it } from 'vitest';
import { parseAnnouncements, parseAssignments } from '../server/parse';

const BASE = 'https://courses.torontomu.ca';

const NEWS_HTML = `
<html><body>
  <table summary="List of announcements">
    <tr class="d_gh" header><th scope="col">Title</th><th scope="col">Start Date</th></tr>
    <tr>
      <th scope="row">
        <a class="d2l-link" href="/d2l/le/news/1188064/1176294/view?ou=1188064">
          <strong>MTH 141 Midterm – Grades and Remarking</strong>
        </a>
      </th>
      <td><label>Oct 19, 2026 8:00 AM</label></td>
    </tr>
    <tr class="d_detailsRow"><td colspan="2">
      <d2l-html-block html="&lt;p&gt;Hi everyone,&lt;/p&gt; &lt;p&gt;Grades are &lt;strong&gt;coming&lt;/strong&gt;.&lt;/p&gt; &lt;script&gt;alert('x')&lt;/script&gt; &lt;p&gt;&lt;a href=&quot;/d2l/le/content/1188064/Home&quot;&gt;Course content&lt;/a&gt;&lt;/p&gt;"></d2l-html-block>
    </td></tr>
    <tr>
      <th scope="row">
        <a class="d2l-link" href="/d2l/le/news/1188064/1175957/view?ou=1188064">
          <strong>Midterm Make-Up Test Procedure</strong>
        </a>
      </th>
      <td><label>Oct 12, 2026 9:30 AM</label></td>
    </tr>
    <tr class="d_detailsRow"><td colspan="2">
      <d2l-html-block html="&lt;p&gt;See the procedure below.&lt;/p&gt;"></d2l-html-block>
    </td></tr>
    <tr><th scope="row"><a class="d2l-link" href="/d2l/lms/news/main.d2l?ou=1188064">All announcements</a></th></tr>
  </table>
</body></html>`;

const DROPBOX_HTML = `
<html><body>
  <table summary="List of assignments for this course">
    <tr class="d_gh" header>
      <th>Assignment</th><th>Completion Status</th><th>Score</th><th>Evaluation Status</th>
    </tr>
    <tr class="d_ggl2 d_dbold"><td colspan="4"><label><span class="ds_i">MATLAB</span></label></td></tr>
    <tr>
      <th scope="row">
        <div class="d2l-foldername">
          <a class="d2l-link" href="/d2l/lms/dropbox/user/folder_submit_files.d2l?db=480620&amp;ou=1194174">
            <strong>MATLAB A1</strong>
          </a>
        </div>
        <div class="d2l-folderdates-wrapper">
          <div class="d2l-dates-text"><label><strong>Due on Sep 16, 2026 11:59 PM</strong></label></div>
        </div>
      </th>
      <td class="d_gt"><a class="d2l-link" href="/d2l/lms/dropbox/user/folders_history.d2l?db=480620">1 Submission, 1 File</a></td>
      <td class="d_gc d_gt"><div class="d2l-grades-score"><label>100 %</label></div></td>
      <td class="d_gt"><label>Feedback: </label><a class="d2l-link">Unread</a></td>
    </tr>
    <tr class="d_ggl2 d_dbold"><td colspan="4"><label><span class="ds_i">No Category</span></label></td></tr>
    <tr>
      <th scope="row">
        <div class="d2l-foldername">
          <a class="d2l-link" href="/d2l/lms/dropbox/user/folder_submit_files.d2l?db=480619&amp;ou=1194174">
            <strong>Personal Introduction</strong>
          </a>
        </div>
      </th>
      <td class="d_gt"><a class="d2l-link">No submissions</a></td>
      <td class="d_gc d_gt"><div class="d2l-grades-score"></div></td>
      <td class="d_gt"><label></label></td>
    </tr>
  </table>
</body></html>`;

describe('parseAnnouncements', () => {
  const announcements = parseAnnouncements(NEWS_HTML, BASE);

  it('reads titles, dates and links from the announcement table', () => {
    expect(announcements).toHaveLength(2);
    const midterm = announcements[0];

    expect(midterm.title).toBe('MTH 141 Midterm – Grades and Remarking');
    expect(midterm.url).toBe(`${BASE}/d2l/le/news/1188064/1176294/view?ou=1188064`);
    expect(midterm.publishedAt).toBe(new Date(2026, 9, 19, 8, 0).toISOString());
  });

  it('decodes and sanitises the body', () => {
    const body = announcements[0].bodyHtml;

    expect(body).toContain('<strong>coming</strong>');
    expect(body).not.toContain('<script');
    expect(body).not.toContain('alert(');
    expect(body).toContain(`href="${BASE}/d2l/le/content/1188064/Home"`);
    expect(announcements[0].bodyText.startsWith('Hi everyone,')).toBe(true);
  });

  it('ignores the "All announcements" navigation link', () => {
    expect(announcements.some((item) => /all announcements/i.test(item.title))).toBe(false);
  });
});

describe('parseAssignments', () => {
  const assignments = parseAssignments(DROPBOX_HTML, BASE);

  it('reads names, due dates, scores and categories', () => {
    expect(assignments).toHaveLength(2);
    const lab = assignments[0];

    expect(lab.name).toBe('MATLAB A1');
    expect(lab.category).toBe('MATLAB');
    expect(lab.dueAt).toBe(new Date(2026, 8, 16, 23, 59).toISOString());
    expect(lab.score).toBe('100 %');
    expect(lab.status).toBe('1 Submission, 1 File');
    expect(lab.url).toBe(`${BASE}/d2l/lms/dropbox/user/folder_submit_files.d2l?db=480620&ou=1194174`);
  });

  it('keeps assignments without a due date and drops the "No Category" header', () => {
    const intro = assignments[1];

    expect(intro.name).toBe('Personal Introduction');
    expect(intro.dueAt).toBeNull();
    expect(intro.score).toBeNull();
    expect(intro.category).toBeNull();
  });

  it('returns nothing for an empty assignment list', () => {
    const empty = '<html><body><table><tr class="d_gh"><th>Assignment</th></tr></table></body></html>';
    expect(parseAssignments(empty, BASE)).toEqual([]);
  });
});
