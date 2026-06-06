import { Language, TempUnit, WindUnit, PressureUnit } from './settings';

// ── Conversions ──

export function convertTemp(celsius: number, unit: TempUnit): number {
  switch (unit) {
    case TempUnit.Celsius: return celsius;
    case TempUnit.Fahrenheit: return celsius * 9 / 5 + 32;
    case TempUnit.Kelvin: return celsius + 273.15;
  }
}

export function convertWind(ms: number, unit: WindUnit): number {
  switch (unit) {
    case WindUnit.Mps: return ms;
    case WindUnit.Kmph: return ms * 3.6;
    case WindUnit.Mph: return ms * 2.23694;
  }
}

export function convertPressure(hpa: number, unit: PressureUnit): number {
  switch (unit) {
    case PressureUnit.HPa: return hpa;
    case PressureUnit.MmHg: return hpa * 0.750062;
    case PressureUnit.InHg: return hpa * 0.02953;
  }
}

// ── Formatting ──

export function formatTime(isoTime: string): string {
  if (isoTime === 'N/A') return 'N/A';
  const timePart = isoTime.split('T')[1] || isoTime;
  return timePart.slice(0, 5);
}

export function formatTemp(celsius: number, unit: TempUnit): string {
  const converted = convertTemp(celsius, unit);
  const unitStr = unit === TempUnit.Celsius ? '°C' : unit === TempUnit.Fahrenheit ? '°F' : 'K';
  return `${converted.toFixed(1)}${unitStr}`;
}

// ── Weather conditions ──

export function conditionIconFromText(condition: string): string {
  const lower = condition.toLowerCase();
  if (lower.includes('mainly clear')) return '🌤️';
  if (lower.includes('partly cloudy')) return '⛅';
  if (lower.includes('clear')) return '☀️';
  if (lower.includes('overcast') || lower.includes('cloudy')) return '☁️';
  if (lower.includes('fog')) return '🌫️';
  if (lower.includes('drizzle')) return '🌦️';
  if (lower.includes('rain')) return '🌧️';
  if (lower.includes('snow')) return '❄️';
  if (lower.includes('thunder')) return '⛈️';
  return '🌡️';
}

