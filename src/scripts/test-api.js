#!/usr/bin/env node
/**
 * Smoke test for the Open-Meteo client in src/js/api.js.
 *
 * The site ships without npm dependencies, so this harness is dependency-free
 * as well: it evaluates api.js inside a vm sandbox with a stubbed window / DOM
 * / localStorage, drives YW.api.fetchWeather() and asserts the mapped
 * WeatherResponse, the runtime configuration and the error messages.
 *
 *   node src/scripts/test-api.js          # offline, stubbed fetches
 *   node src/scripts/test-api.js --live   # also calls Open-Meteo for real
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const API_JS = path.join(__dirname, '..', 'js', 'api.js');
const LIVE = process.argv.indexOf('--live') !== -1;

let checks = 0;
const failures = [];

function check(name, condition, detail) {
  checks++;
  if (condition) {
    console.log('  ok   ' + name);
  } else {
    console.log('  FAIL ' + name + (detail ? '  ->  ' + detail : ''));
    failures.push(name);
  }
}

function section(title) {
  console.log('\n' + title);
}

/** Minimal localStorage stand-in. */
function makeStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const TZ = 'Europe/Moscow';

/** 'YYYY-MM-DD' + an hour of the day -> 'YYYY-MM-DDTHH:00'. */
function isoAt(date, hour) {
  return date + 'T' + String(hour).padStart(2, '0') + ':00';
}

/** 'YYYY-MM-DD' + a time of day -> 'YYYY-MM-DDTHH:MM' (sunrise/sunset shape). */
function isoMinute(date, hour, minute) {
  return (
    date +
    'T' +
    String(hour).padStart(2, '0') +
    ':' +
    String(minute).padStart(2, '0')
  );
}

/** Shifts a 'YYYY-MM-DD' date, mirroring the calendar arithmetic in api.js. */
function shiftDate(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function jsonResponse(body, status) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const code = status || 200;
  return Promise.resolve({
    ok: code < 400,
    status: code,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text)),
  });
}

/**
 * Loads api.js into a fresh sandbox.
 *
 * options: { handler, live, apiKey, search, metaKey, metaUrl, language }
 */
