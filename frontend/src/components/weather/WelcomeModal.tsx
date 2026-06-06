'use client';

import { useState } from 'react';
import { Language, Theme, UserSettings, TempUnit, WindUnit, PressureUnit, choiceBtnClass } from '@/lib/settings';

interface WelcomeModalProps {
  onComplete: (settings: UserSettings) => void;
  onChange: (settings: UserSettings) => void;
}

export default function WelcomeModal({ onComplete, onChange }: WelcomeModalProps) {
  const [settings, setSettings] = useState<UserSettings>({
    temp_unit: TempUnit.Celsius,
    wind_unit: WindUnit.Mps,
    language: Language.English,
    default_city: '',
    theme: Theme.Auto,
    first_time: true,
    pressure_unit: PressureUnit.HPa,
  } as UserSettings);

  const lang = settings.language;

  const update = (partial: Partial<UserSettings>) => {
    const next = { ...settings, ...partial, first_time: false };
    setSettings(next);
    onChange(next);
  };

  return (
    <div className="modal-overlay">
      <div className="modal welcome-modal">
        <div className="modal-topbar" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ margin: '0 0 16px 0' }}>{lang === Language.English ? 'Welcome to Yarik Weather!' : 'Добро пожаловать в Yarik Weather!'}</h2>
        </div>

        <div className="setting-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label style={{ textAlign: 'center', width: '100%' }}>{lang === Language.English ? 'Language:' : 'Язык:'}</label>
          <div className="choice-group">
            <button className={choiceBtnClass(settings.language === Language.English)} onClick={() => update({ language: Language.English })}>English</button>
            <button className={choiceBtnClass(settings.language === Language.Russian)} onClick={() => update({ language: Language.Russian })}>Русский</button>
          </div>
        </div>

        <div className="setting-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label style={{ textAlign: 'center', width: '100%' }}>{lang === Language.English ? 'Default city:' : 'Город по умолчанию:'}</label>
          <input
            className="text-input"
            value={settings.default_city}
            onChange={e => update({ default_city: e.target.value })}
            placeholder={lang === Language.English ? 'e.g. Moscow' : 'напр. Москва'}
          />
        </div>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button className="primary-btn" onClick={() => onComplete(settings)} disabled={!settings.default_city.trim()}>
            {lang === Language.English ? 'Get Started' : 'Начать'}
          </button>
        </div>
      </div>
    </div>
  );
}
