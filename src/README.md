# Yarik Weather — site source

Plain HTML/CSS/JS static site: **no bundler, no npm dependencies, no backend**.
`src/` holds everything the page loads (`js/`, `assets/`, `main.css`) and the
page shell lives one level up in `index.html`, which refers to those files as
`src/…`. `src/scripts/build.sh` assembles `src/out/` (the same files with flat
paths), which is what Tauri (desktop/mobile), GitVerse Pages and the branch
deployment serve.

## Where the weather comes from

The browser talks to [Open-Meteo](https://open-meteo.com) directly
(`src/js/api.js`) — **no API key and no backend required**:

```
GET geocoding-api.open-meteo.com/v1/search?name=…&count=1&language=…
    -> coordinates + IANA timezone (cached in localStorage)
GET api.open-meteo.com/v1/forecast?latitude=…&longitude=…&current=…&hourly=…&daily=…
    -> current conditions + 7 days of hourly points + 7 daily summaries
GET marine-api.open-meteo.com/v1/marine?…&hourly=sea_surface_temperature
    -> best-effort sea temperature for coastal cities (never fatal)
```

`timezone=auto` makes Open-Meteo answer with **local ISO strings for the city**
(`2026-10-05T09:00`), so the client does no timezone arithmetic at all, and
`past_days=1` brings yesterday into the same answer — that is what makes a real
*Yesterday* card and chart point possible.

The answers are folded into the same `WeatherResponse` shape the old Rust
backend returned (`city`, `city_name`, `current`, `hourly`, `yesterday`,
`forecast`, `local_today`, `local_yesterday`, `latitude`, `longitude`,
`timezone`, `source`), so `weather.js`, `ai.js` and the modals were not
rewritten. Six daily cards come from the daily block, the hourly series keeps
**every hour of every day** (24 points a day, so the hourly chart plots the whole
day), and the moon phase is still computed locally.

`city` is **exactly what the visitor typed** — search "sochi" and the headline
says "sochi", search «Сочи» and it says «Сочи»; the name is never translated
behind their back. `city_name` is the geocoder's own (localised) spelling and is
only used for the coastal check below.

Requests are header-less (`fetch(url)` only), which keeps every call a
CORS-"simple" request (no preflight), with a 15 s `AbortSignal` deadline
(8 s for the forecast gateway, so the standby gets its turn quickly).

### Blocked networks: the standby gateway

Some ISPs blackhole the node `api.open-meteo.com` resolves to for a visitor: the
request dies with `ERR_CONNECTION_TIMED_OUT` / `Failed to fetch` while every
other Open-Meteo host on the same cluster keeps answering. Instead of showing
that error, `api.js` retries the identical `/v1/forecast` call **once** on
`historical-forecast-api.open-meteo.com` (`FORECAST_FALLBACK_HOST`), which
serves the same payload from a different address — verified to return `current`,
all 168 hourly rows and the 7 daily cards, with CORS `*`.

Only a transport failure (`err.status === 0`) falls through to the standby; a
real HTTP answer is final, and when both gateways are down the status card says
"Could not reach the weather service" as before. The retry is logged:
`[YW.api] api.open-meteo.com is unreachable, retrying via …`.

### Fields Open-Meteo adds

The rows that used to be hidden are now real data: pressure, UV index (hourly,
daily, and borrowed from the nearest hourly row for the *current* card),
precipitation probability, sea temperature for coastal cities, sunrise/sunset
on **every** daily card (not just day 0) and a genuine yesterday. Values the API
reports as `null` are passed through as `null` and the UI hides those rows
instead of printing a fake zero.

### Cyrillic city names

Open-Meteo's geocoder only matches the Latin spelling ("Сочи" finds nothing,
"sochi" finds Sochi), so `api.js` transliterates a query that came back empty
and retries once (`TRANSLITERATION` + `latinGuess()`). The coordinate cache
stays keyed on what the user typed, and the headline keeps that typed spelling
(`city`), while the geocoder's answer is parked in `city_name`.

### Coastal cities

The sea-temperature rows (details card + hourly tooltip) only exist where there
is a sea: `coastal.js` holds the same five lists the Rust backend uses
(`COASTAL_CITIES_EN` / `COASTAL_CITIES_RU` in `backend/src/main.rs`, plus the
extra spellings), all run through `normalizeCity()` (lower-case, `ё`→`е`,
dots/hyphens→spaces), so «Сочи», «сочи», "Sochi" and "  SOCHI " all match. Both
`city` and `city_name` are checked, which is why a Cyrillic search still finds
the water.

## API key

None is needed: the free tier is key-less and every committed value is `''`.
A paid key can still be supplied, resolved once at load in this order:

1. `window.YW_API_KEY`
2. `?key=<key>` in the page URL
3. `<meta name="yw-api-key" content="...">`
4. `DEFAULT_API_KEY` in `src/js/api.js`

When one is present it is appended as the `apikey` **query parameter** (never a
header) — that is what Open-Meteo's paid customer API expects, and it keeps the
requests CORS-simple. Swap it at runtime with `YW.api.setApiKey('<key>')`
(`''` restores the key-less default).

Requests have a 15 s deadline (`TIMEOUT_MS`) and errors surface as a localized
message in the status card, with `err.status`, `err.detail` and `err.url` kept
for debugging (Open-Meteo's `{"reason": "..."}` bodies are decoded into a
readable sentence).

## Commands

```bash
./src/scripts/dev.sh [port]          # serve the repo root on http://localhost:3000
./src/scripts/build.sh               # index.html + src/ -> src/out (Tauri + Pages)
node src/scripts/test-api.js         # 104 offline checks (network stubbed)
node src/scripts/test-api.js --live  # + 17 checks against the live Open-Meteo API
```

`test-api.js` needs no dependencies: it evaluates `src/js/api.js` in a `vm`
sandbox with a stubbed window/DOM/localStorage, drives
`YW.api.fetchWeather()` and asserts the mapped `WeatherResponse`, the runtime
configuration and the error messages. For an end-to-end check of the *built*
site (real DOM, real search) a jsdom harness is kept outside the repo so the
site stays dependency-free:

```bash
mkdir -p /tmp/yw-dom && cd /tmp/yw-dom && npm install jsdom
node /tmp/yw-dom-test.js             # checks against src/out
```

## Legacy backend

`?api=<url>`, `window.YW_API_URL` or `<meta name="yw-api-url">` switch the
client back to the self-hosted Rust server (`GET /?city=<name>`) — see
`../backend/README.md`. `YW.api.getApiUrl() === ''` means "Open-Meteo
directly", which is the default.