function boot(options) {
  const opts = options || {};
  const calls = [];
  const warns = [];
  const storage = makeStorage();

  const window = { YW: {}, location: { search: opts.search || '' } };
  if (opts.apiKey) window.YW_API_KEY = opts.apiKey;

  // window.YW_API_KEY / the meta tag are read when api.js is evaluated, so the
  // language stub has to exist before that too.
  if (opts.language) {
    window.YW.Language = { English: 'en', Russian: 'ru' };
    window.YW.settings = { getSettings: () => ({ language: opts.language }) };
  }

  const sandbox = {
    window: window,
    document: {
      querySelector: function (selector) {
        if (!selector) return null;
        if (selector.indexOf('yw-api-key') !== -1 && opts.metaKey) {
          return { getAttribute: () => opts.metaKey };
        }
        if (selector.indexOf('yw-api-url') !== -1 && opts.metaUrl) {
          return { getAttribute: () => opts.metaUrl };
        }
        return null;
      },
    },
    localStorage: storage,
    console: {
      warn: (...args) => warns.push(args.join(' ')),
      log: () => {},
      error: () => {},
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    AbortController: AbortController,
    URL: URL,
    URLSearchParams: URLSearchParams,
    fetch: (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      if (opts.live) return fetch(String(url), init);
      return opts.handler ? opts.handler(String(url), init) : jsonResponse({});
    },
  };

  vm.runInNewContext(fs.readFileSync(API_JS, 'utf8'), sandbox, {
    filename: 'api.js',
  });

  return { api: window.YW.api, calls, warns, storage };
}

// ── Fixtures ──

/** The request asks for past_days=1 + forecast_days=6, so 7 local days. */
const DAY_ISO = Array.from({ length: 7 }, (_, i) => shiftDate('2026-10-04', i));
const YESTERDAY = DAY_ISO[0];
const TODAY = DAY_ISO[1];

/** One local ISO string per hour of the whole window (7 * 24 entries). */
const HOUR_STAMPS = [];
DAY_ISO.forEach((date) => {
  for (let hour = 0; hour < 24; hour++) HOUR_STAMPS.push(isoAt(date, hour));
});

/** One value per hour stamp, built from the hour's global index. */
function stampSeries(valueFor) {
  return HOUR_STAMPS.map((_, index) => valueFor(index));
}

const GEOCODE = {
  results: [
    {
      name: 'Sochi',
      latitude: 43.5854823,
      longitude: 39.723109,
      country: 'Russia',
      country_code: 'RU',
      admin1: 'Krasnodar Krai',
      timezone: TZ,
      population: 327608,
    },
  ],
};

const FORECAST = {
  latitude: 43.58548,
  longitude: 39.72311,
  timezone: TZ,
  utc_offset_seconds: 10800,
  current: {
    time: isoAt(TODAY, 12),
    interval: 900,
    temperature_2m: 19,
    relative_humidity_2m: 53,
    apparent_temperature: 18,
    is_day: 1,
    weather_code: 1,
    cloud_cover: 0,
    pressure_msl: 1013.2,
    wind_speed_10m: 1.33,
    wind_direction_10m: 260,
    wind_gusts_10m: 3.1,
  },
  hourly: {
    time: HOUR_STAMPS,
    temperature_2m: stampSeries((i) => 19 - (i % 5)),
    apparent_temperature: stampSeries((i) => 18 - (i % 5)),
    relative_humidity_2m: stampSeries(() => 53),
    precipitation_probability: stampSeries(() => 20),
    precipitation: stampSeries(() => 0),
    weather_code: stampSeries((i) => (i % 7 === 0 ? 3 : 0)),
    cloud_cover: stampSeries(() => 0),
    pressure_msl: stampSeries(() => 1013),
    wind_speed_10m: stampSeries(() => 2.15),
    wind_direction_10m: stampSeries(() => 260),
    wind_gusts_10m: stampSeries(() => 4.4),
    uv_index: stampSeries(() => 4),
  },
  daily: {
    time: DAY_ISO,
    weather_code: [3, 0, 61, 2, 1, 45, 95],
    temperature_2m_max: DAY_ISO.map((_, i) => 21 - i),
    temperature_2m_min: DAY_ISO.map((_, i) => 15 - i),
    wind_speed_10m_max: DAY_ISO.map(() => 2.15),
    sunrise: DAY_ISO.map((date, i) => isoMinute(date, 6, 20 + i)),
    sunset: DAY_ISO.map((date, i) => isoMinute(date, 18, 10 - i)),
    uv_index_max: DAY_ISO.map(() => 5),
    precipitation_probability_max: DAY_ISO.map((_, i) => i * 10),
  },
};

const MARINE = {
  timezone: TZ,
  hourly: {
    time: HOUR_STAMPS,
    sea_surface_temperature: stampSeries(() => 24.5),
  },
};

/** Serves the three Open-Meteo endpoints from the fixtures above. */
function happyPath(url) {
  if (url.indexOf('geocoding-api.open-meteo.com') !== -1) return jsonResponse(GEOCODE);
  if (url.indexOf('marine-api.open-meteo.com') !== -1) return jsonResponse(MARINE);
  if (url.indexOf('/v1/forecast') !== -1) return jsonResponse(FORECAST);
  return jsonResponse({ reason: 'unexpected url ' + url, error: true }, 500);
}

/** Same, but the marine (coastal) answer fails — a search must survive it. */
function withoutSea(url) {
  if (url.indexOf('marine-api.open-meteo.com') !== -1) {
    return jsonResponse(
      { reason: 'No data is available for this location', error: true },
      400,
    );
  }
  return happyPath(url);
}

// ── [1] Configuration ──

async function testConfiguration() {
  section('[1] Runtime configuration');

  const plain = boot({ handler: happyPath });
  check(
    'Open-Meteo is the default provider (no legacy backend)',
    plain.api.getApiUrl() === '',
    plain.api.getApiUrl(),
  );
  check(
    'no key is committed — the free tier needs none',
    plain.api.DEFAULT_API_KEY === '',
    String(plain.api.DEFAULT_API_KEY),
  );
  check(
    'no key is in use by default',
    plain.api.getApiKey() === '',
    String(plain.api.getApiKey()),
  );
  check(
    'the forecast host is exposed for diagnostics',
    plain.api.API_HOST === 'https://api.open-meteo.com',
    plain.api.API_HOST,
  );

  const injected = boot({
    apiKey: 'WINDOW_KEY',
    search: '?key=QUERY_KEY',
    handler: happyPath,
  });
  check(
    'window.YW_API_KEY wins over ?key=',
    injected.api.getApiKey() === 'WINDOW_KEY',
    injected.api.getApiKey(),
  );

  const query = boot({
    search: '?key=QUERY_KEY&api=http://localhost:8081',
    handler: happyPath,
  });
  check(
    '?key= is honoured (paid tier)',
    query.api.getApiKey() === 'QUERY_KEY',
    query.api.getApiKey(),
  );
  check(
    '?api= still selects the legacy backend',
    query.api.getApiUrl() === 'http://localhost:8081',
    query.api.getApiUrl(),
  );

  const meta = boot({ metaKey: 'META_KEY', handler: happyPath });
  check(
    '<meta name="yw-api-key"> is honoured',
    meta.api.getApiKey() === 'META_KEY',
    meta.api.getApiKey(),
  );

  const swapped = boot({ handler: happyPath });
  swapped.api.setApiKey('ROTATED');
  check('setApiKey() rotates the key', swapped.api.getApiKey() === 'ROTATED');
  swapped.api.setApiKey('');
  check(
    'setApiKey("") restores the key-less default',
    swapped.api.getApiKey() === '',
    swapped.api.getApiKey(),
  );
  check(
    'resolveApiKey() re-reads the environment',
    swapped.api.resolveApiKey() === '',
    swapped.api.resolveApiKey(),
  );
}

// ── [2] Mapping ──

async function testMapping() {
  section('[2] Open-Meteo -> WeatherResponse mapping');

  const { api, calls, storage } = boot({ handler: happyPath });
  const data = await api.fetchWeather('Sochi', 'celsius', 'mps');

  const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

  check(
    'three requests are made (geocode, forecast, marine)',
    calls.length === 3,
    calls.map((c) => c.url).join(' | '),
  );
  check(
    'geocoding runs first',
    calls[0].url ===
      'https://geocoding-api.open-meteo.com/v1/search?name=Sochi&count=1&language=en&format=json',
    calls[0].url,
  );
  check(
    'the forecast uses the geocoded coordinates',
    calls[1].url.indexOf(
      FORECAST_URL + '?latitude=43.5854823&longitude=39.723109',
    ) === 0,
    calls[1].url,
  );
  check(
    'the forecast asks for city-local time',
    calls[1].url.indexOf('timezone=auto') !== -1,
    calls[1].url,
  );
  check(
    'yesterday is requested (past_days=1)',
    calls[1].url.indexOf('past_days=1') !== -1,
  );
  check(
    'six forecast days are requested',
    calls[1].url.indexOf('forecast_days=6') !== -1,
  );
  check(
    'current, hourly and daily blocks are requested',
    calls[1].url.indexOf('current=') !== -1 &&
      calls[1].url.indexOf('hourly=') !== -1 &&
      calls[1].url.indexOf('daily=') !== -1,
  );
  check(
    'the units the UI expects are requested',
    calls[1].url.indexOf('temperature_unit=celsius') !== -1 &&
      calls[1].url.indexOf('wind_speed_unit=ms') !== -1,
  );
  check(
    'marine data is requested for the coast',
    calls[2].url.indexOf(
      MARINE_URL +
        '?latitude=43.5854823&longitude=39.723109&hourly=sea_surface_temperature',
    ) === 0,
    calls[2].url,
  );
  check(
    'requests are header-less (CORS-simple, no preflight)',
    calls.every((c) => !c.init.headers),
  );
  check(
    'no apikey parameter on the free tier',
    calls.every((c) => c.url.indexOf('apikey') === -1),
  );
  check(
    'every request is abortable (timeout guard)',
    calls.every((c) => !!c.init.signal),
  );

  check('city name comes from geocoding', data.city === 'Sochi', data.city);
  check(
    'current temperature',
    data.current.temperature === 19,
    String(data.current.temperature),
  );
  check(
    'current condition text comes from the WMO code',
    data.current.condition === 'Mainly clear',
    data.current.condition,
  );
  check(
    'feels-like and humidity are passed through',
    data.current.feels_like === 18 && data.current.humidity === 53,
  );
  check('the daylight flag is a boolean', data.current.is_day === true);
  check(
    'pressure is populated',
    data.current.pressure === 1013.2,
    String(data.current.pressure),
  );
  check(
    'current UV comes from the nearest hourly row',
    data.current.uv_index === 4,
    String(data.current.uv_index),
  );
  check(
    'current rain probability comes from the hourly row',
    data.current.precipitation_probability === 20,
    String(data.current.precipitation_probability),
  );
  check(
    'sea temperature comes from the marine answer',
    data.current.sea_temperature === 24.5,
    String(data.current.sea_temperature),
  );
  check(
    'current sunrise/sunset are city-local',
    data.current.sunrise === '2026-10-05T06:21' &&
      data.current.sunset === '2026-10-05T18:09',
    String(data.current.sunrise) + ' / ' + String(data.current.sunset),
  );
  check(
    'coordinates are exposed for the AI module',
    data.current.latitude === 43.5854823 && data.latitude === 43.5854823,
  );
  check('timezone is exposed', data.timezone === TZ, String(data.timezone));
  check('source is tagged', data.source === 'open-meteo', String(data.source));

  check(
    'every hour of every day is kept (24 rows per day)',
    data.hourly.length === 168,
    String(data.hourly.length),
  );
  check(
    'hourly rows walk the clock one hour at a time',
    data.hourly.every(
      (hour, i) =>
        hour.time === String(i % 24).padStart(2, '0') + ':00' &&
        hour.date === DAY_ISO[Math.floor(i / 24)],
    ),
    data.hourly[0].time + ' .. ' + data.hourly[data.hourly.length - 1].time,
  );
  check(
    'hourly starts on yesterday (past_days=1)',
    data.hourly[0].date === YESTERDAY && data.hourly[0].time === '00:00',
    data.hourly[0].date + ' ' + data.hourly[0].time,
  );
  check(
    'hourly crosses local midnight correctly',
    data.hourly[24].date === TODAY && data.hourly[24].time === '00:00',
    data.hourly[24].date + ' ' + data.hourly[24].time,
  );
  check(
    'hourly keeps wind speed and direction',
    data.hourly[0].wind_speed === 2.15 && data.hourly[0].wind_degrees === 260,
  );
  check(
    'hourly temperatures follow the answer',
    data.hourly[1].temperature === 18,
    String(data.hourly[1].temperature),
  );
  check(
    'hourly condition text comes from the WMO code',
    data.hourly[0].condition === 'Overcast' &&
      data.hourly[1].condition === 'Clear sky',
    data.hourly[0].condition + ' / ' + data.hourly[1].condition,
  );
  check(
    'hourly carries the richer fields',
    data.hourly[0].pressure === 1013 &&
      data.hourly[0].uv_index === 4 &&
      data.hourly[0].precipitation_probability === 20 &&
      data.hourly[0].sea_temperature === 24.5,
    JSON.stringify(data.hourly[0]),
  );

  // Open-Meteo sends null for the points it cannot compute: those must stay
  // null (the UI hides the row) instead of turning into a fake zero.
  const holes = boot({
    handler: (url) => {
      if (url.indexOf('geocoding-api') !== -1) return jsonResponse(GEOCODE);
      if (url.indexOf('marine-api') !== -1) return jsonResponse(MARINE);
      const answer = JSON.parse(JSON.stringify(FORECAST));
      answer.hourly.pressure_msl[0] = null;
      answer.current.weather_code = null;
      return jsonResponse(answer);
    },
  });
  const holed = await holes.api.fetchWeather('Sochi');
  check(
    'a null metric stays null (never zero)',
    holed.hourly[0].pressure === null,
    String(holed.hourly[0].pressure),
  );
  check(
    'an unknown weather code reads as "Unknown"',
    holed.current.condition === 'Unknown',
    holed.current.condition,
  );

  check(
    'the forecast strip holds the six forecast days',
    data.forecast.length === 6,
    String(data.forecast.length),
  );
  check(
    'daily cards are ordered',
    data.forecast.map((d) => d.date).join(',') ===
      '2026-10-05,2026-10-06,2026-10-07,2026-10-08,2026-10-09,2026-10-10',
    data.forecast.map((d) => d.date).join(','),
  );
  check(
    'yesterday is not part of the forecast strip',
    data.forecast[0].date === TODAY,
    data.forecast[0].date,
  );
  check(
    'daily high/low come from the daily block',
    data.forecast[0].temperature_max === 20 &&
      data.forecast[0].temperature_min === 14,
    data.forecast[0].temperature_max + ' / ' + data.forecast[0].temperature_min,
  );
  check('daily wind is the daily maximum', data.forecast[0].wind_speed_max === 2.15);
  check(
    'daily condition comes from the WMO code',
    data.forecast[0].condition === 'Clear sky',
    data.forecast[0].condition,
  );
  check(
    'more of the WMO table is mapped',
    data.forecast[1].condition === 'Slight rain' &&
      data.forecast[5].condition === 'Thunderstorm',
    data.forecast[1].condition + ' / ' + data.forecast[5].condition,
  );
  check(
    'every daily card carries its own sunrise/sunset',
    data.forecast[0].sunrise === '2026-10-05T06:21' &&
      data.forecast[1].sunrise === '2026-10-06T06:22' &&
      data.forecast[1].sunset === '2026-10-06T18:08',
    String(data.forecast[1].sunrise) + ' / ' + String(data.forecast[1].sunset),
  );
  check(
    'daily UV and rain probability are real numbers',
    data.forecast[0].uv_index_max === 5 &&
      data.forecast[0].precipitation_probability_max === 10,
    String(data.forecast[0].uv_index_max) +
      ' / ' +
      String(data.forecast[0].precipitation_probability_max),
  );
  check(
    'yesterday is mapped for real (past_days=1)',
    !!data.yesterday &&
      data.yesterday.date === YESTERDAY &&
      data.yesterday.condition === 'Overcast' &&
      data.yesterday.temperature_max === 21,
    JSON.stringify(data.yesterday),
  );
  check(
    'moon phase is computed locally',
    typeof data.forecast[0].moon_phase_name === 'string' &&
      data.forecast[0].moon_illumination >= 0 &&
      data.forecast[0].moon_illumination <= 100,
    String(data.forecast[0].moon_phase_name) +
      ' ' +
      String(data.forecast[0].moon_illumination),
  );
  check(
    'local_today comes from the API clock',
    data.local_today === TODAY,
    data.local_today,
  );
  check(
    'local_yesterday is one day earlier',
    data.local_yesterday === YESTERDAY &&
      data.local_yesterday === shiftDate(data.local_today, -1),
    data.local_yesterday,
  );

  const before = calls.length;
  await api.fetchWeather('Sochi');
  check(
    'repeat searches reuse the cached coordinates',
    calls.length === before + 2,
    String(calls.length - before),
  );
  check('the coordinate cache is persisted', !!storage.getItem('yw_geocode_cache'));
  api.clearGeocodeCache();
  check(
    'clearGeocodeCache() empties it',
    storage.getItem('yw_geocode_cache') === null,
  );

  // A configured key (paid tier) must ride in the URL, never in a header.
  const keyed = boot({ search: '?key=QUERY_KEY', handler: happyPath });
  await keyed.api.fetchWeather('Sochi');
  check(
    'a configured key is sent as ?apikey=',
    keyed.calls[1].url.indexOf('apikey=QUERY_KEY') !== -1,
    keyed.calls[1].url,
  );

  // Cyrillic queries are not in Open-Meteo's Latin index, so api.js retries
  // with a transliteration ("Сочи" -> "sochi").
  const cyrillic = boot({
    handler: (url) => {
      if (url.indexOf('geocoding-api') !== -1) {
        return url.indexOf('name=sochi') !== -1
          ? jsonResponse(GEOCODE)
          : jsonResponse({ generationtime_ms: 0.4 });
      }
      return happyPath(url);
    },
  });
  const cyrillicData = await cyrillic.api.fetchWeather('Сочи');
  check(
    'a Cyrillic city is transliterated when needed',
    cyrillicData.city === 'Sochi',
    cyrillicData.city,
  );
  check(
    'the second geocoding attempt uses the Latin spelling',
    cyrillic.calls[1].url.indexOf('name=sochi') !== -1,
    cyrillic.calls[1].url,
  );
  check(
    'the cache is keyed on what the user typed',
    !!cyrillic.storage.getItem('yw_geocode_cache') &&
      Object.keys(JSON.parse(cyrillic.storage.getItem('yw_geocode_cache')))[0] ===
        'сочи',
    cyrillic.storage.getItem('yw_geocode_cache'),
  );

  // The marine answer is optional: an inland city (or a failing request) must
  // still get its weather, only the sea-temperature row disappears.
  const inland = boot({ handler: withoutSea });
  const inlandData = await inland.api.fetchWeather('Sochi');
  check(
    'a failing marine request does not break the search',
    inlandData.city === 'Sochi' && inlandData.current.sea_temperature === null,
    String(inlandData.current.sea_temperature),
  );
  check(
    'the missing sea data is only warned about',
    inland.warns.some((w) => /no sea data/.test(w)),
    inland.warns.join(' | '),
  );
}

// ── [3] Errors ──

async function testErrors() {
  section('[3] Error handling');

  // Open-Meteo reports failures as {"reason": "...", "error": true}.
  const statusCases = [
    {
      name: 'rejected key',
      body: { reason: 'Invalid API key.', error: true },
      status: 400,
      expect: /key rejected/i,
    },
    {
      name: 'rate limit',
      body: { reason: 'Minutely API request limit exceeded.', error: true },
      status: 429,
      expect: /rate limited/i,
    },
    {
      name: 'no data for the location',
      body: { reason: 'No data is available for this location.', error: true },
      status: 400,
      expect: /refused/i,
    },
    {
      name: 'upstream failure',
      body: 'boom',
      status: 500,
      expect: /having trouble/i,
    },
  ];

  for (const testCase of statusCases) {
    const { api } = boot({
      handler: () => jsonResponse(testCase.body, testCase.status),
    });
    let err = null;
    try {
      await api.fetchWeather('Sochi');
    } catch (caught) {
      err = caught;
    }
    check(
      testCase.name + ' -> readable message',
      !!err && testCase.expect.test(err.message),
      err && err.message,
    );
    check(
      testCase.name + ' -> status kept on the error',
      !!err && err.status === testCase.status,
      err && String(err.status),
    );
    check(
      testCase.name + ' -> raw cause kept in err.detail',
      !!err && err.detail !== undefined,
      err && String(err.detail),
    );
    check(
      testCase.name + ' -> request URL kept in err.url',
      !!err && typeof err.url === 'string' && err.url.length > 0,
      err && err.url,
    );
  }

  // The `reason` of an Open-Meteo error must reach err.detail untouched.
  const unexplained = boot({
    handler: () =>
      jsonResponse(
        {
          reason: 'Cannot initialize WeatherVariable from invalid String value',
          error: true,
        },
        400,
      ),
  });
  let reasonErr = null;
  try {
    await unexplained.api.fetchWeather('Sochi');
  } catch (caught) {
    reasonErr = caught;
  }
  check(
    'an unmapped 400 reads as "API error 400: <reason>"',
    !!reasonErr &&
      /API error 400: Cannot initialize WeatherVariable/.test(reasonErr.message),
    reasonErr && reasonErr.message,
  );
  check(
    'the API reason is kept in err.detail',
    !!reasonErr &&
      reasonErr.detail === 'Cannot initialize WeatherVariable from invalid String value',
    reasonErr && String(reasonErr.detail),
  );

  // Unknown city: Open-Meteo answers with no `results` array at all.
  const notFound = boot({ handler: () => jsonResponse({ generationtime_ms: 0.4 }) });
  let err = null;
  try {
    await notFound.api.fetchWeather('Nowhereville');
  } catch (caught) {
    err = caught;
  }
  check(
    'unknown city -> "City not found"',
    !!err && /City not found: Nowhereville/.test(err.message),
    err && err.message,
  );
  check(
    'unknown city keeps status 404',
    !!err && err.status === 404,
    err && String(err.status),
  );

  // Unreachable host.
  const offline = boot({
    handler: () => Promise.reject(new Error('getaddrinfo ENOTFOUND')),
  });
  err = null;
  try {
    await offline.api.fetchWeather('Sochi');
  } catch (caught) {
    err = caught;
  }
  check(
    'unreachable host -> "Could not reach"',
    !!err && /Could not reach the weather service/.test(err.message),
    err && err.message,
  );

  // A network that blackholes the primary gateway (ERR_CONNECTION_TIMED_OUT)
  // must not fail the search: the same request is retried on the standby.
  let blockedPrimary = 0;
  const standby = boot({
    handler: (url, init) => {
      // Only the forecast host is blackholed — geocoding and marine still work.
      if (url.indexOf('://api.open-meteo.com') !== -1) {
        blockedPrimary++;
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return happyPath(url, init);
    },
  });
  const viaStandby = await standby.api.fetchWeather('Sochi');
  check(
    'a blackholed forecast host falls back to the standby gateway',
    viaStandby.current.temperature === 19 && viaStandby.hourly.length === 168,
    String(viaStandby.current.temperature) + ' / ' + viaStandby.hourly.length,
  );
  check(
    'the standby answers the identical /v1/forecast request',
    standby.calls.some((call) => {
      const url = call.url;
      return (
        url.indexOf('historical-forecast-api.open-meteo.com/v1/forecast') !==
          -1 &&
        url.indexOf('latitude=') !== -1 &&
        url.indexOf('past_days=1') !== -1 &&
        url.indexOf('forecast_days=6') !== -1
      );
    }),
    standby.calls.map((call) => call.url).join('\n     '),
  );
  check(
    'the primary is tried exactly once before falling back',
    blockedPrimary === 1,
    String(blockedPrimary),
  );
  check(
    'the fallback is logged for debugging',
    standby.warns.some((warn) =>
      /retrying via historical-forecast-api\.open-meteo\.com/.test(warn),
    ),
    standby.warns.join(' | '),
  );

  // An HTTP answer means the gateway was reached, so the standby would only
  // repeat the same error: no second request.
  const answeredWrong = boot({
    handler: (url) =>
      url.indexOf('/v1/forecast') !== -1
        ? jsonResponse({ reason: 'Upstream error.', error: true }, 500)
        : happyPath(url),
  });
  let httpErr = null;
  try {
    await answeredWrong.api.fetchWeather('Sochi');
  } catch (caught) {
    httpErr = caught;
  }
  check(
    'an HTTP error on the primary is not retried on the standby',
    !!httpErr &&
      httpErr.status === 500 &&
      !answeredWrong.calls.some(
        (call) => call.url.indexOf('historical-forecast-api') !== -1,
      ),
    httpErr && httpErr.message,
  );

  // Both gateways unreachable: the message names the host that was tried last.
  const bothDown = boot({
    handler: (url) =>
      url.indexOf('/v1/forecast') !== -1
        ? Promise.reject(new TypeError('Failed to fetch'))
        : happyPath(url),
  });
  let downErr = null;
  try {
    await bothDown.api.fetchWeather('Sochi');
  } catch (caught) {
    downErr = caught;
  }
  check(
    'both gateways down -> "Could not reach" naming the standby',
    !!downErr &&
      /Could not reach the weather service/.test(downErr.message) &&
      String(downErr.url).indexOf('historical-forecast-api') !== -1,
    downErr && downErr.message,
  );

  // A 200 response that is not JSON (captive portal, proxy page).
  const broken = boot({ handler: () => jsonResponse('<html>nope</html>', 200) });
  err = null;
  try {
    await broken.api.fetchWeather('Sochi');
  } catch (caught) {
    err = caught;
  }
  check(
    'non-JSON body -> "unexpected response"',
    !!err && /unexpected response/.test(err.message),
    err && err.message,
  );

  // An empty search is rejected before any request is made.
  const blank = boot({ handler: happyPath });
  err = null;
  try {
    await blank.api.fetchWeather('   ');
  } catch (caught) {
    err = caught;
  }
  check(
    'empty city -> "Enter a city name"',
    !!err && /Enter a city name/.test(err.message),
    err && err.message,
  );
  check('empty city costs no request', blank.calls.length === 0);

  // Russian UI gets Russian messages, English the English ones.
  const ru = boot({
    handler: () => jsonResponse({ reason: 'Invalid API key.', error: true }, 400),
    language: 'ru',
  });
  err = null;
  try {
    await ru.api.fetchWeather('Сочи');
  } catch (caught) {
    err = caught;
  }
  check(
    'messages are localized',
    !!err && /отклонён/.test(err.message),
    err && err.message,
  );
  check(
    'console.warn keeps the raw cause',
    ru.warns.some((w) => /\[YW\.api\].*Invalid API key/.test(w)),
    ru.warns.join(' | '),
  );
}

// ── [4] Optional Rust backend ──

async function testLegacyBackend() {
  section('[4] Legacy Rust backend (opt-in)');

  const payload = {
    city: 'Sochi',
    current: { temperature: 19, condition: 'Clear sky' },
    hourly: [],
    yesterday: { date: '2026-10-04' },
    forecast: [],
    local_today: '2026-10-05',
    local_yesterday: '2026-10-04',
  };
  const { api, calls } = boot({
    search: '?api=http://localhost:8081',
    handler: () => jsonResponse(payload),
  });

  const data = await api.fetchWeather('Sochi');
  check(
    '?api= keeps the old transport',
    calls.length === 1 && calls[0].url === 'http://localhost:8081/?city=Sochi',
    calls[0].url,
  );
  check('backend payload passes through untouched', data.current.temperature === 19);
  check('no Open-Meteo request is made', calls.length === 1);

  const gone = boot({
    search: '?api=https://bba456glbns2mjqupmls.containers.yandexcloud.net',
    handler: () => jsonResponse('404 Container bba456glbns2mjqupmls not found', 404),
  });
  let err = null;
  try {
    await gone.api.fetchWeather('Sochi');
  } catch (caught) {
    err = caught;
  }
  check(
    'a dead backend is reported clearly',
    !!err && /no longer exists/.test(err.message),
    err && err.message,
  );
}

// ── [5] Live Open-Meteo call ──

async function testLive() {
  section('[5] Live Open-Meteo call');

  if (!LIVE) {
    console.log('  skip  run with --live to call Open-Meteo for real');
    return;
  }

  const { api } = boot({ live: true });
  const data = await api.fetchWeather('Сочи');

  check('Cyrillic city resolves', data.city === 'Sochi', data.city);
  check(
    'coordinates were resolved',
    typeof data.latitude === 'number' && data.latitude !== 0,
    String(data.latitude),
  );
  check(
    'timezone comes from geocoding',
    /^[A-Za-z]+\//.test(data.timezone || ''),
    String(data.timezone),
  );
  check(
    'current temperature is a number',
    typeof data.current.temperature === 'number',
    String(data.current.temperature),
  );
  check(
    'current condition is present',
    !!data.current.condition && data.current.condition !== 'Unknown',
    data.current.condition,
  );
  check(
    'current pressure is a number',
    typeof data.current.pressure === 'number',
    String(data.current.pressure),
  );
  check(
    'current UV index is a number',
    typeof data.current.uv_index === 'number',
    String(data.current.uv_index),
  );
  check(
    'hourly series is populated',
    data.hourly.length >= 120,
    String(data.hourly.length),
  );
  check(
    'one row per hour of every day',
    data.hourly.length % 24 === 0 && data.hourly.length / 24 >= 7,
    String(data.hourly.length),
  );
  check(
    'hourly temperatures are numbers',
    data.hourly.every((hour) => typeof hour.temperature === 'number'),
  );
  check(
    'hourly rows sit on the hour',
    data.hourly.every((hour) => hour.time.slice(3, 5) === '00'),
    data.hourly[0].time,
  );
  check(
    'daily cards are aggregated',
    data.forecast.length >= 6 && data.forecast.length <= 7,
    String(data.forecast.length),
  );
  check(
    'daily dates ascend',
    data.forecast.every((day, i, all) => i === 0 || all[i - 1].date < day.date),
  );
  check(
    'every daily card has a local sunrise and sunset',
    data.forecast.every(
      (day) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(day.sunrise || '') &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(day.sunset || ''),
    ),
    String(data.forecast[0].sunrise),
  );
  check(
    "today matches the city's clock",
    data.forecast.some((day) => day.date === data.local_today),
    data.local_today + ' not in ' + data.forecast.map((d) => d.date).join(','),
  );
  check(
    'yesterday is present and matches local_yesterday',
    !!data.yesterday && data.yesterday.date === data.local_yesterday,
    JSON.stringify(data.yesterday),
  );
  check(
    'the sea temperature is a number or honestly null',
    data.current.sea_temperature === null ||
      typeof data.current.sea_temperature === 'number',
    String(data.current.sea_temperature),
  );
}

// ── Runner ──

(async function main() {
  await testConfiguration();
  await testMapping();
  await testErrors();
  await testLegacyBackend();

  try {
    await testLive();
  } catch (err) {
    check('live call succeeded', false, err && err.message);
  }

  console.log('\n' + checks + ' checks, ' + failures.length + ' failure(s)');
  if (failures.length) {
    console.log('Failed: ' + failures.join(', '));
    process.exit(1);
  }
  console.log(
    '✅ Open-Meteo client looks good' + (LIVE ? ' (including a live call)' : ''),
  );
})();


