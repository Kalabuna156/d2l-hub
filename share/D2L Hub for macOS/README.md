# D2L Hub

A dark-mode dashboard for your D2L (Brightspace) courses. It signs in to your
school's D2L once, then reorganizes what D2L shows as one long tile grid into
categories you can actually scan: terms, subjects, and upcoming due dates.
Opening a course stays inside the app too — announcements, work to do and
course links, in the same UI instead of a jump back into D2L.

**Unofficial.** This project is not affiliated with, endorsed by or supported by
D2L Corporation or Toronto Metropolitan University. It only reads the Brightspace
pages you are already signed in to, and your use of D2L stays subject to its terms.

This is the **first sample** — built to be looked at and then reshaped.

It runs as a **desktop app** (Electron) for Windows, macOS and Linux; the
browser dev server is still there for working on it.

## Run it

```bash
npm install
npm run desktop    # build + open the desktop app
```

Or in a browser, with hot reload:

```bash
npm run dev        # http://localhost:5173
npm run build && npm start   # http://127.0.0.1:8787
```

To show or screenshot the app without any of your own data, run the sample-only
preview. It uses its own data folder, ignores saved sessions and calendars, and
shows the invented student ("User") and courses:

```bash
npm run dev:preview   # http://localhost:5173, sample data only
```

Requires Node 20+. The sign-in window uses Chrome, Chromium, Edge or Brave that
is already installed — nothing extra is downloaded.

## Connecting your account

TMU's D2L signs in through Microsoft SSO, so the app cannot use a
username/password form. Instead:

1. Click **Connect D2L** (top right or the sidebar card).
2. Confirm your school's D2L address (default `https://courses.torontomu.ca`).
3. A normal Chrome window opens on the D2L sign-in page.
4. Sign in the way you always do. The window closes itself when it sees the
   D2L session cookies, and the dashboard reloads with your courses.

Nothing is invented before you connect. The dashboard shows an empty state with
a **Connect D2L** button, the Calendar offers **Connect calendar** for Google
Calendar or Notion, and Study offers **Connect Gemini API key** for the AI
features (Study still builds a local plan from your outline without one).

Sample data now exists only for the preview: `npm run dev:preview` uses its own
data folder and shows the invented student ("User") so the UI can be designed
and screenshotted without a real session.

## Google Calendar and Notion

Settings (the gear in the top bar) → **Connections** adds the calendars you
already plan in, and both are read-only:

**Google Calendar** — no Google Cloud project, no OAuth keys.

