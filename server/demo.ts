import type { CalendarEvent, Course, CourseContent, DashboardData } from '../shared/types';

/**
 * Sample data shown before D2L is connected. Everything here is invented:
 * no real student, course or school belongs in preview mode.
 */
/** A stand-in school, so previews never show the real campus address either. */
export const DEMO_BASE_URL = 'https://learn.example.edu';

interface DemoCourse {
  id: string;
  name: string;
  code: string;
}

const DEMO_COURSES: DemoCourse[] = [
  { id: '900001', name: 'CPS101 - Intro to Programming - F2026', code: 'CPS101_F26_01' },
  { id: '900002', name: 'BIO120 - Ecology and Evolution - F2026', code: 'BIO120_F26_01' },
  { id: '900003', name: 'ENG204 - Creative Writing - F2026', code: 'ENG204_F26_01' },
  { id: '900004', name: 'HIS105 - World History - F2026', code: 'HIS105_F26_01' },
  { id: '900005', name: 'PHL110 - Ethics and Society - F2026', code: 'PHL110_F26_01' },
  { id: '900006', name: 'PSY101 - Introduction to Psychology - F2026', code: 'PSY101_F26_01' },
  { id: '900007', name: 'Library Essentials', code: 'ORG_LIBRARY_ESSENTIALS' },
  { id: '900008', name: 'Career Centre', code: 'ORG_CAREER_CENTRE' },
  { id: '900009', name: 'Study Skills Workshop', code: 'ORG_STUDY_SKILLS' },
];

interface DemoEvent {
  title: string;
  courseCode: string | null;
  inDays: number;
  hour: number;
  minute: number;
}

const DEMO_EVENTS: DemoEvent[] = [
  { title: 'Quiz 2 opens', courseCode: 'CPS101_F26_01', inDays: 3, hour: 9, minute: 0 },
  { title: 'Lab report draft', courseCode: 'BIO120_F26_01', inDays: 5, hour: 23, minute: 59 },
  { title: 'Short story workshop', courseCode: 'ENG204_F26_01', inDays: 8, hour: 14, minute: 0 },
  { title: 'Reading response', courseCode: 'HIS105_F26_01', inDays: 11, hour: 17, minute: 0 },
  { title: 'Ethics case study', courseCode: 'PHL110_F26_01', inDays: 16, hour: 12, minute: 0 },
  { title: 'Midterm review', courseCode: 'PSY101_F26_01', inDays: 21, hour: 10, minute: 0 },
];

/**
 * A made-up timetable. Without it the week grid would be empty in preview mode,
 * which hides the part of the app the calendar is for.
 */
interface DemoClass {
  title: string;
  courseCode: string;
  /** 0 = Sunday */
  weekday: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  location: string;
}

const DEMO_CLASSES: DemoClass[] = [
  { title: 'CPS101 — Lecture', courseCode: 'CPS101_F26_01', weekday: 1, startHour: 10, startMinute: 0, endHour: 11, endMinute: 30, location: 'Room 204' },
  { title: 'BIO120 — Lab', courseCode: 'BIO120_F26_01', weekday: 2, startHour: 13, startMinute: 0, endHour: 15, endMinute: 0, location: 'Science Wing 110' },
  { title: 'ENG204 — Workshop', courseCode: 'ENG204_F26_01', weekday: 3, startHour: 9, startMinute: 0, endHour: 10, endMinute: 30, location: 'Library 302' },
  { title: 'HIS105 — Lecture', courseCode: 'HIS105_F26_01', weekday: 3, startHour: 12, startMinute: 0, endHour: 13, endMinute: 30, location: 'Hall 118' },
  { title: 'PSY101 — Lecture', courseCode: 'PSY101_F26_01', weekday: 4, startHour: 10, startMinute: 0, endHour: 11, endMinute: 30, location: 'Room 401' },
  { title: 'PHL110 — Seminar', courseCode: 'PHL110_F26_01', weekday: 5, startHour: 14, startMinute: 0, endHour: 15, endMinute: 0, location: 'Room 210' },
];

