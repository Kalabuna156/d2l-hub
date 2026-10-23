# D2L Hub on a Mac — start here

D2L Hub is a desktop dashboard for Brightspace (D2L). This folder is the app's
source code, ready to build on macOS. Nothing is pre-built: the first run
downloads what it needs (about 300 MB, mostly the Electron runtime), then the
app opens like any other Mac program.

You need:

- macOS 12 or newer (Intel or Apple Silicon both work)
- **Node.js 22 LTS** — <https://nodejs.org> (already have it? `node -v` in Terminal)
- **Google Chrome**, Chromium, Edge or Brave — the app reuses it for the D2L
  sign-in. Chrome is the safest choice.
- ~1 GB of free disk space

## 1. Install Node.js

Download the **LTS** installer from <https://nodejs.org> and run it. Check it in
Terminal:

```bash
node -v      # v22.x.x or newer is good
```

## 2. Unzip this folder

Put it somewhere easy, for example your Desktop, so the path is
`~/Desktop/D2L Hub for macOS`.

## 3. Start the app

Open **Terminal**, then run these two lines (the quotes matter because the
folder name has spaces):

```bash
cd ~/Desktop/"D2L Hub for macOS"
chmod +x *.command
bash "./Run app.command"
```

`chmod` is needed once because zip files lose the "runnable" flag when they
come from Windows; after that you can also double-click **Run app.command** in
Finder. (If macOS still refuses, right-click → Open.)

The first run installs dependencies and builds the app — expect a few minutes,
including a ~120 MB Electron download. After that the D2L Hub window opens.
Keep the Terminal window open while you use the app; closing the app ends the
script.

## 4. Connect your D2L account

1. In the app, click **Connect** (bottom-left, or Settings → D2L address).
2. Type your school's Brightspace address, e.g. `https://courses.torontomu.ca`.
3. A Chrome window opens — sign in there like you normally do.
4. Come back to D2L Hub; it says **Live D2L session** when the cookies are in.

Your password never touches the app: it only keeps the session cookies on your
Mac, in `~/Library/Application Support/D2L Hub/data`.

## 5. Try it

- **Overview** — today's classes and what's due soon.
- **Courses** — every course as a card.
- **Content Space** — open a course → **Content**, hover a file and press the
  download arrow. It lands in Content Space, grouped into chapters. **View**
  opens PDFs in the app; **Show in folder** opens it in Finder with the real
  file name, ready to share.
- **Calendar** — **Import outline** reads a course PDF on your Mac. **Auto-import**
  finds every course outline and reads it with your own AI key (Settings → AI).
- **Study** — pick an upcoming quiz, midterm or assignment to get a focused plan,
  textbook practice, practice questions and the course files you need. Lecture
  file text is only sent to the AI if you turn on **Let AI read course files**.
- **Exam bank** — optional.

## 6. Make installers for other people (optional)

```bash
npm run dist:mac
```

or double-click **Build installers.command** (already marked runnable by the
`chmod` above). After a few minutes `release/`
opens in Finder with:

- `D2L Hub-0.1.1-mac-arm64.dmg` — Apple Silicon (M1–M4)
- `D2L Hub-0.1.1-mac-x64.dmg` — Intel Macs

Those DMGs are unsigned, so the person receiving one must **right-click the app
→ Open** the first time (or allow it under System Settings → Privacy & Security).

## Building inside a macOS virtual machine (VM)

Everything above works the same inside a macOS VM. Three things to get right:

1. **Install inside the VM, not just on the host.** Node LTS *and* a Chromium
   browser (Chrome, Chromium, Edge or Brave) must exist in the VM. The app reuses
   that browser for the D2L sign-in; Safari is not used.
2. **Copy this folder into the VM** (shared folder, drag-and-drop, or `scp`), then
   run `chmod +x *.command` once before double-clicking anything.
3. **Check the architecture with `uname -m`.** On `arm64` both DMGs build and the
   arm64 one runs in the VM; on `x86_64` the x64 DMG is the one you can launch.
   The other architecture still builds (cross-arch packaging works), it just
   cannot be opened inside that VM.

An emulated Intel VM is slow at this: allow 15–45 minutes for `dist:mac`
instead of ~3.

Fastest way to test inside a VM is to skip the DMG for now:

```bash
npm ci && npm test && npm run desktop
```

Then, once you want the real installer, build it and test the installed copy:

```bash
bash "./Build installers.command"     # writes release/*.dmg and opens the folder
```

```bash
# after dragging D2L Hub into Applications:
open "/Applications/D2L Hub.app"
xattr -cr "/Applications/D2L Hub.app"   # only if macOS says the app is "damaged"
```

Remember the VM has its own Chrome profile, so it needs its own **Connect** →
D2L sign-in. Files you download land in the VM's
`~/Library/Application Support/D2L Hub/data`.

If you hand this folder to an AI coding chat running *inside* the VM, this is
the whole prompt:

> Build and test this Electron app on macOS: run `npm ci`, then
> `npm run typecheck && npm test`, then `npm run desktop` to launch it. Fix any
> macOS-only problems you hit (Chrome detection, codesign/xcrun, path casing)
> and then run `npm run dist:mac` to produce both DMGs in `release/`.

## If something goes wrong

| Message | Fix |
| --- | --- |
| `npm ci` fails, `Unsupported engine` | Node is too old — install Node 22 LTS from nodejs.org |
| `codesign` / signing error | Install Apple's command line tools: `xcode-select --install` |
| `xcrun: error: invalid active developer path` | Same fix: `xcode-select --install` |
| "App can't be opened because it is from an unidentified developer" | Right-click the app → **Open** (only needed for the DMGs, not the run script) |
| "D2L Hub is damaged and can't be opened" | Run `xattr -cr "/Applications/D2L Hub.app"`, then open it again |
| `release/mac-arm64` missing after a build | Check `uname -m`; cross-arch targets still appear under `release/`, see the VM section |
| macOS refuses to open a `.command` file | Right-click it → **Open**, or run `xattr -dr com.apple.quarantine "D2L Hub for macOS"` in Terminal, or just use `bash "./Run app.command"` |
| "No Chromium browser found" | Install Google Chrome, or set `CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Wrong school / stuck login | Settings → disconnect, then Connect again |

Want a clean slate? Quit the app and delete
`~/Library/Application Support/D2L Hub`. Nothing is stored anywhere else.

## Optional: check the build yourself

```bash
npm test          # 71 tests
npm run typecheck # TypeScript for app + server
```
