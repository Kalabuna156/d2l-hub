import { describe, expect, it } from 'vitest';
import {
  parseContentModuleTitle,
  parseContentModules,
  parseContentTopics,
  parseGrades,
} from '../server/parse';

const BASE = 'https://courses.torontomu.ca';

const CONTENT_HTML = `
<html><body>
  <h2>List of Topics and Sub-Modules for Tutorials F26</h2>
  <ul id="D2L_LE_Content_TreeBrowser" class="d2l-le-TreeAccordion">
    <li data-key="TOC" class="d2l-le-TreeAccordionItem">
      <a class="d2l-le-TreeAccordionItem-anchor">
        <div class="d2l-textblock">Table of Contents</div>
      </a>
    </li>
    <li data-key="D2L.LE.Content.ContentObject.ModuleCO-7128748" class="d2l-le-TreeAccordionItem">
      <a class="d2l-le-TreeAccordionItem-anchor">
        <div class="d2l-textblock">Course Outline 2026</div>
        <div class="d2l-textblock d2l-offscreen d2l-tree-item-selected">selected</div>
      </a>
    </li>
    <li data-key="D2L.LE.Content.ContentObject.ModuleCO-7240902" class="d2l-le-TreeAccordionItem">
      <a class="d2l-le-TreeAccordionItem-anchor">
        <div class="d2l-textblock">Assignments F26</div>
        <d2l-count-badge number="12" title="12 out of 19 topics remaining"></d2l-count-badge>
      </a>
      <ul>
        <li data-key="D2L.LE.Content.ContentObject.ModuleCO-7128766" class="d2l-le-TreeAccordionItem">
          <a class="d2l-le-TreeAccordionItem-anchor">
            <div class="d2l-textblock">Personal Introduction Assignment</div>
          </a>
        </li>
      </ul>
    </li>
  </ul>

  <div class="d2l-datalist-container">
    <div class="d2l-topic-view">
      <a class="d2l-link" href="/d2l/le/content/1194174/viewContent/7249214/View" title="'CEN100_Lab1' - PDF document">CEN100_Lab1_TeamworkTeamContract_F26</a>
      <div class="d2l-container-icon"><div class="d2l-textblock">PDF document</div></div>
    </div>
  </div>
  <div class="d2l-datalist-container">
    <div class="d2l-topic-view">
      <a class="d2l-link" href="/d2l/le/content/1194174/viewContent/7249225/View">Predictive_FMEA_Template_F26_.xlsx</a>
      <div class="d2l-container-icon"><div class="d2l-textblock">Excel Spreadsheet</div></div>
    </div>
  </div>
  <div class="d2l-datalist-container">
    <div class="d2l-topic-view">
      <a class="d2l-link" href="/d2l/le/content/1194174/viewContent/7249214/View">Duplicate topic link</a>
    </div>
  </div>
</body></html>`;

const GRADES_HTML = `
<html><body>
<table class="d2l-table" summary="List of grade items and their values">
  <tr class="d_gh" header>
    <th scope="col" colspan="2">Grade Item</th>
    <th scope="col">Points</th>
    <th scope="col">Weight Achieved</th>
    <th scope="col">Grade</th>
    <th scope="col">Comments and Assessments</th>
  </tr>
  <tr>
    <th scope="row" colspan="2" class="d_gt d_ich"><label>Quizzes</label></th>
    <td class="d_gn d_gr d_gt">&nbsp;</td>
    <td class="d_gn d_gr d_gt"><span>5.2 / 20</span></td>
    <td class="d_gn d_gr d_gt"><span>26 %</span></td>
    <td class="d_gt"></td>
  </tr>
  <tr>
    <td class="d_g_treeNodeImage d_g_l_e"></td>
    <th scope="row" class="d_gt d_ich"><label>Quiz 1</label></th>
    <td class="d_gn d_gr d_gt">&nbsp;</td>
    <td class="d_gn d_gr d_gt"><span>3.2 / 4</span></td>
    <td class="d_gn d_gr d_gt"><span>80 %</span></td>
    <td class="d_gt"><a class="d2l-link" href="/d2l/lms/quizzing/user/quiz_submissions.d2l?ou=1188064&amp;qi=507834">View Quiz Attempts</a></td>
  </tr>
  <tr>
    <td class="d_g_treeNodeImage d_g_l_e"></td>
    <th scope="row" class="d_gt d_ich"><label>Quiz 2</label></th>
    <td class="d_gn d_gr d_gt">&nbsp;</td>
    <td class="d_gn d_gr d_gt"><span>2 / 4</span></td>
    <td class="d_gn d_gr d_gt"><span>50 %</span></td>
    <td class="d_gt"></td>
  </tr>
  <tr>
    <th scope="row" colspan="2" class="d_gt d_ich"><label>Final Exam</label></th>
    <td class="d_gn d_gr d_gt">&nbsp;</td>
    <td class="d_gn d_gr d_gt"><span>0 / 45</span></td>
    <td class="d_gn d_gr d_gt"><span>- %</span></td>
    <td class="d_gt"></td>
  </tr>
</table>
</body></html>`;

describe('parseContentModules', () => {
  const modules = parseContentModules(CONTENT_HTML);

  it('reads modules, skips the table of contents and keeps nesting depth', () => {
    expect(modules.map((module) => module.name)).toEqual([
      'Course Outline 2026',
      'Assignments F26',
      'Personal Introduction Assignment',
    ]);
    expect(modules[0]).toMatchObject({ id: '7128748', depth: 0 });
    expect(modules[1]).toMatchObject({ id: '7240902', depth: 0, remaining: 12, total: 19 });
    expect(modules[2].depth).toBe(1);
  });

  it('reads the selected module title', () => {
    expect(parseContentModuleTitle(CONTENT_HTML)).toBe('Tutorials F26');
    expect(parseContentModuleTitle('<html></html>')).toBeNull();
  });
});

describe('parseContentTopics', () => {
  const topics = parseContentTopics(CONTENT_HTML, BASE);

  it('reads topics with type and absolute link, without duplicates', () => {
    expect(topics).toHaveLength(2);
    expect(topics[0]).toMatchObject({
      id: '7249214',
      title: 'CEN100_Lab1_TeamworkTeamContract_F26',
      type: 'PDF document',
      url: `${BASE}/d2l/le/content/1194174/viewContent/7249214/View`,
    });
    expect(topics[1].type).toBe('Excel Spreadsheet');
  });
});

describe('parseGrades', () => {
  const items = parseGrades(GRADES_HTML, BASE);

  it('reads every graded row with its weight and grade', () => {
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      name: 'Quizzes',
      kind: 'group',
      depth: 0,
      achieved: '5.2 / 20',
      grade: '26 %',
    });
    expect(items[1]).toMatchObject({ name: 'Quiz 1', kind: 'item', depth: 1, grade: '80 %' });
  });

  it('links graded items back to D2L', () => {
    expect(items[1].url).toBe(`${BASE}/d2l/lms/quizzing/user/quiz_submissions.d2l?ou=1188064&qi=507834`);
    expect(items[1].comment).toBeNull();
    expect(items[2].url).toBeNull();
  });

  it('treats "- %" as an empty grade and keeps ungraded items', () => {
    expect(items[3].name).toBe('Final Exam');
    expect(items[3].grade).toBe('- %');
    expect(items[3].kind).toBe('item');
  });

  it('returns nothing when the page has no gradebook table', () => {
    expect(parseGrades('<html><body><p>No grades</p></body></html>', BASE)).toEqual([]);
  });
});
