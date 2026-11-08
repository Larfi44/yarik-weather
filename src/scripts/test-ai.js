#!/usr/bin/env node
/**
 * Smoke test for the locally computed "Yaroslav AI" analysis in src/js/ai.js.
 *
 * Like test-api.js this harness has no dependencies: settings.js, helpers.js,
 * coastal.js and ai.js are evaluated inside a vm sandbox with a stubbed window
 * and DOM, and YW.ai.buildAiData() is then driven with hand-built weather — a
 * coastal day with cold water, the same day with warm water and an inland city.
 *
 *   node src/scripts/test-ai.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');
const SCRIPTS = ['settings.js', 'helpers.js', 'coastal.js', 'dom.js', 'ai.js'];

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

/**
 * A node of the fake DOM: just enough of `document.createElement()` for
 * YW.dom.h() and for the AI modal to build its tree.
 */
function makeEl(tag) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    attributes: {},
    children: [],
    listeners: {},
    dataset: {},
    style: { setProperty: () => {} },
    textContent: '',
    parentNode: null,
    setAttribute: function (name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return this.attributes[name];
    },
    addEventListener: function (type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    },
    appendChild: function (child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild: function (child) {
      const index = this.children.indexOf(child);
      if (index !== -1) this.children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
  };
  Object.defineProperty(el, 'firstChild', {
    get: function () {
      return this.children[0] || null;
    },
  });
  return el;
}

/** Depth-first search for the first element matching the predicate. */
function findEl(node, predicate) {
  if (!node || node.nodeType !== 1) return null;
  if (predicate(node)) return node;
  for (let i = 0; i < node.children.length; i++) {
    const found = findEl(node.children[i], predicate);
    if (found) return found;
  }
  return null;
}

/** Every piece of text inside a node, one per line, in document order. */
function textOf(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.textContent;
  return node.children.map(textOf).join('\n');
}

/** Clicks the first button whose label contains the needle. */
function clickButton(root, needle) {
  const button = findEl(
    root,
    (el) => el.tagName === 'BUTTON' && textOf(el).indexOf(needle) !== -1,
  );
  if (!button) return false;
  (button.listeners.click || []).forEach((fn) => fn({ target: button }));
  return true;
}

/**
 * Loads the four scripts into a fresh sandbox (the order matches index.html)
 * and returns the populated `YW` namespace plus the fake document body.
 */
function boot(options) {
  const opts = options || {};
  const storage = makeStorage();
  if (opts.settings) {
    storage.setItem('weather_settings', JSON.stringify(opts.settings));
  }

  const body = makeEl('body');
  const window = { YW: {} };
  // The analysis is deferred by a timeout: running it straight away keeps the
  // whole modal synchronous for the assertions below.
  const runNow = (fn) => {
    fn();
    return 0;
  };
  window.setTimeout = runNow;
  window.clearTimeout = () => {};
  const sandbox = {
    window: window,
    document: {
      body: body,
      currentScript: null,
      createElement: makeEl,
      createElementNS: (namespace, tag) => makeEl(tag),
      createTextNode: (text) => ({
        nodeType: 3,
        textContent: String(text),
        parentNode: null,
      }),
    },
    localStorage: storage,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: runNow,
    clearTimeout: () => {},
  };

  SCRIPTS.forEach((file) => {
    vm.runInNewContext(
      fs.readFileSync(path.join(JS_DIR, file), 'utf8'),
      sandbox,
      { filename: file },
    );
  });

  return { yw: window.YW, body: body };
}

// ── Fixtures ──

const TODAY = '2026-11-08';
const YESTERDAY = '2026-11-07';

/** One hourly row of the shape api.js produces. */
function hourRow(date, hour, temperature) {
  return {
    date: date,
    time: (hour < 10 ? '0' : '') + hour + ':00',
    temperature: temperature,
    wind_speed: 2,
    uv_index: 1,
    precipitation_probability: 0,
    condition: 'Clear',
    sea_temperature: null,
  };
}

/**
 * A November day in Yalta: 09:00 is the warmest hour of the day but sits
 * outside the 10:00-18:00 swim window, so 15:00 is the warmest hour inside it.
 * Yesterday holds a hotter 16:00 row that must never be picked.
 */
