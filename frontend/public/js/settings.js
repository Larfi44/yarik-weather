/**
 * Settings, units and themes.
 * Vanilla-JS port of frontend/src/lib/settings.ts — everything hangs off the
 * global `YW` namespace (classic scripts, no bundler / ES modules needed, so
 * the page also works over the Tauri asset protocol and from file://).
 */
window.YW = window.YW || {};

(function (YW) {
  'use strict';

  const Language = { English: 'en', Russian: 'ru' };
  const TempUnit = { Celsius: 'celsius', Fahrenheit: 'fahrenheit', Kelvin: 'kelvin' };
  const WindUnit = { Mps: 'mps', Kmph: 'kmph', Mph: 'mph' };
  const PressureUnit = { HPa: 'hpa', MmHg: 'mmhg', InHg: 'inhg' };
  const Theme = { Auto: 'auto', Light: 'light', Dark: 'dark' };

  const SETTINGS_KEY = 'weather_settings';

  function getDefaultSettings() {
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

  function getSettings() {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        return Object.assign({}, getDefaultSettings(), JSON.parse(stored));
      }
    } catch (e) {
      /* ignore corrupt storage */
    }
    return getDefaultSettings();
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      /* ignore quota / private-mode errors */
    }
  }

  function cycleTheme(theme) {
    switch (theme) {
      case Theme.Auto:
        return Theme.Light;
      case Theme.Light:
        return Theme.Dark;
      default:
        return Theme.Auto;
    }
  }

  function themeIcon(theme) {
    switch (theme) {
      case Theme.Auto:
        return '🌓';
      case Theme.Light:
        return '☀️';
      default:
        return '🌙';
    }
  }

  function choiceBtnClass(active) {
    return active ? 'choice-btn active' : 'choice-btn';
  }

  function tempUnitStr(unit) {
    switch (unit) {
      case TempUnit.Fahrenheit:
        return '°F';
      case TempUnit.Kelvin:
        return 'K';
      default:
        return '°C';
    }
  }

  function windUnitStr(unit, lang) {
    const en = lang === Language.English;
    switch (unit) {
      case WindUnit.Kmph:
        return en ? 'km/h' : 'км/ч';
      case WindUnit.Mph:
        return en ? 'mph' : 'миль/ч';
      default:
        return en ? 'm/s' : 'м/с';
    }
  }

  function pressureUnitStr(unit, lang) {
    const en = lang === Language.English;
    switch (unit) {
      case PressureUnit.MmHg:
        return en ? 'mmHg' : 'мм рт. ст.';
      case PressureUnit.InHg:
        return en ? 'inHg' : 'дюйм рт. ст.';
      default:
        return en ? 'hPa' : 'гПа';
    }
  }

  YW.Language = Language;
  YW.TempUnit = TempUnit;
  YW.WindUnit = WindUnit;
  YW.PressureUnit = PressureUnit;
  YW.Theme = Theme;

  YW.settings = {
    getDefaultSettings: getDefaultSettings,
    getSettings: getSettings,
    saveSettings: saveSettings,
    cycleTheme: cycleTheme,
    themeIcon: themeIcon,
    choiceBtnClass: choiceBtnClass,
    tempUnitStr: tempUnitStr,
    windUnitStr: windUnitStr,
    pressureUnitStr: pressureUnitStr,
  };
})(window.YW);