function atOffset(daysFromNow: number, hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function startOfWeek(value: Date): Date {
  const day = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  day.setDate(day.getDate() - day.getDay());
  return day;
}

/** Three weeks of made-up classes, so stepping through weeks shows something. */
function demoClasses(): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const weekStart = startOfWeek(new Date());
  for (let week = -1; week <= 1; week += 1) {
    DEMO_CLASSES.forEach((entry, index) => {
      const start = new Date(weekStart);
      start.setDate(start.getDate() + week * 7 + entry.weekday);
      start.setHours(entry.startHour, entry.startMinute, 0, 0);
      const end = new Date(start);
      end.setHours(entry.endHour, entry.endMinute, 0, 0);
      events.push({
        id: `demo-class-${week}-${index}`,
        title: entry.title,
        courseCode: entry.courseCode,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        location: entry.location,
        whenLabel: null,
        url: null,
        calendarName: 'School timetable',
      });
    });
  }
  return events;
}

export function demoCourses(baseUrl: string): Course[] {
  return DEMO_COURSES.map((course) => ({
    ...course,
    // Preview tiles point at the real D2L home page; sample org unit ids do not exist.
    url: `${baseUrl.replace(/\/+$/, '')}/d2l/home`,
    imageUrl: null,
  }));
}

export function demoEvents(_baseUrl: string): CalendarEvent[] {
  const deadlines: CalendarEvent[] = DEMO_EVENTS.map((event, index) => ({
    id: `demo-event-${index}`,
    title: event.title,
    courseCode: event.courseCode,
    startsAt: atOffset(event.inDays, event.hour, event.minute),
    whenLabel: null,
    url: null,
  }));
  return [...demoClasses(), ...deadlines];
}

interface DemoModule {
  id: string;
  name: string;
  topics: { title: string; type: string }[];
}

const DEMO_MODULES: DemoModule[] = [
  {
    id: '301',
    name: 'Unit 3 — Applications of Derivatives',
    topics: [
      { title: 'Unit 3.2 - Derivatives', type: 'PDF document' },
      { title: 'Unit 3.3 - 3.6 Practice', type: 'PDF document' },
      { title: 'Unit 3 Review', type: 'PDF document' },
    ],
  },
  {
    id: '302',
    name: 'Unit 4 — Integration',
    topics: [
      { title: 'Unit 4.1 - Integrals', type: 'PDF document' },
      { title: 'Unit 4.2 - Applications', type: 'PDF document' },
      { title: 'Unit 4 Formula Sheet', type: 'Word document' },
    ],
  },
];

/** Sample modules and topics so the Content tab works in preview mode too. */
export function demoContent(courseId: string, moduleId?: string): CourseContent {
  const modules = DEMO_MODULES.map((module) => ({
    id: module.id,
    name: module.name,
    depth: 0,
    remaining: null,
    total: module.topics.length,
  }));
  const wanted = DEMO_MODULES.find((module) => module.id === moduleId) ?? DEMO_MODULES[0];
  const base = `${DEMO_BASE_URL}/d2l/le/content/${courseId}`;

  return {
    modules,
    moduleId: wanted.id,
    moduleTitle: wanted.name,
    topics: wanted.topics.map((topic, index) => ({
      id: `${wanted.id}-${index}`,
      title: topic.title,
      type: topic.type,
      url: `${base}/viewContent/${wanted.id}${index}/View`,
    })),
    contentUrl: `${base}/Home`,
    fetchedAt: new Date().toISOString(),
  };
}

export function demoDashboard(baseUrl: string, notice: string | null): DashboardData {
  return {
    source: 'sample',
    notice,
    user: { name: 'User', baseUrl },
    courses: demoCourses(baseUrl),
    events: demoEvents(baseUrl),
    fetchedAt: new Date().toISOString(),
  };
}
