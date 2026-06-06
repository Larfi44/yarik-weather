'use client';

import { useState, useEffect } from 'react';
import { Language, Theme, UserSettings, TempUnit, WindUnit, PressureUnit, choiceBtnClass } from '@/lib/settings';
import { tempUnitStr, windUnitStr, pressureUnitStr } from '@/lib/settings';

interface SettingsModalProps {
  settings: UserSettings;
  theme: Theme;
  onSave: (settings: UserSettings) => void;
  onClose: () => void;
  onChange: (settings: UserSettings) => void;
}

export default function SettingsModal({ settings, theme, onSave, onClose, onChange }: SettingsModalProps) {
  const [temp, setTemp] = useState<UserSettings>(settings);
  const lang = temp.language;

  useEffect(() => { setTemp(settings); }, [settings]);

  const update = (partial: Partial<UserSettings>) => {
    const next = { ...temp, ...partial };
    setTemp(next);
    onChange(next);
  };

  const handleClose = () => {
    onSave(temp);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-topbar">
          <h2>{lang === Language.English ? 'Settings' : 'Настройки'}</h2>
          <button className="close-btn" onClick={handleClose}>✖</button>
        </div>

        <div className="setting-row">
          <label>{lang === Language.English ? 'Language:' : 'Язык:'}</label>
          <div className="choice-group">
            <button className={choiceBtnClass(temp.language === Language.English)} onClick={() => update({ language: Language.English })}>English</button>
            <button className={choiceBtnClass(temp.language === Language.Russian)} onClick={() => update({ language: Language.Russian })}>Русский</button>
          </div>
        </div>

        <div className="setting-row">
          <label>{lang === Language.English ? 'Temperature unit:' : 'Единица температуры:'}</label>
          <div className="choice-group">
            <button className={choiceBtnClass(temp.temp_unit === TempUnit.Celsius)} onClick={() => update({ temp_unit: TempUnit.Celsius })}>
              {lang === Language.English ? 'Celsius (°C)' : 'Цельсий (°C)'}
            </button>
            <button className={choiceBtnClass(temp.temp_unit === TempUnit.Fahrenheit)} onClick={() => update({ temp_unit: TempUnit.Fahrenheit })}>
              {lang === Language.English ? 'Fahrenheit (°F)' : 'Фаренгейт (°F)'}
            </button>
            <button className={choiceBtnClass(temp.temp_unit === TempUnit.Kelvin)} onClick={() => update({ temp_unit: TempUnit.Kelvin })}>
              {lang === Language.English ? 'Kelvin (K)' : 'Кельвин (K)'}
            </button>
          </div>
        </div>

        <div className="setting-row">
          <label>{lang === Language.English ? 'Wind unit:' : 'Единица ветра:'}</label>
          <div className="choice-group">
            <button className={choiceBtnClass(temp.wind_unit === WindUnit.Mps)} onClick={() => update({ wind_unit: WindUnit.Mps })}>
              {lang === Language.English ? 'm/s' : 'м/с'}
            </button>
            <button className={choiceBtnClass(temp.wind_unit === WindUnit.Kmph)} onClick={() => update({ wind_unit: WindUnit.Kmph })}>
              {lang === Language.English ? 'km/h' : 'км/ч'}
            </button>
            <button className={choiceBtnClass(temp.wind_unit === WindUnit.Mph)} onClick={() => update({ wind_unit: WindUnit.Mph })}>
              {lang === Language.English ? 'mph' : 'миль/ч'}
            </button>
          </div>
        </div>

        <div className="setting-row">
          <label>{lang === Language.English ? 'Pressure unit:' : 'Единица давления:'}</label>
          <div className="choice-group">
            <button className={choiceBtnClass(temp.pressure_unit === PressureUnit.HPa)} onClick={() => update({ pressure_unit: PressureUnit.HPa })}>hPa</button>
            <button className={choiceBtnClass(temp.pressure_unit === PressureUnit.MmHg)} onClick={() => update({ pressure_unit: PressureUnit.MmHg })}>
              {lang === Language.English ? 'mmHg' : 'мм рт. ст.'}
            </button>
            <button className={choiceBtnClass(temp.pressure_unit === PressureUnit.InHg)} onClick={() => update({ pressure_unit: PressureUnit.InHg })}>
              {lang === Language.English ? 'inHg' : 'дюйм рт. ст.'}
            </button>
          </div>
        </div>

        <div className="setting-row">
          <label>{lang === Language.English ? 'Theme:' : 'Тема:'}</label>
          <div className="choice-group">
            <button className={choiceBtnClass(temp.theme === Theme.Auto)} onClick={() => update({ theme: Theme.Auto })}>
              {lang === Language.English ? 'Auto' : 'Авто'}
            </button>
            <button className={choiceBtnClass(temp.theme === Theme.Light)} onClick={() => update({ theme: Theme.Light })}>
              {lang === Language.English ? 'Light' : 'Светлая'}
            </button>
            <button className={choiceBtnClass(temp.theme === Theme.Dark)} onClick={() => update({ theme: Theme.Dark })}>
              {lang === Language.English ? 'Dark' : 'Тёмная'}
            </button>
          </div>
        </div>

        <div className="setting-row">
          <label>{lang === Language.English ? 'Default city:' : 'Город по умолчанию:'}</label>
          <input
            className="text-input"
            value={temp.default_city}
            onChange={e => update({ default_city: e.target.value })}
          />
        </div>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.85rem' }}>
          <span style={{ color: theme === Theme.Light ? '#000' : '#fff' }}>
            {lang === Language.English ? 'Developed by ' : 'Разработано '}
          </span>
          <a
            href="https://larfi44.github.io/Yarik-Studio.github.io/index.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4a9eff', textDecoration: 'none', fontWeight: 600 }}
          >
            Yarik Studio
          </a>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
          <a
            href="https://pay.cloudtips.ru/p/b94e349b"
            target="_blank"
            rel="noopener noreferrer"
            className="primary-btn"
            style={{ fontSize: '0.9rem', padding: '10px 20px', textDecoration: 'none' }}
          >
            {lang === Language.English ? '❤️ Donate' : '❤️ Пожертвовать'}
          </a>
        </div>
      </div>
    </div>
  );
}
