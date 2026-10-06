/**
 * Settings, Welcome and Download modals.
 * Vanilla-JS port of:
 *   frontend/src/components/weather/SettingsModal.tsx
 *   frontend/src/components/weather/WelcomeModal.tsx
 *   frontend/src/components/weather/DownloadModal.tsx
 *
 * Each `open*` function mounts an overlay into <body> and returns a small
 * handle ({ close }) so the caller can dismiss it programmatically.
 */
window.YW = window.YW || {};

(function (YW) {
  'use strict';

  const h = YW.dom.h;
  const mount = YW.dom.mount;
  const Settings = YW.settings;
  const Language = YW.Language;
  const Theme = YW.Theme;
  const TempUnit = YW.TempUnit;
  const WindUnit = YW.WindUnit;
  const PressureUnit = YW.PressureUnit;

  const DONATE_URL = 'https://pay.cloudtips.ru/p/b94e349b';
  const STUDIO_URL = 'https://larfi.gitverse.site/yarik-studio/index.html';
  const SUPPORT_URL =
    'https://larfi.gitverse.site/yarik-studio/pages/support.html';
  const RELEASE_BASE =
    'https://github.com/Larfi44/yarik-weather/releases/latest/download';
  const ANDROID_URL = RELEASE_BASE + '/YarikWeather-Android.apk';

  /**
   * Creates the overlay + modal shell and appends it to <body>.
   * `options.closeOnOverlay` mirrors the AI modal behaviour (clicking the
   * backdrop dismisses it); the other modals only close via their own buttons.
   */
  function createModalShell(className, options) {
    const opts = options || {};
    const overlay = h('div', { class: 'modal-overlay' });
    const modal = h('div', {
      class: 'modal' + (className ? ' ' + className : ''),
    });
    overlay.appendChild(modal);

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (typeof opts.onClose === 'function') opts.onClose();
    }

    if (opts.closeOnOverlay) {
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
      });
    }

    document.body.appendChild(overlay);
    return { overlay: overlay, modal: modal, close: close };
  }

  /** Opens a URL: through the Tauri opener in the app, a new tab on the web. */
  function openExternal(url, isTauri) {
    if (isTauri) {
      YW.tauri.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  /** External <a> link (styled inline) that routes through openExternal. */
  function externalLink(url, label, style, isTauri) {
    return h(
      'a',
      {
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: style,
        onclick: (event) => {
          event.preventDefault();
          openExternal(url, isTauri);
        },
      },
      label,
    );
  }

  // ── Settings modal ──

  function openSettings(options) {
    const opts = options || {};
    const isTauri = !!opts.isTauri;
    let temp = Object.assign({}, opts.settings || Settings.getDefaultSettings());
    const shell = createModalShell('');

    function isDark() {
      const theme =
        temp.theme === Theme.Auto
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? Theme.Dark
            : Theme.Light
          : temp.theme;
      return theme === Theme.Dark;
    }

    function textColor() {
      return isDark() ? '#e5e7eb' : '#1a1a1a';
    }

    function update(partial) {
      temp = Object.assign({}, temp, partial);
      if (typeof opts.onChange === 'function') opts.onChange(temp);
      render();
    }

    function handleClose() {
      if (typeof opts.onSave === 'function') opts.onSave(temp);
      shell.close();
    }

    /** label + a row of mutually exclusive buttons (mirrors `.setting-row`). */
    function choiceRow(labelText, choices) {
      return h('div', { class: 'setting-row' }, [
        h('label', { style: { color: textColor() } }, labelText),
        h(
          'div',
          { class: 'choice-group' },
          choices.map((choice) =>
            h(
              'button',
              {
                class: Settings.choiceBtnClass(choice.active),
                onclick: choice.onclick,
              },
              choice.label,
            ),
          ),
        ),
      ]);
    }

    function render() {
      const lang = temp.language;
      const en = lang === Language.English;

      const topbar = h('div', { class: 'modal-topbar' }, [
        h(
          'h2',
          { style: { flex: 1, textAlign: 'center', color: textColor() } },
          en ? 'Settings' : 'Настройки',
        ),
        h(
          'button',
          {
            class: 'modal-close',
            'aria-label': 'Close',
            style: {
              cursor: 'pointer',
              position: 'absolute',
              right: '24px',
              color: textColor(),
              background: 'none',
              border: 'none',
              fontSize: '1.2rem',
            },
            onclick: handleClose,
          },
          '✕',
        ),
      ]);

      const languageRow = choiceRow(en ? 'Language:' : 'Язык:', [
        {
          label: 'English',
          active: temp.language === Language.English,
          onclick: () => update({ language: Language.English }),
        },
        {
          label: 'Русский',
          active: temp.language === Language.Russian,
          onclick: () => update({ language: Language.Russian }),
        },
      ]);

      const temperatureRow = choiceRow(
        en ? 'Temperature unit:' : 'Единица температуры:',
        [
          {
            label: en ? 'Celsius (°C)' : 'Цельсий (°C)',
            active: temp.temp_unit === TempUnit.Celsius,
            onclick: () => update({ temp_unit: TempUnit.Celsius }),
          },
          {
            label: en ? 'Fahrenheit (°F)' : 'Фаренгейт (°F)',
            active: temp.temp_unit === TempUnit.Fahrenheit,
            onclick: () => update({ temp_unit: TempUnit.Fahrenheit }),
          },
          {
            label: en ? 'Kelvin (K)' : 'Кельвин (K)',
            active: temp.temp_unit === TempUnit.Kelvin,
            onclick: () => update({ temp_unit: TempUnit.Kelvin }),
          },
        ],
      );

      const windRow = choiceRow(en ? 'Wind unit:' : 'Единица ветра:', [
        {
          label: en ? 'm/s' : 'м/с',
          active: temp.wind_unit === WindUnit.Mps,
          onclick: () => update({ wind_unit: WindUnit.Mps }),
        },
        {
          label: en ? 'km/h' : 'км/ч',
          active: temp.wind_unit === WindUnit.Kmph,
          onclick: () => update({ wind_unit: WindUnit.Kmph }),
        },
        {
          label: en ? 'mph' : 'миль/ч',
          active: temp.wind_unit === WindUnit.Mph,
          onclick: () => update({ wind_unit: WindUnit.Mph }),
        },
      ]);

      mount(shell.modal, [
        topbar,
        languageRow,
        temperatureRow,
        windRow,
        pressureRow(en),
        themeRow(en),
        cityRow(en),
        footer(en),
      ]);
    }

    function pressureRow(en) {
      return choiceRow(en ? 'Pressure unit:' : 'Единица давления:', [
        {
          label: 'hPa',
          active: temp.pressure_unit === PressureUnit.HPa,
          onclick: () => update({ pressure_unit: PressureUnit.HPa }),
        },
        {
          label: en ? 'mmHg' : 'мм рт. ст.',
          active: temp.pressure_unit === PressureUnit.MmHg,
          onclick: () => update({ pressure_unit: PressureUnit.MmHg }),
        },
        {
          label: en ? 'inHg' : 'дюйм рт. ст.',
          active: temp.pressure_unit === PressureUnit.InHg,
          onclick: () => update({ pressure_unit: PressureUnit.InHg }),
        },
      ]);
    }

    function themeRow(en) {
      return choiceRow(en ? 'Theme:' : 'Тема:', [
        {
          label: en ? 'Auto' : 'Авто',
          active: temp.theme === Theme.Auto,
          onclick: () => update({ theme: Theme.Auto }),
        },
        {
          label: en ? 'Light' : 'Светлая',
          active: temp.theme === Theme.Light,
          onclick: () => update({ theme: Theme.Light }),
        },
        {
          label: en ? 'Dark' : 'Тёмная',
          active: temp.theme === Theme.Dark,
          onclick: () => update({ theme: Theme.Dark }),
        },
      ]);
    }

    function cityRow(en) {
      return h('div', { class: 'setting-row' }, [
        h(
          'label',
          { style: { color: textColor() } },
          en ? 'Default city:' : 'Город по умолчанию:',
        ),
        h('input', {
          class: 'text-input',
          value: temp.default_city,
          style: { color: textColor() },
          placeholder: en ? 'e.g. Moscow' : 'например, Москва',
          // Mutates the local copy without re-rendering so typing keeps focus.
          oninput: (event) => {
            temp = Object.assign({}, temp, {
              default_city: event.target.value,
            });
            if (typeof opts.onChange === 'function') opts.onChange(temp);
          },
        }),
      ]);
    }

    function footer(en) {
      const studioStyle = {
        color: '#f97316',
        textDecoration: 'none',
        fontWeight: 600,
        cursor: 'pointer',
        fontSize: 'inherit',
      };
      const supportStyle = {
        display: 'inline-block',
        backgroundColor: '#ef4444',
        color: '#fff',
        textDecoration: 'none',
        cursor: 'pointer',
        fontSize: '0.85rem',
        padding: '10px 20px',
        borderRadius: '8px',
        fontWeight: 600,
      };

      return h('div', {}, [
        h(
          'div',
          {
            style: {
              marginTop: '24px',
              textAlign: 'center',
              fontSize: '0.85rem',
            },
          },
          [
            h(
              'span',
              { style: { color: textColor() } },
              en ? 'Developed by ' : 'Разработано ',
            ),
            externalLink(STUDIO_URL, 'Yarik Studio', studioStyle, isTauri),
          ],
        ),
        h(
          'div',
          {
            style: {
              marginTop: '12px',
              textAlign: 'center',
              fontSize: '0.85rem',
            },
          },
          [
            externalLink(
              SUPPORT_URL,
              '🛠️ ' + (en ? 'Technical support' : 'Техподдержка'),
              supportStyle,
              isTauri,
            ),
          ],
        ),
        h(
          'div',
          {
            style: {
              marginTop: '16px',
              display: 'flex',
              justifyContent: 'center',
            },
          },
          [
            h(
              'button',
              {
                class: 'primary-btn',
                style: {
                  fontSize: '0.9rem',
                  padding: '10px 20px',
                  textDecoration: 'none',
                },
                onclick: () => openExternal(DONATE_URL, isTauri),
              },
              en ? '❤️ Donate' : '❤️ Поддержать',
            ),
          ],
        ),
      ]);
    }

    render();
    return { close: shell.close };
  }

  // ── Welcome modal (first launch) ──

  function openWelcome(options) {
    const opts = options || {};
    let temp = {
      temp_unit: TempUnit.Celsius,
      wind_unit: WindUnit.Mps,
      language: Language.English,
      default_city: '',
      theme: Theme.Auto,
      first_time: true,
      pressure_unit: PressureUnit.HPa,
    };
    const shell = createModalShell('welcome-modal');
    let startBtn = null;

    function update(partial, rerender) {
      temp = Object.assign({}, temp, partial, { first_time: false });
      if (typeof opts.onChange === 'function') opts.onChange(temp);
      if (rerender !== false) render();
    }

    function render() {
      const lang = temp.language;
      const en = lang === Language.English;

      const topbar = h(
        'div',
        {
          class: 'modal-topbar',
          style: {
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          },
        },
        [
          h(
            'h2',
            { style: { margin: '0 0 16px 0' } },
            en
              ? 'Welcome to Yarik Weather!'
              : 'Добро пожаловать в Yarik Weather!',
          ),
        ],
      );

      const languageRow = h(
        'div',
        {
          class: 'setting-row',
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          },
        },
        [
          h(
            'label',
            { style: { textAlign: 'center', width: '100%' } },
            en ? 'Language:' : 'Язык:',
          ),
          h('div', { class: 'choice-group' }, [
            h(
              'button',
              {
                class: Settings.choiceBtnClass(
                  temp.language === Language.English,
                ),
                onclick: () => update({ language: Language.English }),
              },
              'English',
            ),
            h(
              'button',
              {
                class: Settings.choiceBtnClass(
                  temp.language === Language.Russian,
                ),
                onclick: () => update({ language: Language.Russian }),
              },
              'Русский',
            ),
          ]),
        ],
      );

      const cityRowEl = h(
        'div',
        {
          class: 'setting-row',
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          },
        },
        [
          h(
            'label',
            { style: { textAlign: 'center', width: '100%' } },
            en ? 'Default city:' : 'Город по умолчанию:',
          ),
          h('input', {
            class: 'text-input',
            value: temp.default_city,
            placeholder: en ? 'e.g. Moscow' : 'напр. Москва',
            // No re-render on typing: keeps focus and only toggles the button.
            oninput: (event) => {
              update({ default_city: event.target.value }, false);
              if (startBtn) {
                startBtn.disabled = !event.target.value.trim();
              }
            },
          }),
        ],
      );

      startBtn = h(
        'button',
        {
          class: 'primary-btn',
          onclick: () => {
            if (typeof opts.onComplete === 'function') opts.onComplete(temp);
            shell.close();
          },
        },
        en ? 'Get Started' : 'Начать',
      );
      startBtn.disabled = !temp.default_city.trim();

      mount(shell.modal, [
        topbar,
        languageRow,
        cityRowEl,
        h('div', { style: { marginTop: '24px', textAlign: 'center' } }, [
          startBtn,
        ]),
      ]);
    }

    render();
    return { close: shell.close };
  }

  // ── Download modal ──

  function openDownloads(options) {
    const opts = options || {};
    const lang = opts.lang || Language.English;
    const isTauri = !!opts.isTauri;
    const en = lang === Language.English;
    const shell = createModalShell('download-modal', { onClose: opts.onClose });

    const topbar = h('div', { class: 'modal-topbar' }, [
      h('h2', {}, en ? 'Downloads' : 'Загрузки'),
      h(
        'button',
        {
          class: 'modal-close',
          'aria-label': 'Close',
          style: { cursor: 'pointer' },
          onclick: shell.close,
        },
        '✕',
      ),
    ]);

    const androidCard = h('div', { class: 'download-card active' }, [
      h('img', {
        class: 'download-card-icon',
        src: YW.assetUrl('/android.png'),
        alt: 'Android',
      }),
      h('div', { class: 'download-card-title' }, 'Android'),
      h(
        'div',
        { class: 'download-card-desc' },
        en ? '.apk for Android' : '.apk для Android',
      ),
    ]);

    const actions = h('div', { class: 'download-actions' }, [
      h(
        'a',
        {
          class: 'primary-btn download-confirm-btn',
          href: ANDROID_URL,
          style: { textDecoration: 'none', display: 'inline-block' },
          onclick: (event) => {
            event.preventDefault();
            openExternal(ANDROID_URL, isTauri);
          },
        },
        en ? 'Download' : 'Скачать',
      ),
    ]);

    mount(shell.modal, [
      topbar,
      h(
        'p',
        { class: 'modal-subtitle' },
        en
          ? 'Download the app for Android.'
          : 'Скачайте приложение для Android.',
      ),
      h('div', { class: 'download-scroll' }, [
        h('div', { class: 'download-grid' }, [androidCard]),
      ]),
      actions,
    ]);

    return { close: shell.close };
  }

  YW.modals = {
    openSettings: openSettings,
    openWelcome: openWelcome,
    openDownloads: openDownloads,
  };
})(window.YW);
