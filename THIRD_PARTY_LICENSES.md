# Third-Party Licenses / Open-Source Disclosure

This file is an engineering inventory, not a legal opinion. Re-check versions and upstream terms before a commercial release.

## Vite

- Purpose: local development/build tooling
- Version in this repository: `^5.4.0`
- License: MIT
- Upstream: https://github.com/vitejs/vite
- License: https://github.com/vitejs/vite/blob/main/LICENSE

## PeerJS

- Purpose: WebRTC multiplayer client
- Browser script currently loaded from `unpkg.com`
- License: MIT
- Upstream: https://github.com/peers/peerjs
- License information: https://github.com/peers/peerjs

## SheetJS Community Edition

- Purpose: spreadsheet/XLSX handling
- Browser script currently loaded from `cdn.sheetjs.com`
- License: Apache License 2.0
- Upstream: https://git.sheetjs.com/SheetJS/sheetjs
- Licensing/required attribution: https://docs.sheetjs.com/docs/miscellany/license/

SheetJS CE requests an open-source disclosure. Preserve the attribution required by its current license page when distributing the product.

## Firebase JavaScript SDK

- Purpose: authentication, Firestore, messaging
- Browser modules currently loaded from `www.gstatic.com`
- License: primarily Apache License 2.0; upstream repository documents an exception for protobuf code under BSD-3-Clause
- Upstream: https://github.com/firebase/firebase-js-sdk
- License: https://github.com/firebase/firebase-js-sdk/blob/master/LICENSE

## Google Fonts

The app currently requests these families from Google Fonts:

- Archivo Black
- Chakra Petch
- Nunito Sans
- Heebo

These are open-source Google Fonts families. Keep the upstream font license notices available if you later self-host font files. Do not commit unrelated commercial font files without a license record.

Google Fonts repository: https://github.com/google/fonts

## Wikimedia / Wikipedia media

Player photography is not treated as a single blanket license. The application now checks each image's Wikimedia metadata at runtime. A real-player image is shown only when:

1. a creator/photographer is present;
2. the license is on the project's explicit allowlist;
3. a license URL is present;
4. the original file/source page is present.

Accepted license-name families are centralized in `src/content-license-policy.js`. If verification fails, the game shows an anonymous silhouette instead.

## TheSportsDB

The previous player-image fallback has been disabled. Do not re-enable `strCutout`, `strThumb`, or another TheSportsDB image endpoint until you have implemented and reviewed reliable per-image rights metadata and the service terms for your intended use.

## Project assets

See:

- `asset-license-manifest.json`
- `ASSET_LICENSE_AUDIT.md`

Any asset marked `review` still requires a human provenance check before commercial launch.