function hourlySeries() {
  return [
    hourRow(YESTERDAY, 16, 30),
    hourRow(TODAY, 9, 20),
    hourRow(TODAY, 10, 14),
    hourRow(TODAY, 12, 16),
    hourRow(TODAY, 15, 17),
    hourRow(TODAY, 18, 15.5),
    hourRow(TODAY, 23, 19),
  ];
}

function forecastDays() {
  return [
    {
      date: TODAY,
      temperature_max: 13,
      temperature_min: 7,
      precipitation_probability_max: 20,
      uv_index_max: 2,
    },
    {
      date: '2026-11-09',
      temperature_max: 12,
      temperature_min: 6,
      precipitation_probability_max: 10,
      uv_index_max: 1,
    },
  ];
}

/**
 * A complete WeatherResponse. Defaults: Yalta, 22 °C air, 13 °C water (the
 * November case that used to show no swim advice at all).
 */
function makeWeather(options) {
  const opts = options || {};
  const current = Object.assign(
    {
      temperature: 22,
      wind_speed: 3,
      uv_index: 1,
      precipitation_probability: 10,
      condition: 'Clear',
      sea_temperature: 13,
      latitude: 44.5,
    },
    opts.current || {},
  );

  return {
    city: opts.city === undefined ? 'Ялта' : opts.city,
    city_name: opts.city_name === undefined ? 'Yalta' : opts.city_name,
    local_today: opts.local_today === undefined ? TODAY : opts.local_today,
    current: current,
    hourly: opts.hourly === undefined ? hourlySeries() : opts.hourly,
    forecast: forecastDays(),
  };
}

/** Every recommendation that starts with the given prefix. */
function tips(data, prefix) {
  return (data.recommendations || []).filter(
    (tip) => String(tip).indexOf(prefix) === 0,
  );
}


// ── Tests ──

function testScores(yw) {
  section('Comfort / walk scores are whole numbers');

  const en = yw.ai.buildAiData(makeWeather(), 'en');
  const comfort = tips(en, '⭐ Comfort: ');
  const walk = tips(en, '🚶 Walk: ');

  check('comfort tip is there exactly once', comfort.length === 1);
  check('walk tip is there exactly once', walk.length === 1);
  // 22 °C, 3 m/s, UV 1, 10 % rain -> comfort 9.05, walk 8.4
  check('comfort 9.05 is shown as 9', comfort[0] === '⭐ Comfort: 9/10', comfort[0]);
  check('walk 8.4 is shown as 8', walk[0] === '🚶 Walk: 8/10', walk[0]);
  check(
    'scores keep no decimals at all',
    /^⭐ Comfort: \d{1,2}\/10$/.test(comfort[0] || '') &&
      /^🚶 Walk: \d{1,2}\/10$/.test(walk[0] || ''),
    comfort[0] + ' / ' + walk[0],
  );
  check(
    'raw scores stay available for the response shape',
    typeof en.comfortScore === 'number' && typeof en.walkScore === 'number',
  );

  const ru = yw.ai.buildAiData(makeWeather(), 'ru');
  check(
    'russian tips are rounded too',
    tips(ru, '⭐ Комфорт: 9/10').length === 1 &&
      tips(ru, '🚶 Прогулка: 8/10').length === 1,
    JSON.stringify(ru.recommendations.slice(0, 2)),
  );
}

function testNoCurrentConditions(yw) {
  section('"Current conditions" is gone from the modal');

  const en = yw.ai.buildAiData(makeWeather(), 'en');
  const ru = yw.ai.buildAiData(makeWeather(), 'ru');

  check('buildAiData no longer returns a summary', en.summary === undefined);
  check(
    'no english "Current conditions" line',
    tips(en, 'Current conditions').length === 0,
    JSON.stringify(tips(en, 'Current conditions')),
  );
  check(
    'no russian "Текущие условия" line',
    tips(ru, 'Текущие условия').length === 0,
    JSON.stringify(tips(ru, 'Текущие условия')),
  );
  check(
    'nothing in the list repeats the current weather',
    en.recommendations.every((tip) => tip.indexOf('°C, ') === -1),
  );
}


// ── Tests ──

/**
 * Opens the AI modal with the given weather/settings, presses its "Use
 * Yaroslav AI" button and returns the text the user would see.
 */
