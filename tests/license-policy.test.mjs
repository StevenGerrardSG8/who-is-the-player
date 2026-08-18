import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWikimediaAttribution,
  isApprovedWikimediaLicense,
  isMarketingSafeMode,
  normalizeLicenseName,
} from "../src/content-license-policy.js";

function imageInfo(license, overrides = {}) {
  return {
    url: "https://upload.wikimedia.org/example.jpg",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
    extmetadata: {
      Artist: { value: "Example Photographer" },
      LicenseShortName: { value: license },
      LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" },
    },
    ...overrides,
  };
}

test("CC BY is accepted", () => {
  assert.equal(isApprovedWikimediaLicense("CC BY 4.0"), true);
});

test("CC BY-SA is accepted", () => {
  assert.equal(isApprovedWikimediaLicense("CC BY-SA 4.0"), true);
});

test("CC0 is accepted", () => {
  assert.equal(isApprovedWikimediaLicense("CC0"), true);
});

test("Public Domain is accepted by the license-name allowlist", () => {
  assert.equal(isApprovedWikimediaLicense("Public Domain"), true);
});

test("CC BY-NC is rejected", () => {
  assert.equal(isApprovedWikimediaLicense("CC BY-NC 4.0"), false);
});

test("CC BY-ND is rejected", () => {
  assert.equal(isApprovedWikimediaLicense("CC BY-ND 4.0"), false);
});

test("unknown license is rejected", () => {
  assert.equal(isApprovedWikimediaLicense("Free Art-ish License"), false);
});

test("normalization is stable", () => {
  assert.equal(normalizeLicenseName("CC BY-SA 4.0"), "CC BY-SA 4.0");
});

test("verified attribution object is created", () => {
  const result = buildWikimediaAttribution({
    rawUrl: "https://upload.wikimedia.org/example.jpg",
    imageInfo: imageInfo("CC BY-SA 4.0"),
  });
  assert.ok(result);
  assert.equal(result.creator, "Example Photographer");
  assert.equal(result.license, "CC BY-SA 4.0");
  assert.match(result.sourcePageUrl, /commons\.wikimedia\.org/);
});

test("missing creator rejects the image", () => {
  const info = imageInfo("CC BY-SA 4.0");
  delete info.extmetadata.Artist;
  assert.equal(
    buildWikimediaAttribution({
      rawUrl: "https://upload.wikimedia.org/example.jpg",
      imageInfo: info,
    }),
    null
  );
});

test("missing license URL rejects the image", () => {
  const info = imageInfo("CC BY-SA 4.0");
  delete info.extmetadata.LicenseUrl;
  assert.equal(
    buildWikimediaAttribution({
      rawUrl: "https://upload.wikimedia.org/example.jpg",
      imageInfo: info,
    }),
    null
  );
});

test("prohibited license rejects the full attribution record", () => {
  assert.equal(
    buildWikimediaAttribution({
      rawUrl: "https://upload.wikimedia.org/example.jpg",
      imageInfo: imageInfo("CC BY-NC 4.0"),
    }),
    null
  );
});

test("mismatched license URL rejects the image", () => {
  const info = imageInfo("CC BY 4.0");
  info.extmetadata.LicenseUrl.value =
    "https://creativecommons.org/licenses/by-sa/4.0/";
  assert.equal(
    buildWikimediaAttribution({
      rawUrl: "https://upload.wikimedia.org/example.jpg",
      imageInfo: info,
    }),
    null
  );
});

test("marketing safe mode can be forced globally", () => {
  globalThis.GUESS_THE_BALLER_MARKETING_SAFE_MODE = true;
  assert.equal(isMarketingSafeMode(), true);
  delete globalThis.GUESS_THE_BALLER_MARKETING_SAFE_MODE;
});

