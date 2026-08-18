// Central content-license policy for Guess The Baller.
// Keep this module dependency-free so it can also be tested under Node.

export const APPROVED_WIKIMEDIA_LICENSES = Object.freeze([
  "CC0",
  "Public Domain",
  "CC BY 1.0",
  "CC BY 2.0",
  "CC BY 2.5",
  "CC BY 3.0",
  "CC BY 4.0",
  "CC BY-SA 1.0",
  "CC BY-SA 2.0",
  "CC BY-SA 2.5",
  "CC BY-SA 3.0",
  "CC BY-SA 4.0",
]);

const CLEARLY_PROHIBITED_RE =
  /(?:\bNC\b|\bND\b|NON[-\s]?FREE|FAIR\s+USE|ALL\s+RIGHTS\s+RESERVED)/i;

export function cleanMetadataText(value) {
  if (!value) return "";
  return String(value)
    .replace(/<span[^>]*display:\s*none[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\S+\.(?:jpe?g|png|gif|svg|tiff?|webp|bmp):\s*/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLicenseName(value) {
  const raw = cleanMetadataText(value).replace(/\s+/g, " ").trim();
  if (!raw) return "";

  if (/^CC0(?:\s+1\.0)?$/i.test(raw)) return "CC0";
  if (/^Public\s+Domain$/i.test(raw)) return "Public Domain";

  const match = raw.match(/^CC\s+BY(-SA)?\s+(1\.0|2\.0|2\.5|3\.0|4\.0)$/i);
  if (!match) return raw;

  return `CC BY${match[1] ? "-SA" : ""} ${match[2]}`;
}

export function isApprovedWikimediaLicense(value) {
  const license = normalizeLicenseName(value);
  if (!license || CLEARLY_PROHIBITED_RE.test(license)) return false;
  return APPROVED_WIKIMEDIA_LICENSES.includes(license);
}

export function licenseUrlMatchesName(licenseName, licenseUrl) {
  const license = normalizeLicenseName(licenseName);
  const url = normalizeHttpUrl(licenseUrl).toLowerCase();
  if (!license || !url) return false;

  if (license === "CC0") {
    return /creativecommons\.org\/publicdomain\/zero\//.test(url);
  }
  if (license === "Public Domain") {
    return /creativecommons\.org\/publicdomain\//.test(url);
  }
  if (/^CC BY-SA /.test(license)) {
    return /creativecommons\.org\/licenses\/by-sa\//.test(url);
  }
  if (/^CC BY /.test(license)) {
    return /creativecommons\.org\/licenses\/by\//.test(url);
  }
  return false;
}

function metadataValue(extmetadata, key) {
  return extmetadata && extmetadata[key] && extmetadata[key].value;
}

function normalizeHttpUrl(value) {
  const url = cleanMetadataText(value);
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return /^https?:\/\//i.test(url) ? url : "";
}

export function buildWikimediaAttribution({ rawUrl, imageInfo }) {
  const meta = imageInfo && imageInfo.extmetadata;
  if (!meta) return null;

  const creator = cleanMetadataText(metadataValue(meta, "Artist"));
  const license = normalizeLicenseName(metadataValue(meta, "LicenseShortName"));
  const licenseUrl = normalizeHttpUrl(metadataValue(meta, "LicenseUrl"));
  const sourcePageUrl = normalizeHttpUrl(imageInfo && imageInfo.descriptionurl);
  const imageUrl = normalizeHttpUrl((imageInfo && imageInfo.url) || rawUrl);

  // Fail closed: no verified metadata means no real-player image.
  if (
    !creator ||
    !isApprovedWikimediaLicense(license) ||
    !licenseUrl ||
    !licenseUrlMatchesName(license, licenseUrl) ||
    !sourcePageUrl ||
    !imageUrl
  ) {
    return null;
  }

  return Object.freeze({
    source: "Wikimedia Commons / Wikipedia",
    creator,
    license,
    licenseUrl,
    sourcePageUrl,
    imageUrl,
    modified: true,
  });
}

export function isMarketingSafeMode() {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.GUESS_THE_BALLER_MARKETING_SAFE_MODE === true
  ) {
    return true;
  }

  if (typeof window === "undefined") return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("marketingSafe") === "1") return true;
    if (
      window.localStorage &&
      window.localStorage.getItem("gtbMarketingSafeMode") === "1"
    ) {
      return true;
    }
  } catch (_) {
    // Location/localStorage can be unavailable in privacy-restricted contexts.
  }

  return false;
}
