# Usage Reference

## CLI syntax

```bash
./start <x_url> [output.pdf]
```

Equivalent direct command:

```bash
node ./src/x-thread-to-pdf.mjs <x_url> [output.pdf]
```

## Arguments

- `<x_url>`: a public X URL containing `/status/<id>`
- `[output.pdf]`: optional custom output path

## Examples

### Export with default filename

```bash
./start "https://x.com/TheVixhal/status/2026002315371745671"
```

Expected output:

```bash
./x-2026002315371745671.pdf
```

### Export to custom path

```bash
./start "https://x.com/wickedguro/status/2025967492359913862" "./out/wickedguro.pdf"
```

### Help

```bash
./start --help
node ./src/x-thread-to-pdf.mjs --help
```

## Conversion behavior

- Retries are applied for remote fetch failures.
- Source fallback order: `fxtwitter` then `vxtwitter` then `oEmbed`.
- Article media is rendered inline when mapping data is available.
