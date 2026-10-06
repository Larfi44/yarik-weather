/**
 * "Yaroslav AI" modal: comfort / walk / swim scores, recommendations and a
 * short-term outlook, all computed locally (no backend call).
 * Vanilla-JS port of frontend/src/components/weather/AiModal.tsx
 *
 *   const modal = YW.ai.openAi({ weather, theme, onClose });
 *   modal.close();
 */
window.YW = window.YW || {};

(function (YW) {
  'use strict';

  const h = YW.dom.h;
  const mount = YW.dom.mount;
  const Language = YW.Language;
  const Theme = YW.Theme;

  // ── Scoring helpers matching ai_service.py ──────────────────────────

  /** api-ninjas does not publish every metric: treat unknowns as 0. */
  function num(value) {
    const parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  function rainFlag(cond, prob) {
    const c = String(cond || '').toLowerCase();
    if (c.indexOf('rain') !== -1 || c.indexOf('drizzle') !== -1) return 1;
    // Precipitation probability is missing without the old backend, so the
    // condition text stays the source of truth.
    return num(prob) >= 30 ? 1 : 0;
  }

  function clampScore(value) {
    return Math.round(Math.max(0, Math.min(10, value)) * 10) / 10;
  }

  function comfortScore(temp, wind, uv, prob, isRain) {
    const probFraction = num(prob) / 100;
    const s =
      10 -
      Math.abs(num(temp) - 21) * 0.15 -
      num(wind) * 0.2 -
      probFraction * 2 -
      Math.max(0, num(uv) - 8) * 0.5 -
      (isRain ? 2 : 0);
    return clampScore(s);
  }

  function walkScore(temp, wind, uv, prob, isRain) {
    const probFraction = num(prob) / 100;
    const s =
      10 -
      Math.abs(num(temp) - 18) * 0.2 -
      num(wind) * 0.2 -
      probFraction * 2 -
      (isRain ? 2 : 0) -
      (num(uv) > 8 ? 1.5 : 0);
    return clampScore(s);
  }

  function swimScore(temp, seaTemp, month, isRain, coastal) {
    if (!coastal || !seaTemp || seaTemp <= 17) return 0;
    let s = 5 + (num(temp) - 20) * 0.15;
    // Summer months bonus
    if ([6, 7, 8].indexOf(month) !== -1) s += 1.5;
    // Winter months penalty
    if ([11, 12, 1, 2, 3].indexOf(month) !== -1) s -= 2;
    if (isRain) s -= 2;
    return clampScore(s);
  }

  /** Open-Meteo condition strings -> Russian (used in the AI summary only). */
  function translateCondition(cond, lang) {
    if (lang !== Language.Russian) return cond;
    const map = {
      clear: 'ясно',
      sunny: 'солнечно',
      'partly cloudy': 'переменная облачность',
      cloudy: 'облачно',
      overcast: 'пасмурно',
      fog: 'туман',
      drizzle: 'морось',
      'light drizzle': 'лёгкая морось',
      rain: 'дождь',
      'light rain': 'небольшой дождь',
      'moderate rain': 'умеренный дождь',
      'heavy rain': 'сильный дождь',
      showers: 'ливень',
      snow: 'снег',
      'light snow': 'небольшой снег',
      'heavy snow': 'сильный снег',
      sleet: 'мокрый снег',
      thunderstorm: 'гроза',
    };
    const key = String(cond || '').toLowerCase();
    // api-ninjas descriptions ("broken clouds", "mist", …) are not in this
    // table: fall back to the shared helper, which knows them too.
    if (map[key]) return map[key];
    return YW.helpers && YW.helpers.translateCondition
      ? YW.helpers.translateCondition(cond, lang)
      : cond;
  }

  const MONTH_NAMES = {
    ru: [
      'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
      'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
    ],
    en: [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ],
  };

  /**
   * Client-side twin of ai_service.py: scores, recommendations and the
   * next-week / next-months outlook (see AiModal.tsx's handleFetch).
   */
  function buildAiData(weather, language) {
    const t = (en, ru) => (language === Language.Russian ? ru : en);
    const current = weather.current;
    const forecast = weather.forecast || [];
    const hourly = weather.hourly || [];
    const now = new Date();
    const month = now.getMonth() + 1; // 1-indexed, matching ai_service.py

    const cond = String(current.condition || '').toLowerCase();
    const isRain = rainFlag(current.condition, current.precipitation_probability);
    const coastal = YW.isCoastal(weather.city);

    // ── Scores matching ai_service.py exactly ──
    const cScore = comfortScore(
      current.temperature,
      current.wind_speed,
      current.uv_index,
      current.precipitation_probability,
      isRain,
    );
    const wScore = walkScore(
      current.temperature,
      current.wind_speed,
      current.uv_index,
      current.precipitation_probability,
      isRain,
    );
    const sScore = swimScore(
      current.temperature,
      current.sea_temperature,
      month,
      isRain,
      coastal,
    );

    // ── Recommendations (scores first, so they top the list) ──
    const tips = [];
    tips.push(t('⭐ Comfort: ' + cScore + '/10', '⭐ Комфорт: ' + cScore + '/10'));
    tips.push(t('🚶 Walk: ' + wScore + '/10', '🚶 Прогулка: ' + wScore + '/10'));

    if (cond.indexOf('rain') !== -1 || cond.indexOf('drizzle') !== -1) {
      if (cond.indexOf('heavy') !== -1 || cond.indexOf('violent') !== -1) {
        tips.push(
          t(
            '🌧️ Heavy rain! Stay indoors if possible.',
            '🌧️ Сильный дождь! Оставайтесь дома, если возможно.',
          ),
        );
      } else {
        tips.push(
          t(
            '🌂 Bring an umbrella and wear waterproof shoes.',
            '🌂 Возьмите зонт и наденьте непромокаемую обувь.',
          ),
        );
      }
    } else if (cond.indexOf('snow') !== -1) {
      tips.push(
        t(
          '❄️ Snowfall – wear warm, non-slip shoes.',
          '❄️ Снегопад – одевайтесь тепло, нескользящая обувь.',
        ),
      );
    } else if (current.temperature < 0) {
      tips.push(
        t(
          '🧣 Bitter cold! Down jacket, hat, gloves.',
          'Очень холодно! 🧣 Пуховик, шапка, перчатки.',
        ),
      );
    } else if (current.temperature < 10) {
      tips.push(
        t('🧥 Cold – warm jacket and scarf.', 'Холодно – 🧥 тёплая куртка и шарф.'),
      );
    } else if (current.temperature < 18) {
      tips.push(
        t(
          '👕 Cool – light jacket or sweater.',
          'Прохладно – 👕 лёгкая куртка или свитер.',
        ),
      );
    } else if (current.temperature < 26) {
      tips.push(
        t('👕 Comfortable – t-shirt is fine.', 'Комфортно – 👕 можно в футболке.'),
      );
    } else {
      tips.push(
        t(
          '🩳 Hot! Light clothes, stay hydrated.',
          'Жарко! 🩳 Лёгкая одежда, пейте больше воды💧.',
        ),
      );
    }

    if (current.uv_index >= 6) {
      tips.push(
        t(
          '🧴 High UV index – use sunscreen.',
          '🧴 Ультрафиолетовый индекс высокий – используйте солнцезащитный крем.',
        ),
      );
    }

    // Swim recommendation (matching ai_service.py)
    if (coastal) {
      if (current.sea_temperature != null && current.sea_temperature > 17) {
        tips.push(
          t(
            '🏊 Swim: ' + sScore + '/10 (water ' + current.sea_temperature.toFixed(0) + '°C)',
            '🏊 Купание: ' + sScore + '/10 (вода ' + current.sea_temperature.toFixed(0) + '°C)',
          ),
        );
      } else {
        tips.push(
          t('🏖️ Sea too cold for swimming.', '🏖️ Море слишком холодное для купания.'),
        );
      }
    }

    // Best times from the hourly forecast (matching ai_service.py)
    if (hourly.length > 0) {
      let bestWalkTime = '';
      let bestWalkScoreVal = -1;
      let bestSwimTime = '';
      let bestSwimScoreVal = -1;
      const nowHour = now.getHours();

      hourly.forEach((hr) => {
        const hIsRain = rainFlag(hr.condition, hr.precipitation_probability);
        const hWalk = walkScore(
          hr.temperature,
          hr.wind_speed,
          hr.uv_index,
          hr.precipitation_probability,
          hIsRain,
        );
        if (hWalk > bestWalkScoreVal) {
          bestWalkScoreVal = hWalk;
          bestWalkTime = hr.time;
        }

        // Best swim time (like ai_service.py's logic: between 10:00-18:00)
        const hHour = hr.time ? parseInt(hr.time.split(':')[0], 10) : nowHour;
        if (
          coastal &&
          current.sea_temperature != null &&
          current.sea_temperature > 17 &&
          hHour >= 10 &&
          hHour <= 18
        ) {
          const hSwim = swimScore(
            hr.temperature,
            current.sea_temperature,
            month,
            hIsRain,
            coastal,
          );
          if (hSwim > bestSwimScoreVal) {
            bestSwimScoreVal = hSwim;
            bestSwimTime = hr.time;
          }
        }
      });

      if (bestWalkTime) {
        tips.push(
          t(
            '🚶 Best walk time: ' + bestWalkTime,
            '🚶‍♂️ Лучшее время для прогулки: ' + bestWalkTime,
          ),
        );
      }
      if (bestSwimTime) {
        tips.push(
          t(
            '🏊 Best swim time: ' + bestSwimTime,
            '🏊 Лучшее время для купания: ' + bestSwimTime,
          ),
        );
      }
    }

    // ── Forecast outlook matching ai_service.py's predict logic ──
    // ai_service.py's predict_period() uses monthly climate averages + trends;
    // the frontend uses the forecast itself as the climate proxy.
    const nextWeekDays = forecast.slice(0, 7);
    let weekAvgTemp = 0;
    let weekTotalRain = 0;
    let weekMaxUv = 0;

    // api-ninjas publishes neither precipitation probability nor UV, so those
    // aggregates are only meaningful when the data is actually there.
    const hasRainData = nextWeekDays.some(
      (day) => day.precipitation_probability_max != null,
    );
    const hasUvData = nextWeekDays.some((day) => day.uv_index_max != null);

    if (nextWeekDays.length > 0) {
      weekAvgTemp =
        nextWeekDays.reduce(
          (sum, day) => sum + (day.temperature_max + day.temperature_min) / 2,
          0,
        ) / nextWeekDays.length;
      if (hasRainData) {
        weekTotalRain = nextWeekDays.reduce(
          (sum, day) => sum + num(day.precipitation_probability_max) * 0.1,
          0,
        );
      }
      if (hasUvData) {
        weekMaxUv = Math.max.apply(
          null,
          nextWeekDays.map((day) => num(day.uv_index_max)),
        );
      }
    }

    // The outlook sentence only mentions the metrics the data supports.
    const weekParts = [
      t(
        'Next week in ' + weather.city + ': Avg ' + Math.round(weekAvgTemp * 10) / 10 + '°C',
        'На следующей неделе в ' + weather.city + ': Средняя температура ' + Math.round(weekAvgTemp * 10) / 10 + '°C',
      ),
    ];
    if (hasRainData) {
      weekParts.push(
        t(
          Math.round(weekTotalRain * 10) / 10 + 'mm rain',
          Math.round(weekTotalRain * 10) / 10 + 'мм дождя',
        ),
      );
    }
    if (hasUvData) {
      weekParts.push(
        t(
          'max UV ' + Math.round(weekMaxUv * 10) / 10,
          'макс. Ультрафиолет ' + Math.round(weekMaxUv * 10) / 10,
        ),
      );
    }

    const predict = {
      next_week: {
        avg_temp: Math.round(weekAvgTemp * 10) / 10,
        total_rain: hasRainData ? Math.round(weekTotalRain * 10) / 10 : null,
        max_uv: hasUvData ? Math.round(weekMaxUv * 10) / 10 : null,
      },
      next_months: [],
      summary: weekParts.join(', ') + '.',
    };

    // Next 6 months, using monthly aggregates of the forecast as the climate
    // proxy (ai_service.py: predict_period() with monthly averaging).
    const forecastByMonth = {};
    forecast.forEach((day) => {
      const d = new Date(day.date);
      const m = d.getMonth() + 1;
      if (!forecastByMonth[m]) {
        forecastByMonth[m] = { temps: [], rains: [], uvs: [] };
      }
      forecastByMonth[m].temps.push(
        (day.temperature_max + day.temperature_min) / 2,
      );
      forecastByMonth[m].rains.push(num(day.precipitation_probability_max) * 0.1);
      forecastByMonth[m].uvs.push(num(day.uv_index_max));
    });

    for (let offset = 1; offset <= 6; offset++) {
      const targetMonth = ((now.getMonth() + offset) % 12) + 1;

      if (forecastByMonth[targetMonth]) {
        // Use the forecast data available for that month
        const data = forecastByMonth[targetMonth];
        const avgTemp =
          data.temps.reduce((a, b) => a + b, 0) / data.temps.length;
        const totalRain = data.rains.reduce((a, b) => a + b, 0);
        const maxUv = Math.max.apply(null, data.uvs);

        predict.next_months.push({
          month: targetMonth,
          avg_temp: Math.round(avgTemp * 10) / 10,
          total_rain: hasRainData ? Math.round(totalRain * 10) / 10 : null,
          max_uv: hasUvData ? Math.min(12, Math.round(maxUv * 10) / 10) : null,
        });
      } else {
        // Fallback: smooth seasonal climate model when the forecast has no
        // data for that month yet. July is the warmest month in the northern
        // hemisphere (January in the south); UV follows the same curve and
        // rain peaks in the transition months.
        const lat = current.latitude != null ? current.latitude : 0;
        const peakMonth = lat < 0 ? 1 : 7;
        // 1.0 in the warmest month, -1.0 half a year later
        const seasonal = Math.cos(((targetMonth - peakMonth) / 12) * 2 * Math.PI);

        const avgTemp = Math.round((weekAvgTemp + seasonal * 8) * 10) / 10;
        const maxUv = Math.min(
          12,
          Math.max(
            1,
            Math.round(weekMaxUv * (0.35 + 0.65 * ((seasonal + 1) / 2)) * 10) / 10,
          ),
        );
        // Wetter in spring/autumn, drier at the temperature extremes
        const rainFactor = 0.6 + 0.9 * (1 - Math.abs(seasonal));
        const totalRain =
          Math.round(Math.max(0, weekTotalRain * 3 * rainFactor) * 10) / 10;

        predict.next_months.push({
          month: targetMonth,
          avg_temp: avgTemp,
          total_rain: hasRainData ? totalRain : null,
          max_uv: hasUvData ? maxUv : null,
        });
      }
    }

    return {
      recommendations: tips,
      summary:
        t(
          'Current conditions in ' + weather.city + ': ' + num(current.temperature) +
            '°C, ' + cond,
          'Текущие условия в городе ' + weather.city + ': ' + num(current.temperature) +
            '°C, ' + translateCondition(current.condition, language),
        ) +
        (current.precipitation_probability != null
          ? t(
              '. ' +
                Math.round(current.precipitation_probability) +
                '% chance of precipitation.',
              '. Вероятность осадков ' +
                Math.round(current.precipitation_probability) +
                '%.',
            )
          : '.'),
      comfortScore: cScore,
      walkScore: wScore,
      swimScore: sScore,
      predict: predict,
    };
  }

  /** One labelled row of the outlook tables. */
  function statRow(icon, label, value) {
    return h('tr', {}, [
      h('td', {}, [icon + ' ' + label]),
      h('td', {}, [value]),
    ]);
  }

  /**
   * Opens the AI modal: mounts its own overlay into <body> and returns a
   * handle ({ close }) for programmatic dismissal.
   */
  function openAi(options) {
    const opts = options || {};
    const weather = opts.weather;
    const theme = opts.theme || Theme.Light;
    const isDark = theme === Theme.Dark;
    const aiColor = isDark ? '#60a5fa' : '#2563eb';
    const language = YW.settings.getSettings().language;
    const t = (en, ru) => (language === Language.Russian ? ru : en);

    // Nothing to analyse yet (e.g. the very first load).
    if (!weather || !weather.current) return null;

    const overlay = h('div', { class: 'modal-overlay' });
    const modal = h('div', { class: 'modal ai-results-modal' });
    overlay.appendChild(modal);

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (typeof opts.onClose === 'function') opts.onClose();
    }

    // Clicking the backdrop dismisses the modal, like in the React version.
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    const brand = h('div', { class: 'ai-modal-title' }, [
      h('img', {
        class: 'ai-logo-icon',
        src: YW.assetUrl('/yaroslav_ai.svg'),
        alt: 'AI',
      }),
      h('span', { style: { color: aiColor } }, ['Yaroslav AI']),
    ]);

    const closeBtn = h(
      'button',
      {
        class: 'modal-close',
        type: 'button',
        'aria-label': 'Close',
        style: { cursor: 'pointer' },
        onclick: close,
      },
      ['✕'],
    );

    const body = h('div', {});
    mount(modal, [h('div', { class: 'ai-modal-header' }, [brand, closeBtn]), body]);

    let data = null;
    let errorText = '';

    /** Empty state: an explanatory line plus the "Use Yaroslav AI" button. */
    function renderPrompt() {
      return h('div', { style: { textAlign: 'center', padding: '1rem 0' } }, [
        h(
          'p',
          {
            style: {
              color: 'var(--yw-muted)',
              marginBottom: '1rem',
              fontSize: '0.9rem',
            },
          },
          [
            t(
              'Get AI-powered recommendations based on current weather conditions',
              'Получите ИИ-рекомендации на основе текущих погодных условий',
            ),
          ],
        ),
        h(
          'button',
          { class: 'primary-btn', type: 'button', onclick: runAnalysis },
          ['🧠 ' + t('Use Yaroslav AI', 'Использовать Yaroslav AI')],
        ),
      ]);
    }

    /** Loading state shown while the analysis is computed. */
    function renderLoading() {
      return h('div', { class: 'ai-loading' }, [
        '🤔 ' + t('Thinking...', 'Думаю...'),
      ]);
    }

    /** Error state with a retry button. */
    function renderError() {
      return h(
        'div',
        { style: { textAlign: 'center', padding: '1rem 0', color: '#ef4444' } },
        [
          h('p', {}, [errorText]),
          h(
            'button',
            {
              class: 'primary-btn',
              type: 'button',
              style: { marginTop: '0.75rem' },
              onclick: runAnalysis,
            },
            [t('Retry', 'Повторить')],
          ),
        ],
      );
    }

    /**
     * Computes the analysis and swaps in the results. The loading frame is
     * painted first through a timeout, mirroring the React handleFetch flow.
     */
    function runAnalysis() {
      errorText = '';
      data = null;
      mount(body, [renderLoading()]);

      window.setTimeout(() => {
        if (closed) return;
        try {
          data = buildAiData(weather, language);
        } catch (err) {
          errorText =
            err && err.message
              ? err.message
              : t('AI service error', 'Ошибка ИИ-сервиса');
          data = null;
        }
        render();
      }, 0);
    }

    /** Recommendations plus the next-week / next-months outlook. */
    function renderResults() {
      const recommendations = [];
      if (data && Array.isArray(data.recommendations)) {
        recommendations.push.apply(recommendations, data.recommendations);
      }
      if (data && typeof data.summary === 'string') {
        recommendations.push(data.summary);
      }

      const children = [
        h(
          'h3',
          { style: { fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.95rem' } },
          ['💡 ' + t('Recommendations', 'Рекомендации')],
        ),
      ];

      if (recommendations.length > 0) {
        children.push(
          h(
            'div',
            { class: 'ai-tips' },
            recommendations.map((rec) => h('div', { class: 'ai-tip' }, [rec])),
          ),
        );
      } else {
        children.push(
          h(
            'p',
            { style: { color: 'var(--yw-muted)', fontSize: '0.85rem' } },
            [JSON.stringify(data, null, 2)],
          ),
        );
      }

      const predict = data ? data.predict : null;
      if (predict) children.push(renderOutlook(predict));

      return h('div', {}, children);
    }

    /** Next-week table plus one card per upcoming month. */
    function renderOutlook(predict) {
      const monthNames =
        language === Language.Russian ? MONTH_NAMES.ru : MONTH_NAMES.en;

      const section = h(
        'div',
        { class: 'ai-predictions', style: { marginTop: '1rem' } },
        [
          h(
            'h3',
            {
              style: {
                fontWeight: 600,
                marginBottom: '0.75rem',
                fontSize: '0.95rem',
              },
            },
            ['🔮 ' + t('Forecast Outlook', 'Прогноз на будущее')],
          ),
        ],
      );

      const weekCard = h('div', { class: 'ai-pred-card' }, [
        h('h4', {}, ['📅 ' + t('Next Week', 'Следующая неделя')]),
      ]);

      const week = predict.next_week;
      if (week) {
        const weekRows = [
          statRow('🌡️', t('Avg', 'Средняя температура'), week.avg_temp + '°'),
        ];
        // Rain and UV are optional: api-ninjas does not publish them.
        if (week.total_rain != null) {
          weekRows.push(statRow('🌧️', t('Rain', 'Дождь'), week.total_rain + 'mm'));
        }
        if (week.max_uv != null) {
          weekRows.push(
            statRow('☀️', t('Max UV', 'Макс. Ультрафиолет'), String(week.max_uv)),
          );
        }

        weekCard.appendChild(
          h('table', { class: 'ai-table' }, [h('tbody', {}, weekRows)]),
        );
      }
      section.appendChild(weekCard);

      const months = predict.next_months || [];
      if (months.length > 0) {
        section.appendChild(
          h(
            'h4',
            {
              style: {
                fontSize: '0.9rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
                marginTop: '0.25rem',
              },
            },
            ['📅 ' + t('Next Months', 'Следующие месяцы')],
          ),
        );

        months.forEach((m) => {
          const monthRows = [
            statRow('🌡️', t('Avg', 'Средняя температура'), m.avg_temp + '°'),
          ];
          if (m.total_rain != null) {
            monthRows.push(statRow('🌧️', t('Rain', 'Дождь'), m.total_rain + 'mm'));
          }
          if (m.max_uv != null) {
            monthRows.push(
              statRow('☀️', t('Max UV', 'Макс. Ультрафиолет'), String(m.max_uv)),
            );
          }

          section.appendChild(
            h('div', { class: 'ai-pred-card' }, [
              h('h4', {}, ['📅 ' + monthNames[(m.month - 1) % 12]]),
              h('table', { class: 'ai-table' }, [h('tbody', {}, monthRows)]),
            ]),
          );
        });
      }

      return section;
    }

    /** Picks the right body for the current state. */
    function render() {
      if (errorText) {
        mount(body, [renderError()]);
      } else if (data) {
        mount(body, [renderResults()]);
      } else {
        mount(body, [renderPrompt()]);
      }
    }

    document.body.appendChild(overlay);
    render();

    return { close: close };
  }

  YW.ai = {
    openAi: openAi,
    buildAiData: buildAiData,
  };
})(window.YW);
