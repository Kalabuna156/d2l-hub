# D2L Hub for Android

A native Android client for D2L / Brightspace with the same dark dashboard look as the desktop app. It talks to your school's Brightspace directly — there is no D2L Hub server in the middle.

## What this first build includes

- Sign-in through your school's own Brightspace page in an in-app WebView. Only the D2L session cookie is kept, encrypted on the device (Android Keystore).
- Dashboard: next deadline, the next seven days, overdue count and course shortcuts — D2L only, so it stays readable.
- Calendar: one Google-style calendar for D2L deadlines (including imported outlines), Google Calendar classes and Notion entries. **Day**, **3 days**, **Week** and **Month** switch the range; Month stacks coloured events under every day like Google Calendar, and tapping a day opens its full list. The D2L, Google and Notion chips can be unchecked to hide a source, the arrows move by the selected range, and **Today** jumps back.
- Course outlines: upload a PDF or text outline from a course's Import button (or Courses → Import), review the dates found, and import them. A basic reader works offline; an optional AI key handles messy tables.
- Courses: searchable course grid, plus per-course announcements, due dates, content modules and the gradebook. Topics and graded items open in D2L with the saved session. Pull down on the Content or Grades list to refresh it without leaving the course.
- Content Space: tap **↓** on a content topic to copy the file to the phone. Saved files are grouped by course and open in the phone's document viewer. The Courses screen has a Content Space shortcut.
- Exam bank: browse the public MUES Google Drive archive, open papers in the browser or save them to Content Space. The Courses screen has an Exam bank shortcut.
- Save for offline: in a course's Content tab, **Save N files for offline** downloads every file in the open module that is not in Content Space yet, one at a time, and skips pages such as links and quizzes. **Stop** finishes the file in progress and keeps what already downloaded.
- PDF reader: a PDF saved in Content Space opens in a built-in dark reader. Pages sit in one continuous list, so scrolling moves into the next page; a page counter follows along. **−** and **+** zoom from 100% to 200% with sideways panning, **Fit** returns to the width, and **Invert** flips the page to white-on-black (remembered for the next PDF). Other file types still open in the phone's document app.
- Download notification: a silent progress bar in the notification shade shows the current file and how many are left, then turns into a dismissible summary that opens the app. Android 13+ asks once for permission; the Downloads channel can be silenced in system settings without affecting anything else.
- Notifications bell: the bell in the top bar counts unread course announcements. The panel lists the five newest, newest first, with course, time, refresh and "mark all as read"; **Load more** adds five at a time up to 80. Tapping an update opens it in D2L with the saved session. Tap outside the panel, its **×** or the phone's back button to close. Read state stays on the phone (ids and a timestamp only).
- Google Calendar: connect one calendar through its private iCal address and see its classes and events on the Calendar tab, coloured blue and filterable like every other source.
- Notion: connect an internal integration, pick one shared database, and merge its dated entries into the Calendar tab with D2L and Google.
- In-app D2L links that reuse the saved session.
- Appearance: six original backdrops (including a yellow-and-red Voltage theme) or any photo from the gallery, dimmed for readability and kept on the phone.
- Settings: connected apps, an optional AI provider for outlines, background choice, refresh, sign out, version and privacy notes.

## What it does not include yet

This is not full desktop parity. Still missing: the schedule builder, AI study tools, deadline reminders, widgets and offline caching of D2L pages. There is deliberately no AI study section — the phone app focuses on schedules, courses, saved files and past exams.

## Build

Requirements: JDK 17 and Android SDK 35.

```bash
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest      # JVM tests for the parsers, calendar ranges, the offline queue, the exam bank and notifications
./gradlew lintDebug
```

`local.properties` must point at your SDK (`sdk.dir=...`). Builds on Windows, macOS and Linux.

The debug APK is signed with the standard Android debug key, which is fine for sideloading and testing. A Play Store or public release needs your own signing key; do not lose it, or installed copies cannot be updated in place.

## Install

Copy the APK to the phone and open it (allow installs from this source when prompted), or use `adb install -r D2L-Hub-0.1.1-android.apk`. Android 8.0 (API 26) or newer is required.

## Connecting calendars

**Google Calendar** — in Google Calendar open Settings → the calendar → “Secret address in iCal format”, then paste that `https://…/basic.ics` link into D2L Hub. The feed is read-only; the app never asks for a Google password. Only that one calendar is read.

**Notion** — create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations), share the database that holds your deadlines with it, then paste the Internal Integration Secret in the app and pick the database from the list. The database needs a date property; entries are read-only. If the list is empty, the database has not been shared with the integration yet.

Both connections can be removed from Settings → Connected apps. Removing one deletes only the saved link/token on the phone.

## Importing due dates from an outline

Open a course and tap **Import** at the top right, or open **Courses** and tap **Import** to choose a course first. Pick a PDF, TXT or Markdown file. The app reads the text on the phone and lists the dated assessments it found. Tick the ones you want and tap **Add dates**; they appear in the course, the home dashboard and the Calendar agenda with an `Outline` tag. The same button is also at the top of a course's Due dates tab.

Without an AI key the basic reader looks for lines containing assessment words and a date. For messy tables, outlines with several dates in one cell, or awkward layouts, add your own key in **Settings → AI**: Google Gemini, OpenAI, Anthropic Claude, or any OpenAI-compatible endpoint. If the chosen model is busy, retired or rate-limited, the app automatically tries other models from that provider — and for Gemini it asks Google which other text models the key can use. The extracted text is sent only to that provider, only when you import an outline, using your own credits. Scanned images without a text layer cannot be read; export the outline as a digital PDF or text file first.

## Privacy

The password is typed into your school's page and never read by the app. The session cookie, the Google Calendar iCal link, the Notion token and any AI key are stored in encrypted preferences on the phone (Android Keystore) and are only sent to their own services — your school's Brightspace host, Google's calendar feed, `api.notion.com`, or the AI provider you chose. A background photo you pick is copied into the app's private storage, downscaled there, and never uploaded. Outline files are read on the phone; their text goes to the AI provider only when an AI key is configured and you import an outline. The notifications bell reads the same course announcement pages as the course tabs and keeps only read ids, never announcement text. Signing out deletes the D2L cookie; disconnecting an app deletes its link or token; removing the AI key deletes only that key. Course files you download and exam papers you save stay in the app's private storage on the phone; removing one deletes that local copy, never the D2L or Drive original.