function renderModal(options) {
  const opts = options || {};
  const booted = boot({ settings: opts.settings });
  const modal = booted.yw.ai.openAi({
    weather: opts.weather || makeWeather(),
    theme: 'light',
  });
  const clicked = clickButton(booted.body, 'Yaroslav AI');
  return {
    yw: booted.yw,
    body: booted.body,
    modal: modal,
    clicked: clicked,
    text: textOf(booted.body),
  };
}

function testScores(yw) {
  section('Comfort / walk scores are whole numbers');

  const en = yw.ai.buildAiData(makeWeather(), 'en');
  const comfort = tips(en, '⭐ Comfort: ');
  const walk = tips(en, '🚶 Walk: ');

  check('comfort tip is there exactly once', comfort.length === 1);
  check('walk tip is there exactly once', walk.length === 1);
  // 22 °C, 3 m/s, UV 1, 10 % rain -> comfort 9.05, walk 8.4
  check('comfort 9.05 is shown as 9', comfort[0] === '⭐ Comfort: 9/10', comfort[0]);
  check('walk 8.4 is shown as 8', walk[0] === '🚶 Walk: 8/10', walk[0]);
  check(
    'scores keep no decimals at all',
    /^⭐ Comfort: \d{1,2}\/10$/.test(comfort[0] || '') &&
      /^🚶 Walk: \d{1,2}\/10$/.test(walk[0] || ''),
    comfort[0] + ' / ' + walk[0],
  );
  check(
    'raw scores stay available for the response shape',
    typeof en.comfortScore === 'number' && typeof en.walkScore === 'number',
  );

  const ru = yw.ai.buildAiData(makeWeather(), 'ru');
  check(
    'russian tips are rounded too',
    tips(ru, '⭐ Комфорт: 9/10').length === 1 &&
      tips(ru, '🚶 Прогулка: 8/10').length === 1,
    JSON.stringify(ru.recommendations.slice(0, 2)),
  );
}

function testNoCurrentConditions(yw) {
  section('"Current conditions" is gone from the modal');

  const en = yw.ai.buildAiData(makeWeather(), 'en');
  const ru = yw.ai.buildAiData(makeWeather(), 'ru');

  check('buildAiData no longer returns a summary', en.summary === undefined);
  check(
    'no english "Current conditions" line',
    tips(en, 'Current conditions').length === 0,
    JSON.stringify(tips(en, 'Current conditions')),
  );
  check(
    'no russian "Текущие условия" line',
    tips(ru, 'Текущие условия').length === 0,
    JSON.stringify(tips(ru, 'Текущие условия')),
  );
  check(
    'nothing in the list repeats the current weather',
    en.recommendations.every((tip) => tip.indexOf('°C, ') === -1),
  );
}


