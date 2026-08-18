# Legal Launch Checklist

This checklist identifies issues code cannot resolve by itself. It is not legal advice.

## Before monetization / paid advertising

- [ ] Run a trademark search for **GUESS THE BALLER** in the countries where the product will be marketed.
- [ ] Have an IP lawyer review the commercial use of real players' names/likenesses, especially in advertising and paid products.
- [ ] Consider player/NIL licensing if real-player imagery becomes central to the commercial product.
- [ ] Confirm the provenance and ownership/commission terms for every project logo/icon marked `review` in `asset-license-manifest.json`.
- [ ] Keep official club, league, federation and competition logos out unless you obtain a license.
- [ ] Review all user-facing pack names; the hardening patch maps major branded league/award names to neutral display names while retaining stable internal IDs.
- [ ] Review factual player data provenance and avoid wholesale extraction from a protected third-party database.
- [ ] Publish Terms of Use appropriate to the service.
- [ ] Publish a Privacy Policy describing anonymous authentication, leaderboard names, multiplayer data, push tokens and bug reports.
- [ ] Decide retention/deletion rules for bug reports, usernames, push tokens and leaderboard records.
- [ ] Provide a contact route for copyright/privacy complaints and deletion requests.
- [ ] Review age/minor-user requirements for the markets you target.
- [ ] Re-check the current licenses/terms of every third-party service and library before launch.

## Marketing rule

For screenshots, Instagram posts, paid ads, landing-page hero art and other promotional captures, enable **Marketing Safe Mode** so the product does not render real-player photography.

Temporary URL mode:

`?marketingSafe=1`

Persistent browser mode:

```js
localStorage.setItem("gtbMarketingSafeMode", "1");
location.reload();
```

Disable persistent mode:

```js
localStorage.removeItem("gtbMarketingSafeMode");
location.reload();
```

You can also set this before app code executes:

```js
globalThis.GUESS_THE_BALLER_MARKETING_SAFE_MODE = true;
```

## Release checks

Run:

```bash
npm test
npm run validate:data
npm run validate:licenses
npm run build
```

Do not treat a passing technical validator as legal clearance. It only enforces the engineering rules encoded in this repository.