export function moonEmojiFromPhase(phase: string): string {
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

export function uvCategory(uv: number): string {
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very High';
  return 'Extreme';
}

export function pressureCategory(hpa: number): string {
  if (hpa < 980) return 'Low';
  if (hpa < 1010) return 'Normal';
  if (hpa < 1040) return 'High';
  return 'Very High';
}

export function windCategory(ms: number): string {
  if (ms < 0.5) return 'Calm';
  if (ms < 5.5) return 'Light';
  if (ms < 8) return 'Moderate';
  if (ms < 10.8) return 'Fresh';
  if (ms < 13.9) return 'Strong';
  return 'Storm';
}

// ── Translations ──

export function translateCondition(conditionEn: string, lang: Language): string {
  if (lang === Language.English) return conditionEn;
  const map: Record<string, string> = {
    'Clear sky': 'Ясно',
    'Mainly clear': 'Преимущественно ясно',
    'Partly cloudy': 'Переменная облачность',
    'Overcast': 'Пасмурно',
    'Fog': 'Туман',
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
    'Thunderstorm': 'Гроза',
    'Slight rain showers': 'Небольшие ливни',
    'Violent rain showers': 'Сильные ливни',
    'Slight snow showers': 'Небольшой снегопад',
  };
  return map[conditionEn] || conditionEn;
}

export function translateCategory(cat: string, lang: Language): string {
  if (lang === Language.English) return cat;
  const map: Record<string, string> = {
    'Low': 'Низкий',
    'Moderate': 'Средний',
    'High': 'Высокий',
    'Very High': 'Очень высокий',
    'Extreme': 'Экстремальный',
    'Normal': 'Нормальное',
    'Calm': 'Штиль',
    'Light': 'Лёгкий',
    'Fresh': 'Средний',
    'Strong': 'Сильный',
    'Storm': 'Шторм',
  };
  return map[cat] || cat;
}

export function translateMoonPhase(phase: string, lang: Language): string {
  if (lang === Language.English) return phase;
  const map: Record<string, string> = {
    'New Moon': 'Новолуние',
    'Waxing Crescent': 'Растущий серп',
    'First Quarter': 'Первая четверть',
    'Waxing Gibbous': 'Растущая луна',
    'Full Moon': 'Полнолуние',
    'Waning Gibbous': 'Убывающая луна',
    'Last Quarter': 'Последняя четверть',
    'Waning Crescent': 'Убывающий серп',
  };
  return map[phase] || phase;
}

// ── Month names ──

export function monthNameEn(month: number): string {
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return names[(month - 1) % 12] || 'Month';
}

export function monthNameRu(month: number): string {
  const names = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return names[(month - 1) % 12] || '';
}

// ── Day labels ──

export function formatDayLabel(dateStr: string, lang: Language): string {
  const date = new Date(dateStr + 'T00:00:00');
  if (isNaN(date.getTime())) return dateStr;
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.getMonth() + 1;
  const monthName = lang === Language.English ? monthNameEn(month) : monthNameRu(month);
  const weekdays_en = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const weekdays_ru = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const wd = (date.getDay() + 6) % 7; // Monday = 0
  const weekday = lang === Language.English ? weekdays_en[wd] : weekdays_ru[wd];
  return `${day} ${monthName} (${weekday})`;
}

// ── Day length ──

export function dayLengthApprox(sunrise: string, sunset: string): string {
  const toMin = (s: string) => {
    const parts = s.split(':');
    return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
  };
  const diff = toMin(sunset) - toMin(sunrise);
  if (diff <= 0) return 'N/A';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${m}m`;
}

// ── Coastal city detection ──

const COASTAL_CITIES_EN = [
  'Sochi','Vladivostok','Kaliningrad','Murmansk','Arkhangelsk',
  'Saint Petersburg','St. Petersburg','Novorossiysk','Anapa','Gelendzhik',
  'Tuapse','Nakhodka','Magadan','Sevastopol','Yalta','Alushta','Sudak',
  'Feodosia','Kerch','Yevpatoria','Miami','Los Angeles','San Francisco',
  'Rio de Janeiro','Sydney','Melbourne','Cape Town','Barcelona','Valencia',
  'Malaga','Lisbon','Porto','Rome','Naples','Athens','Istanbul','Antalya',
  'Dubai','Mumbai','Chennai','Bangkok','Hong Kong','Tokyo','Osaka','Busan',
  'Vancouver','Halifax','Reykjavik','Copenhagen','Stockholm','Helsinki',
  'Oslo','London','Amsterdam','Odessa','Odesa',
];

const COASTAL_CITIES_RU = [
  'Сочи','Владивосток','Калининград','Мурманск','Архангельск',
  'Санкт-Петербург','Новороссийск','Анапа','Геленджик','Туапсе',
  'Находка','Магадан','Севастополь','Ялта','Алушта','Судак','Феодосия',
  'Керчь','Евпатория','Мариуполь','Майами','Лос-Анджелес','Сан-Франциско',
  'Рио-де-Жанейро','Сидней','Мельбурн','Кейптаун','Барселона','Валенсия',
  'Малага','Лиссабон','Порту','Рим','Неаполь','Афины','Стамбул','Анталья',
  'Дубай','Мумбаи','Ченнаи','Бангкок','Гонконг','Токио','Осака','Пусан',
  'Ванкувер','Галифакс','Рейкьявик','Копенгаген','Стокгольм','Хельсинки',
  'Осло','Лондон','Амстердам','Одесса',
];

export function isCoastalCity(city: string): boolean {
  const lower = city.toLowerCase();
  return COASTAL_CITIES_EN.some(c => c.toLowerCase() === lower)
    || COASTAL_CITIES_RU.some(c => c.toLowerCase() === lower);
}

// ── Approximate coordinates ──

export function getApproxLat(city: string): number {
  const map: Record<string, number> = {
    'moscow': 55.75, 'london': 51.51, 'sochi': 43.59,
    'vladivostok': 43.13, 'saint petersburg': 59.93, 'st. petersburg': 59.93,
  };
  return map[city.toLowerCase()] || 50.0;
}

export function getApproxLon(city: string): number {
  const map: Record<string, number> = {
    'moscow': 37.61, 'london': -0.13, 'sochi': 39.72,
    'vladivostok': 131.89, 'saint petersburg': 30.34, 'st. petersburg': 30.34,
  };
  return map[city.toLowerCase()] || 10.0;
}
