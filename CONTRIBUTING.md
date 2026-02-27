# Contributing

Thanks for contributing to `x-thread-to-pdf`.

## Development workflow

1. Fork the repository.
2. Create a feature branch.
3. Implement your changes with focused commits.
4. Run checks locally.
5. Open a Pull Request with a clear description.

## Local setup

```bash
npm install
npx playwright install chromium
npm run check
```

## Branch naming

Use descriptive branch names:

- `feat/inline-media-order`
- `fix/oembed-timeout`
- `docs/readme-refresh`

## Commit messages

Use clear commit messages, for example:

- `feat: improve inline media mapping in article blocks`
- `docs: add architecture and troubleshooting guides`

## Pull Request checklist

- [ ] The change is scoped and documented.
- [ ] `npm run check` passes.
- [ ] No secrets or generated artifacts are committed.
- [ ] README or docs were updated when behavior changed.

## Security and privacy

Please do not include credentials, private links, or sensitive data in issues or PRs.
