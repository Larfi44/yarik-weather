/**
 * Weather client — talks to Open-Meteo (open-meteo.com) directly from the
 * browser, so no backend is required. The old Rust server in backend/ is kept
 * only as an optional fallback (see "Legacy backend" near the bottom).
 *
 * Every search makes two key-less requests:
 *
 *   1. GET geocoding-api.open-meteo.com/v1/search?name=<city>
 *        city -> latitude/longitude + IANA timezone (cached in localStorage)
 *   2. GET api.open-meteo.com/v1/forecast?latitude=&longitude=&…
 *        current + hourly (one row per hour) + daily blocks in a single answer
 *
 * A network that blackholes the forecast host does not break the app: when
 * api.open-meteo.com only ever times out (ERR_CONNECTION_TIMED_OUT — some ISPs
 * drop the node its DNS hands out, while the other Open-Meteo hosts on the same
 * cluster keep answering), the identical /v1/forecast call is retried once
 * against the standby gateway historical-forecast-api.open-meteo.com. See
 * FORECAST_FALLBACK_HOST.
 *
 * and, only for coastal cities, one best-effort extra call that must never
 * break a search:
 *
 *   3. GET marine-api.open-meteo.com/v1/marine?…&hourly=sea_surface_temperature
 *
 * The answers are folded into the same WeatherResponse shape the UI
 * (weather.js / ai.js) has always consumed:
 *
 *   { city, current, hourly[], yesterday, forecast[], local_today,
 *     local_yesterday }
 *
 * Unlike api-ninjas, Open-Meteo publishes every metric this UI renders, so the
 * rows that used to be hidden are populated for real:
 *
 *   pressure, uv_index, precipitation_probability, sea_temperature,
 *   a genuine `yesterday` (past_days=1), uv_index_max on the daily cards and
 *   sunrise/sunset on *every* daily card — not just day 0. The `current` block
 *   has no UV or rain-probability column, so the card borrows those two from
 *   the hourly row closest to "now".
 *
 * Cyrillic searches are transliterated once ("Сочи" -> "sochi"), because the
 * geocoder only indexes the Latin spelling.
 *
 * No API key is needed on the free tier. The key plumbing is kept anyway
 * (window.YW_API_KEY / ?key= / <meta name="yw-api-key"> / DEFAULT_API_KEY) and
 * a key, when present, is sent as Open-Meteo's `apikey` query parameter, i.e.
 * the paid customer API. It is never sent as a header, so every request stays
 * CORS-"simple" and no preflight is triggered.
 *
 * Open-Meteo answers with local-time ISO strings for the city (timezone=auto),
 * which is exactly what the mappers below want: no timezone arithmetic, no
 * unix timestamps to convert.
 *
 * NOTE: the temperature/wind unit arguments are kept for API parity with the
 * original call sites — the request always asks for °C and m/s, so the
 * conversion happens in the UI helpers.
 */
window.YW = window.YW || {};

