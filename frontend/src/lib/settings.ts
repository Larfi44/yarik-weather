export enum Language {
  English = 'en',
  Russian = 'ru',
}

export enum TempUnit {
  Celsius = 'celsius',
  Fahrenheit = 'fahrenheit',
  Kelvin = 'kelvin',
}

export enum WindUnit {
  Mps = 'mps',
  Kmph = 'kmph',
  Mph = 'mph',
}

export enum PressureUnit {
  HPa = 'hpa',
  MmHg = 'mmhg',
  InHg = 'inhg',
}

export enum Theme {
  Auto = 'auto',
  Light = 'light',
  Dark = 'dark',
}

export interface UserSettings {
  temp_unit: TempUnit;
  wind_unit: WindUnit;
  language: Language;
  default_city: string;
  theme: Theme;
  first_time: boolean;
  pressure_unit: PressureUnit;
}

const SETTINGS_KEY = 'weather_settings';

export function getDefaultSettings(): UserSettings {
  return {
    temp_unit: TempUnit.Celsius,
    wind_unit: WindUnit.Mps,
    language: Language.English,
    default_city: '',
    theme: Theme.Auto,
    first_time: true,
    pressure_unit: PressureUnit.HPa,
  };
}

export function getSettings(): UserSettings {
  if (typeof window === 'undefined') return getDefaultSettings();
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...getDefaultSettings(), ...JSON.parse(stored) };
    }
  } catch {}
  return getDefaultSettings();
}

export function saveSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

export function cycleTheme(theme: Theme): Theme {
  switch (theme) {
    case Theme.Auto: return Theme.Light;
    case Theme.Light: return Theme.Dark;
    case Theme.Dark: return Theme.Auto;
  }
}

export function themeIcon(theme: Theme): string {
  switch (theme) {
    case Theme.Auto: return '🌓';
    case Theme.Light: return '☀️';
    case Theme.Dark: return '🌙';
  }
}

export function choiceBtnClass(active: boolean): string {
  return active ? 'choice-btn active' : 'choice-btn';
}

export function tempUnitStr(unit: TempUnit, lang: Language): string {
  switch (unit) {
    case TempUnit.Celsius: return '°C';
    case TempUnit.Fahrenheit: return '°F';
    case TempUnit.Kelvin: return 'K';
  }
}

export function windUnitStr(unit: WindUnit, lang: Language): string {
  switch (unit) {
    case WindUnit.Mps: return lang === Language.English ? 'm/s' : 'м/с';
    case WindUnit.Kmph: return lang === Language.English ? 'km/h' : 'км/ч';
    case WindUnit.Mph: return lang === Language.English ? 'mph' : 'миль/ч';
  }
}

export function pressureUnitStr(unit: PressureUnit, lang: Language): string {
  switch (unit) {
    case PressureUnit.HPa: return lang === Language.English ? 'hPa' : 'гПа';
    case PressureUnit.MmHg: return lang === Language.English ? 'mmHg' : 'мм рт. ст.';
    case PressureUnit.InHg: return lang === Language.English ? 'inHg' : 'дюйм рт. ст.';
  }
}
