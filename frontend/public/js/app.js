/**
 * Application shell: wires the static markup in index.html to the YW modules
 * (search, theme, settings, welcome, downloads and AI modals).
 * Vanilla-JS port of frontend/src/components/weather/YarikWeatherApp.tsx
 */
window.YW = window.YW || {};

(function (YW) {
  'use strict';

  const h = YW.dom.h;
  const mount = YW.dom.mount;
  const Settings = YW.settings;
  const Language = YW.Language;
  const Theme = YW.Theme;

  /** Tauri (desktop / mobile) exposes this global to the webview. */
  function isTauri() {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  function main() {
    const runningInTauri = isTauri();
    const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

    // Static shell elements (see index.html)
    const shell = document.getElementById('app-shell');
    const themeBtn = document.getElementById('theme-btn');
    const aiBtn = document.getElementById('ai-btn');
    const downloadsBtn = document.getElementById('downloads-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const cityInput = document.getElementById('city-input');
    const searchBtn = document.getElementById('search-btn');
    const statusSlot = document.getElementById('status-slot');
    const weatherSlot = document.getElementById('weather-slot');

    let settings = Settings.getSettings();
    let weather = null;
    let loading = false;
    let error = null;
    let initialFetchDone = false;

    // One long-lived weather view; each search only updates its state.
    const weatherView = YW.createWeatherView();
    weatherSlot.appendChild(weatherView.el);

    // ── theme ──

    function systemTheme() {
      return systemThemeQuery.matches ? Theme.Dark : Theme.Light;
    }

    function resolvedTheme() {
      return settings.theme === Theme.Auto ? systemTheme() : settings.theme;
    }

    function t(en, ru) {
      return settings.language === Language.English ? en : ru;
    }

    /** Mirrors the theme class onto <html> so the CSS variables cascade. */
    function applyTheme() {
      const themeClass =
        resolvedTheme() === Theme.Dark ? 'theme-dark' : 'theme-light';
      const root = document.documentElement;
      root.classList.remove('theme-light', 'theme-dark');
      root.classList.add(themeClass);
      shell.classList.remove('theme-light', 'theme-dark');
      shell.classList.add(themeClass);
      aiBtn.style.color = resolvedTheme() === Theme.Light ? 'blue' : 'cyan';
      // The static shell text depends on the language, which lives in the
      // settings, so refresh it together with the theme.
      applyLanguage();
    }

    /** Localises the text that lives directly in index.html. */
    function applyLanguage() {
      cityInput.placeholder = t(
        'Enter city name...',
        'Введите название города...',
      );
      searchBtn.textContent = t('Search', 'Поиск');
    }

    // ── rendering ──

    /** Loading / error / idle hint shown above the weather card. */
    function renderStatus() {
      if (loading) {
        mount(statusSlot, [
          h('div', { class: 'status-card glass-card' }, [
            t('Loading weather data...', 'Загрузка данных о погоде...'),
          ]),
        ]);
        return;
      }

      if (error) {
        mount(statusSlot, [
          h('div', { class: 'status-card error-card glass-card' }, [
            h('div', { class: 'error-title' }, [
              settings.language === Language.English ? 'Error' : 'Ошибка',
            ]),
            h('div', { class: 'error-message' }, [error]),
          ]),
        ]);
        return;
      }

      if (!weather && !settings.first_time) {
        mount(statusSlot, [
          h('div', { class: 'status-card glass-card' }, [
            t(
              'Search for a city to see the weather.',
              'Введите город, чтобы увидеть погоду.',
            ),
          ]),
        ]);
        return;
      }

      mount(statusSlot, []);
    }

    /** Pushes weather + units + theme into the (long-lived) weather view. */
    function renderWeather() {
      weatherView.update({
        data: weather,
        temp_unit: settings.temp_unit,
        wind_unit: settings.wind_unit,
        pressure_unit: settings.pressure_unit,
        lang: settings.language,
        theme: resolvedTheme(),
      });
    }

    // ── data ──

    /** Looks a city up and repaints the status + weather slots. */
    function fetchAndSet(city) {
      loading = true;
      error = null;
      renderStatus();

      YW.api
        .fetchWeather(city, settings.temp_unit, settings.wind_unit)
        .then((data) => {
          weather = data;
          error = null;
        })
        .catch((err) => {
          weather = null;
          error = err && err.message ? err.message : String(err);
        })
        .then(() => {
          loading = false;
          renderStatus();
          renderWeather();
        });
    }

    // ── settings ──

    /** Saved from the settings modal: refetch only when the inputs changed. */
    function handleSaveSettings(next) {
      const old = settings;
      settings = next;
      Settings.saveSettings(next);
      applyTheme();
      renderStatus();

      const oldCity = (old.default_city || '').trim();
      const newCity = (next.default_city || '').trim();
      const needsRefetch =
        newCity !== oldCity ||
        next.temp_unit !== old.temp_unit ||
        next.wind_unit !== old.wind_unit;

      // Skip the request when there is no city to look up.
      if (needsRefetch && newCity) fetchAndSet(newCity);
      else renderWeather();
    }

    /** Live preview while the settings modal is open (no refetch). */
    function handleSettingsChange(next) {
      settings = next;
      applyTheme();
      renderStatus();
      renderWeather();
    }

    /** Welcome modal finished — persist and auto-search the chosen city. */
    function handleWelcomeComplete(next) {
      settings = Object.assign({}, next, { first_time: false });
      Settings.saveSettings(settings);
      applyTheme();
      renderStatus();

      const city = (settings.default_city || '').trim();
      if (city) fetchAndSet(city);
    }

    // ── modals & buttons ──

    function openSettingsModal() {
      YW.modals.openSettings({
        settings: settings,
        isTauri: runningInTauri,
        onChange: handleSettingsChange,
        onSave: handleSaveSettings,
      });
    }

    function openWelcomeModal() {
      YW.modals.openWelcome({
        onChange: handleSettingsChange,
        onComplete: handleWelcomeComplete,
      });
    }

    themeBtn.addEventListener('click', () => {
      settings = Object.assign({}, settings, {
        theme: Settings.cycleTheme(settings.theme),
      });
      Settings.saveSettings(settings);
      themeBtn.textContent = Settings.themeIcon(settings.theme);
      applyTheme();
    });

    aiBtn.addEventListener('click', () => {
      // Nothing to analyse before the first successful search.
      if (!weather) return;
      YW.ai.openAi({ weather: weather, theme: resolvedTheme() });
    });

    settingsBtn.addEventListener('click', openSettingsModal);

    // Downloading only makes sense on the website, so the button is hidden
    // inside the Tauri (desktop / mobile) builds.
    if (runningInTauri) {
      downloadsBtn.style.display = 'none';
    } else {
      downloadsBtn.addEventListener('click', () => {
        YW.modals.openDownloads({ lang: settings.language, isTauri: false });
      });
    }

    // ── search ──

    function runSearch() {
      const city = cityInput.value.trim();
      if (city) fetchAndSet(city);
    }

    searchBtn.addEventListener('click', runSearch);
    cityInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') runSearch();
    });

    // A system theme flip only matters while the theme is set to "auto".
    systemThemeQuery.addEventListener('change', () => {
      applyTheme();
      renderWeather();
    });

    // ── boot ──

    themeBtn.textContent = Settings.themeIcon(settings.theme);
    applyTheme();
    renderStatus();

    if (settings.first_time) {
      // First visit: ask for units, language and a city up front.
      openWelcomeModal();
    } else {
      const city = (settings.default_city || '').trim();
      if (city) {
        initialFetchDone = true;
        fetchAndSet(city);
      }
    }
  }

  YW.app = {
    main: main,
    isTauri: isTauri,
  };

  // Every script is loaded with `defer`, so the DOM is parsed by now.
  main();
})(window.YW);
