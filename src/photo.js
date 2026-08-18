// License-aware player-photo loader for Guess The Baller.
// Real-player images are shown only when Wikimedia metadata can be verified
// against the allowlist in content-license-policy.js. Unknown/unsafe media
// fails closed to the anonymous branded fallback.
//
// TheSportsDB fallback is intentionally disabled: the previous implementation
// could render a player image without reliable per-image licensing metadata.

import { t } from "./i18n/index.js";
import {
  buildWikimediaAttribution,
  isMarketingSafeMode,
} from "./content-license-policy.js";

const activeTokens = new WeakMap();
const recordCache = new Map(); // player key -> Promise<{src, attribution}|null>
const imageCache = new Map(); // player key -> { img, attribution }

const THUMB_WIDTH = 330;
const IMAGE_INFO_ENDPOINTS = [
  "https://commons.wikimedia.org/w/api.php",
  "https://en.wikipedia.org/w/api.php",
  "https://he.wikipedia.org/w/api.php",
];

function resizeThumbnail(url) {
  if (!url) return url;
  return url.replace(/\/(\d+)px-/, `/${THUMB_WIDTH}px-`);
}

function fileNameFromUrl(url) {
  if (!url) return null;
  const match = url.split("?")[0].match(/\/([^/]+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1].replace(/^\d+px-/, ""));
  } catch (_) {
    return match[1].replace(/^\d+px-/, "");
  }
}

function playerKey(player) {
  return (player && (player.wiki || player.answer)) || "";
}

function bareName(wiki) {
  return String(wiki || "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
}

function isLikelySamePerson(wiki, hitTitle) {
  const ourBare = bareName(wiki);
  const hitBare = bareName(hitTitle);
  const ourWords = ourBare.toLowerCase().split(/\s+/).filter(Boolean);
  const hitWords = new Set(hitBare.toLowerCase().split(/\s+/).filter(Boolean));

  if (!ourWords.some((word) => hitWords.has(word))) return false;

  const ourHasDisambiguator = ourBare !== wiki;
  if (ourHasDisambiguator && hitBare === ourBare && hitTitle !== wiki) {
    return false;
  }

  return true;
}

async function fetchWikipediaSummaryImage(wiki) {
  const response = await fetch(
    "https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(wiki)
  );
  if (!response.ok) throw new Error("Wikipedia summary fetch failed");
  const data = await response.json();
  return (
    (data.thumbnail && data.thumbnail.source) ||
    (data.originalimage && data.originalimage.source) ||
    null
  );
}

async function fetchWikipediaSearchImage(wiki) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `"${bareName(wiki)}" footballer`,
    gsrnamespace: "0",
    gsrlimit: "5",
    prop: "pageimages|pageprops",
    piprop: "thumbnail",
    pithumbsize: "640",
    ppprop: "wikibase-shortdesc",
    format: "json",
    origin: "*",
  });

  const response = await fetch(
    "https://en.wikipedia.org/w/api.php?" + params.toString()
  );
  if (!response.ok) throw new Error("Wikipedia search failed");

  const data = await response.json();
  const pages = Object.values((data.query && data.query.pages) || {}).sort(
    (a, b) => (a.index || 999) - (b.index || 999)
  );

  const hit = pages.find((page) => {
    const description =
      (page.pageprops && page.pageprops["wikibase-shortdesc"]) || "";
    return (
      page.thumbnail &&
      page.thumbnail.source &&
      /footballer|player/i.test(description) &&
      isLikelySamePerson(wiki, page.title)
    );
  });

  return (hit && hit.thumbnail.source) || null;
}

async function fetchHebrewWikipediaImage(answer) {
  if (!answer || !/[֐-׿]/.test(answer)) return null;

  const response = await fetch(
    "https://he.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(answer)
  );
  if (!response.ok) throw new Error("Hebrew Wikipedia summary fetch failed");

  const data = await response.json();
  return (
    (data.thumbnail && data.thumbnail.source) ||
    (data.originalimage && data.originalimage.source) ||
    null
  );
}

async function fetchImageInfo(fileName) {
  if (!fileName) return null;

  for (const endpoint of IMAGE_INFO_ENDPOINTS) {
    try {
      const params = new URLSearchParams({
        action: "query",
        titles: "File:" + fileName,
        prop: "imageinfo",
        iiprop: "extmetadata|url",
        format: "json",
        origin: "*",
      });

      const response = await fetch(endpoint + "?" + params.toString());
      if (!response.ok) continue;

      const data = await response.json();
      const page =
        data.query && data.query.pages && Object.values(data.query.pages)[0];
      const imageInfo =
        page && page.imageinfo && page.imageinfo.length
          ? page.imageinfo[0]
          : null;

      if (imageInfo) return imageInfo;
    } catch (_) {
      // Try the next Wikimedia project. If none succeeds, the image is rejected.
    }
  }

  return null;
}

async function validateWikimediaImage(rawUrl) {
  if (!rawUrl) return null;

  const fileName = fileNameFromUrl(rawUrl);
  if (!fileName) return null;

  const imageInfo = await fetchImageInfo(fileName);
  if (!imageInfo) return null;

  const attribution = buildWikimediaAttribution({ rawUrl, imageInfo });
  if (!attribution) return null;

  return {
    src: resizeThumbnail(rawUrl),
    attribution,
  };
}

async function resolveImageRecordUncached(player) {
  if (!player || !player.wiki || isMarketingSafeMode()) return null;

  const candidates = [
    () => fetchWikipediaSummaryImage(player.wiki),
    () => fetchWikipediaSearchImage(player.wiki),
    () => fetchHebrewWikipediaImage(player.answer),
  ];

  for (const getCandidate of candidates) {
    try {
      const rawUrl = await getCandidate();
      if (!rawUrl) continue;

      const record = await validateWikimediaImage(rawUrl);
      if (record) return record;
      // An image with unknown/prohibited/incomplete licensing is skipped.
    } catch (_) {
      // Fail soft and try the next source. We never display an unverified image.
    }
  }

  return null;
}

