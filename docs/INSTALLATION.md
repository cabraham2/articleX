# Installation

## Requirements

- Node.js `>= 20`
- npm `>= 10`
- macOS or Linux shell environment

## Option A: auto-bootstrap (recommended)

`./start.sh` checks dependencies, installs missing packages, installs Playwright Chromium if needed, and runs conversion.

```bash
./start.sh "https://x.com/TheVixhal/status/2026002315371745671"
```

## Option B: manual setup

```bash
npm install
npx playwright install chromium
```

Then run:

```bash
node ./src/x-thread-to-pdf.mjs "https://x.com/TheVixhal/status/2026002315371745671"
```

## Notes

- Browser binaries are stored in `.playwright-browsers/` by `./start.sh`.
- This folder is ignored by git and should not be committed.
