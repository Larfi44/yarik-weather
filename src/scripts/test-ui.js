#!/usr/bin/env node
/**
 * Smoke test for the Russian category words used by the current card and the
 * chart tooltips (src/js/helpers.js).
 *
 * One category table is shared by metrics whose nouns have different genders:
 * «давление» is neuter («Высокое»), «ветер» and «УФ-индекс» are masculine
 * («Высокий»). H.translateCategory(cat, lang, gender) has to pick the right
 * form, and English has to stay untouched.
 *
 *   node src/scripts/test-ui.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');
const SCRIPTS = ['settings.js', 'helpers.js'];

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

/** Loads the scripts into a fresh sandbox (the order matches index.html). */
function boot() {
  const window = { YW: {} };
  const sandbox = {
    window: window,
    document: { currentScript: null },
    localStorage: makeStorage(),
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };

  SCRIPTS.forEach((file) => {
    vm.runInNewContext(
      fs.readFileSync(path.join(JS_DIR, file), 'utf8'),
      sandbox,
      { filename: file },
    );
  });

  return window.YW.helpers;
}

const H = boot();

/** The Russian bracket word for one wind speed. */
function windRu(ms) {
  return H.translateCategory(H.windCategory(ms), 'ru', 'masculine');
}

/** The Russian bracket word for one UV index. */
function uvRu(uv) {
  return H.translateCategory(H.uvCategory(uv), 'ru', 'masculine');
}

/** The Russian bracket word for one pressure reading. */
function pressureRu(hpa) {
  return H.translateCategory(H.pressureCategory(hpa), 'ru');
}

section('Wind is masculine («Ветер: 3.0 м/с (Лёгкий)»)');
check('calm', windRu(0.2) === 'Штиль', windRu(0.2));
check('light', windRu(3) === 'Лёгкий', windRu(3));
check('moderate', windRu(6.5) === 'Средний', windRu(6.5));
check('fresh', windRu(9) === 'Свежий', windRu(9));
check('strong', windRu(12) === 'Сильный', windRu(12));
check('storm', windRu(20) === 'Штормовой', windRu(20));
check(
  'every wind word is masculine (noun or -ий/-ый/-ой adjective)',
  [windRu(0.2), windRu(3), windRu(6.5), windRu(9), windRu(12), windRu(20)].every(
    (word) => word === 'Штиль' || /(ий|ый|ой)$/.test(word),
  ),
  [windRu(0.2), windRu(3), windRu(6.5), windRu(9), windRu(12), windRu(20)].join(
    ', ',
  ),
);

section('UV is masculine («УФ: 4.0 (Средний)»)');
check('low', uvRu(1) === 'Низкий', uvRu(1));
check('moderate', uvRu(4) === 'Средний', uvRu(4));
check('high', uvRu(7) === 'Высокий', uvRu(7));
check('very high', uvRu(9) === 'Очень высокий', uvRu(9));
check('extreme', uvRu(12) === 'Экстремальный', uvRu(12));
check(
  'every uv word is masculine (noun or -ий/-ый/-ой adjective)',
  [uvRu(1), uvRu(4), uvRu(7), uvRu(9), uvRu(12)].every((word) =>
    /(ий|ый|ой)$/.test(word),
  ),
  [uvRu(1), uvRu(4), uvRu(7), uvRu(9), uvRu(12)].join(', '),
);

section('Pressure stays neuter («Давление: 1020.0 гПа (Высокое)»)');
check('low', pressureRu(970) === 'Низкое', pressureRu(970));
check('normal', pressureRu(1000) === 'Нормальное', pressureRu(1000));
check('high', pressureRu(1020) === 'Высокое', pressureRu(1020));
check('very high', pressureRu(1050) === 'Очень высокое', pressureRu(1050));
check(
  'every pressure word is neuter (noun or -ое/-ее adjective)',
  [pressureRu(970), pressureRu(1000), pressureRu(1020), pressureRu(1050)].every(
    (word) => /(ое|ее)$/.test(word),
  ),
  [pressureRu(970), pressureRu(1000), pressureRu(1020), pressureRu(1050)].join(
    ', ',
  ),
);

section('English and unknown categories are passed through');
check('english wind', H.translateCategory('Moderate', 'en') === 'Moderate');
check(
  'english uv with a gender',
  H.translateCategory('Very High', 'en', 'masculine') === 'Very High',
);
check('unknown category', H.translateCategory('Odd', 'ru', 'masculine') === 'Odd');

console.log('\n' + checks + ' checks, ' + failures.length + ' failure(s)');
if (failures.length) {
  console.log('Failed: ' + failures.join(', '));
  process.exit(1);
}
console.log('✅ Russian category words look good');
