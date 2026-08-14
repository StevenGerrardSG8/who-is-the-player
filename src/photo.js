// Shared Wikipedia photo loader. Guards against stale responses overwriting
// a newer request when the player advances before a slow fetch resolves.
const activeTokens = new WeakMap();
const srcCache = new Map(); // wiki title -> resolved image URL (or null if none found)

async function resolveImageSrc(wiki) {
  if (srcCache.has(wiki)) return srcCache.get(wiki);
  const r = await fetch(
    "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(wiki)
  );
  if (!r.ok) throw new Error("fetch failed");
  const j = await r.json();
  // Prefer the small thumbnail over the (often multi-MB) full-resolution
  // original — it renders far faster in the sticker card at no visible
  // quality cost, and only fall back to the original if no thumbnail exists.
  const src = (j.thumbnail && j.thumbnail.source) || (j.originalimage && j.originalimage.source) || null;
  srcCache.set(wiki, src);
  return src;
}

export async function loadPhoto(player, container) {
  const token = Symbol();
  activeTokens.set(container, token);
  container.innerHTML = '<div class="fallback">?<small>Loading photo…</small></div>';

  const isStale = () => activeTokens.get(container) !== token;
  const showSilhouette = () => {
    if (isStale()) return;
    container.innerHTML = '<div class="fallback">🕵️<small>Mystery player — use the hints!</small></div>';
  };

  try {
    const src = await resolveImageSrc(player.wiki);
    if (!src) throw new Error("no image");
    if (isStale()) return;
    const img = new Image();
    img.onload = () => {
      if (isStale()) return;
      container.innerHTML = "";
      container.appendChild(img);
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
    if (!p || srcCache.has(p.wiki)) return;
    resolveImageSrc(p.wiki).catch(() => srcCache.set(p.wiki, null));
  });
}
