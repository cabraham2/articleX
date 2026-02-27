# Usage Reference

## CLI syntax

```bash
./start.sh <x_url|input.txt|liste> [autres_urls_ou_fichiers...] [--out-dir output] [--output fichier.pdf]
```

Equivalent direct command:

```bash
node ./src/x-thread-to-pdf.mjs <x_url|input.txt|liste> [autres_urls_ou_fichiers...] [--out-dir output] [--output fichier.pdf]
```

## Arguments

- `<x_url>`: a public X URL containing `/status/<id>`
- `input.txt`: file containing URLs (spaces, commas, new lines accepted)
- `--out-dir`: output directory for generated PDFs (default: `output`)
- `--output`: custom output PDF path (single URL only)

## Examples

### Export with default filename

```bash
./start.sh "https://x.com/TheVixhal/status/2026002315371745671"
```

Expected output:

```bash
./output/x-2026002315371745671.pdf
```

### Export multiple URLs in one command

```bash
./start.sh "https://x.com/TheVixhal/status/2026002315371745671" "https://x.com/wickedguro/status/2025967492359913862"
```

### Export from input file

```bash
./start.sh ./links.txt
```

### Export with custom output file (single URL)

```bash
./start.sh "https://x.com/wickedguro/status/2025967492359913862" --output "./output/wickedguro.pdf"
```

### Help

```bash
./start.sh --help
node ./src/x-thread-to-pdf.mjs --help
```

### Interactive prompt

```bash
./start.sh
```

If no argument is provided, the script asks for one or more URLs (or a `.txt` file path).

## Conversion behavior

- Retries are applied for remote fetch failures.
- Source fallback order: `fxtwitter` then `vxtwitter` then `oEmbed`.
- Article media is rendered inline when mapping data is available.