1. Open [calendar.google.com](https://calendar.google.com) and click the gear →
   **Settings**, or use the **Open Google Calendar settings** button in the app
   (it opens the same page).
2. On the left under **Settings for my calendars**, click the calendar your
   classes are on.
3. Scroll right down to **Integrate calendar** → **Secret address in iCal
   format**.
4. Copy that link (`https://calendar.google.com/calendar/ical/…/basic.ics`),
   paste it into the Google Calendar card and press **Connect**.

**Notion** — one database of deadlines.

1. Open [notion.so/my-integrations](https://www.notion.so/my-integrations) →
   **New integration**, name it, save, then copy the **Internal Integration
   Secret**.
2. In Notion, open your deadlines database → **⋯** → **Connections** → add the
   integration you just made.
3. Paste the secret into the Notion card → **Find databases** → pick the
   database → **Use this database**.

The Notion database needs a **Date** property; one named "Due", "Deadline" or
"Date" is picked automatically. Entries without a date are ignored.

Recurring Google events are expanded (a weekly lab shows up every week), all-day
events stay on their own date, and cancelled events are skipped. Items link
back to the original calendar event or Notion page.

The calendar page reads it all three ways:

- **Class week** — a week grid of your timed Google Calendar entries, laid out
  like Google's own week view: days across, hours down, one block per class with
  its time and room, a line for the current time and arrows to step through
  weeks. This is the school-schedule view; room changes and cancelled classes
  come through on the next sync.
- **Upcoming** — deadlines only (D2L, Notion and all-day calendar entries),
  grouped by month.
- **Older dates** — everything from before today, collapsed behind one row until
  you open it.

### Importing an outline

No D2L account and no Notion database? Your course management form already has
the due dates — **Import outline** at the top of the Calendar page reads them:

1. Drop the PDF the professor posted (or a plain-text copy of it) into the
   dialog. The file is read by the local server on this computer; it is never
   uploaded anywhere.
2. The schedule table is parsed row by row. A line becomes a date when it names
   a quiz, test, midterm, exam, assignment, project, report or submission **and**
   carries a date. When a row has both a class date and a due date, the due date
   wins; a clock on the line (`11:59 p.m.`, `6:00 p.m.`) sets the hour, otherwise
   it is 9:00 a.m. Rows like "No classes — study week" are skipped.
   When the form has a proper assessment table — assessment, date, format and
   weight in their own columns — the date column is read directly, so text that
   wraps across several lines still stays with its assessment, and a list like
   `Sep 21, Oct 5, … Nov 30` becomes one date per assessment.
3. Check the review list: each row keeps the outline line it came from, and its
   name, date and time can be edited. Untick whatever the parser misread, choose
   the course (guessed from the file name, so `MTH141-outline.pdf` fills itself
   in), then **Add N dates to calendar**.

They land in **Upcoming** with an `Outline` badge and count towards **Up next**
and **Next 14 days**. Click one there to rename it, move it or delete it — they
are ordinary local events, and **Add to Google Calendar** copies one across with
the prefilled Google page if you want it there too.

Dates without a year that would sit more than six months in the past are read as
next year, so a Winter form uploaded in September correctly fills in January.
Scans have no text layer and are rejected with a hint; import the original PDF
instead. Importing the same outline twice skips dates already on the calendar
(same name, same moment), so a corrected upload only adds what is new.

### Auto-import with your own AI

**Calendar → Auto-import** finds the course management form for every enrolled
course, reads it, and puts the dates in one review list. It looks in D2L's course
content, in Content Space (uploads and saved files), and at outlines read earlier.
The review works like the upload dialog: one row per date, with the outline's own
wording underneath, and a **No specific date** list for items like a final exam
that only says “during the examination period”. Nothing is added until you press
**Add N dates to calendar**; dates already there are skipped.

This needs your own AI key, because course outlines vary too much for one table
parser. Add it in **Settings → AI**:

- **Google Gemini** — create a key in Google AI Studio.
- **OpenAI** — create a key on the OpenAI platform.
- **Anthropic** — create a Claude key in the Anthropic console.
- **OpenAI-compatible endpoint** — any gateway or local server that speaks the
  chat-completions API. `http://` is allowed for localhost.

Leave the model blank to use a sensible default, or type one (for example
`gemini-3.8-flash` or `gpt-4o-mini`). Gemini's retired 2.5 Flash IDs are upgraded
automatically, so an old saved model cannot break every request. If Gemini's
chosen Flash model is at capacity (a `503` high-demand spike), Study retries and
falls back to the newest sibling model that answers. If those are busy too, it
asks Google for the other Gemini 3.x text models your key can use and tries them
before giving up — skipping image, speech and audio-only models. The key lives in
this computer's app data, is never sent back to the interface, and is used only
for the requests you start.
Each scan makes at most one request per course that has an outline, using your
provider account and credits.

### Study

The **Study** page lists every upcoming quiz, midterm, assignment and test, nearest
deadline first. The nearest one is the **Top priority** card at the top and its
plan opens automatically. An assessment stays listed through the end of its own
day, so you can keep revising until the last minute, then it drops off the next
morning.

Pick any assessment and Study builds a plan from the outline you imported, the
course's announcements and the course files. It works without an AI key:

- what to review, with the chapters and topics the outline names, or with the
  lecture file names when no outline is saved;
- what the announcements say is covered or deliberately left out, shown with a
  link back to each announcement so you can check it yourself;
- a dated checklist that spreads the topics across the days before the
  assessment;
- the textbook and practice areas the outline names, without inventing question
  numbers;
- the course files for that assessment, with **Open**, **Download** and **Show in
  folder**. Files from the course's D2L Content are listed even before you save
  anything; **Download** copies one into Content Space;
- on every file, a **3B1B** and an **OCT** button. Each asks your AI to pick the
  best 3Blue1Brown or Organic Chemistry Tutor topic for that file, then offers a
  channel-scoped YouTube search. Without a working key it falls back to a search
  built from the file name, so the buttons still do something useful.

With an AI key, **Rebuild** adds generated practice questions with worked answers,
a more specific topic breakdown, and deeper textbook practice. If the AI request
fails, the local plan stays on screen instead of being replaced by an error.

The file list does not depend on having a plan or a working AI key, so you can
still see and download lectures while a plan is unavailable. If an assessment has
no course code, pick its course once in the **Files for this assessment** panel;
Study remembers the link and lists that course's D2L files.

AI plans are stored on this computer so reopening one is instant. Local plans
are rebuilt instantly from the outline and file list, so they always reflect the
current course. **Rebuild** asks the AI again when a key is configured; without
one it simply refreshes the local plan.

In a course's **Content** tab, every topic also has a **Study** button. It builds a
plan for that one lecture, with worked practice and one 3Blue1Brown and one
Organic Chemistry Tutor link, without opening the full assessment plan.

By default the AI sees the outline text, the course announcements that mention
quiz or exam coverage, and file names. Turn on **Let AI read course files** in
Settings → AI and it also reads up to a few lecture PDFs, Word
documents and PowerPoint slide decks to make the plan specific. That is a real
privacy change: the text of those files leaves this computer and goes to the
provider you chose. The setting is off until you switch it on, and Settings,
Study and the scan dialog all say when it is on.

### Editing a class

Click any block in **Class week** to fix it for that date:

- change the class name, the room, or the start and end time;
- **Hide class** when the school cancelled it — the block leaves the grid and
  waits under *Hidden this week* below the timetable, ready to restore;
- **Reset to Google's version** throws the local change away.

These edits live in `config.json` next to the session and are layered over the
feed on every sync, so a refresh cannot undo them. Google Calendar itself is
never written to — the app still only reads it.

Only the fields you actually changed are stored: renaming a class does not pin
its time, so a later time change in Google still comes through.

### Adding an event

Click any empty slot in **Class week** and a dialog opens with that day and time
already filled in. Click and drag down (or up) to choose the whole range at
once, like Google Calendar — the dashed preview shows the span as you drag, and
a very short drag still makes a 30 minute block. The **Add event** icon in the
card header does the same for the next free half hour. New events are drawn in
the accent colour with a dashed edge, so they never look like something Google
sent.

They are stored in `config.json` alongside the session and only leave this
computer if you choose to copy one to Google yourself. Like edited classes they
show up in **Up next**, today's card on the Overview and the week grid, and they
can be renamed or deleted from the same dialog.

**Add to Google Calendar** saves the event here and opens Google Calendar with
the name, room and times already filled in, ready for its own Save button. It
is a hand-off, not a connection: the app never writes to your Google account on
its own, and the same button works for a brand new event before you add it.

### Moving an event

The events this app can write to — the ones you add here, and classes that come
from a Google feed — can be dragged straight on the grid. Grab a block to move
it in 15 minute steps; slide it sideways to drop it on another day. Pull its
top or bottom edge to shorten or lengthen it, down to a 15 minute minimum.

The block follows the pointer as a translucent preview, and the new time is
saved when you let go. Google events keep their original entry in the feed:
the moved time is stored as a local override, exactly like editing a class.
D2L and Notion items are read-only, so their blocks show no drag handles.

The Overview rail shows **Today** as a read-only day column — the same blocks
as the week grid, without any editing. Its pencil button opens the **Calendar**
tab, where those events can be changed normally.

The same deadlines drive **Up next** and the **Next 14 days** stat, with a
`GCal` / `Notion` badge so you can tell where each one came from. Rows are
colour-coded by how close they are: **red** when something is due within three
days, **amber** within the week after that, unchanged past that.

Only the useful window is read — 30 days back through 120 days forward — so a
long-running Notion database no longer floods the app with its first entries.

Feeds are read through this computer. They refresh every five minutes, whenever
the window comes back into focus, and immediately on **Sync now** (which skips
the server cache) or the refresh icon in the week grid. A broken feed shows its
error in Settings and in the dashboard banner without taking the rest of the app
down.

## Making it yours

Settings → **Appearance**:

- **Accent** — violet, sky, emerald, amber, rose or fuchsia; re-tints the whole
  interface, not just one widget.
- **Background** — Aurora, Noir, Sunset, Ocean or Meadow, each with its own page
  colour, glass tint and ambient glows. The sidebar and top bar are glass over
  the same backdrop, so the theme covers the whole window rather than only the
  content area.
- **Your own image** — paste a direct `https://…jpg` link and set how strongly it
  shows through; text sits on a dimming layer so it stays readable, and the
  image runs behind the chrome too.

Preferences live next to the D2L session in `config.json`, so they survive
restarts and follow you between runs on the same machine.

## Inside a course

Click a course card (or **View**) to open its page in the app. It has three tabs:

**Overview**

- **Announcements** — full posts from the course, cleaned of scripts and
  tracking attributes before rendering, with a link to each post in D2L.
- **Work to do** — every assignment folder with its due date, category,
  submission status and score. Upcoming items come first, overdue ones last.
- **Dates** — this course's calendar entries for the current month.

**Content**

- The module tree, including nested sub-modules and how many topics each holds.
- Clicking a module loads its topics in-app (name, file type, direct link). D2L
  renders one module per request, so topics are fetched on demand and cached.

**Grades**

- Every gradebook row D2L shows, grouped by category, with weight achieved and
  the grade, colour-coded by percentage.
- Rows with feedback or attempts link straight into D2L.

Announcements, Assignments and Discussions still open the real D2L pages, and
there is no quizzes section. Everything is read-only: submitting, grading and
replying still happen in D2L. Any school can use it — set the D2L address in the
connect dialog.

## Content Space

Every file in a course's **Content** tab has a download button on hover. The
file is fetched through your D2L session, saved under the app's data folder, and
appears in **Content Space** — a library that works offline. Topics D2L renders
in its document viewer (the ones with a Download button there) are saved as the
real file, not the surrounding HTML page.

Content Space starts with one block per course, then groups the files inside:

- `Unit 3.2 - Derivatives`, `Unit 3.3 - 3.6 Practice` and `Unit 3 Review` all
  become **Unit 3**, even though their names differ;
- bare numbered handouts (`3.3 - 3.6 Practice`) and `Week 4`, `Module 5` or
  `Chapter 2` names are recognised too;
- D2L's own numbering is ignored, so `(6) section 2.2-Limits` files up under
  **Chapter 2** and not under the module they came from;
- files without a unit fall back to the D2L module they came from, or **Other
  files** when there is none.

### Your own files

**Add files** in Content Space saves anything from this computer — a paper from
another class, a scanned midterm, a friend's notes — into the course you pick.
Choose an existing shelf, a D2L enrollment, or type a new course name. The
optional **Unit or folder** field is where the files are filed, even when their
names mention a different unit. Uploads are marked **added by you**, are capped
at 150 MB each, replace an older copy of the same name, and never leave the
computer.

Dragging files from the desktop straight onto a course card skips the dialog:
the card highlights while you hover and shows progress while the copies are
written. Inside a shelf, the same works per unit — drop onto **Unit 3** and the
files land there, regardless of what their names say. A drop anywhere else is
cancelled, so the window never tries to open the file itself.

Downloading the same handout again replaces the old copy. Removing a file from
Content Space deletes its local bytes. **Show in folder** opens the file in your
file manager with its readable name, so it can be dragged into a chat or email.

### PDF reader

Clicking **View** on a PDF opens it inside the app, without a browser or an
external viewer. The toolbar has previous/next page, a page-number jump, zoom,
fit-to-width, rotation, fullscreen, save-a-copy, and **invert colours** for a
dark version of the page. Arrow keys turn pages, +/- zoom, Escape closes. The
invert choice is remembered.

## MUES exam bank

**Exam bank** in the sidebar browses the public MUES Google Drive folder inside
the app: engineering year → term → course → exam. No Google sign-in is needed.
Google's server-rendered folder listing is read by the local server and drawn
with the app's own UI, so the Drive page never opens in a separate window.

Each file can be saved into Content Space with one button; PDFs then open in the
reader and can be inverted like any other handout. The folder stays public, and
nothing is uploaded anywhere.

Exam bank visibility is a setting: Settings → **Appearance** → **Features** →
**MUES exam bank**. Turning it off hides the sidebar entry and the page.

### Your own exam banks

Settings → **Appearance** → **Exam banks** accepts any public Google Drive
folder link — `drive.google.com/drive/folders/<id>`, a `/u/1/` variant, an
`open?id=` link, or just the folder id — and adds it as another bank. Each folder
gets its own tab on the Exam bank page next to the built-in MUES archive, and
files saved there land in a Content Space shelf named after that bank. Leave the
name blank to use the folder's own Drive title. Up to 12 folders; **Remove**
drops a tab without touching files already saved.

## Notifications

The bell at the top of the window reads D2L's own alert feed — the same updates
Brightspace's bell shows: grade changes, new course content, announcements and
discussion messages. The badge counts what arrived since you last cleared it.
Opening the panel shows the **five newest** updates with their course and time;
**Load more** adds five at a time, and clicking an item opens that item in D2L in
your browser.

Read state stays on this computer: **Mark all as read** (the double check) clears
the badge and is remembered. D2L's feed carries no read flag of its own, so the
app stores the moment you cleared it (`notificationsSeenAt`) and the ids that
were on screen (`notificationsSeenIds`) in `config.json`. Anything older, or
anything already cleared, counts as read — so a post whose date sits slightly in
the future can never leave a badge that refuses to clear. The feed refreshes when
you open the panel and every five minutes, and is cached for a minute on the
server.

It comes from `GET /d2l/api/lp/<version>/alerts/user/<id>` with your session; the
id is read from `/users/whoami`. Some schools do not expose that route to
student sessions (a 403 or 404, which the app reports as unavailable rather than
claiming your session expired). In that case the bell falls back to your courses'
announcement pages — one request per course, cached for five minutes — and lists
them as **Announcement** rows, so it still shows real updates instead of an empty
error. Clearing the bell never empties it: everything stays visible, just read.

## What it reads

The app uses the same endpoints D2L's own home page calls, with your session:

- `GET /d2l/le/manageCourses/api/mycourses` → enrollments: org unit id, title,
  enrollment code, banner image
- `GET /d2l/api/lp/<version>/users/whoami` → your display name and user id
- `GET /d2l/api/lp/<version>/alerts/user/<id>` → the notification bell, paged
  with the `Next` links D2L returns
- `GET /d2l/le/calendar/<orgUnit>` → the month grid: event title, course, date,
  time (the calendar page only exposes the month D2L renders server-side)
- `GET /d2l/lms/news/main.d2l?ou=<id>` → course announcements, with bodies
- `GET /d2l/lms/dropbox/user/folders_list.d2l?ou=<id>` → assignment folders,
  due dates, scores and submission state
- `GET /d2l/le/content/<id>/Home` and `?itemIdentifier=ModuleCO-<module>` →
  module tree and the topics of one module
- `GET /d2l/lms/grades/my_grades/main.d2l?ou=<id>` → gradebook rows
- `GET /d2l/api/lp/<version>/courses/<id>/image` → course banners, proxied
  through `/api/course-image/<id>` because they sit behind the session cookie

Course content files are fetched only when you ask for them: opening a course's
Content tab, saving a topic, running **Auto-import**, or building a study plan
with file reading on. The gradebook is read only for the Grades tab.

### Limitations

- Calendar events cover the month D2L renders into the page (the current one).
  D2L switches months with a JavaScript postback, so earlier or later months
  are not loaded yet — the Calendar view therefore shows this month's events,
  past and future.
- A D2L session eventually expires; reconnect from the same dialog when the
  banner says the session is gone.
- Content loads one module at a time because D2L renders modules server-side
  only when they are requested; the module tree itself is complete.
- Grades show what D2L puts on the student's grades page — final grades and
  comments still live in D2L.
- If D2L changes its internal widget endpoints, the app falls back to parsing
  the home page HTML and finally to an empty dashboard with a notice.

## Privacy

- Your password never touches this app.
- Only D2L cookies are stored, in `config.json` inside the app's data folder
  (mode 0600), on this computer. That is `.data/` when you run from source and
  the OS app-data folder in the desktop app (see below).
- Chrome runs with its own profile in a `chrome-profile` folder next to it for
  the sign-in window. Signing out clears the stored D2L cookies.
- A course outline you import or auto-scan is kept on this computer (in
  `config.json`) so Study can use its chapters and textbook list. Only the dates
  you tick in the review list become calendar events.
- Your AI API key is stored in the same `config.json` (mode 0600) and is never
  sent back to the interface — Settings only sees a masked hint. It is sent only
  to the provider you picked, and only when you press Auto-import, Build study
  plan or Save & test.
- Auto-import and study plans send the outline text to that provider. Lecture
  file text is sent only when **Let AI read course files** is on; otherwise just
  the file names are included. Turn the setting off and the AI feature still
  works from the outline alone.
- The Google iCal address and the Notion token are stored in the same
  `config.json` and are never sent back to the interface — Settings only ever
  sees the calendar or database name and the sync status. The local server
  calls Google or Notion directly; nothing goes through a middleman.
- Removing a connection deletes its stored address or token.
- No analytics, no tracking, and no Freebuff server in the middle. Without an AI
  key, nothing you do in the app leaves this computer.

## Layout

```
server/
  index.ts    Express API (state, connect, dashboard, course, image proxy,
              integrations, preferences)
  d2l.ts      sign-in window, session storage, dashboard + course loading
  d2l-api.ts  Brightspace endpoints → courses, events, whoami, banner images
  parse.ts    Brightspace HTML → courses, events, announcements, assignments,
              content modules/topics, gradebook
  demo.ts     sample data for the --demo preview only
  library.ts  downloads files into Content Space and serves them locally
  exambank.ts reads the public MUES Drive folder listing
  course-form.ts  course-outline PDF/text → dated assessments for the Calendar
  ai.ts       the user's own Gemini/OpenAI/Claude key and provider calls
  outlines.ts finds outlines in course files and asks the AI for their dates
  study.ts    outline + lecture files → a study plan and practice questions
  config.ts   config.json read/write in the app data folder
  chrome.ts   locate installed Chrome/Edge/Chromium on Windows, macOS or Linux
  integrations.ts  Google iCal parsing + Notion database reads, with a cache
                   and the past/future window both feeds are trimmed to
electron/
  main.mjs    desktop shell: picks a free port, starts the API, opens the window
scripts/
  build-server.mjs  bundles server/ into dist-server/index.mjs (esbuild)
  make-icon.mjs     generates build/icon.png
shared/
  types.ts      API types
  categorize.ts term/subject parsing, grouping, subject colors
src/
  App.tsx     views, filtering, state
  components/ sidebar, top bar, course cards, course page, up-next, today card,
              calendar (week grid + deadline list), event dialog, connect
              dialog, settings dialog, backdrop, content space, exam bank,
              PDF reader
  lib/schedule.ts     week math, class-block layout and overlapping columns
  lib/preferences.ts  accent + backdrop catalogs and the theme applier
  lib/format.ts       dates, relative labels and the urgency colours
  lib/pdf-polyfills.ts Uint8Array helpers pdf.js needs on older Chromium
  lib/google-calendar.ts prefilled Google Calendar hand-off links
tests/        parser, integration, course page and categorization tests (vitest)
```

## Scripts

| Script              | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | API on :8787 + Vite with HMR on :5173            |
| `npm run build`     | Build the frontend into `dist/`                  |
| `npm start`         | Serve the API and the built frontend on :8787    |
| `npm test`          | Parser, calendar layout and categorization tests |
| `npm run typecheck` | TypeScript for the app and the server            |
| `npm run desktop`   | Build and run the desktop app from source        |
| `npm run icon`      | Regenerate `build/icon.png`                      |
| `npm run dist:win:dir` | Build only `release/win-unpacked` (no installer) |
| `npm run dist:win`  | Build Windows installer + portable exe           |
| `npm run dist:mac`  | Build macOS `.dmg` (x64 + arm64)                 |
| `npm run dist:linux` | Build Linux `.AppImage` + `.deb`                |

## Desktop app

The whole app is now a packaged desktop program: the Express API runs inside an
Electron process on a free loopback port, and the built UI is loaded from the
app folder. Nothing is exposed on the network, and each person signs in through
their own browser on their own machine.

```bash
npm install
npm run desktop        # run it without packaging
npm run dist:win:dir   # rebuild release/win-unpacked only
npm run dist:win       # or dist:mac / dist:linux
```

To test a change on Windows without installing anything, double-click
[run-test-build.cmd](run-test-build.cmd). It rebuilds `release/win-unpacked` and
opens it. The unpacked copy uses the same app data as the installed app, so a
D2L sign-in carries over. Close D2L Hub before rebuilding: Windows locks the
files while it runs, and a rebuild then leaves `win-unpacked` incomplete.

Installers land in `release/`:

| Platform | Artifacts                                                    |
| -------- | ------------------------------------------------------------ |
| Windows  | `D2L Hub-<version>-setup-x64.exe`, `…-portable-x64.exe`        |
| macOS    | `D2L Hub-<version>-mac-x64.dmg`, `…-mac-arm64.dmg`             |
| Linux    | `D2L Hub-<version>-linux-<arch>.AppImage`, `…-<arch>.deb`      |

Gotchas worth knowing before you ship builds:

- **Build each OS on that OS.** electron-builder cannot cross-compile a macOS
  dmg (it needs macOS and, for signing, Xcode) or a Linux deb from Windows in
  general. Each target in `electron-builder.yml` is already configured; run the
  matching `dist:*` script on that platform. [.github/workflows/build.yml](.github/workflows/build.yml)
  does this already — trigger it manually or push a `v*` tag and download the
  three builds from the run's artifacts.
- **The builds are unsigned.** Windows shows a SmartScreen warning and macOS
  blocks the first launch until you right-click → Open. To remove that you need
  a Windows code-signing certificate (`CSC_LINK` / `CSC_KEY_PASSWORD`) and an
  Apple Developer ID plus notarization (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_TEAM_ID`). Set them as env vars before `npm run dist:*`; nothing else
  in the config needs to change.
- **A Chromium browser must be installed** on the machine (Chrome, Chromium,
  Edge or Brave). The app finds it automatically per platform and accepts
  `CHROME_PATH` as an override. macOS builds need `arm64` for Apple Silicon and
  `x64` for Intel — both targets are listed.
- **Data lives in the OS app folder**, not next to the executable:
  `%APPDATA%\D2L Hub\data` on Windows, `~/Library/Application Support/D2L Hub/data`
  on macOS, `~/.config/D2L Hub/data` on Linux.
- The packaged app is unpacked (`asar: false`) on purpose: the API is loaded as
  a real ES module from disk, which keeps Node's loader away from asar paths.

## Releases and updates

The installed app updates itself from **GitHub Releases**. Five seconds after
launch (and every four hours) it reads the `latest.yml` published for the
`publish` feed in `electron-builder.yml`. A newer version downloads quietly in
the background, then a dialog offers **Restart now** or **Later**; choosing
Later installs it the next time the app quits.

To ship a version:

1. Raise `version` in `package.json` — it must be higher than the published one,
   or nobody is offered the update.
2. Publish a GitHub Release containing the installer and `latest.yml`.
   electron-builder does both in one step:

   ```bash
   npm run build
   npx electron-builder --win -c.electronDist=node_modules/electron/dist --publish always
   ```

   Set `GH_TOKEN` to a token with access to the repository first. The draft
   release can be reviewed before it is published; once it is live, installed
   copies pick it up on their next check.
3. Keep `publish.owner` and `publish.repo` in `electron-builder.yml` matching the
   repository that holds the releases.

Things that matter for updates:

- Only the **installed NSIS build** can update itself. `win-unpacked` and the
  portable exe have no installation to replace.
- Release assets must be publicly reachable. A private repository would need a
  token shipped inside the app, so updates assume a public repository (or public
  release assets).
- macOS updates need a signed and notarized app; unsigned DMGs cannot update
  themselves. AppImage builds can.
- Updates still work on unsigned Windows builds, but every new installer may
  show SmartScreen once.

## Ideas for the next pass

- A full grades view per course, and a combined "all courses" work list
- Custom categories you can name, reorder and drag courses into
- A proper "today" agenda, deadline reminders, and a compact widget mode
- A light theme option, and per-card background images from D2L
- Shareable themes (export a preset as a file) and local image files instead of
  pasted links
