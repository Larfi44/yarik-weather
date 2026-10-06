#!/usr/bin/env node
/**
 * Smoke test for the api-ninjas client in frontend/public/js/api.js.
 *
 * The frontend ships without npm dependencies, so this harness is
 * dependency-free as well: it evaluates api.js inside a vm sandbox with a
 * stubbed window / DOM / localStorage, drives YW.api.fetchWeather() and asserts
 * the mapped WeatherResponse, the runtime configuration and the error messages.
 *
 *   node frontend/scripts/test-api.js          # offline, stubbed fetches
 *   node frontend/scripts/test-api.js --live   # also calls api-ninjas for real
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const API_JS = path.join(__dirname, '..', 'public', 'js', 'api.js');
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

/** Independent timezone conversion, used to build the expected values. */
function localMoment(seconds) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(seconds * 1000))
    .replace(' ', 'T');
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

const PLACE = {
  name: 'Sochi',
  latitude: 43.5854823,
  longitude: 39.723109,
  country: 'RU',
  timezone: TZ,
  population: 327608,
  sun: {
    sunrise: '2026-10-05T03:23:14.450907+00:00',
    sunset: '2026-10-05T14:55:10.155913+00:00',
  },
};

const BASE_TS = Date.UTC(2026, 9, 5, 0, 0, 0) / 1000; // 2026-10-05T00:00Z

const INTERVALS = Array.from({ length: 40 }, (_, i) => ({
  timestamp: BASE_TS + i * 3 * 3600,
  temp: 19 - (i % 5),
  feels_like: 18 - (i % 5),
  humidity: 53,
  min_temp: 17 - (i % 3),
  max_temp: 21 - (i % 3),
  weather_code: i % 7 === 0 ? 803 : 800,
  weather_description: i % 7 === 0 ? 'broken clouds' : 'clear sky',
  is_day: true,
  cloud_pct: 0,
  wind_speed: 2.15,
  wind_degrees: 260,
}));

const CURRENT = {
  cloud_pct: 0,
  weather: 'Clear',
  weather_code: 800,
  weather_description: 'clear sky',
  is_day: true,
  temp: 19,
  feels_like: 18,
  humidity: 53,
  min_temp: 19,
  max_temp: 19,
  wind_speed: 1.33,
  wind_degrees: 260,
  sunrise: 1791170559,
  sunset: 1791212177,
};

/** Serves the three api-ninjas endpoints from the fixtures above. */
function happyPath(url) {
  if (url.indexOf('/v1/geocoding') !== -1) return jsonResponse([PLACE]);
  if (url.indexOf('/v1/weatherforecast') !== -1) return jsonResponse(INTERVALS);
  if (url.indexOf('/v1/weather') !== -1) return jsonResponse(CURRENT);
  return jsonResponse({ error: 'unexpected url ' + url }, 500);
}

// ── [1] Configuration ──

async function testConfiguration() {
  section('[1] Runtime configuration');

  const plain = boot({ handler: happyPath });
  check(
    'api-ninjas is the default provider (no legacy backend)',
    plain.api.getApiUrl() === '',
    plain.api.getApiUrl(),
  );
  check(
    'the committed key is used',
    plain.api.getApiKey() === plain.api.DEFAULT_API_KEY,
  );
  check(
    'the host is exposed for diagnostics',
    plain.api.API_HOST === 'https://api.api-ninjas.com',
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
    '?key= overrides the committed key',
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
    'setApiKey("") restores the committed key',
    swapped.api.getApiKey() === swapped.api.DEFAULT_API_KEY,
  );
  check(
    'resolveApiKey() re-reads the environment',
    swapped.api.resolveApiKey() === swapped.api.DEFAULT_API_KEY,
  );
}

// ── [2] Mapping ──

