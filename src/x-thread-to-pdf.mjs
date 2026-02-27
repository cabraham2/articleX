#!/usr/bin/env node

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const API_TIMEOUT_MS = 20000;
const API_RETRIES = 3;

function usage() {
  console.log(
    [
      "Usage:",
      "  x-thread-to-pdf <x_url> [output.pdf]",
      "",
      "Examples:",
      "  x-thread-to-pdf https://x.com/TheVixhal/status/2026002315371745671",
      "  x-thread-to-pdf https://x.com/wickedguro/status/2025967492359913862 out/article.pdf"
    ].join("\n")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(dateString) {
  if (!dateString) {
    return "";
  }
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short"
  });
}

function parseStatusId(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("URL invalide. Exemple attendu: https://x.com/user/status/1234567890");
  }

  const statusMatch = url.pathname.match(/status\/(\d+)/i);
  if (!statusMatch) {
    throw new Error("Impossible de trouver l'identifiant du status dans l'URL X.");
  }
  return statusMatch[1];
}

function outputPathFromStatusId(statusId, outputArg) {
  if (outputArg) {
    return outputArg;
  }
  return path.resolve(process.cwd(), `x-${statusId}.pdf`);
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "x-thread-to-pdf/1.0"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetries(url, retries = API_RETRIES, timeoutMs = API_TIMEOUT_MS) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fetchJson(url, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(attempt * 400);
      }
    }
  }
  throw lastError;
}

function mediaUrlFromEntity(entity) {
  if (!entity || typeof entity !== "object") {
    return null;
  }
  const info = entity.media_info ?? {};
  if (typeof info.original_img_url === "string" && info.original_img_url.length > 0) {
    return info.original_img_url;
  }
  const variants = Array.isArray(info.variants) ? info.variants : [];
  if (variants.length > 0) {
    const sorted = variants
      .filter((variant) => typeof variant.url === "string")
      .sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0));
    if (sorted[0]?.url) {
      return sorted[0].url;
    }
  }
  return null;
}

function buildBoldMask(text, inlineStyleRanges) {
  const mask = Array.from({ length: text.length }, () => false);
  for (const range of inlineStyleRanges ?? []) {
    const style = String(range?.style ?? "");
    if (style.toLowerCase() !== "bold") {
      continue;
    }
    const start = Math.max(0, Number(range.offset ?? 0));
    const end = Math.min(text.length, start + Math.max(0, Number(range.length ?? 0)));
    for (let i = start; i < end; i += 1) {
      mask[i] = true;
    }
  }
  return mask;
}

function renderStyledText(text, inlineStyleRanges) {
  const safeText = String(text ?? "");
  if (!safeText) {
    return "";
  }
  const boldMask = buildBoldMask(safeText, inlineStyleRanges);
  let html = "";
  let inBold = false;
  for (let i = 0; i < safeText.length; i += 1) {
    if (boldMask[i] && !inBold) {
      html += "<strong>";
      inBold = true;
    } else if (!boldMask[i] && inBold) {
      html += "</strong>";
      inBold = false;
    }
    html += escapeHtml(safeText[i]);
  }
  if (inBold) {
    html += "</strong>";
  }
  return html;
}