(function (YW) {
  'use strict';

  /**
   * Open-Meteo's free tier needs no key, so nothing is committed here. A value
   * only shows up when one is supplied at runtime (?key=, window.YW_API_KEY,
   * the meta tag or YW.api.setApiKey()); it is then appended as the `apikey`
   * parameter, which is what Open-Meteo's paid customer API expects.
   */
  const DEFAULT_API_KEY = '';

  /** Global / query parameter / meta tag that can supply an API key. */
  const API_KEY_GLOBAL = 'YW_API_KEY';
  const API_KEY_PARAM = 'key';
  const API_KEY_META = 'yw-api-key';

  /** Open-Meteo hosts: forecast, geocoding and (best effort) marine data. */
  const API_HOST = 'https://api.open-meteo.com';
  const GEOCODE_HOST = 'https://geocoding-api.open-meteo.com';
  const MARINE_HOST = 'https://marine-api.open-meteo.com';

  /**
   * Standby gateway for the very same `/v1/forecast` endpoint.
   *
   * Open-Meteo serves the forecast from several addresses; some networks can
   * reach only part of them (a blackholed node answers with a TCP timeout and
   * nothing else, which the browser reports as ERR_CONNECTION_TIMED_OUT). The
   * historical-forecast host returned a byte-for-byte equivalent payload —
   * `current`, all 168 hourly rows and the 7 daily cards — from an address that
   * such a network still reaches, so it is used as a second attempt instead of
   * showing "Failed to fetch" to the visitor.
   */
  const FORECAST_FALLBACK_HOST = 'https://historical-forecast-api.open-meteo.com';

  /** How far ahead the daily strip goes, and whether yesterday is included. */
  const FORECAST_DAYS = 6;
  const PAST_DAYS = 1;

  /**
   * The primary gateway only fails by timing out on a blackholed network, so it
   * gets a shorter deadline than TIMEOUT_MS: the standby must get its turn
   * while the visitor is still looking at the spinner.
   */
  const PRIMARY_TIMEOUT_MS = 8000;

  /** Encoded once — sent to every endpoint so it stays in one place. */
  const FORECAST_PARAMS = {
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,' +
      'weather_code,cloud_cover,pressure_msl,wind_speed_10m,' +
      'wind_direction_10m,wind_gusts_10m',
    hourly:
      'temperature_2m,relative_humidity_2m,apparent_temperature,' +
      'precipitation_probability,precipitation,weather_code,cloud_cover,' +
      'pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,' +
      'uv_index',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,' +
      'sunrise,sunset,uv_index_max,precipitation_probability_max',
    timezone: 'auto',
    // Keep the numbers the UI (and ai.js) has always worked with.
    temperature_unit: 'celsius',
    wind_speed_unit: 'ms',
    past_days: PAST_DAYS,
    forecast_days: FORECAST_DAYS,
  };

  /** Give up on a hanging request instead of leaving the app on "Loading". */
  const TIMEOUT_MS = 15000;

  /** Searched cities are cached (city -> {latitude, longitude, timezone}). */
  const GEO_CACHE_KEY = 'yw_geocode_cache';

  /**
   * Legacy backend (backend/src/main.rs) that used to serve
   * GET <api-url>/?city=<name>. Empty means "disabled — use Open-Meteo
   * directly"; set it through window.YW_API_URL, ?api=<url> or
   * <meta name="yw-api-url"> if you ever host it again.
   */
  const DEFAULT_API_URL = '';

  /** Global / query parameter / meta tag that can point the app elsewhere. */
  const API_URL_GLOBAL = 'YW_API_URL';
  const API_URL_PARAM = 'api';
  const API_URL_META = 'yw-api-url';

  /** Yandex Cloud answers with this payload when the container is gone. */
  const GONE_CONTAINER = /Container\s+\S+\s+not found/i;

  /** Trims a candidate URL and drops trailing slashes; '' when unusable. */
  function normalizeUrl(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed ? trimmed.replace(/\/+$/, '') : '';
  }

  /** window.YW_API_URL — set by embedding shells (Tauri) or from the console. */
  function injectedUrl() {
    return normalizeUrl(window[API_URL_GLOBAL]);
  }

  /** ?api=<url> — handy on a device where editing files is awkward. */
  function queryUrl() {
    try {
      return normalizeUrl(new URLSearchParams(window.location.search).get(API_URL_PARAM));
    } catch (err) {
      return '';
    }
  }

  /** <meta name="yw-api-url" content="..."> — the committed configuration. */
  function metaUrl() {
    const meta = document.querySelector('meta[name="' + API_URL_META + '"]');
    return meta ? normalizeUrl(meta.getAttribute('content')) : '';
  }

  function resolveApiUrl() {
    return injectedUrl() || queryUrl() || metaUrl() || DEFAULT_API_URL;
  }

  let apiUrl = resolveApiUrl();

  // ── API key ──

  function normalizeKey(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  /** window.YW_API_KEY — set by embedding shells or from the console. */
  function injectedKey() {
    return normalizeKey(window[API_KEY_GLOBAL]);
  }

  /** ?key=<key> — handy on a device where editing files is awkward. */
  function queryKey() {
    try {
      return normalizeKey(
        new URLSearchParams(window.location.search).get(API_KEY_PARAM),
      );
    } catch (err) {
      return '';
    }
  }

  /** <meta name="yw-api-key" content="..."> — optional committed key. */
  function metaKey() {
    const meta = document.querySelector('meta[name="' + API_KEY_META + '"]');
    return meta ? normalizeKey(meta.getAttribute('content')) : '';
  }

  function resolveApiKey() {
    return injectedKey() || queryKey() || metaKey() || DEFAULT_API_KEY;
  }

  let apiKey = resolveApiKey();

  /** Host part of a URL, used in the user-facing "endpoint is gone" message. */
  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch (err) {
      return url;
    }
  }

  /** Reads the UI language without hard-depending on the settings module. */
  function t(en, ru) {
    let language = null;
    try {
      const settings = YW.settings && YW.settings.getSettings();
      language = settings && settings.language;
    } catch (err) {
      language = null;
    }
    // An unknown language (no settings module, sandboxed tests) means English:
    // without the explicit `russian &&` guard this comparison is
    // `undefined === undefined`, which is true.
    const russian = YW.Language && YW.Language.Russian;
    return russian && language === russian ? ru : en;
  }

  /** Pulls the message out of the backend's {"error": "..."} payload. */
  function describeBody(body) {
    const text = (body || '').trim();
    if (!text) return '';
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        // Open-Meteo reports its failures as {"reason": "...", "error": true}.
        if (typeof parsed.reason === 'string') return parsed.reason;
        if (typeof parsed.error === 'string') return parsed.error;
        if (typeof parsed.errorMessage === 'string') return parsed.errorMessage;
      }
    } catch (err) {
      // Not JSON — fall through and use the raw body.
    }
    return text;
  }

  /** Builds the Error shown in the status card, keeping diagnostics attached. */
  function apiError(message, status, detail, url) {
    const err = new Error(message);
    err.status = status;
    err.detail = detail;
    err.url = url;
    return err;
  }

  // ── HTTP ──

  /** Turns an Open-Meteo failure into an actionable, localized message. */
  function openMeteoMessage(status, detail) {
    const lower = String(detail || '').toLowerCase();

    // A bad key shows up as a 400 whose `reason` mentions the apikey.
    if (lower.indexOf('apikey') !== -1 || lower.indexOf('api key') !== -1) {
      return t(
        'Weather API key rejected (HTTP ' + status + '): Open-Meteo needs no key on the free tier — reset it with YW.api.setApiKey("")',
        'Ключ API погоды отклонён (HTTP ' + status + '): на бесплатном тарифе Open-Meteo ключ не нужен — сбросьте его через YW.api.setApiKey("")',
      );
    }
    if (
      status === 429 ||
      lower.indexOf('limit') !== -1 ||
      lower.indexOf('too many') !== -1
    ) {
      return t(
        'The free weather service is rate limited right now — try again in a minute',
        'Бесплатный сервис погоды ограничил число запросов — попробуйте через минуту',
      );
    }
    if (lower.indexOf('no data') !== -1) {
      return t('Open-Meteo refused the request: ', 'Open-Meteo отклонил запрос: ') + detail;
    }
    if (status >= 500) {
      return t(
        'Weather service is having trouble (HTTP ' + status + ')',
        'Сервис погоды испытывает трудности (HTTP ' + status + ')',
      );
    }
    return 'API error ' + status + (detail ? ': ' + detail : '');
  }

  /**
   * fetch() carrying the deadline's AbortSignal.
   *
   * A fetch that lives in another realm — jsdom with an injected fetch, a
   * polyfill or a webview shim — rejects a signal it did not create, so the
   * request is retried once without the deadline instead of failing outright.
   * Our *own* deadline firing is not that case: the request is over, and a
   * retry without a signal would only add an unbounded second attempt (on a
   * blackholed host that doubles the wait), so it is rethrown.
   */
  async function apiFetch(url, controller) {
    // Deliberately header-less: Open-Meteo authenticates (when it has to)
    // through the `apikey` query parameter, and a header-less GET stays a
    // CORS-"simple" request, so the browser never sends a preflight.
    if (!controller) return fetch(url);

    try {
      return await fetch(url, { signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) throw err;
      const message = err && err.message ? String(err.message) : '';
      if (message.indexOf('signal') === -1) throw err;
      console.warn('[YW.api] retrying without an abort signal (' + message + ')');
      return fetch(url);
    }
  }

  /**
   * GETs a JSON document with a deadline and errors that stay readable in the
   * status card. `timeoutMs` overrides the standard deadline for a caller that
   * cannot afford to wait for the full one (see PRIMARY_TIMEOUT_MS).
   */
  async function getJson(url, timeoutMs) {
    const deadline = typeof timeoutMs === 'number' ? timeoutMs : TIMEOUT_MS;
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(function () {
          controller.abort();
        }, deadline)
      : null;

    let resp;
    try {
      resp = await apiFetch(url, controller);
    } catch (err) {
      const aborted = err && err.name === 'AbortError';
      const reason = aborted
        ? t('no answer within ', 'нет ответа в течение ') +
          Math.round(deadline / 1000) +
          's'
        : err && err.message
          ? err.message
          : String(err);
      console.warn('[YW.api] cannot reach ' + hostOf(url) + ': ' + reason);
      throw apiError(
        t('Could not reach the weather service', 'Не удалось подключиться к сервису погоды') +
          ' (' + reason + ').',
        0,
        reason,
        url,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }

    const text = await resp.text().catch(function () {
      return '';
    });

    if (!resp.ok) {
      const detail = describeBody(text);
      console.warn('[YW.api] ' + url + ' -> HTTP ' + resp.status + ': ' + detail);
      throw apiError(openMeteoMessage(resp.status, detail), resp.status, detail, url);
    }

    try {
      return JSON.parse(text);
    } catch (err) {
      console.warn('[YW.api] ' + url + ' -> unparseable body: ' + text.slice(0, 120));
      throw apiError(
        t(
          'Weather service returned an unexpected response',
          'Сервис погоды вернул неожиданный ответ',
        ) +
          ' (' +
          hostOf(url) +
          ')',
        resp.status,
        text.slice(0, 200),
        url,
      );
    }
  }

  // ── Providers ──

  /**
   * Builds an Open-Meteo URL. When a key is configured it is appended as the
   * `apikey` parameter (what the paid customer API expects); otherwise the URL
   * stays plain, because the free tier needs no credentials at all.
   */
  function openMeteoUrl(host, path, params) {
    const query = Object.keys(params || {})
      .filter(function (name) {
        return params[name] !== undefined && params[name] !== null;
      })
      .map(function (name) {
        return name + '=' + encodeURIComponent(params[name]);
      })
      .join('&');

    const url = host + path + (query ? '?' + query : '');
    if (!apiKey) return url;
    return url + (query ? '&' : '?') + 'apikey=' + encodeURIComponent(apiKey);
  }

  /** Cached city -> coordinates/timezone lookups (localStorage, best effort). */
  function readGeoCache() {
    try {
      return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '{}') || {};
    } catch (err) {
      return {};
    }
  }

  function writeGeoCache(cache) {
    try {
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
    } catch (err) {
      // Private mode / file:// — the cache is an optimisation, not a need.
    }
  }

  /**
   * The interface language, so a geocoded city name comes back in the same
   * script the rest of the page uses (Open-Meteo localizes `name` for us).
   */
  function currentLanguage() {
    try {
      const settings =
        YW.settings && YW.settings.getSettings ? YW.settings.getSettings() : null;
      const lang = settings && settings.language ? String(settings.language) : '';
      return lang.slice(0, 2) || 'en';
    } catch (err) {
      return 'en';
    }
  }

  /**
   * Cyrillic -> Latin. Open-Meteo's geocoder only indexes the Latin spelling
   * ("Сочи" returns nothing, "sochi" finds Sochi), so a Cyrillic query is
   * transliterated as a second attempt — that way a Russian-language search
   * keeps working exactly like it did with the previous provider.
   */
  const TRANSLITERATION = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'i',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'kh',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'shch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
    і: 'i',
    ї: 'i',
    є: 'e',
    ґ: 'g',
  };

  /** 'Сочи' -> 'sochi'; '' when there was nothing non-Latin to convert. */
  function latinGuess(value) {
    const text = String(value || '');
    let out = '';
    let changed = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text.charAt(i).toLowerCase();
      const mapped = TRANSLITERATION[ch];
      if (mapped === undefined) {
        out += ch;
      } else {
        out += mapped;
        changed = true;
      }
    }

    return changed ? out : '';
  }

  /** The geocoding URL for one spelling of a city name. */
  function geocodeUrl(name) {
    return openMeteoUrl(GEOCODE_HOST, '/v1/search', {
      name: name,
      count: 1,
      language: currentLanguage(),
      format: 'json',
    });
  }

  /**
   * One geocoding attempt: { name, latitude, longitude, country, timezone },
   * or null when the spelling is not in the database.
   */
  async function geocodeLookup(name) {
    const answer = await getJson(geocodeUrl(name));
    const results = answer && Array.isArray(answer.results) ? answer.results : [];
    const first = results.length > 0 ? results[0] : null;
    if (!first || typeof first.latitude !== 'number') return null;

    return {
      name: first.name || name,
      latitude: first.latitude,
      longitude: first.longitude,
      country: first.country || '',
      timezone: first.timezone || '',
    };
  }

  /**
   * Turns a city name into { name, latitude, longitude, country, timezone }.
   * Open-Meteo geocodes for free and understands both Latin and Cyrillic
   * names (the latter through the transliteration above), so the app never
   * needs coordinates from the visitor.
   */
  async function geocodeCity(city) {
    const lookup = String(city || '').trim();
    if (!lookup) {
      throw apiError(
        t('Enter a city name', 'Введите название города'),
        400,
        'empty city',
        '',
      );
    }

    const cacheId = lookup.toLowerCase();
    const cache = readGeoCache();
    if (cache[cacheId]) return cache[cacheId];

    let place = await geocodeLookup(lookup);
    if (!place) {
      const latin = latinGuess(lookup);
      if (latin) place = await geocodeLookup(latin);
    }

    if (!place) {
      throw apiError(
        t('City not found: ', 'Город не найден: ') + lookup,
        404,
        'geocoding returned no match',
        geocodeUrl(lookup),
      );
    }

    cache[cacheId] = place;
    writeGeoCache(cache);
    return place;
  }

  /**
   * One request carries everything the UI needs: current conditions, the
   * hourly series (every hour of every day) and the daily summary. `past_days=1`
   * is what makes a real Yesterday card possible.
   */
  function fetchForecast(latitude, longitude) {
    // Coordinates first: it keeps every Open-Meteo URL in this file readable
    // and identical in shape (`?latitude=..&longitude=..&…`).
    const params = Object.assign(
      { latitude: latitude, longitude: longitude },
      FORECAST_PARAMS,
    );
    return forecastFrom(API_HOST, params);
  }

  /** True for a transport failure, i.e. no HTTP answer came back at all. */
  function isUnreachable(err) {
    return !!(err && err.status === 0);
  }

  /**
   * GETs the forecast from one gateway, with the standby gateway as a second
   * attempt when the first one is unreachable.
   *
   * Only a transport failure falls through: `status === 0` means the host never
   * answered (DNS, blackholed node, offline, CORS), while a real HTTP status
   * means it did answer — and the standby serves the same data, so asking it
   * again would only repeat the same error.
   */
  async function forecastFrom(host, params) {
    const primary = openMeteoUrl(host, '/v1/forecast', params);

    try {
      return await getJson(primary, PRIMARY_TIMEOUT_MS);
    } catch (err) {
      if (!isUnreachable(err)) throw err;
      const standby = openMeteoUrl(FORECAST_FALLBACK_HOST, '/v1/forecast', params);
      console.warn(
        '[YW.api] ' + hostOf(primary) + ' is unreachable, retrying via ' + hostOf(standby),
      );
      return getJson(standby);
    }
  }

  /**
   * Best-effort sea-surface temperature, only worth asking for near a coast.
   * Inland coordinates make the marine API fail, so the failure is swallowed:
   * `current.sea_temperature` simply stays null and the UI hides the row.
   */
  async function fetchMarine(latitude, longitude) {
    try {
      return await getJson(
        openMeteoUrl(MARINE_HOST, '/v1/marine', {
          latitude: latitude,
          longitude: longitude,
          hourly: 'sea_surface_temperature',
          timezone: 'auto',
          past_days: PAST_DAYS,
          forecast_days: FORECAST_DAYS,
        }),
      );
    } catch (err) {
      console.warn(
        '[YW.api] no sea data for ' +
          latitude +
          ',' +
          longitude +
          ': ' +
          (err && err.message ? err.message : err),
      );
      return null;
    }
  }

  // ── Time zones & moon phase (computed locally, no extra request) ──

  // Open-Meteo is asked for `timezone=auto`, so every timestamp it returns is
  // already a local-time ISO string for the city ('2026-10-05T09:00'). That
  // makes IANA arithmetic unnecessary here: date = slice(0, 10) and
  // time = slice(11, 16) is all the mappers below need.

  /** Shifts a 'YYYY-MM-DD' string by whole days (calendar-safe, UTC based). */
  function shiftDate(dateStr, days) {
    const date = new Date(dateStr + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  /**
   * Moon phase for a date — a faithful JS port of moon_phase_for_date() in
   * backend/src/main.rs so the Sun & Moon card survives without the backend.
   */
  function moonPhaseForDate(dateStr) {
    const synodicMonth = 29.53058867;
    const reference = Date.UTC(2000, 0, 6, 0, 0, 0);
    const target = Date.parse(dateStr + 'T00:00:00Z');
    if (isNaN(target)) return { name: undefined, illumination: undefined };

    let age = ((target - reference) / 3600000 / 24) % synodicMonth;
    if (age < 0) age += synodicMonth;

    const illumination =
      ((1 - Math.cos((2 * Math.PI * age) / synodicMonth)) / 2) * 100;

    let name = 'New Moon';
    if (age < 1.84566) name = 'New Moon';
    else if (age < 5.53699) name = 'Waxing Crescent';
    else if (age < 9.22831) name = 'First Quarter';
    else if (age < 12.91963) name = 'Waxing Gibbous';
    else if (age < 16.61096) name = 'Full Moon';
    else if (age < 20.30228) name = 'Waning Gibbous';
    else if (age < 23.99361) name = 'Last Quarter';
    else if (age < 27.68493) name = 'Waning Crescent';
    else name = 'New Moon';

    return { name: name, illumination: Math.round(illumination * 10) / 10 };
  }

  // ── Mapping Open-Meteo -> WeatherResponse ──

  /**
   * WMO weather interpretation codes -> the description strings the rest of
   * the app already speaks. These are the exact keys of helpers.CONDITION_RU
   * and the substrings helpers.conditionIconFromText() looks for, so both the
   * emoji picker and the Russian translation table keep working unchanged.
   */
  const WMO_CONDITIONS = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };

  /** The description for a WMO code; 'Unknown' when the code is missing. */
  function describeWeather(code) {
    if (code == null) return 'Unknown';
    return WMO_CONDITIONS[code] || 'Unknown';
  }

  /**
   * Reads one value out of a parallel array. Open-Meteo ships `null` for the
   * points it cannot compute, and the UI hides a row fed `null` instead of
   * printing a fake zero — so anything non-finite collapses to null here.
   */
  function numberAt(series, index) {
    if (!series || index < 0 || index >= series.length) return null;
    const value = series[index];
    return typeof value === 'number' && isFinite(value) ? value : null;
  }

  /**
   * Reads one scalar out of the `current` block, which — unlike `hourly` and
   * `daily` — is an object of plain numbers rather than parallel arrays.
   */
  function currentNumber(current, name) {
    const value = current ? current[name] : undefined;
    return typeof value === 'number' && isFinite(value) ? value : null;
  }

  /** Folds one column of the daily block into a DailyData card. */
  function dailyCard(daily, index) {
    const date = String((daily.time || [])[index] || '').slice(0, 10);
    const moon = moonPhaseForDate(date);

    return {
      date: date,
      temperature_max: numberAt(daily.temperature_2m_max, index),
      temperature_min: numberAt(daily.temperature_2m_min, index),
      wind_speed_max: numberAt(daily.wind_speed_10m_max, index),
      condition: describeWeather(numberAt(daily.weather_code, index)),
      // Unlike api-ninjas, Open-Meteo knows the sun times of every single day.
      sunrise: daily.sunrise ? daily.sunrise[index] : undefined,
      sunset: daily.sunset ? daily.sunset[index] : undefined,
      moon_phase_name: moon.name,
      moon_illumination: moon.illumination,
      uv_index_max: numberAt(daily.uv_index_max, index),
      precipitation_probability_max: numberAt(
        daily.precipitation_probability_max,
        index,
      ),
    };
  }

  /** One card per forecast day; yesterday gets a field of its own instead. */
  function buildDaily(daily, today) {
    const dates = (daily && daily.time) || [];
    const days = [];

    for (let i = 0; i < dates.length; i++) {
      const date = String(dates[i]).slice(0, 10);
      if (date < today) continue;
      days.push(dailyCard(daily, i));
    }

    return days;
  }

  /**
   * Yesterday's card. It only exists because the forecast request asks for
   * `past_days=1`, so day -1 is part of that very same answer.
   */
  function buildYesterday(daily, today) {
    const dates = (daily && daily.time) || [];
    const wanted = shiftDate(today, -1);

    for (let i = 0; i < dates.length; i++) {
      if (String(dates[i]).slice(0, 10) === wanted) return dailyCard(daily, i);
    }

    return null;
  }

  /** Today's sunrise/sunset, shown in the current-conditions card. */
  function todaySun(daily, today) {
    const dates = (daily && daily.time) || [];
    const index = dates.findIndex(function (value) {
      return String(value).slice(0, 10) === today;
    });

    if (index === -1) return { sunrise: undefined, sunset: undefined };
    return {
      sunrise: daily.sunrise ? daily.sunrise[index] : undefined,
      sunset: daily.sunset ? daily.sunset[index] : undefined,
    };
  }

  /**
   * Normalises the hourly block into the UI's HourlyData shape — one row per
   * hour, so the chart can draw a point for every hour of the day. `seaByTime`
   * maps a local ISO hour to its sea-surface temperature (empty for a city that
   * is not on a coast).
   */
  function buildHourly(hourly, seaByTime) {
    const times = (hourly && hourly.time) || [];
    const rows = [];

    for (let i = 0; i < times.length; i++) {
      const iso = String(times[i]);

      rows.push({
        date: iso.slice(0, 10),
        time: iso.slice(11, 16),
        temperature: numberAt(hourly.temperature_2m, i),
        feels_like: numberAt(hourly.apparent_temperature, i),
        humidity: numberAt(hourly.relative_humidity_2m, i),
        wind_speed: numberAt(hourly.wind_speed_10m, i),
        wind_degrees: numberAt(hourly.wind_direction_10m, i),
        cloud_pct: numberAt(hourly.cloud_cover, i),
        condition: describeWeather(numberAt(hourly.weather_code, i)),
        pressure: numberAt(hourly.pressure_msl, i),
        uv_index: numberAt(hourly.uv_index, i),
        precipitation_probability: numberAt(hourly.precipitation_probability, i),
        precipitation: numberAt(hourly.precipitation, i),
        sea_temperature: seaByTime ? seaByTime[iso] || null : null,
      });
    }

    return rows;
  }

  /** Maps every local ISO hour of the marine answer to its sea temperature. */
  function seaTemperatures(marine) {
    const hourly = (marine && marine.hourly) || {};
    const times = hourly.time || [];
    const byTime = {};

    for (let i = 0; i < times.length; i++) {
      const value = numberAt(hourly.sea_surface_temperature, i);
      if (value != null) byTime[String(times[i])] = value;
    }

    return byTime;
  }

  /** The index of `hourly` closest to `nowIso` (-1 when the series is empty). */
  function nearestHourIndex(hourly, nowIso) {
    const times = (hourly && hourly.time) || [];
    if (times.length === 0) return -1;
    if (!nowIso) return 0;

    const now = Date.parse(String(nowIso));
    let best = 0;
    let bestGap = Infinity;

    for (let i = 0; i < times.length; i++) {
      const gap = Math.abs(Date.parse(String(times[i])) - now);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }

    return best;
  }

  /** The marine reading closest to `nowIso`, null when there is none. */
  function nearestSeaTemperature(seaByTime, nowIso) {
    const times = Object.keys(seaByTime || {});
    if (times.length === 0) return null;
    if (!nowIso) return seaByTime[times[0]];

    const now = Date.parse(String(nowIso));
    let best = null;
    let bestGap = Infinity;

    times.forEach(function (key) {
      const gap = Math.abs(Date.parse(key) - now);
      if (gap < bestGap) {
        bestGap = gap;
        best = seaByTime[key];
      }
    });

    return best;
  }

  /** CurrentData, plus the coordinates/timezone ai.js can use for context. */
  function buildCurrent(forecast, place, seaByTime) {
    const current = forecast.current || {};
    const hourly = forecast.hourly || {};
    const nowIso = current.time;
    // The `current` block has no UV/probability column, so those two are taken
    // from the hourly row closest to "now" — that is what the card displays.
    const index = nearestHourIndex(hourly, nowIso);
    const sun = todaySun(forecast.daily, String(nowIso || '').slice(0, 10));
    const code = currentNumber(current, 'weather_code');

    return {
      temperature: currentNumber(current, 'temperature_2m'),
      feels_like: currentNumber(current, 'apparent_temperature'),
      humidity: currentNumber(current, 'relative_humidity_2m'),
      wind_speed: currentNumber(current, 'wind_speed_10m'),
      wind_degrees: currentNumber(current, 'wind_direction_10m'),
      cloud_pct: currentNumber(current, 'cloud_cover'),
      weather_code: code,
      is_day: currentNumber(current, 'is_day') === 1,
      condition: describeWeather(code),
      pressure: currentNumber(current, 'pressure_msl'),
      sea_temperature: nearestSeaTemperature(seaByTime, nowIso),
      uv_index: numberAt(hourly.uv_index, index),
      precipitation_probability: numberAt(hourly.precipitation_probability, index),
      sunrise: sun.sunrise,
      sunset: sun.sunset,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone,
    };
  }

  /**
   * Assembles the WeatherResponse the UI has always consumed. Everything comes
   * out of a single forecast answer, so every timestamp is already city-local
   * ISO text — no timezone arithmetic anywhere below.
   */
  function buildWeatherResponse(city, place, forecast, marine) {
    const current = forecast.current || {};
    const today = String(current.time || '').slice(0, 10);
    const seaByTime = seaTemperatures(marine);

    return {
      city: place.name || city,
      current: buildCurrent(forecast, place, seaByTime),
      hourly: buildHourly(forecast.hourly, seaByTime),
      // `past_days=1` makes yesterday part of the same answer.
      yesterday: buildYesterday(forecast.daily, today),
      forecast: buildDaily(forecast.daily, today),
      local_today: today,
      local_yesterday: shiftDate(today, -1),
      // Extra context for the AI module and for debugging.
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone || forecast.timezone || 'UTC',
      source: 'open-meteo',
    };
  }

  /** The default provider: geocode -> forecast (+ marine) -> map. */
  async function fetchFromOpenMeteo(city) {
    const place = await geocodeCity(city);

    // Marine data is a coastal bonus. A city far from the sea simply has no
    // sea point, which open-meteo reports as an empty series — so the row is
    // hidden instead of failing the whole lookup.
    const answers = await Promise.all([
      fetchForecast(place.latitude, place.longitude),
      fetchMarine(place.latitude, place.longitude).catch(function () {
        return null;
      }),
    ]);

    return buildWeatherResponse(city, place, answers[0], answers[1]);
  }


  /**
   * Self-hosted backend (backend/src/main.rs): GET <url>/?city=<name>.
   * Kept for the day the Rust server is deployed again.
   */
  async function fetchFromBackend(city, url) {
    const endpoint = url + '/?city=' + encodeURIComponent(city);

    let resp;
    try {
      resp = await fetch(endpoint);
    } catch (err) {
      const reason = err && err.message ? err.message : String(err);
      console.warn('[YW.api] cannot reach ' + endpoint + ': ' + reason);
      throw apiError(
        t('Could not reach the weather service', 'Не удалось подключиться к сервису погоды') +
          ' (' +
          reason +
          ').',
        0,
        reason,
        endpoint,
      );
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const detail = describeBody(body);
      console.warn('[YW.api] ' + endpoint + ' -> HTTP ' + resp.status + ': ' + detail);

      if (GONE_CONTAINER.test(detail)) {
        // The deployment behind the configured endpoint no longer exists.
        throw apiError(
          t('Weather service unavailable: the API at ', 'Сервис погоды недоступен: API по адресу ') +
            hostOf(url) +
            t(' no longer exists.', ' больше не существует.') +
            ' (HTTP ' +
            resp.status +
            ')',
          resp.status,
          detail,
          endpoint,
        );
      }

      throw apiError(
        'API error ' + resp.status + (detail ? ': ' + detail : ''),
        resp.status,
        detail,
        endpoint,
      );
    }

    const data = await resp.json();
    return data;
  }

  // ── Public entry point ──

  /**
   * Looks a city up. Open-Meteo is used unless a legacy backend URL was
   * configured (window.YW_API_URL / ?api= / <meta name="yw-api-url">).
   *
   * Rejects with a localized Error whose `status`, `detail` and `url`
   * properties keep the technical cause available for debugging.
   */
  async function fetchWeather(city, _tempUnit, _windUnit) {
    if (apiUrl) return fetchFromBackend(city, apiUrl);
    return fetchFromOpenMeteo(city);
  }

  YW.api = {
    fetchWeather: fetchWeather,

    /** The optional Open-Meteo key in use ('' on the free tier). */
    getApiKey: function () {
      return apiKey;
    },
    /**
     * Swaps the optional Open-Meteo key at runtime; '' restores the default.
     * The free tier never needs it — a key only raises the paid rate limits.
     */
    setApiKey: function (next) {
      apiKey = normalizeKey(next) || DEFAULT_API_KEY;
      return apiKey;
    },
    /** Re-runs key resolution (window -> ?key -> meta -> default). */
    resolveApiKey: function () {
      apiKey = resolveApiKey();
      return apiKey;
    },
    DEFAULT_API_KEY: DEFAULT_API_KEY,

    /** Drops the cached city coordinates (they rarely change). */
    clearGeocodeCache: function () {
      try {
        localStorage.removeItem(GEO_CACHE_KEY);
      } catch (err) {
        // Nothing to clear when localStorage is unavailable.
      }
    },

    /** Legacy backend URL in use ('' means "Open-Meteo directly"). */
    getApiUrl: function () {
      return apiUrl;
    },
    /** Points the client at a self-hosted backend at runtime. */
    setApiUrl: function (next) {
      apiUrl = normalizeUrl(next) || DEFAULT_API_URL;
      return apiUrl;
    },
    /** Re-runs endpoint resolution (window -> ?api -> meta -> default). */
    resolveApiUrl: resolveApiUrl,
    DEFAULT_API_URL: DEFAULT_API_URL,
    /** Kept for backwards compatibility with the first port of api.ts. */
    API_URL: apiUrl,
    API_HOST: API_HOST,
    /** Standby gateway used when API_HOST cannot be reached at all. */
    FORECAST_FALLBACK_HOST: FORECAST_FALLBACK_HOST,
  };
})(window.YW);
