// Shared Wikipedia photo loader. Guards against stale responses overwriting
// a newer request when the player advances before a slow fetch resolves.
import { t } from "./i18n/index.js";

const activeTokens = new WeakMap();
const srcCache = new Map(); // wiki title -> resolved image URL (or null if none found)
const imageCache = new Map(); // wiki title -> preloaded HTMLImageElement (browser-cached bytes)
const creditCache = new Map(); // wiki title -> Promise<credit text|null>, shared across concurrent callers

// Wikimedia thumbnail URLs look like ".../thumb/a/ab/File.jpg/440px-File.jpg" —
// the "440px-" segment can be swapped for a different width, but only from
// Wikimedia's fixed set of standard thumbnail steps (20/40/60/120/250/330/
// 500/960/1280/1920/3840) — hotlinking any other width now gets rejected
// with a 429. The sticker card only ever displays this image at ~260px
// wide, so 330 is the smallest standard step that still looks sharp.
const THUMB_WIDTH = 330;
function resizeThumbnail(url) {
  if (!url) return url;
  return url.replace(/\/(\d+)px-/, `/${THUMB_WIDTH}px-`);
}

// Wikimedia image URLs end in either ".../a/ab/File.jpg" (original) or
// ".../thumb/a/ab/File.jpg/320px-File.jpg" (thumbnail), often with a
// "?utm_source=..." query string tacked on — pull the bare file name back
// out so it can be looked up on the file description page.
function fileNameFromUrl(url) {
  const m = url.split("?")[0].match(/\/([^/]+)$/);
  if (!m) return null;
  return decodeURIComponent(m[1].replace(/^\d+px-/, ""));
}

