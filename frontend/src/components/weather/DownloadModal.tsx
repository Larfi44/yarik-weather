'use client';

import { useState } from 'react';
import { Language, Theme } from '@/lib/settings';
import { assetUrl } from '@/lib/assets';

type DownloadOs = 'android' | 'windows' | 'macos' | 'linux';

interface DownloadModalProps {
  lang: Language;
  theme: Theme;
  onClose: () => void;
}

/** Base URL for downloading from GitHub Releases */
const RELEASE_BASE =
  'https://github.com/Larfi44/yarik-weather/releases/latest/download';

function downloadLabel(os: DownloadOs): string {
  const labels: Record<DownloadOs, string> = {
    android: 'Android',
    windows: 'Windows',
    macos: 'MacOS',
    linux: 'Linux',
  };
  return labels[os];
}

function downloadDescription(os: DownloadOs, lang: Language): string {
  if (lang === Language.English) {
    const map: Record<DownloadOs, string> = {
      android: '.apk for Android',
      windows: '.exe for Windows',
      macos: '.dmg for Mac',
      linux: 'from source',
    };
    return map[os];
  }
  const map: Record<DownloadOs, string> = {
    android: '.apk для Android',
    windows: '.exe для Windows',
    macos: '.dmg для Mac',
    linux: 'из исходников',
  };
  return map[os];
}

function downloadUrl(os: DownloadOs): string {
  const map: Record<DownloadOs, string> = {
    android: `${RELEASE_BASE}/YarikWeather-Android.apk`,
    windows: `${RELEASE_BASE}/YarikWeather-Windows.exe`,
    macos: `${RELEASE_BASE}/YarikWeather-MacOS.dmg`,
    linux: '',
  };
  return map[os];
}

function getIcon(os: DownloadOs, theme: Theme): string {
  switch (os) {
    case 'android':
      return '/android.png';
    case 'windows':
      return '/windows.svg';
    case 'macos':
      return theme === Theme.Light ? '/apple-dark.svg' : '/apple-light.svg';
    case 'linux':
      return '/linux.png';
  }
}

export default function DownloadModal({
  lang,
  theme,
  onClose,
}: DownloadModalProps) {
  const [selected, setSelected] = useState<DownloadOs>('android');
  const oss: DownloadOs[] = ['android', 'windows', 'macos', 'linux'];

  const installRustCommand =
    "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh";
  const installAppCommand =
    'cargo install --git https://github.com/Larfi44/yarik-weather --features desktop';

  return (
    <div className="modal-overlay">
      <div className="modal download-modal">
        <div className="modal-topbar">
          <h2>{lang === Language.English ? 'Downloads' : 'Загрузки'}</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
            style={{ cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
        <p className="modal-subtitle">
          {lang === Language.English
            ? 'Choose your platform and download the app.'
            : 'Выберите платформу и скачайте приложение.'}
        </p>

        <div className="download-scroll">
          <div className="download-grid">
            {oss.map((os) => (
              <div
                key={os}
                className={`download-card${selected === os ? ' active' : ''}`}
                onClick={() => setSelected(os)}
              >
                <img
                  className="download-card-icon"
                  src={assetUrl(getIcon(os, theme))}
                  alt={downloadLabel(os)}
                />
                <div className="download-card-title">{downloadLabel(os)}</div>
                <div className="download-card-desc">
                  {downloadDescription(os, lang)}
                </div>
              </div>
            ))}
          </div>

          {selected === 'linux' && (
            <div className="linux-instructions">
              <div className="linux-step">
                <p className="linux-step-text">
                  {lang === Language.English
                    ? '1. Install Rust'
                    : '1. Установите Rust'}
                </p>
                <code>{installRustCommand}</code>
              </div>
              <div className="linux-step">
                <p className="linux-step-text">
                  {lang === Language.English
                    ? '2. Install Yarik Weather'
                    : '2. Установите Yarik Weather'}
                </p>
                <code>{installAppCommand}</code>
              </div>
            </div>
          )}
        </div>

        <div className="download-actions">
          {selected !== 'linux' && (
            <a
              className="primary-btn download-confirm-btn"
              href={downloadUrl(selected)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              {lang === Language.English ? 'Download' : 'Скачать'}
            </a>
          )}
          {selected === 'macos' && (
            <div className="mac-instructions">
              <p className="mac-instructions-title">
                {lang === Language.English
                  ? 'After downloading:'
                  : 'После загрузки:'}
              </p>
              <p className="mac-instructions-step">
                {lang === Language.English
                  ? '1. Open the .dmg, drag the app to Applications'
                  : '1. Откройте .dmg, перетащите приложение в Applications'}
              </p>
              <p className="mac-instructions-step">
                {lang === Language.English
                  ? '2. Open Terminal, type: xattr -cr'
                  : '2. Откройте Терминал, введите: xattr -cr'}
              </p>
              <p className="mac-instructions-step">
                {lang === Language.English
                  ? '3. Drag the app into Terminal, press Enter'
                  : '3. Перетащите приложение в Терминал, нажмите Enter'}
              </p>
              <p className="mac-instructions-step">
                {lang === Language.English
                  ? '4. Now you can use it'
                  : '4. Теперь можно пользоваться'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
