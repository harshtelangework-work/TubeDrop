# TubeDrop

Electron desktop app for downloading YouTube videos with automatic
video+audio merging via a bundled FFmpeg and bundled yt-dlp — no Node.js,
Python, or FFmpeg installation required on the end user's machine.

## Project layout

```
TubeDrop/
├─ main.js               Electron entry point. Starts the backend in-process,
│                         creates the window, wires up IPC handlers.
├─ preload.js             contextBridge API exposed to the renderer (unchanged)
├─ index.html/.js/.css    UI (unchanged, as requested)
├─ settings.js            Persisted user settings (download folder, etc.)
├─ server/
│  ├─ index.js            Express + Socket.IO layer. Runs on http://localhost:3000
│  │                      so the browser extension keeps working. No longer a
│  │                      separate process — required directly by main.js.
│  ├─ backend.js          The actual analyze/download/cancel pipeline. Used
│  │                      identically by Electron's IPC handlers and by the
│  │                      HTTP routes, so there's exactly one implementation.
│  ├─ ffmpeg.js           Resolves the bundled ffmpeg.exe (dev vs. packaged)
│  ├─ ytdlp.js            Resolves the bundled yt-dlp.exe (dev vs. packaged)
│  ├─ ytdlp-runner.js     Thin child_process wrapper around yt-dlp.exe
│  └─ extension/          Optional Chrome extension (not packaged into the app)
├─ ffmpeg/                Bundled ffmpeg.exe + ffprobe.exe (dev mode location)
├─ ytdlp/                 Bundled yt-dlp.exe (dev mode location)
└─ build/TubeDrop.ico     App/installer icon
```

In a packaged build, `ffmpeg/` and `ytdlp/` are copied to
`resources/ffmpeg` and `resources/ytdlp` (see `extraResources` in
`package.json`), and `server/ffmpeg.js` / `server/ytdlp.js` automatically
detect whichever location exists.

## Running in development

```bash
npm install
npm start
```

No separate "run the server" step — Electron starts it automatically when
the app launches, and stops it when the app quits.

## Building the Windows installer

```bash
npm install
npm run dist:win
```

This produces `dist/TubeDrop Setup.exe` — a normal NSIS installer with a
desktop shortcut, Start Menu shortcut, and the TubeDrop icon (not the
default Electron icon).

**Note:** producing the final signed `.exe` requires either a real Windows
machine or a CI runner with `wine` available (building a Windows installer
with an embedded custom icon on Linux/macOS requires wine to run
`rcedit`/`signtool`). The packaging config itself was verified end-to-end
in a Linux container — `dist/win-unpacked/TubeDrop.exe` builds correctly
with `resources/ffmpeg` and `resources/ytdlp` bundled — but the last
icon-embedding step needs an actual Windows environment or CI to finish
cleanly.

### Building via GitHub Actions (no Windows machine needed)

`.github/workflows/build-windows.yml` is included and ready to use:

1. Push this project to a GitHub repository.
2. Go to the repo's **Actions** tab — the workflow runs automatically on
   pushes to `main`, or click **Run workflow** to trigger it manually.
3. It checks out the code on a real `windows-latest` runner, runs
   `npm ci && npm run dist:win`, and uploads `TubeDrop Setup.exe` as a
   downloadable build artifact on the completed run's summary page.

No local Windows machine, VM, or Wine setup required — GitHub provides the
Windows environment.

## Notes on files removed from the original project

- `server/cookies.txt` — removed. It wasn't referenced anywhere in the
  code, and appeared to contain a real exported YouTube cookie/session
  file. Worth mentioning in case you didn't intend to include it: treat it
  as sensitive and don't commit it to any repository.
- `audio.mp4` / `video.mp4` — removed. Unused leftover test files (only
  `warning.mp4` is referenced by `index.html`).
- Duplicate `server/package.json` / `server/package-lock.json` — merged
  into the single root `package.json`.

[![Hits](https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2Fharshtelangework-work%2FTubeDrop&count_bg=%2379C83D&title_bg=%23555555&icon=&icon_color=%23E7E7E7&title=hits&edge_flat=false)](https://hits.seeyoufarm.com)
