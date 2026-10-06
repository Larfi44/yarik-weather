/**
 * Conversions, formatting and translations.
 * Vanilla-JS port of frontend/src/lib/helpers.ts (+ assetUrl from lib/assets.ts).
 * The unused coastal/coordinate helpers of the old file are not ported —
 * the app uses `YW.isCoastal` from coastal.js instead.
 */
window.YW = window.YW || {};

(function (YW) {
  'use strict';

  const Language = YW.Language;
  const TempUnit = YW.TempUnit;
  const WindUnit = YW.WindUnit;
  const PressureUnit = YW.PressureUnit;

  // ── Assets ──

  /**
   * Returns the path for a static asset. Always uses a *relative* path so the
   * site works from any sub-path (e.g. GitVerse Pages /yarik-weather/) as well
   * as from the root of the Tauri bundle.
   */
  function assetUrl(path) {
    return './' + path.replace(/^\//, '');
  }

  // ── Conversions ──

  function convertTemp(celsius, unit) {
    const t = celsius == null ? 0 : celsius;
    if (typeof t !== 'number' || isNaN(t)) return 0;
    switch (unit) {
      case TempUnit.Celsius:
        return t;
      case TempUnit.Fahrenheit:
        return (t * 9) / 5 + 32;
      case TempUnit.Kelvin:
        return t + 273.15;
      default:
        return t;
    }
  }

  function convertWind(ms, unit) {
    const t = ms == null ? 0 : ms;
    if (typeof t !== 'number' || isNaN(t)) return 0;
    switch (unit) {
      case WindUnit.Mps:
        return t;
      case WindUnit.Kmph:
        return t * 3.6;
      case WindUnit.Mph:
        return t * 2.23694;
      default:
        return t;
    }
  }

  function convertPressure(hpa, unit) {
    const t = hpa == null ? 0 : hpa;
    if (typeof t !== 'number' || isNaN(t)) return 0;
    switch (unit) {
      case PressureUnit.HPa:
        return t;
      case PressureUnit.MmHg:
        return t * 0.750062;
      case PressureUnit.InHg:
        return t * 0.02953;
      default:
        return t;
    }
  }

  // ── Formatting ──

  function formatTime(isoTime) {
    if (isoTime === 'N/A') return 'N/A';
    const timePart = isoTime.split('T')[1] || isoTime;
    return timePart.slice(0, 5);
  }

  function formatTemp(celsius, unit) {
    const converted = convertTemp(celsius, unit);
    const unitStr =
      unit === TempUnit.Celsius
        ? '°C'
        : unit === TempUnit.Fahrenheit
          ? '°F'
          : 'K';
    return converted.toFixed(1) + unitStr;
  }

  // ── Weather conditions ──

  function conditionIconFromText(condition) {
    const lower = String(condition || '').toLowerCase();
    if (lower.includes('mainly clear')) return '🌤️';
    if (lower.includes('partly cloudy')) return '⛅';
    if (lower.includes('few clouds')) return '🌤️';
    if (lower.includes('scattered clouds')) return '⛅';
    if (lower.includes('clear')) return '☀️';
    if (lower.includes('overcast') || lower.includes('cloudy')) return '☁️';
    if (lower.includes('clouds')) return '☁️';
    if (lower.includes('fog')) return '🌫️';
    if (
      lower.includes('mist') ||
      lower.includes('haze') ||
      lower.includes('smoke') ||
      lower.includes('dust') ||
      lower.includes('sand') ||
      lower.includes('ash')
    ) {
      return '🌫️';
    }
    if (
      lower.includes('tornado') ||
      lower.includes('squall') ||
      lower.includes('whirls')
    ) {
      return '🌪️';
    }
    if (lower.includes('thunder')) return '⛈️';
    if (lower.includes('snow') || lower.includes('sleet')) return '❄️';
    if (lower.includes('drizzle')) return '🌦️';
    if (lower.includes('rain') || lower.includes('shower')) return '🌧️';
    return '🌡️';
  }

  function moonEmojiFromPhase(phase) {
    const p = phase.toLowerCase();
    if (p.includes('new moon')) return '🌑';
    if (p.includes('waxing crescent')) return '🌒';
    if (p.includes('first quarter')) return '🌓';
    if (p.includes('waxing gibbous')) return '🌔';
    if (p.includes('full moon')) return '🌕';
    if (p.includes('waning gibbous')) return '🌖';
    if (p.includes('last quarter') || p.includes('third quarter')) return '🌗';
    if (p.includes('waning crescent')) return '🌘';
    return '🌙';
  }

  // ── Categories ──

  function uvCategory(uv) {
    if (uv < 3) return 'Low';
    if (uv < 6) return 'Moderate';
    if (uv < 8) return 'High';
    if (uv < 11) return 'Very High';
    return 'Extreme';
  }

  function pressureCategory(hpa) {
    if (hpa < 980) return 'Low';
    if (hpa < 1010) return 'Normal';
    if (hpa < 1040) return 'High';
    return 'Very High';
  }

  function windCategory(ms) {
    if (ms < 0.5) return 'Calm';
    if (ms < 5.5) return 'Light';
    if (ms < 8) return 'Moderate';
    if (ms < 10.8) return 'Fresh';
    if (ms < 13.9) return 'Strong';
    return 'Storm';
  }

  // ── Translations ──

  const CONDITION_RU = {
    'Clear sky': 'Ясно',
    'Mainly clear': 'Преимущественно ясно',
    'Partly cloudy': 'Переменная облачность',
    Overcast: 'Пасмурно',
    Fog: 'Туман',
    'Depositing rime fog': 'Изморозь',
    'Light drizzle': 'Лёгкая морось',
    'Moderate drizzle': 'Умеренная морось',
    'Dense drizzle': 'Сильная морось',
    'Slight rain': 'Небольшой дождь',
    'Moderate rain': 'Умеренный дождь',
    'Heavy rain': 'Сильный дождь',
    'Slight snow fall': 'Небольшой снег',
    'Moderate snow fall': 'Умеренный снег',
    'Heavy snow fall': 'Сильный снег',
    Thunderstorm: 'Гроза',
    'Slight rain showers': 'Небольшие ливни',
    'Violent rain showers': 'Сильные ливни',
    'Slight snow showers': 'Небольшой снегопад',
    // api-ninjas (OpenWeather-style) descriptions.
    'Few clouds': 'Небольшая облачность',
    'Scattered clouds': 'Рассеянные облака',
    'Broken clouds': 'Облачно с прояснениями',
    'Overcast clouds': 'Пасмурно',
    'Light rain': 'Небольшой дождь',
    'Heavy intensity rain': 'Сильный дождь',
    'Very heavy rain': 'Очень сильный дождь',
    'Extreme rain': 'Экстремальный дождь',
    'Freezing rain': 'Ледяной дождь',
    'Light intensity drizzle': 'Лёгкая морось',
    'Heavy intensity drizzle': 'Сильная морось',
    'Shower rain': 'Ливень',
    'Light intensity shower rain': 'Небольшой ливень',
    'Heavy intensity shower rain': 'Сильный ливень',
    'Light snow': 'Небольшой снег',
    Snow: 'Снег',
    'Heavy snow': 'Сильный снег',
    Sleet: 'Мокрый снег',
    'Rain and snow': 'Дождь со снегом',
    Rain: 'Дождь',
    Drizzle: 'Морось',
    'Light rain and snow': 'Небольшой дождь со снегом',
    Mist: 'Дымка',
    Haze: 'Мгла',
    Smoke: 'Дым',
    Dust: 'Пыль',
    Sand: 'Песок',
    Squalls: 'Шквалы',
    Tornado: 'Смерч',
    'Volcanic ash': 'Вулканический пепел',
  };

  /** Case-insensitive view of the table (api-ninjas uses lower-case text). */
  const CONDITION_RU_LOWER = (function () {
    const map = {};
    Object.keys(CONDITION_RU).forEach(function (key) {
      map[key.toLowerCase()] = CONDITION_RU[key];
    });
    return map;
  })();

  /** Substring fallback for descriptions the table does not list verbatim. */
  function conditionHeuristicRu(lower) {
    if (lower.indexOf('thunder') !== -1) return 'Гроза';
    if (lower.indexOf('tornado') !== -1) return 'Смерч';
    if (lower.indexOf('squall') !== -1) return 'Шквал';
    if (lower.indexOf('snow') !== -1 || lower.indexOf('sleet') !== -1) return 'Снег';
    if (lower.indexOf('freezing') !== -1) return 'Ледяной дождь';
    if (lower.indexOf('drizzle') !== -1) return 'Морось';
    if (lower.indexOf('rain') !== -1 || lower.indexOf('shower') !== -1) return 'Дождь';
    if (lower.indexOf('overcast') !== -1) return 'Пасмурно';
    if (lower.indexOf('broken clouds') !== -1) return 'Облачно с прояснениями';
    if (lower.indexOf('scattered clouds') !== -1) return 'Рассеянные облака';
    if (lower.indexOf('few clouds') !== -1) return 'Небольшая облачность';
    if (lower.indexOf('cloud') !== -1) return 'Облачно';
    if (lower.indexOf('mist') !== -1) return 'Дымка';
    if (lower.indexOf('haze') !== -1) return 'Мгла';
    if (lower.indexOf('fog') !== -1) return 'Туман';
    if (lower.indexOf('smoke') !== -1) return 'Дым';
    if (lower.indexOf('dust') !== -1) return 'Пыль';
    if (lower.indexOf('sand') !== -1) return 'Песок';
    if (lower.indexOf('ash') !== -1) return 'Пепел';
    if (lower.indexOf('clear') !== -1) return 'Ясно';
    return '';
  }

  const CATEGORY_RU = {
    Low: 'Низкий',
    Moderate: 'Средний',
    High: 'Высокий',
    'Very High': 'Очень высокий',
    Extreme: 'Экстремальный',
    Normal: 'Нормальное',
    Calm: 'Штиль',
    Light: 'Лёгкий',
    Fresh: 'Средний',
    Strong: 'Сильный',
    Storm: 'Шторм',
  };

  const MOON_PHASE_RU = {
    'New Moon': 'Новолуние',
    'Waxing Crescent': 'Растущий серп',
    'First Quarter': 'Первая четверть',
    'Waxing Gibbous': 'Растущая луна',
    'Full Moon': 'Полнолуние',
    'Waning Gibbous': 'Убывающая луна',
    'Last Quarter': 'Последняя четверть',
    'Waning Crescent': 'Убывающий серп',
  };

  const MONTHS_EN = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const MONTHS_RU = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];

  function translateCondition(conditionEn, lang) {
    if (lang === Language.English) return conditionEn;
    const condition = String(conditionEn || '');
    return (
      CONDITION_RU[condition] ||
      CONDITION_RU_LOWER[condition.toLowerCase()] ||
      conditionHeuristicRu(condition.toLowerCase()) ||
      condition
    );
  }

  function translateCategory(cat, lang) {
    if (lang === Language.English) return cat;
    return CATEGORY_RU[cat] || cat;
  }

  function translateMoonPhase(phase, lang) {
    if (lang === Language.English) return phase;
    return MOON_PHASE_RU[phase] || phase;
  }

  // ── Month names ──

  function monthNameEn(month) {
    return MONTHS_EN[(month - 1) % 12] || 'Month';
  }

  function monthNameRu(month) {
    return MONTHS_RU[(month - 1) % 12] || '';
  }

  // ── Day labels ──

  function formatDayLabel(dateStr, lang) {
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return dateStr;
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.getMonth() + 1;
    const monthName =
      lang === Language.English ? monthNameEn(month) : monthNameRu(month);
    const weekdays_en = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekdays_ru = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const wd = (date.getDay() + 6) % 7; // Monday = 0
    const weekday = lang === Language.English ? weekdays_en[wd] : weekdays_ru[wd];
    return day + ' ' + monthName + ' (' + weekday + ')';
  }

  // ── Day length ──

  function dayLengthApprox(sunrise, sunset) {
    const toMin = (str) => {
      const parts = String(str).split(':');
      return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    };
    const diff = toMin(sunset) - toMin(sunrise);
    if (diff <= 0) return 'N/A';
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    return hours + 'h ' + minutes + 'm';
  }

  YW.assetUrl = assetUrl;

  YW.helpers = {
    convertTemp: convertTemp,
    convertWind: convertWind,
    convertPressure: convertPressure,
    formatTime: formatTime,
    formatTemp: formatTemp,
    conditionIconFromText: conditionIconFromText,
    moonEmojiFromPhase: moonEmojiFromPhase,
    uvCategory: uvCategory,
    pressureCategory: pressureCategory,
    windCategory: windCategory,
    translateCondition: translateCondition,
    translateCategory: translateCategory,
    translateMoonPhase: translateMoonPhase,
    monthNameEn: monthNameEn,
    monthNameRu: monthNameRu,
    formatDayLabel: formatDayLabel,
    dayLengthApprox: dayLengthApprox,
  };
})(window.YW);
