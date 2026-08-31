'use client';

import { Language } from '@/lib/settings';
import { assetUrl } from '@/lib/assets';

interface DownloadModalProps {
  lang: Language;
  onClose: () => void;
  isTauri?: boolean;
}

/** Base URL for downloading from GitHub Releases */
const RELEASE_BASE =
  'https://github.com/Larfi44/yarik-weather/releases/latest/download';

const ANDROID_URL = `${RELEASE_BASE}/YarikWeather-Android.apk`;

export default function DownloadModal({
  lang,
  onClose,
  isTauri,
}: DownloadModalProps) {
  const handleDownload = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (isTauri) {
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(ANDROID_URL);
      } catch (err) {
        console.error('Failed to open URL:', err);
        window.open(ANDROID_URL, '_blank', 'noopener,noreferrer');
      }
    } else {
      window.open(ANDROID_URL, '_blank', 'noopener,noreferrer');
    }
  };

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
            ? 'Download the app for Android.'
            : 'Скачайте приложение для Android.'}
        </p>

        <div className="download-scroll">
          <div className="download-grid">
            <div className="download-card active">
              <img
                className="download-card-icon"
                src={assetUrl('/android.png')}
                alt="Android"
              />
              <div className="download-card-title">Android</div>
              <div className="download-card-desc">
                {lang === Language.English
                  ? '.apk for Android'
                  : '.apk для Android'}
              </div>
            </div>
          </div>
        </div>

        <div className="download-actions">
          <a
            className="primary-btn download-confirm-btn"
            href={ANDROID_URL}
            onClick={handleDownload}
            style={{ textDecoration: 'none', display: 'inline-block' }}
          >
            {lang === Language.English ? 'Download' : 'Скачать'}
          </a>
        </div>
      </div>
    </div>
  );
}