async function testMapping() {
  section('[2] api-ninjas -> WeatherResponse mapping');

  const { api, calls, storage } = boot({ handler: happyPath });
  const data = await api.fetchWeather('Sochi', 'celsius', 'mps');

  check(
    'three requests are made',
    calls.length === 3,
    calls.map((c) => c.url).join(' | '),
  );
  check(
    'geocoding runs first',
    calls[0].url === 'https://api.api-ninjas.com/v1/geocoding?city=Sochi',
    calls[0].url,
  );
  check(
    'current weather uses the geocoded coordinates',
    calls[1].url ===
      'https://api.api-ninjas.com/v1/weather?lat=43.5854823&lon=39.723109',
    calls[1].url,
  );
  check(
    'forecast uses the geocoded coordinates',
    calls[2].url ===
      'https://api.api-ninjas.com/v1/weatherforecast?lat=43.5854823&lon=39.723109',
    calls[2].url,
  );
  check(
    'every request carries X-Api-Key',
    calls.every(
      (c) =>
        c.init.headers && c.init.headers['X-Api-Key'] === api.DEFAULT_API_KEY,
    ),
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
    'current condition text',
    data.current.condition === 'clear sky',
    data.current.condition,
  );
  check(
    'feels-like and humidity are passed through',
    data.current.feels_like === 18 && data.current.humidity === 53,
  );
  check(
    'coordinates are exposed for the AI module',
    data.current.latitude === 43.5854823 && data.latitude === 43.5854823,
  );
  check('timezone is exposed', data.timezone === TZ, String(data.timezone));
  check('source is tagged', data.source === 'api-ninjas', String(data.source));

  check(
    '40 three-hourly points are mapped',
    data.hourly.length === 40,
    String(data.hourly.length),
  );
  check(
    'hourly time is local to the city',
    data.hourly[0].time === localMoment(BASE_TS).slice(11),
    data.hourly[0].time + ' vs ' + localMoment(BASE_TS).slice(11),
  );
  check(
    'hourly date is local to the city',
    data.hourly[0].date === localMoment(BASE_TS).slice(0, 10),
    data.hourly[0].date,
  );
  check(
    'hourly crosses local midnight correctly',
    data.hourly[7].date === '2026-10-06' && data.hourly[7].time === '00:00',
    data.hourly[7].date + ' ' + data.hourly[7].time,
  );
  check('hourly keeps wind speed', data.hourly[0].wind_speed === 2.15);

  const missing = [
    'pressure',
    'uv_index',
    'precipitation_probability',
    'sea_temperature',
  ];
  check(
    'unavailable hourly metrics are null',
    missing.every((key) => data.hourly[0][key] === null),
    JSON.stringify(data.hourly[0]),
  );
  check(
    'unavailable current metrics are null',
    missing.every((key) => data.current[key] === null),
    JSON.stringify(data.current),
  );

  check(
    '3-hourly data is folded into 6 local days',
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
    'daily high/low are aggregated',
    data.forecast[0].temperature_max === 21 &&
      data.forecast[0].temperature_min === 15,
    data.forecast[0].temperature_max + ' / ' + data.forecast[0].temperature_min,
  );
  check('daily wind is the daily maximum', data.forecast[0].wind_speed_max === 2.15);
  check(
    'daily condition is the dominant one',
    data.forecast[0].condition === 'clear sky',
    data.forecast[0].condition,
  );
  check(
    'day 0 carries the sunrise from the sun block',
    data.forecast[0].sunrise === '2026-10-05T06:23',
    String(data.forecast[0].sunrise),
  );
  check(
    'later days have no sunrise (not published)',
    data.forecast[1].sunrise === undefined,
    String(data.forecast[1].sunrise),
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
    'daily uv/rain stay null (never faked)',
    data.forecast[0].uv_index_max === null &&
      data.forecast[0].precipitation_probability_max === null,
  );
  check(
    'current sunrise is localised',
    data.current.sunrise === localMoment(CURRENT.sunrise),
    String(data.current.sunrise) + ' vs ' + localMoment(CURRENT.sunrise),
  );
  check('no history means yesterday is null', data.yesterday === null);
  check(
    'local_today is a calendar date',
    /^\d{4}-\d{2}-\d{2}$/.test(data.local_today),
    data.local_today,
  );
  check(
    'local_yesterday is one day earlier',
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
}

// ── [3] Errors ──

async function testErrors() {
  section('[3] Error handling');

  const statusCases = [
    {
      name: 'invalid key',
      body: { error: 'Invalid API Key.' },
      status: 400,
      expect: /key rejected/i,
    },
    {
      name: 'missing key',
      body: { error: 'Missing API Key.' },
      status: 400,
      expect: /key missing/i,
    },
    {
      name: 'premium-only parameter',
      body: { error: 'Searching by city parameter requires a premium subscription.' },
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

  // Unknown city: api-ninjas answers with an empty geocoding array.
  const notFound = boot({ handler: () => jsonResponse([]) });
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
  check('unknown city keeps status 404', !!err && err.status === 404, err && String(err.status));

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
    handler: () => jsonResponse({ error: 'Invalid API Key.' }, 400),
    language: 'ru',
  });
  err = null;
  try {
    await ru.api.fetchWeather('Сочи');
  } catch (caught) {
    err = caught;
  }
  check('messages are localized', !!err && /отклонён/.test(err.message), err && err.message);
  check(
    'console.warn keeps the raw cause',
    ru.warns.some((w) => /\[YW\.api\].*Invalid API Key/.test(w)),
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
  check('no api-ninjas request is made', calls.length === 1);

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

// ── [5] Live api-ninjas call ──

async function testLive() {
  section('[5] Live api-ninjas call');

  if (!LIVE) {
    console.log('  skip  run with --live to call api-ninjas for real');
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
  check('timezone comes from geocoding', /^[A-Za-z]+\//.test(data.timezone || ''), String(data.timezone));
  check(
    'current temperature is a number',
    typeof data.current.temperature === 'number',
    String(data.current.temperature),
  );
  check('current condition is present', !!data.current.condition, data.current.condition);
  check('hourly series is populated', data.hourly.length >= 8, String(data.hourly.length));
  check(
    'hourly temperatures are numbers',
    data.hourly.every((hour) => typeof hour.temperature === 'number'),
  );
  check(
    'daily cards are aggregated',
    data.forecast.length >= 5 && data.forecast.length <= 7,
    String(data.forecast.length),
  );
  check(
    'daily dates ascend',
    data.forecast.every((day, i, all) => i === 0 || all[i - 1].date < day.date),
  );
  check(
    'day 0 has a local sunrise',
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.forecast[0].sunrise || ''),
    String(data.forecast[0].sunrise),
  );
  check(
    "today matches the city's clock",
    data.forecast.some((day) => day.date === data.local_today),
    data.local_today + ' not in ' + data.forecast.map((d) => d.date).join(','),
  );
  check(
    'unavailable metrics stay null',
    data.current.pressure === null && data.forecast[0].uv_index_max === null,
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
    '✅ api-ninjas client looks good' + (LIVE ? ' (including a live call)' : ''),
  );
})();