function testBestSwimTime(yw) {
  section('Best swim time for coastal cities');

  // Cold sea: the score stays at 0, yet the best hour is still suggested.
  const cold = yw.ai.buildAiData(makeWeather(), 'en');
  const coldBest = tips(cold, '🏊 Best swim time: ');

  check(
    'cold water still reports the sea as too cold',
    tips(cold, '🏖️ Sea too cold for swimming.').length === 1,
  );
  check(
    'cold water still gets a best swim time',
    coldBest.length === 1,
    JSON.stringify(tips(cold, '🏊')),
  );
  check(
    'best swim time is the warmest hour within 10:00-18:00',
    coldBest[0] === '🏊 Best swim time: 15:00',
    coldBest[0],
  );
  check(
    'hours outside the swim window are ignored',
    coldBest[0].indexOf('09:00') === -1 && coldBest[0].indexOf('23:00') === -1,
    coldBest[0],
  );
  check(
    "yesterday's hotter hour is ignored",
    coldBest[0].indexOf('16:00') === -1,
    coldBest[0],
  );

  // Warm sea: the score tip joins in, the best time stays.
  const warm = yw.ai.buildAiData(
    makeWeather({ current: { sea_temperature: 24 } }),
    'en',
  );
  check(
    'warm water shows the swim score',
    tips(warm, '🏊 Swim: ').length === 1,
    JSON.stringify(tips(warm, '🏊')),
  );
  check(
    'the swim score is followed by the water temperature',
    /^🏊 Swim: [\d.]+\/10 \(water 24°C\)$/.test(tips(warm, '🏊 Swim: ')[0] || ''),
    tips(warm, '🏊 Swim: ')[0],
  );
  check(
    'warm water also shows the best time',
    tips(warm, '🏊 Best swim time: 15:00').length === 1,
  );
  check(
    'no "too cold" line when the water is warm',
    tips(warm, '🏖️').length === 0,
  );

  const ru = yw.ai.buildAiData(
    makeWeather({ current: { sea_temperature: 24 } }),
    'ru',
  );
  check(
    'russian wording of the best swim time',
    tips(ru, '🏊 Лучшее время для купания: 15:00').length === 1,
    JSON.stringify(tips(ru, '🏊')),
  );

  // The English spelling of the city counts as coastal as well.
  const english = yw.ai.buildAiData(
    makeWeather({ city: 'Yalta', city_name: '' }),
    'en',
  );
  check(
    'english spelling is recognised as coastal',
    tips(english, '🏊 Best swim time: ').length === 1,
    JSON.stringify(english.recommendations),
  );

  // Inland city: neither swim line may appear, even with a sea temperature.
  const inland = yw.ai.buildAiData(
    makeWeather({
      city: 'Москва',
      city_name: 'Moscow',
      current: { sea_temperature: 24 },
    }),
    'en',
  );
  check(
    'inland city gets no swim tips',
    tips(inland, '🏊').length === 0 && tips(inland, '🏖️').length === 0,
    JSON.stringify(inland.recommendations),
  );

  // Without hourly rows there is nothing to rank.
  const noHourly = yw.ai.buildAiData(makeWeather({ hourly: [] }), 'en');
  check(
    'no hourly forecast -> no best swim time',
    tips(noHourly, '🏊 Best swim time: ').length === 0,
  );
  check(
    'the rest of the analysis survives an empty hourly series',
    tips(noHourly, '⭐ Comfort: ').length === 1,
  );
}

function testOutlookUnits() {
  section('Outlook temperatures follow the settings, rain uses мм in russian');

  const celsius = renderModal({
    weather: makeWeather({ current: { sea_temperature: 24 } }),
    settings: { language: 'en', temp_unit: 'celsius' },
  });
  check('the modal opened and the analysis ran', celsius.clicked, celsius.text);
  check(
    'celsius temperatures carry the °C suffix',
    /\d+°C/.test(celsius.text),
    celsius.text,
  );
  check(
    'no bare degrees are left in the tables',
    celsius.text.indexOf('.0°') === -1,
    celsius.text,
  );
  check('rain is measured in mm in english', /\dmm/.test(celsius.text));
  check(
    'the water temperature uses the same unit',
    /\(water 24°C\)/.test(celsius.text),
    celsius.text,
  );

  const fahrenheit = renderModal({
    weather: makeWeather({ current: { sea_temperature: 24 } }),
    settings: { language: 'en', temp_unit: 'fahrenheit' },
  });
  check(
    'fahrenheit settings convert the outlook',
    /\d+°F/.test(fahrenheit.text) && fahrenheit.text.indexOf('°C') === -1,
    fahrenheit.text,
  );
  check(
    'fahrenheit settings convert the water temperature too',
    /\(water 75°F\)/.test(fahrenheit.text),
    fahrenheit.text,
  );

  const russian = renderModal({
    settings: { language: 'ru', temp_unit: 'celsius' },
  });
  check('rain is measured in мм in russian', /\dмм/.test(russian.text));
  check(
    'no latin mm is left in the russian modal',
    russian.text.indexOf('mm') === -1,
    russian.text,
  );
  check(
    'the russian modal shows the best swim time',
    russian.text.indexOf('🏊 Лучшее время для купания: 15:00') !== -1,
  );
  check(
    'the russian modal shows no current conditions line',
    russian.text.indexOf('Текущие условия') === -1,
    russian.text,
  );
}

// ── Runner ──

(function main() {
  const booted = boot();
  const yw = booted.yw;

  testScores(yw);
  testNoCurrentConditions(yw);
  testBestSwimTime(yw);
  testOutlookUnits();

  console.log('\n' + checks + ' checks, ' + failures.length + ' failure(s)');
  if (failures.length) {
    console.log('Failed: ' + failures.join(', '));
    process.exit(1);
  }
  console.log('✅ AI modal looks good');
})();

