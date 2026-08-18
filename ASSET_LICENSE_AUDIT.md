# Asset License Audit

Engineering inventory only; verify provenance before a commercial release.

| File | Type | Current classification | License/status | Action |
|---|---|---|---|---|
| `src/assets/logo-badge.svg` | SVG brand mark | Project branding | REVIEW | Confirm it was created by you/commissioned with rights assigned; keep the source record. |
| `public/favicon.svg` | SVG favicon | Project branding derivative | REVIEW | Confirm it derives only from cleared project branding. |
| `public/favicon-32.png` | PNG favicon | Project branding derivative | REVIEW | Confirm it derives only from cleared project branding. |
| `public/apple-touch-icon.png` | PNG app icon | Project branding derivative | REVIEW | Confirm it derives only from cleared project branding. |
| `public/icon-192.png` | PNG PWA icon | Project branding derivative | REVIEW | Confirm it derives only from cleared project branding. |
| `public/icon-512.png` | PNG PWA icon | Project branding derivative | REVIEW | Confirm it derives only from cleared project branding. |

## Rules going forward

- Every new local PNG/JPG/JPEG/SVG/WebP/GIF/ICO under `public/` or `src/assets/` must be added to `asset-license-manifest.json`.
- Do not add club crests, league marks, federation marks, sponsor marks, broadcast graphics, player-card art, or copied game UI assets without a documented license.
- Prefer original Guess The Baller graphics, generic football icons, country flags, and text.
- `npm run validate:licenses` fails when a new image asset is missing from the manifest.