function renderAtomicEntities(entityRanges, entityMap, mediaById, usedMediaIds) {
  const htmlParts = [];
  const mediaEntries = Array.from(mediaById.values());

  function resolveMediaFromEntity(entity) {
    const mediaItem = entity?.data?.mediaItems?.[0] ?? {};
    const candidates = [
      mediaItem?.mediaId,
      mediaItem?.media_id,
      mediaItem?.id,
      mediaItem?.localMediaId
    ]
      .map((id) => (id == null ? "" : String(id)))
      .filter(Boolean);

    for (const candidate of candidates) {
      const media = mediaById.get(candidate);
      if (media) {
        return media;
      }
    }

    // Fallback: place the next not-yet-used media at this atomic position.
    for (const media of mediaEntries) {
      const mediaId = String(media?.media_id ?? media?.id ?? "");
      if (!mediaId || usedMediaIds.has(mediaId)) {
        continue;
      }
      return media;
    }
    return null;
  }

  for (const range of entityRanges ?? []) {
    const key = String(range?.key ?? "");
    const entity = entityMap.get(key);
    if (!entity) {
      continue;
    }
    const entityType = String(entity.type ?? "").toUpperCase();
    if (entityType === "MEDIA") {
      const media = resolveMediaFromEntity(entity);
      const url = mediaUrlFromEntity(media);
      if (url) {
        const mediaId = String(media?.media_id ?? media?.id ?? "");
        if (mediaId) {
          usedMediaIds.add(mediaId);
        }
        const caption = entity?.data?.caption ? `<figcaption>${escapeHtml(entity.data.caption)}</figcaption>` : "";
        htmlParts.push(`<figure><img src="${escapeHtml(url)}" alt="media" loading="eager" />${caption}</figure>`);
      }
      continue;
    }
    if (entityType === "MARKDOWN") {
      const markdown = String(entity?.data?.markdown ?? "").trim();
      if (markdown) {
        htmlParts.push(`<pre>${escapeHtml(markdown)}</pre>`);
      }
      continue;
    }
    if (entityType === "LINK") {
      const url =
        entity?.data?.url ??
        entity?.data?.urls?.[0]?.url ??
        entity?.data?.urls?.[0]?.expanded_url;
      if (typeof url === "string" && url.length > 0) {
        const safeUrl = escapeHtml(url);
        htmlParts.push(
          `<p><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a></p>`
        );
      }
    }
  }
  return htmlParts.join("\n");
}

function normalizeEntityMap(entityMapRaw) {
  const normalized = new Map();

  if (Array.isArray(entityMapRaw)) {
    for (const [index, entry] of entityMapRaw.entries()) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(entry, "key") && Object.prototype.hasOwnProperty.call(entry, "value")) {
        normalized.set(String(entry.key), entry.value);
        continue;
      }
      normalized.set(String(index), entry);
    }
    return normalized;
  }

  if (entityMapRaw && typeof entityMapRaw === "object") {
    for (const [key, value] of Object.entries(entityMapRaw)) {
      normalized.set(String(key), value);
    }
  }

  return normalized;
}

function renderArticleBlocks(content, mediaEntities) {
  const blocks = Array.isArray(content?.blocks) ? content.blocks : [];
  const entityMap = normalizeEntityMap(content?.entityMap);
  const mediaById = new Map();
  for (const entity of mediaEntities ?? []) {
    const ids = [entity?.media_id, entity?.id, entity?.media_key]
      .map((id) => (id == null ? "" : String(id)))
      .filter(Boolean);
    for (const id of ids) {
      mediaById.set(id, entity);
    }
  }
  const usedMediaIds = new Set();
  const htmlParts = [];

  let listType = null;
  function closeList() {
    if (listType === "ul") {
      htmlParts.push("</ul>");
    } else if (listType === "ol") {
      htmlParts.push("</ol>");
    }
    listType = null;
  }

  for (const block of blocks) {
    const type = String(block?.type ?? "");
    const text = String(block?.text ?? "");
    const styled = renderStyledText(text, block?.inlineStyleRanges);

    if (type === "unordered-list-item") {
      if (listType !== "ul") {
        closeList();
        htmlParts.push("<ul>");
        listType = "ul";
      }
      htmlParts.push(`<li>${styled}</li>`);
      continue;
    }

    if (type === "ordered-list-item") {
      if (listType !== "ol") {
        closeList();
        htmlParts.push("<ol>");
        listType = "ol";
      }
      htmlParts.push(`<li>${styled}</li>`);
      continue;
    }

    closeList();

    if (type === "header-one") {
      htmlParts.push(`<h1>${styled}</h1>`);
      continue;
    }
    if (type === "header-two") {
      htmlParts.push(`<h2>${styled}</h2>`);
      continue;
    }
    if (type === "atomic") {
      const atomicHtml = renderAtomicEntities(block?.entityRanges, entityMap, mediaById, usedMediaIds);
      if (atomicHtml) {
        htmlParts.push(atomicHtml);
      }
      continue;
    }

    if (styled.trim().length > 0) {
      htmlParts.push(`<p>${styled}</p>`);
    }
  }

  closeList();

  const remainingMedia = [];
  for (const entity of mediaEntities ?? []) {
    const id = String(entity?.media_id ?? "");
    if (!id || usedMediaIds.has(id)) {
      continue;
    }
    const url = mediaUrlFromEntity(entity);
    if (url) {
      remainingMedia.push(`<figure><img src="${escapeHtml(url)}" alt="media" loading="eager" /></figure>`);
    }
  }
  if (remainingMedia.length > 0) {
    htmlParts.push("<h2>Media</h2>");
    htmlParts.push(...remainingMedia);
  }

  return htmlParts.join("\n");
}