// Some Commons extmetadata fields (e.g. the "Unknown author" template) embed
// a hidden duplicate span for machine parsing — strip that out first, or a
// naive tag strip concatenates it with the visible copy ("Unknown authorUnknown author").
//
// Derivative-work photos (crops/edits of someone else's upload) list BOTH
// contributors as a bare `<ul><li>` list: "<OriginalFile.jpg>: <uploader>" then
// "derivative work: <editor>". The original file is usually named after its
// subject by whoever uploaded it (e.g. "Abby_Wambach_USA_vs_Can_Sep17.jpg"),
// so a plain tag-strip leaves that filename sitting at the front of the
// credit line — which reads as though the player were credited as their own
// photographer, even though the real contributors follow right after. Strip
// bare "filename.ext:" fragments so only the actual credited names remain.
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<span[^>]*display:\s*none[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\S+\.(?:jpe?g|png|gif|svg|tiff?|webp|bmp):\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCredit(extmetadata) {
  const artist = stripHtml(extmetadata.Artist && extmetadata.Artist.value);
  const license = stripHtml(extmetadata.LicenseShortName && extmetadata.LicenseShortName.value);
  const parts = [artist, license].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Wikipedia";
}

// Photos are pulled live from Wikimedia, whose free-license images (mostly
// CC BY-SA) require attribution — resolve author/license from the file's
// extmetadata. en.wikipedia's API transparently resolves File: pages that
// actually live on Commons, so this one endpoint covers both cases. Falls
// back to a plain "Wikipedia" credit if metadata is missing or the lookup
// fails, so every real photo still carries a source line.
function resolveCredit(wiki, rawUrl) {
  if (creditCache.has(wiki)) return creditCache.get(wiki);
  const promise = (async () => {
    const file = fileNameFromUrl(rawUrl);
    if (!file) return "Wikipedia";
    try {
      const r = await fetch(
        "https://en.wikipedia.org/w/api.php?action=query&titles=" +
          encodeURIComponent("File:" + file) +
          "&prop=imageinfo&iiprop=extmetadata&format=json&origin=*"
      );
      if (!r.ok) throw new Error("credit fetch failed");
      const j = await r.json();
      const page = j.query && j.query.pages && Object.values(j.query.pages)[0];
      const meta = page && page.imageinfo && page.imageinfo[0] && page.imageinfo[0].extmetadata;
      return meta ? formatCredit(meta) : "Wikipedia";
    } catch (e) {
      return "Wikipedia";
    }
  })();
  creditCache.set(wiki, promise);
  return promise;
}

// Wiki titles disambiguate same-name players with a trailing parenthetical
// ("Chris Allen (footballer, born 1972)") that Wikipedia needs but a plain
// name-search API doesn't — and will find nothing for if left attached.
function bareName(wiki) {
  return wiki.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// TheSportsDB's free, keyless tier (the "3" test key, intended for exactly
// this kind of hobby lookup) as a second source for the ~40% of players
// Wikipedia has no photo for at all — mostly lower-profile players from the
// bigger leagues' full squads. `strCutout` (a transparent-background player
// render) is tried first since it matches the sticker-card art direction
// better than an arbitrary action photo; `strThumb` is the fallback within
// the fallback.
async function resolveSportsDbSrc(wiki) {
  const r = await fetch(
    "https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=" + encodeURIComponent(bareName(wiki))
  );
  if (!r.ok) throw new Error("sportsdb fetch failed");
  const j = await r.json();
  const hit = j.player && j.player[0];
  return (hit && (hit.strCutout || hit.strThumb)) || null;
}

// Some recent Ligat Ha'Al players have an English Wikipedia article under a
// spelling variant or a disambiguated title. If the direct title lookup has no
// image, search for the footballer and use the first photographed result.
//
// A search hit is only trusted if Wikidata's short description actually
// calls it a footballer/player — otherwise the top "<name> footballer" hit
// can be an unrelated article (a cup final, a stadium, a squad list) that
// happens to have a page image, which would silently show the wrong photo
// instead of falling through to the TheSportsDB fallback below.
async function resolveWikipediaSearchSrc(wiki) {
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
  const r = await fetch("https://en.wikipedia.org/w/api.php?" + params.toString());
  if (!r.ok) throw new Error("wiki search failed");
  const j = await r.json();
  const pages = Object.values((j.query && j.query.pages) || {}).sort(
    (a, b) => (a.index || 999) - (b.index || 999)
  );
  const hit = pages.find((page) => {
    const desc = (page.pageprops && page.pageprops["wikibase-shortdesc"]) || "";
    return page.thumbnail && page.thumbnail.source && /footballer|player/i.test(desc);
  });
  return (hit && hit.thumbnail.source) || null;
}

async function resolveImageSrc(wiki) {
  if (srcCache.has(wiki)) return srcCache.get(wiki);

  let raw = null;
  let wikiFailed = false;
  try {
    const r = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(wiki));
    if (!r.ok) throw new Error("wiki fetch failed");
    const j = await r.json();
    raw = (j.thumbnail && j.thumbnail.source) || (j.originalimage && j.originalimage.source) || null;
  } catch (e) {
    wikiFailed = true;
  }

  if (raw) {
    const src = resizeThumbnail(raw);
    srcCache.set(wiki, src);
    resolveCredit(wiki, raw);
    return src;
  }

  let searchFailed = false;
  try {
    raw = await resolveWikipediaSearchSrc(wiki);
  } catch (e) {
    searchFailed = true;
  }

  if (raw) {
    const src = resizeThumbnail(raw);
    srcCache.set(wiki, src);
    resolveCredit(wiki, raw);
    return src;
  }

  let fallback = null;
  let fallbackFailed = false;
  try {
    fallback = await resolveSportsDbSrc(wiki);
  } catch (e) {
    fallbackFailed = true;
  }

  if (fallback) {
    srcCache.set(wiki, fallback);
    creditCache.set(wiki, Promise.resolve("TheSportsDB"));
    return fallback;
  }

  // Only remember "no photo anywhere" once both lookups have genuinely
  // completed — a transient failure (rate limit, flaky network) should be
  // retried next time, not written off permanently for the rest of the
  // session over what might just be a momentary hiccup.
  if (!wikiFailed && !searchFailed && !fallbackFailed) srcCache.set(wiki, null);
  return null;
}

// Actually start downloading the image bytes (not just resolve the URL) and
// keep a reference so the browser can't garbage-collect the decoded image
// before it's used — this is what makes a prefetched photo appear instantly.
function warmImage(wiki, src) {
  if (imageCache.has(wiki) || !src) return;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  imageCache.set(wiki, img);
}

function attachCredit(wiki, container, isStale) {
  const promise = creditCache.get(wiki);
  if (!promise) return;
  promise.then((text) => {
    if (isStale() || !text) return;
    const c = document.createElement("div");
    c.className = "photo-credit";
    c.textContent = text;
    c.title = text;
    container.appendChild(c);
  });
}

export async function loadPhoto(player, container) {
  const token = Symbol();
  activeTokens.set(container, token);

  const isStale = () => activeTokens.get(container) !== token;
  const showSilhouette = () => {
    if (isStale()) return;
    container.innerHTML = '<div class="fallback">🖼️<small>' + t("game.photoUnavailable") + "</small></div>";
  };

  // If this photo was already prefetched, the bytes are (likely) already in
  // the browser cache — render immediately instead of showing a spinner first.
  const cachedImg = imageCache.get(player.wiki);
  if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
    container.innerHTML = "";
    container.appendChild(cachedImg.cloneNode());
    attachCredit(player.wiki, container, isStale);
    return;
  }

  container.innerHTML = '<div class="fallback">?<small>' + t("game.mysteryLoading") + "</small></div>";
  try {
    const src = await resolveImageSrc(player.wiki);
    if (!src) throw new Error("no image");
    if (isStale()) return;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (isStale()) return;
      container.innerHTML = "";
      container.appendChild(img);
      attachCredit(player.wiki, container, isStale);
    };
    img.onerror = showSilhouette;
    img.src = src;
  } catch (e) {
    showSilhouette();
  }
}

// Warm the cache for upcoming players without blocking the UI — call this
// with the next few players in a round so their photos are ready instantly.
export function prefetchPhotos(players) {
  players.forEach((p) => {
    if (!p) return;
    resolveImageSrc(p.wiki)
      .then((src) => warmImage(p.wiki, src))
      .catch(() => srcCache.set(p.wiki, null));
  });
}
