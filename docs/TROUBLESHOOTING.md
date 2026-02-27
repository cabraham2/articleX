# Troubleshooting

## `fetch failed` or DNS errors

Possible causes:

- temporary network/DNS issues
- mirror endpoint outage
- restricted environment

What to do:

1. Retry the same command.
2. Validate URL is public and still online.
3. Check outbound network access from your shell.

## Playwright browser install failure

If browser download fails, run:

```bash
npx playwright install chromium
```

If your environment blocks user cache directories, use:

```bash
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers"
npx playwright install chromium
```

## URL parsing errors

Expected format includes `/status/<id>`, for example:

```text
https://x.com/username/status/2026002315371745671
```

## Security notes

- Never commit `.env`, `.env.*`, API keys, or tokens.
- Generated PDFs may contain sensitive source content. Review before sharing.