function normalizeFxPayload(payload) {
  if (!payload || payload.code !== 200 || !payload.tweet) {
    return null;
  }
  const tweet = payload.tweet;
  const article = tweet.article ?? null;

  const authorName = tweet.author?.name ?? "";
  const authorHandle = tweet.author?.screen_name ? `@${tweet.author.screen_name}` : "";
  const title = article?.title ?? `Post ${tweet.id ?? ""}`;
  const coverImage = mediaUrlFromEntity(article?.cover_media);
  const mediaEntities = Array.isArray(article?.media_entities) ? article.media_entities : [];
  const articleHtml = article
    ? renderArticleBlocks(article?.content, mediaEntities)
    : "";

  const textSource = tweet.text || tweet.raw_text?.text || "";
  const text = String(textSource).trim();
  return {
    source: "fxtwitter",
    canonicalUrl: tweet.url ?? "",
    title,
    authorName,
    authorHandle,
    createdAt: tweet.created_at ?? "",
    text,
    coverImage,
    articleHtml
  };
}

function normalizeVxPayload(payload) {
  if (!payload || typeof payload !== "object" || !payload.tweetID) {
    return null;
  }
  const article = payload.article ?? null;
  const mediaURLs = Array.isArray(payload.mediaURLs) ? payload.mediaURLs : [];
  const mediaHtml = mediaURLs
    .map((url) => `<figure><img src="${escapeHtml(url)}" alt="media" loading="eager" /></figure>`)
    .join("\n");
  const articleHtml = [
    article?.preview_text ? `<p>${escapeHtml(article.preview_text)}</p>` : "",
    mediaHtml
  ]
    .filter(Boolean)
    .join("\n");

  return {
    source: "vxtwitter",
    canonicalUrl: payload.tweetURL ?? "",
    title: article?.title ?? `Post ${payload.tweetID}`,
    authorName: payload.user_name ?? "",
    authorHandle: payload.user_screen_name ? `@${payload.user_screen_name}` : "",
    createdAt: payload.date ?? "",
    text: payload.text ?? "",
    coverImage: article?.image ?? null,
    articleHtml
  };
}

function normalizeOembedPayload(payload, originalUrl, statusId) {
  if (!payload || typeof payload !== "object" || typeof payload.html !== "string") {
    return null;
  }
  const title = payload.author_name
    ? `Post de ${payload.author_name}`
    : `Post ${statusId}`;
  return {
    source: "oembed",
    canonicalUrl: payload.url ?? originalUrl,
    title,
    authorName: payload.author_name ?? "",
    authorHandle: "",
    createdAt: "",
    text: "",
    coverImage: null,
    articleHtml: `<section class="oembed">${payload.html}</section>`
  };
}

