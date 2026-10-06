/**
 * Weather client — talks to api-ninjas (api-ninjas.com) directly from the
 * browser, so no backend is required. The old Rust server in backend/ is kept
 * only as an optional fallback (see "Legacy backend" near the bottom).
 *
 * Every search sends the X-Api-Key header to three endpoints:
 *
 *   1. GET /v1/geocoding?city=<name>      city -> lat/lon + IANA timezone
 *   2. GET /v1/weather?lat=&lon=          current conditions
 *   3. GET /v1/weatherforecast?lat=&lon=  40 entries = 5 days * 3 hours
 *
 * and folds the three answers into the same WeatherResponse shape the UI
 * (weather.js / ai.js) has always consumed:
 *
 *   { city, current, hourly[], yesterday, forecast[], local_today,
 *     local_yesterday }
 *
 * Values api-ninjas does not provide stay `null` and the UI hides their rows
 * instead of printing fake zeros:
 *
 *   pressure, uv_index, precipitation_probability, sea_temperature,
 *   yesterday (no historical endpoint), uv_index_max on the daily cards,
 *   per-day sunrise/sunset (only day 0 gets them, from the geocoding sun block).
 *
 * API key resolution order — the first non-empty value wins:
 *
 *   1. window.YW_API_KEY            injected at runtime (console, Tauri, tests)
 *   2. ?key=<key>                   per-load override, e.g. index.html?key=...
 *   3. <meta name="yw-api-key">     optional tag, if you keep the key in the HTML
 *   4. DEFAULT_API_KEY              the committed key below
 *
 * Repointing needs no rebuild: run YW.api.setApiKey('...') in the console.
 *
 * NOTE: the temperature/wind unit arguments are kept for API parity with the
 * original call sites — api-ninjas always answers in °C and m/s, so the
 * conversion happens in the UI helpers.
 */
window.YW = window.YW || {};

