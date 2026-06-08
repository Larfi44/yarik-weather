'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Language,
  Theme,
  UserSettings,
  TempUnit,
  WindUnit,
  getSettings,
  saveSettings,
  cycleTheme,
  themeIcon,
} from '@/lib/settings';
import { WeatherResponse } from '@/lib/types';
import { fetchWeather } from '@/lib/api';
import SearchBar from '@/components/weather/SearchBar';
import WeatherDisplay from '@/components/weather/WeatherDisplay';
import AIModal from '@/components/weather/AiModal';
import DownloadModal from '@/components/weather/DownloadModal';
import SettingsModal from '@/components/weather/SettingsModal';
import WelcomeModal from '@/components/weather/WelcomeModal';

/** Detect if the app is running inside Tauri (desktop/mobile) */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export default function YarikWeatherApp() {
  const [settings, setSettings] = useState<UserSettings>(getSettings);
  const [systemTheme, setSystemTheme] = useState<Theme>(Theme.Light);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const [initialFetchDone, setInitialFetchDone] = useState(false);

  const runningInTauri = isTauri();

  // Detect system theme
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemTheme(mq.matches ? Theme.Dark : Theme.Light);
    const handler = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? Theme.Dark : Theme.Light);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Initialize system theme on mount to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      setSystemTheme(mq.matches ? Theme.Dark : Theme.Light);
    }
  }, []);

  const resolvedTheme: Theme =
    settings.theme === Theme.Auto ? systemTheme : settings.theme;
  const themeClass =
    resolvedTheme === Theme.Dark ? 'theme-dark' : 'theme-light';
  const lang = settings.language;

  // Sync theme class to <html> so CSS variables cascade to <body>
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(themeClass);
  }, [themeClass]);

  // Show welcome on first visit
  useEffect(() => {
    if (settings.first_time) setShowWelcome(true);
  }, []);

  const fetchAndSet = useCallback(
    (city: string, tempUnit: TempUnit, windUnit: WindUnit) => {
      setLoading(true);
      setError(null);
      fetchWeather(city, tempUnit, windUnit)
        .then((data) => {
          setWeather(data);
          setError(null);
        })
        .catch((err) => {
          setWeather(null);
          setError(err.message);
        })
        .finally(() => setLoading(false));
    },
    [],
  );

  // Initial fetch
  useEffect(() => {
    if (initialFetchDone || settings.first_time || !settings.default_city)
      return;
    setInitialFetchDone(true);
    fetchAndSet(settings.default_city, settings.temp_unit, settings.wind_unit);
  }, [initialFetchDone, settings.first_time, settings.default_city]);

  const handleWelcomeComplete = (newSettings: UserSettings) => {
    const s = { ...newSettings, first_time: false };
    setSettings(s);
    saveSettings(s);
    setShowWelcome(false);
    // Auto-search after Get Started
    if (s.default_city.trim()) {
      fetchAndSet(s.default_city, s.temp_unit, s.wind_unit);
    }
  };

  const handleSaveSettings = (newSettings: UserSettings) => {
    const old = settings;
    setSettings(newSettings);
    saveSettings(newSettings);
    const needsRefetch =
      newSettings.default_city !== old.default_city ||
      newSettings.temp_unit !== old.temp_unit ||
      newSettings.wind_unit !== old.wind_unit;
    if (needsRefetch) {
      fetchAndSet(
        newSettings.default_city,
        newSettings.temp_unit,
        newSettings.wind_unit,
      );
    }
  };

  return (
    <div className={`app-shell ${themeClass}`}>
      <div className="app-container">
        <div className="header glass-card">
          <div className="brand">
            <img
              src="/favicon.svg"
              className="header-icon"
              alt="Yarik Weather"
            />
            <h1>Yarik Weather</h1>
          </div>
          <div className="header-buttons">
            <button
              className="icon-btn"
              onClick={() => {
                const newSettings = {
                  ...settings,
                  theme: cycleTheme(settings.theme),
                };
                setSettings(newSettings);
                saveSettings(newSettings);
              }}
            >
              {themeIcon(settings.theme)}
            </button>
            <button
              className="icon-btn"
              style={{ color: resolvedTheme === Theme.Light ? 'blue' : 'cyan' }}
              onClick={() => setShowAiModal(true)}
            >
              AI
            </button>
            {/* Download button: only on website, not in Tauri (desktop/mobile) app */}
            {!runningInTauri && (
              <button
                className="icon-btn"
                onClick={() => setShowDownloads(true)}
              >
                📥
              </button>
            )}
            <button className="icon-btn" onClick={() => setShowSettings(true)}>
              ⚙️
            </button>
          </div>
        </div>

        <SearchBar
          lang={lang}
          onSearch={(city) =>
            fetchAndSet(city, settings.temp_unit, settings.wind_unit)
          }
        />

        {loading && (
          <div className="status-card glass-card">
            {lang === Language.English
              ? 'Loading weather data...'
              : 'Загрузка данных о погоде...'}
          </div>
        )}

        {error && (
          <div className="status-card error-card glass-card">
            <div className="error-title">
              {lang === Language.English ? 'Error' : 'Ошибка'}
            </div>
            <div className="error-message">{error}</div>
          </div>
        )}

        {weather && (
          <WeatherDisplay
            data={weather}
            temp_unit={settings.temp_unit}
            wind_unit={settings.wind_unit}
            pressure_unit={settings.pressure_unit}
            lang={lang}
            theme={resolvedTheme}
          />
        )}

        {!loading && !error && !weather && !settings.first_time && (
          <div className="status-card glass-card">
            {lang === Language.English
              ? 'Search for a city to see the weather.'
              : 'Введите город, чтобы увидеть погоду.'}
          </div>
        )}

        {showSettings && (
          <SettingsModal
            settings={settings}
            theme={resolvedTheme}
            onSave={handleSaveSettings}
            onClose={() => setShowSettings(false)}
            onChange={(s) => setSettings(s)}
            isTauri={runningInTauri}
          />
        )}

        {showDownloads && (
          <DownloadModal
            lang={lang}
            theme={resolvedTheme}
            onClose={() => setShowDownloads(false)}
          />
        )}

        {showWelcome && (
          <WelcomeModal
            onComplete={handleWelcomeComplete}
            onChange={(s) => setSettings(s)}
          />
        )}

        <AIModal
          open={showAiModal && !!weather}
          weather={weather as WeatherResponse}
          onClose={() => setShowAiModal(false)}
        />
      </div>
    </div>
  );
}
