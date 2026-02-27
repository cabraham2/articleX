# Architecture

## Pipeline

1. Parse status ID from the X URL.
2. Request normalized content payloads from supported sources.
3. Normalize source payload to an internal rendering model.
4. Build print-friendly HTML with metadata, text blocks, and media.
5. Render HTML to PDF with Playwright Chromium.

## Main components

- `start`: bootstrap script for setup + run
- `src/x-thread-to-pdf.mjs`: core CLI

## Key functions

- `parseStatusId`: extract post ID from URL path
- `resolveTweetData`: fallback source resolution
- `renderArticleBlocks`: map structured blocks to HTML
- `buildHtmlDocument`: create final printable HTML
- `htmlToPdf`: render HTML into A4 PDF

## Data flow (logical)

```text
X URL
  -> parse status id
  -> fetch source payload (retry + fallback)
  -> normalize model
  -> render HTML
  -> generate PDF
```