async function resolveImageRecord(player) {
  if (isMarketingSafeMode()) return null;

  const key = playerKey(player);
  if (!key) return null;
  if (recordCache.has(key)) return recordCache.get(key);

  const promise = resolveImageRecordUncached(player);
  recordCache.set(key, promise);

  const record = await promise;
  // Successful records remain cached. Null results are retried later so a
  // temporary API/network failure does not permanently remove a legal image.
  if (!record) recordCache.delete(key);
  return record;
}

function renderFallback(container, loading = false) {
  container.innerHTML = "";

  const fallback = document.createElement("div");
  fallback.className = "licensed-photo-fallback";

  const silhouette = document.createElement("div");
  silhouette.className = "anonymous-player-silhouette";
  silhouette.setAttribute("aria-hidden", "true");

  const question = document.createElement("span");
  question.className = "anonymous-player-question";
  question.textContent = "?";
  silhouette.appendChild(question);

  const label = document.createElement("small");
  label.textContent = loading
    ? t("game.mysteryLoading")
    : t("game.photoUnavailable");

  fallback.appendChild(silhouette);
  fallback.appendChild(label);
  container.appendChild(fallback);
}

function makeDetailRow(label, value) {
  const row = document.createElement("div");
  row.className = "photo-license-row";

  const strong = document.createElement("strong");
  strong.textContent = label;

  const text = document.createElement("span");
  text.textContent = value;

  row.appendChild(strong);
  row.appendChild(text);
  return row;
}

function makeDetailLink(label, url) {
  const link = document.createElement("a");
  link.className = "photo-license-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

function showAttributionModal(attribution) {
  const previous = document.getElementById("photoLicenseOverlay");
  if (previous) previous.remove();

  const overlay = document.createElement("div");
  overlay.id = "photoLicenseOverlay";
  overlay.className = "photo-license-overlay";
  overlay.setAttribute("role", "presentation");

  const modal = document.createElement("div");
  modal.className = "photo-license-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", t("photo.creditTitle"));

  const title = document.createElement("h3");
  title.textContent = t("photo.creditTitle");

  modal.appendChild(title);
  modal.appendChild(
    makeDetailRow(t("photo.creatorLabel"), attribution.creator)
  );
  modal.appendChild(
    makeDetailRow(t("photo.licenseLabel"), attribution.license)
  );
  modal.appendChild(
    makeDetailRow(t("photo.sourceLabel"), attribution.source)
  );

  if (attribution.modified) {
    const modified = document.createElement("p");
    modified.className = "photo-license-modified";
    modified.textContent = t("photo.modified");
    modal.appendChild(modified);
  }

  const links = document.createElement("div");
  links.className = "photo-license-links";
  links.appendChild(
    makeDetailLink(t("photo.openSource"), attribution.sourcePageUrl)
  );
  links.appendChild(
    makeDetailLink(t("photo.openLicense"), attribution.licenseUrl)
  );
  modal.appendChild(links);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "photo-license-close";
  close.textContent = t("photo.close");

  const closeModal = () => {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") closeModal();
  };

  close.addEventListener("click", closeModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal();
  });
  document.addEventListener("keydown", onKeyDown);

  modal.appendChild(close);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  close.focus();
}

function attachAttributionButton(container, attribution) {
  if (!attribution) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "photo-credit-btn";
  button.textContent = t("photo.creditButton");
  button.title = `${attribution.creator} · ${attribution.license}`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    showAttributionModal(attribution);
  });

  container.appendChild(button);
}

function warmImage(key, record) {
  if (!key || !record || imageCache.has(key)) return;

  const img = new Image();
  img.decoding = "async";
  img.src = record.src;
  imageCache.set(key, { img, attribution: record.attribution });
}

export async function loadPhoto(player, container) {
  const token = Symbol();
  activeTokens.set(container, token);

  const isStale = () => activeTokens.get(container) !== token;
  const showFallback = () => {
    if (!isStale()) renderFallback(container, false);
  };

  if (isMarketingSafeMode()) {
    showFallback();
    return;
  }

  const key = playerKey(player);
  const cached = key && imageCache.get(key);

  if (
    cached &&
    cached.img &&
    cached.img.complete &&
    cached.img.naturalWidth > 0 &&
    cached.attribution
  ) {
    container.innerHTML = "";
    container.appendChild(cached.img.cloneNode());
    attachAttributionButton(container, cached.attribution);
    return;
  }

  renderFallback(container, true);

  try {
    const record = await resolveImageRecord(player);
    if (!record || isStale()) {
      showFallback();
      return;
    }

    const img = new Image();
    img.decoding = "async";

    img.onload = () => {
      if (isStale()) return;
      container.innerHTML = "";
      container.appendChild(img);
      attachAttributionButton(container, record.attribution);
      imageCache.set(key, {
        img: img.cloneNode(),
        attribution: record.attribution,
      });
    };

    img.onerror = showFallback;
    img.src = record.src;
  } catch (_) {
    showFallback();
  }
}

export function prefetchPhotos(players) {
  if (isMarketingSafeMode()) return;

  players.forEach((player) => {
    if (!player) return;

    const key = playerKey(player);
    resolveImageRecord(player)
      .then((record) => {
        if (record) warmImage(key, record);
      })
      .catch(() => {
        // Prefetch is a performance optimization only.
      });
  });
}