async function resolveTweetData(statusId, originalUrl) {
  const endpoints = [
    {
      name: "fxtwitter",
      url: `https://api.fxtwitter.com/status/${statusId}`,
      normalize: normalizeFxPayload
    },
    {
      name: "vxtwitter",
      url: `https://api.vxtwitter.com/status/${statusId}`,
      normalize: normalizeVxPayload
    }
  ];

  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const payload = await fetchWithRetries(endpoint.url);
      const normalized = endpoint.normalize(payload);
      if (normalized) {
        return normalized;
      }
      errors.push(`${endpoint.name}: payload invalide`);
    } catch (error) {
      errors.push(`${endpoint.name}: ${error.message}`);
    }
  }

  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(originalUrl)}`;
    const oembedPayload = await fetchWithRetries(oembedUrl);
    const normalized = normalizeOembedPayload(oembedPayload, originalUrl, statusId);
    if (normalized) {
      return normalized;
    }
    errors.push("oembed: payload invalide");
  } catch (error) {
    errors.push(`oembed: ${error.message}`);
  }

  throw new Error(`Impossible de recuperer les donnees du post. Détails: ${errors.join(" | ")}`);
}

function buildHtmlDocument(model, originalUrl) {
  const headerTitle = model.title ? escapeHtml(model.title) : "Post X";
  const canonical = model.canonicalUrl || originalUrl;
  const authorLine = [model.authorName, model.authorHandle].filter(Boolean).join(" ");
  const createdAt = formatDate(model.createdAt);
  const introText = model.text ? `<p class="lead">${escapeHtml(model.text)}</p>` : "";
  const cover = model.coverImage
    ? `<figure class="cover"><img src="${escapeHtml(model.coverImage)}" alt="cover" loading="eager" /></figure>`
    : "";
  const body = model.articleHtml || "";

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${headerTitle}</title>
  <style>
    :root {
      --bg: #ffffff;
      --text: #111827;
      --muted: #4b5563;
      --line: #d1d5db;
      --accent: #0f172a;
      --panel: #f8fafc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.6;
      font-size: 14px;
    }
    main {
      max-width: 820px;
      margin: 0 auto;
      padding: 28px;
    }
    .meta {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 24px;
    }
    .meta h1 {
      font-size: 1.6rem;
      line-height: 1.3;
      margin: 0 0 10px 0;
      color: var(--accent);
      word-break: break-word;
    }
    .meta p {
      margin: 0;
      color: var(--muted);
      font-size: 0.95rem;
    }
    .meta .row {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .meta a {
      color: #0b65d8;
      text-decoration: none;
      word-break: break-all;
    }
    .lead {
      font-size: 1rem;
      margin-bottom: 18px;
      white-space: pre-wrap;
    }
    h1 {
      font-size: 1.5rem;
      margin: 1.1em 0 0.45em 0;
      line-height: 1.3;
    }
    h2 {
      font-size: 1.15rem;
      margin: 1.05em 0 0.42em 0;
      line-height: 1.35;
    }
    p {
      margin: 0.5em 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    ul, ol {
      margin: 0.5em 0 0.9em 1.3em;
      padding: 0;
    }
    li {
      margin: 0.22em 0;
    }
    figure {
      margin: 14px 0;
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow: hidden;
      background: #ffffff;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    figure.cover {
      margin-top: 0;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
    }
    figcaption {
      font-size: 0.86rem;
      color: var(--muted);
      padding: 10px 12px;
      border-top: 1px solid var(--line);
      background: #fbfdff;
    }
    pre {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      background: #0b1020;
      color: #e5e7eb;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .oembed {
      margin-top: 6px;
    }
    .twitter-tweet {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    @media print {
      main { padding: 14mm 10mm; }
      .meta { page-break-inside: avoid; break-inside: avoid; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main>
    <section class="meta">
      <h1>${headerTitle}</h1>
      <p>${escapeHtml(authorLine || "Auteur inconnu")}</p>
      <div class="row">
        ${createdAt ? `<p>${escapeHtml(createdAt)}</p>` : ""}
        <p>Source: ${escapeHtml(model.source)}</p>
      </div>
      <div class="row">
        <a href="${escapeHtml(canonical)}" target="_blank" rel="noopener noreferrer">${escapeHtml(canonical)}</a>
      </div>
    </section>
    ${introText}
    ${cover}
    ${body}
  </main>
</body>
</html>`;
}

async function ensureImagesLoaded(page) {
  await page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          })
      )
    );
  });
}

async function htmlToPdf(html, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await ensureImagesLoaded(page);
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "12mm",
        right: "10mm",
        bottom: "12mm",
        left: "10mm"
      }
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    usage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const inputUrl = args[0];
  const outputArg = args[1];
  const statusId = parseStatusId(inputUrl);
  const outputPath = outputPathFromStatusId(statusId, outputArg);

  console.log(`-> Recuperation du post ${statusId}`);
  const model = await resolveTweetData(statusId, inputUrl);
  const html = buildHtmlDocument(model, inputUrl);

  console.log("-> Generation du PDF");
  await htmlToPdf(html, outputPath);

  console.log(`OK: PDF cree: ${outputPath}`);
}

main().catch((error) => {
  console.error(`Erreur: ${error.message}`);
  process.exit(1);
});