(function (YW) {
  'use strict';

  /**
   * Committed api-ninjas key (free tier). It is visible in the page source:
   * rotate it on api-ninjas.com and paste the new value here, or override it at
   * runtime via ?key=, window.YW_API_KEY or YW.api.setApiKey().
   */
  const DEFAULT_API_KEY = '6b9usH0CRcyVa7x0enU53PhyCxj0WVahFkS7yqii';

  /** Global / query parameter / meta tag that can supply an API key. */
  const API_KEY_GLOBAL = 'YW_API_KEY';
  const API_KEY_PARAM = 'key';
  const API_KEY_META = 'yw-api-key';

  /** api-ninjas host; the key travels in a header, never in the URL. */
  const API_HOST = 'https://api.api-ninjas.com';

  /** Give up on a hanging request instead of leaving the app on "Loading". */
  const TIMEOUT_MS = 15000;

  /** Searched cities are cached (city -> {lat, lon, timezone, sun}). */
  const GEO_CACHE_KEY = 'yw_geocode_cache';

  /**
   * Legacy backend (backend/src/main.rs) that used to serve
   * GET <api-url>/?city=<name>. Empty means "disabled — use api-ninjas
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

  /** Turns an api-ninjas failure into an actionable, localized message. */
  function apiNinjasMessage(status, detail) {
    const lower = String(detail || '').toLowerCase();

    if (lower.indexOf('missing api key') !== -1) {
      return t(
        'Weather API key missing: set one in js/api.js (DEFAULT_API_KEY) or call YW.api.setApiKey("<your key>")',
        'Отсутствует ключ API погоды: укажите его в js/api.js (DEFAULT_API_KEY) или вызовите YW.api.setApiKey("<ваш ключ>")',
      );
    }
    if (lower.indexOf('invalid api key') !== -1) {
      return t(
        'Weather API key rejected (HTTP ' + status + '): check the api-ninjas key',
        'Ключ API погоды отклонён (HTTP ' + status + '): проверьте ключ api-ninjas',
      );
    }
    if (lower.indexOf('premium') !== -1) {
      return t('api-ninjas refused the request: ', 'api-ninjas отклонил запрос: ') + detail;
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
   */
  async function apiFetch(url, controller) {
    const options = { headers: { 'X-Api-Key': apiKey } };
    if (!controller) return fetch(url, options);

    try {
      return await fetch(url, {
        headers: options.headers,
        signal: controller.signal,
      });
    } catch (err) {
      const message = err && err.message ? String(err.message) : '';
      if (message.indexOf('signal') === -1) throw err;
      console.warn('[YW.api] retrying without an abort signal (' + message + ')');
      return fetch(url, options);
    }
  }

  /**
   * GETs a JSON document with the api-ninjas key, a deadline and errors that
   * stay readable in the status card.
   */
  async function getJson(url) {
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(function () {
          controller.abort();
        }, TIMEOUT_MS)
      : null;

    let resp;
    try {
      resp = await apiFetch(url, controller);
    } catch (err) {
      const aborted = err && err.name === 'AbortError';
      const reason = aborted
        ? t('no answer within ', 'нет ответа в течение ') +
          Math.round(TIMEOUT_MS / 1000) +
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
      throw apiError(apiNinjasMessage(resp.status, detail), resp.status, detail, url);
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

  /** Builds an api-ninjas URL; the key always travels in a header. */
  function apiNinjasUrl(path, params) {
    const query = Object.keys(params || {})
      .map(function (name) {
        return name + '=' + encodeURIComponent(params[name]);
      })
      .join('&');
    return API_HOST + path + (query ? '?' + query : '');
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
   * Turns a city name into { name, latitude, longitude, country, timezone,
   * sun }. The free tier refuses /v1/weather?city=, so a coordinate lookup
   * always comes first. Latin and Cyrillic names both work.
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

    const url = apiNinjasUrl('/v1/geocoding', { city: lookup });
    const results = await getJson(url);
    const first =
      Array.isArray(results) && results.length > 0 ? results[0] : null;

    if (!first || typeof first.latitude !== 'number') {
      throw apiError(
        t('City not found: ', 'Город не найден: ') + lookup,
        404,
        'geocoding returned no match',
        url,
      );
    }

    const place = {
      name: first.name || lookup,
      latitude: first.latitude,
      longitude: first.longitude,
      country: first.country || '',
      timezone: first.timezone || '',
      sun: first.sun || null,
    };

    cache[cacheId] = place;
    writeGeoCache(cache);
    return place;
  }

  /** Current conditions for a coordinate pair. */
  function fetchCurrent(latitude, longitude) {
    return getJson(apiNinjasUrl('/v1/weather', { lat: latitude, lon: longitude }));
  }

  /** 40 three-hourly entries covering the next 5 days. */
  function fetchForecast(latitude, longitude) {
    return getJson(
      apiNinjasUrl('/v1/weatherforecast', { lat: latitude, lon: longitude }),
    );
  }

  // ── Time zones & moon phase (computed locally, no extra request) ──

  /** Returns the IANA zone when the runtime understands it, else null. */
  function safeTimezone(timezone) {
    if (!timezone) return null;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return timezone;
    } catch (err) {
      return null;
    }
  }

  /**
   * Splits a unix timestamp into the city's local calendar date and clock time,
   * e.g. 1791190800 in Europe/Moscow -> { date: '2026-10-05', time: '09:00' }.
   * Falls back to UTC when the zone is unknown.
   */
  function localParts(timestampSeconds, timezone) {
    const ms = timestampSeconds * 1000;
    const zone = safeTimezone(timezone);

    if (!zone) {
      const utc = new Date(ms).toISOString();
      return { date: utc.slice(0, 10), time: utc.slice(11, 16) };
    }

    // sv-SE renders ISO-like local values: "2026-10-05 09:00".
    const formatted = new Intl.DateTimeFormat('sv-SE', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ms));

    const parts = formatted.split(' ');
    return { date: parts[0], time: (parts[1] || '00:00').slice(0, 5) };
  }

  /** Shifts a 'YYYY-MM-DD' string by whole days (calendar-safe, UTC based). */
  function shiftDate(dateStr, days) {
    const date = new Date(dateStr + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  /** Today's calendar date in the city, not in the visitor's own zone. */
  function localToday(timezone) {
    return localParts(Math.floor(Date.now() / 1000), timezone).date;
  }

  /**
   * Converts an ISO instant (the geocoding `sun` block is UTC) into the city's
   * local 'YYYY-MM-DDTHH:MM' — the shape helpers.formatTime() understands.
   */
  function localIsoTime(iso, timezone) {
    if (!iso) return undefined;
    const ms = Date.parse(iso);
    if (isNaN(ms)) return undefined;
    const parts = localParts(Math.floor(ms / 1000), timezone);
    return parts.date + 'T' + parts.time;
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

  // ── Mapping api-ninjas -> WeatherResponse ──

  /** Ranks conditions so a day's summary picks the most "eventful" weather. */
  const CONDITION_SEVERITY = [
    'tornado',
    'squall',
    'thunder',
    'snow',
    'sleet',
    'freezing',
    'shower',
    'rain',
    'drizzle',
    'fog',
    'mist',
    'haze',
    'smoke',
    'dust',
    'sand',
    'ash',
    'overcast',
    'cloud',
    'clear',
  ];

  /** Higher = more noteworthy (0 for "clear", negative for the tail). */
  function severityOf(condition) {
    const lower = String(condition || '').toLowerCase();
    let rank = 0;
    for (let i = 0; i < CONDITION_SEVERITY.length; i++) {
      if (lower.indexOf(CONDITION_SEVERITY[i]) !== -1) {
        rank = CONDITION_SEVERITY.length - i;
        break;
      }
    }
    return rank;
  }

  /** The day's most frequent description; ties go to the harsher one. */
  function dominantCondition(entries) {
    const counts = {};
    entries.forEach((entry) => {
      const description = entry.weather_description || 'Unknown';
      counts[description] = (counts[description] || 0) + 1;
    });
    return (
      Object.keys(counts).sort((a, b) => {
        if (counts[b] !== counts[a]) return counts[b] - counts[a];
        return severityOf(b) - severityOf(a);
      })[0] || 'Unknown'
    );
  }

  /** Converts unix seconds into the city's local 'YYYY-MM-DDTHH:MM'. */
  function localIsoFromUnix(seconds, timezone) {
    if (seconds == null) return undefined;
    const parts = localParts(seconds, timezone);
    return parts.date + 'T' + parts.time;
  }

  /**
   * Folds the three-hourly entries into one card per day. Day 0 additionally
   * carries sunrise/sunset, because the geocoding `sun` block only describes
   * today — later days simply omit them (the UI shows "N/A").
   */
  function buildDaily(intervals, timezone, sun) {
    const days = [];
    const byDate = {};

    (intervals || []).forEach((interval) => {
      const parts = localParts(interval.timestamp, timezone);
      let day = byDate[parts.date];

      if (!day) {
        day = {
          date: parts.date,
          entries: [],
          temperature_max: -Infinity,
          temperature_min: Infinity,
          wind_speed_max: 0,
        };
        byDate[parts.date] = day;
        days.push(day);
      }

      day.entries.push(interval);
      const high = interval.max_temp != null ? interval.max_temp : interval.temp;
      const low = interval.min_temp != null ? interval.min_temp : interval.temp;
      day.temperature_max = Math.max(day.temperature_max, high);
      day.temperature_min = Math.min(day.temperature_min, low);
      day.wind_speed_max = Math.max(day.wind_speed_max, interval.wind_speed || 0);
    });

    return days.map((day, index) => {
      const moon = moonPhaseForDate(day.date);
      return {
        date: day.date,
        temperature_max: day.temperature_max === -Infinity ? 0 : day.temperature_max,
        temperature_min: day.temperature_min === Infinity ? 0 : day.temperature_min,
        wind_speed_max: day.wind_speed_max,
        condition: dominantCondition(day.entries),
        sunrise: index === 0 ? localIsoTime(sun && sun.sunrise, timezone) : undefined,
        sunset: index === 0 ? localIsoTime(sun && sun.sunset, timezone) : undefined,
        moon_phase_name: moon.name,
        moon_illumination: moon.illumination,
        // Not published by api-ninjas — the UI hides these rows.
        uv_index_max: null,
        precipitation_probability_max: null,
      };
    });
  }

  /** Normalises one three-hourly entry into the UI's HourlyData shape. */
  function buildHourly(intervals, timezone) {
    return (intervals || []).map((interval) => {
      const parts = localParts(interval.timestamp, timezone);
      return {
        date: parts.date,
        time: parts.time,
        temperature: interval.temp,
        wind_speed: interval.wind_speed,
        condition: interval.weather_description || 'Unknown',
        // Not published by api-ninjas — the UI hides these rows.
        pressure: null,
        sea_temperature: null,
        uv_index: null,
        precipitation_probability: null,
      };
    });
  }

  /** CurrentData, plus the coordinates/timezone ai.js can use for context. */
  function buildCurrent(observation, place, timezone) {
    return {
      temperature: observation.temp,
      feels_like: observation.feels_like,
      humidity: observation.humidity,
      wind_speed: observation.wind_speed,
      wind_degrees: observation.wind_degrees,
      cloud_pct: observation.cloud_pct,
      weather_code: observation.weather_code,
      is_day: observation.is_day,
      condition: observation.weather_description || 'Unknown',
      // Not published by api-ninjas — the UI hides these rows.
      pressure: null,
      sea_temperature: null,
      uv_index: null,
      precipitation_probability: null,
      sunrise: localIsoFromUnix(observation.sunrise, timezone),
      sunset: localIsoFromUnix(observation.sunset, timezone),
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: timezone,
    };
  }

  /** Assembles the WeatherResponse the UI has always consumed. */
  function buildWeatherResponse(city, place, observation, intervals) {
    const timezone = place.timezone;
    const today = localToday(timezone);

    return {
      city: place.name || city,
      current: buildCurrent(observation, place, timezone),
      hourly: buildHourly(intervals, timezone),
      // No historical endpoint: the UI drops the Yesterday tab (no hourly
      // entries for it) and the Yesterday point of the daily chart.
      yesterday: null,
      forecast: buildDaily(intervals, timezone, place.sun),
      local_today: today,
      local_yesterday: shiftDate(today, -1),
      // Extra context for the AI module and for debugging.
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: timezone,
      source: 'api-ninjas',
    };
  }

  /** The default provider: geocode -> current + forecast -> map. */
  async function fetchFromApiNinjas(city) {
    if (!apiKey) {
      throw apiError(
        t(
          'Weather API key missing: set one in js/api.js (DEFAULT_API_KEY) or call YW.api.setApiKey("<your key>")',
          'Отсутствует ключ API погоды: укажите его в js/api.js (DEFAULT_API_KEY) или вызовите YW.api.setApiKey("<ваш ключ>")',
        ),
        401,
        'no api key',
        '',
      );
    }

    const place = await geocodeCity(city);

    // Current conditions and the 5-day series are independent requests.
    const answers = await Promise.all([
      fetchCurrent(place.latitude, place.longitude),
      fetchForecast(place.latitude, place.longitude),
    ]);

    return buildWeatherResponse(city, place, answers[0], answers[1]);
  }



  // ── Legacy backend ──

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
   * Looks a city up. api-ninjas is used unless a legacy backend URL was
   * configured (window.YW_API_URL / ?api= / <meta name="yw-api-url">).
   *
   * Rejects with a localized Error whose `status`, `detail` and `url`
   * properties keep the technical cause available for debugging.
   */
  async function fetchWeather(city, _tempUnit, _windUnit) {
    if (apiUrl) return fetchFromBackend(city, apiUrl);
    return fetchFromApiNinjas(city);
  }

  YW.api = {
    fetchWeather: fetchWeather,

    /** The api-ninjas key currently in use. */
    getApiKey: function () {
      return apiKey;
    },
    /** Swaps the api-ninjas key at runtime; '' restores the committed one. */
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

    /** Legacy backend URL in use ('' means "api-ninjas directly"). */
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
  };
})(window.YW);
