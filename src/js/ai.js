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

  // ── Scoring helpers (twins of the ones in ai_service.py) ────────────
  //
  // Comfort and walk answer two different questions, so they cannot be the
  // same formula with two tweaked constants (that is what they used to be:
  // identical wind / rain / probability terms and only the ideal temperature
  // 3 °C apart, so both scores landed on the same whole number almost every
  // day). Now:
  //
  //   comfort — how pleasant it is to simply be outside: a mild 19-24 °C
  //             plateau, muggy or bone-dry air, wind chill, sunburn and light
  //             rain all chip away at it. It reads the *apparent* temperature.
  //   walk    — how pleasant it is to go for a walk right now: people walk
  //             best in cooler air (12-20 °C), and rain, gusts and strong sun
  //             hurt a walk far more than they hurt standing around.
  //
  // Both start at 10 and are clamped to the 0..10 range.

  /** A metric can be missing (the API sends null): treat unknowns as 0. */
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

  /**
   * Degrees outside [min, max], priced per degree. `coldSlope` applies below
   * the band, `hotSlope` above it (they default to each other).
   */
  function bandPenalty(temp, min, max, coldSlope, hotSlope) {
    const value = num(temp);
    const hot = hotSlope === undefined ? coldSlope : hotSlope;
    if (value < min) return (min - value) * coldSlope;
    if (value > max) return (value - max) * hot;
    return 0;
  }

  /** Whatever is above `threshold`, priced per unit (wind, UV, ...). */
  function above(value, threshold, slope) {
    return Math.max(0, num(value) - threshold) * slope;
  }

  /**
   * Muggy air (>60 %) wears a person down, bone-dry air (<30 %) irritates the
   * eyes and throat. A missing reading costs nothing: `num(null)` is not a
   * dry day.
   */
  function airPenalty(humidity) {
    if (humidity === null || humidity === undefined) return 0;
    const value = num(humidity);
    if (!value) return 0;
    if (value > 60) return (value - 60) * 0.04;
    if (value < 30) return (30 - value) * 0.03;
    return 0;
  }

  /**
   * Comfort of being outside right now, from the apparent temperature (what
   * the current card shows as "feels like"), the air itself and the sky.
   */
  function comfortScore(feels, humidity, wind, uv, prob, isRain) {
    const s =
      10 -
      bandPenalty(feels, 19, 24, 0.3) -
      airPenalty(humidity) -
      above(wind, 3, 0.25) -
      (num(prob) / 100) * 2 -
      above(uv, 7, 0.6) -
      (isRain ? 1.5 : 0);
    return clampScore(s);
  }

  /**
   * Quality of a walk: cooler than comfort (walking warms you up), and much
   * less forgiving about rain, gusts and strong sun.
   */
  function walkScore(temp, wind, uv, prob, isRain) {
    const s =
      10 -
      bandPenalty(temp, 12, 20, 0.35, 0.45) -
      above(wind, 4, 0.3) -
      (num(prob) / 100) * 3.5 -
      above(uv, 5, 0.6) -
      (isRain ? 3.5 : 0);
    return clampScore(s);
  }

  /**
   * Swim score of a single hour: air temperature, season and rain decide it, so
   * the hours of the day can be ranked even when the sea is too cold for the
   * score itself to be meaningful (that "warm water" rule lives in swimScore).
   *
   * The 6-point baseline is deliberately generous: once the water is warm
   * enough to swim at all, the day is worth a positive number.
   */
  function swimHourScore(temp, month, isRain) {
    let s = 6 + (num(temp) - 20) * 0.15;
    // Summer months bonus
    if ([6, 7, 8].indexOf(month) !== -1) s += 1;
    // Winter months penalty
    if ([11, 12, 1, 2, 3].indexOf(month) !== -1) s -= 2;
    if (isRain) s -= 2;
    return clampScore(s);
  }

  /**
   * Swim score of the day. Warm water is the reason to swim at all, so every
   * degree the sea is above the 17 °C gate adds to the hour score on top of the
   * air, the season and the rain.
   */
  function swimScore(temp, seaTemp, month, isRain, coastal) {
    if (!coastal || !seaTemp || seaTemp <= 17) return 0;
    return clampScore(
      swimHourScore(temp, month, isRain) + (num(seaTemp) - 17) * 0.2,
    );
  }

  /**
   * The window the "best walk time" tip may point at — 06:00 until 22:00. The
   * hourly series covers the whole day (including the night), but a walk is a
   * daytime plan, so an ideal 03:00 or 23:00 must not win the tip.
   */
  const WALK_FROM_HOUR = 6;
  const WALK_UNTIL_HOUR = 22;

  const MONTH_NAMES = {
    ru: [
      'Январь',
      'Февраль',
      'Март',
      'Апрель',
      'Май',
      'Июнь',
      'Июль',
      'Август',
      'Сентябрь',
      'Октябрь',
      'Ноябрь',
      'Декабрь',
    ],
    en: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
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

    // Temperatures follow the unit picked in the settings, like every other
    // number in the app (the analysis itself always works in Celsius).
    const tempUnit = YW.settings.getSettings().temp_unit;
    const tempUnitStr = YW.settings.tempUnitStr(tempUnit);
    /** A Celsius temperature as shown in the modal: whole degrees + unit. */
    const tempStr = (celsius) =>
      Math.round(YW.helpers.convertTemp(celsius, tempUnit)) + tempUnitStr;

    const cond = String(current.condition || '').toLowerCase();
    const isRain = rainFlag(
      current.condition,
      current.precipitation_probability,
    );
    // Both spellings: the typed one (what the headline shows) and the
    // geocoder's own, so «Сочи» and "Sochi" behave the same.
    const coastal =
      YW.isCoastal(weather.city) || YW.isCoastal(weather.city_name || '');

    // ── Scores (comfort reads the apparent temperature, walk the air one) ──
    const feelsLike =
      current.feels_like != null ? current.feels_like : current.temperature;
    const cScore = comfortScore(
      feelsLike,
      current.humidity,
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
    // The three scores are reported as whole numbers: a "7.3/10" next to the
    // plain-language tips around it reads like noise.
    const comfort = Math.round(cScore);
    const walk = Math.round(wScore);
    const swim = Math.round(sScore);
    tips.push(
      t('⭐ Comfort: ' + comfort + '/10', '⭐ Комфорт: ' + comfort + '/10'),
    );
    tips.push(t('🚶 Walk: ' + walk + '/10', '🚶 Прогулка: ' + walk + '/10'));

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
        t(
          '🧥 Cold – warm jacket and scarf.',
          'Холодно – 🧥 тёплая куртка и шарф.',
        ),
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
        t(
          '👕 Comfortable – t-shirt is fine.',
          'Комфортно – 👕 можно в футболке.',
        ),
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
            '🏊 Swim: ' +
              swim +
              '/10 (water ' +
              tempStr(current.sea_temperature) +
              ')',
            '🏊 Купание: ' +
              swim +
              '/10 (вода ' +
              tempStr(current.sea_temperature) +
              ')',
          ),
        );
      } else {
        tips.push(
          t(
            '🏖️ Sea too cold for swimming.',
            '🏖️ Море слишком холодное для купания.',
          ),
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
        // The series starts with yesterday's rows (past_days=1), and a "best
        // time" must never point at a day that is already over.
        if (weather.local_today && hr.date && hr.date < weather.local_today) {
          return;
        }

        const hIsRain = rainFlag(hr.condition, hr.precipitation_probability);
        const hHour = hr.time ? parseInt(hr.time.split(':')[0], 10) : nowHour;

        // A walk is a daytime plan: the series holds every hour of the day, and
        // 03:00 or 23:00 must never win the "best walk time" tip even when the
        // air happens to be perfect then. Only 06:00-21:59 is eligible.
        if (hHour >= WALK_FROM_HOUR && hHour < WALK_UNTIL_HOUR) {
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
        }

        // Best swim time: the coastal-city tip the day is ranked by. Only the
        // hours a swim is plausible at are considered (10:00-18:00, like
        // ai_service.py) and the air decides the winner, so the tip shows up
        // even when the water is too cold for a score.
        if (coastal && hHour >= 10 && hHour <= 18) {
          const hSwim = swimHourScore(hr.temperature, month, hIsRain);
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

    // Precipitation probability and UV can be missing for a city, so those
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
        'Next week in ' +
          weather.city +
          ': Average temperature ' +
          Math.round(weekAvgTemp * 10) / 10 +
          '°C',
        'На следующей неделе в ' +
          weather.city +
          ': Средняя температура ' +
          Math.round(weekAvgTemp * 10) / 10 +
          '°C',
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
          'Максимальный ультрафиолет ' + Math.round(weekMaxUv * 10) / 10,
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
      forecastByMonth[m].rains.push(
        num(day.precipitation_probability_max) * 0.1,
      );
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
        const seasonal = Math.cos(
          ((targetMonth - peakMonth) / 12) * 2 * Math.PI,
        );

        const avgTemp = Math.round((weekAvgTemp + seasonal * 8) * 10) / 10;
        const maxUv = Math.min(
          12,
          Math.max(
            1,
            Math.round(weekMaxUv * (0.35 + 0.65 * ((seasonal + 1) / 2)) * 10) /
              10,
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
    const settings = YW.settings.getSettings();
    const language = settings.language;
    const t = (en, ru) => (language === Language.Russian ? ru : en);

    // The outlook is the only place the modal shows predicted temperatures, so
    // they follow the unit picked in the settings just like the main screen.
    const tempUnitStr = YW.settings.tempUnitStr(settings.temp_unit);
    const tempStr = (celsius) =>
      Math.round(YW.helpers.convertTemp(celsius, settings.temp_unit)) +
      tempUnitStr;
    const rainUnit = t('mm', 'мм');

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
        src: YW.assetUrl('src/assets/yaroslav-ai.svg'),
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
    mount(modal, [
      h('div', { class: 'ai-modal-header' }, [brand, closeBtn]),
      body,
    ]);

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

      const children = [
        h(
          'h3',
          {
            style: {
              fontWeight: 600,
              marginBottom: '0.5rem',
              fontSize: '0.95rem',
            },
          },
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
          h('p', { style: { color: 'var(--yw-muted)', fontSize: '0.85rem' } }, [
            JSON.stringify(data, null, 2),
          ]),
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
          statRow(
            '🌡️',
            t('Average temperature', 'Средняя температура'),
            tempStr(week.avg_temp),
          ),
        ];
        // Rain and UV can still be missing for some points: show them when
        // the answer has them.
        if (week.total_rain != null) {
          weekRows.push(
            statRow('🌧️', t('Rain', 'Дождь'), week.total_rain + rainUnit),
          );
        }
        if (week.max_uv != null) {
          weekRows.push(
            statRow(
              '☀️',
              t('Max UV', 'Максимальный ультрафиолет'),
              String(week.max_uv),
            ),
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
            statRow(
              '🌡️',
              t('Average temperature', 'Средняя температура'),
              tempStr(m.avg_temp),
            ),
          ];
          if (m.total_rain != null) {
            monthRows.push(
              statRow('🌧️', t('Rain', 'Дождь'), m.total_rain + rainUnit),
            );
          }
          if (m.max_uv != null) {
            monthRows.push(
              statRow(
                '☀️',
                t('Max UV', 'Максимальный ультрафиолет'),
                String(m.max_uv),
              ),
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
