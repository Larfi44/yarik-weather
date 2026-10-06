# Yarik Weather — frontend

Plain HTML/CSS/JS static site: **no bundler, no npm dependencies, no backend**.
`public/` is the source tree; `scripts/build.sh` copies it to `out/`, which is
what Tauri (desktop/mobile), GitVerse Pages and the branch deployment serve.

## Where the weather comes from

The browser talks to [api-ninjas](https://api-ninjas.com) directly
(`public/js/api.js`):

```
GET /v1/geocoding?city=...        -> coordinates + timezone (cached in localStorage)
GET /v1/weather?lat=..&lon=..     -> current observation
GET /v1/weatherforecast?lat=..&lon=..
                                  -> 40 three-hourly intervals
```

The three answers are folded into the same `WeatherResponse` shape the old Rust
backend returned (`city`, `current`, `hourly`, `yesterday`, `forecast`,
`local_today`, `local_yesterday`, `latitude`, `longitude`, `timezone`,
`source`), so `weather.js`, `ai.js` and the modals were not rewritten. Six
daily cards are derived from the 3-hourly intervals, and the moon phase is
computed locally because api-ninjas does not publish it.

### Fields api-ninjas does not publish

Pressure, UV index, precipitation probability, sea temperature, history
("yesterday") and sunrise/sunset for days after day 0 are sent as `null`
instead of being faked, and the UI hides those rows (or drops the *Yesterday*
tab / chart point) when the value is `null`.

## API key

The key is resolved once at load, in this order:

1. `window.YW_API_KEY`
2. `?key=<key>` in the page URL
3. `<meta name="yw-api-key" content="...">`
4. `DEFAULT_API_KEY` committed in `public/js/api.js`

It is sent only in the `X-Api-Key` header — never in a URL. The committed key
is visible in the page source (free tier, rate limited); use `?key=` or the
meta tag with your own key for anything serious. Rotate at runtime with
`YW.api.setApiKey('<key>')` (`''` restores the committed key).

Requests have a 15 s deadline (`TIMEOUT_MS`) and errors surface as a localized
message in the status card, with `err.status`, `err.detail` and `err.url` kept
for debugging.

## Commands

```bash
./frontend/scripts/dev.sh [port]     # serve public/ on http://localhost:3000
./frontend/scripts/build.sh          # public/ -> out/ (used by Tauri + Pages)
node frontend/scripts/test-api.js    # 74 offline checks (network stubbed)
node frontend/scripts/test-api.js --live
                                     # + live api-ninjas calls (86 checks)
```

`test-api.js` needs no dependencies. For an end-to-end check of the *built*
site (real DOM, real search, real api-ninjas) a jsdom harness is kept outside
the repo so the site stays dependency-free:

```bash
mkdir -p /tmp/yw-dom && cd /tmp/yw-dom && npm install jsdom
node /tmp/yw-dom-test.js             # 48 checks against frontend/out
```

## Legacy backend

`?api=<url>`, `window.YW_API_URL` or `<meta name="yw-api-url">` switch the
client back to the self-hosted Rust server (`GET /?city=<name>`) — see
`../backend/README.md`. `YW.api.getApiUrl() === ''` means "api-ninjas
directly", which is the default.
