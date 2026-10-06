/**
 * Weather display: current conditions + hourly/daily charts + sun & moon card.
 * Vanilla-JS port of frontend/src/components/weather/WeatherDisplay.tsx.
 *
 *   const view = YW.createWeatherView();
 *   host.appendChild(view.el);
 *   view.update({ data, temp_unit, wind_unit, pressure_unit, lang, theme });
 *
 * `theme` must be the *resolved* theme, i.e. 'light' or 'dark'.
 */
window.YW = window.YW || {};

(function (YW) {
  'use strict';

  const h = YW.dom.h;
  const s = YW.dom.s;
  const mount = YW.dom.mount;
  const H = YW.helpers;

  const Language = YW.Language;
  const Theme = YW.Theme;
  const TempUnit = YW.TempUnit;
  const WindUnit = YW.WindUnit;
  const PressureUnit = YW.PressureUnit;

  const HOURLY_TOOLTIP_W = 180;
  const HOURLY_TOOLTIP_H = 130;
  const DAILY_TOOLTIP_W = 180;
  const DAILY_TOOLTIP_H = 110;

  /** Split the hourly forecast into one group per day (API order is preserved). */
  function groupHourlyByDay(hourly) {
    const groups = [];
    let current = [];
    let currentDate = null;
    (hourly || []).forEach((hr) => {
      if (hr.date !== currentDate) {
        if (current.length > 0) groups.push(current);
        current = [];
        currentDate = hr.date;
      }
      current.push(hr);
    });
    if (current.length > 0) groups.push(current);
    return groups;
  }

  /** Today / Yesterday / Tomorrow / "05 августа (Вт)" labels for the hourly tabs. */
  function buildDayLabels(groups, data, lang) {
    return groups.map((group) => {
      const date = group[0] ? group[0].date : null;
      if (!date) return '';
      if (date === data.local_today)
        return lang === Language.English ? 'Today' : 'Сегодня';
      if (date === data.local_yesterday)
        return lang === Language.English ? 'Yesterday' : 'Вчера';
      const todayDate = new Date(data.local_today + 'T00:00:00');
      const thisDate = new Date(date + 'T00:00:00');
      const diff =
        (thisDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24);
      if (Math.round(diff) === 1)
        return lang === Language.English ? 'Tomorrow' : 'Завтра';
      return H.formatDayLabel(date, lang);
    });
  }

  /** Splits "HH:MM" into minutes since midnight. */
  function timeToMinutes(time) {
    const parts = String(time || '0:0').split(':');
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  }

  /**
   * Places a fixed-position tooltip next to a data point, flipping it to the
   * left of the point when the point sits in the right half of the SVG.
   */
  function tooltipPosition(svgEl, x, y, svgWidth, svgHeight, tipW, tipH, offset) {
    const rect = svgEl.getBoundingClientRect();
    const scaleX = rect.width / svgWidth;
    const scaleY = rect.height / svgHeight;
    const px = x * scaleX;
    const py = y * scaleY;
    const left =
      px < rect.width / 2
        ? rect.left + px + offset
        : rect.left + px - tipW - offset;
    return { left: left, top: rect.top + py - tipH / 1.5 };
  }

  YW.createWeatherView = function createWeatherView() {
    const el = h('div', { class: 'weather-container' });

    // Fixed-position tooltips live next to the cards, exactly like in the
    // React version (both were children of .weather-container).
    const hourlyTooltipEl = h('div', {
      class: 'chart-tooltip-fixed',
      style: { display: 'none' },
    });
    const dailyTooltipEl = h('div', {
      class: 'chart-tooltip-fixed',
      style: { display: 'none' },
    });

    const state = {
      data: null,
      temp_unit: TempUnit.Celsius,
      wind_unit: WindUnit.Mps,
      pressure_unit: PressureUnit.HPa,
      lang: Language.English,
      theme: Theme.Light,
      selectedHourlyDay: 0,
    };

    // Mutable DOM references, rebuilt on every render.
    let hourlySvgEl = null;
    let dailySvgEl = null;
    let chartScrollEl = null;
    let hourlyPoints = []; // [{ group, circle }]
    let dailyPoints = []; // [{ group, maxCircle, minCircle }]
    let hoveredHour = null;
    let hoveredDay = null;

    /** Keeps the selected hourly tab inside range when the data changes. */
    function normalizeSelectedDay(groups, data) {
      const todayIndex = groups.findIndex(
        (group) => group[0] && group[0].date === data.local_today,
      );
      const index = state.selectedHourlyDay;
      if (!(index >= 0 && index < groups.length)) {
        state.selectedHourlyDay = Math.max(todayIndex, 0);
      }
      return todayIndex;
    }

    /** Hourly chart geometry + the "now" marker. */
    function buildHourlyContext(data, displayedHours, todayIndex) {
      const hMinTemp = Math.min.apply(
        null,
        displayedHours.map((hr) => hr.temperature),
      );
      const hMaxTemp = Math.max.apply(
        null,
        displayedHours.map((hr) => hr.temperature),
      );
      const hTempRange = Math.max(hMaxTemp - hMinTemp, 0.1);
      const hViewHeight = 300;
      const hPadX = 45;
      const hPadding = 60;
      const hPlotHeight = hViewHeight - 2 * hPadding;
      const hStepX = displayedHours.length > 1 ? 70 : 0;
      const hSvgWidth =
        displayedHours.length < 2
          ? 300
          : hPadding + hStepX * (displayedHours.length - 1) + hPadding;
      const hToY = (temp) =>
        hViewHeight - hPadding - ((temp - hMinTemp) / hTempRange) * hPlotHeight;

      let nowLine = null;
      if (todayIndex === state.selectedHourlyDay && displayedHours.length > 0) {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        let leftIdx = 0;
        let rightIdx = 0;
        for (let i = 0; i < displayedHours.length; i++) {
          const minutes = timeToMinutes(displayedHours[i].time);
          if (minutes <= nowMinutes) leftIdx = i;
          else if (rightIdx === 0) {
            rightIdx = i;
            break;
          }
        }
        const leftX = hPadding + hStepX * leftIdx;
        const rightX = hPadding + hStepX * rightIdx;
        const leftMinutes = timeToMinutes(displayedHours[leftIdx].time);
        const rightMinutes =
          leftIdx === rightIdx
            ? leftMinutes + 60
            : timeToMinutes(displayedHours[rightIdx].time);
        const fraction =
          rightMinutes === leftMinutes
            ? 0
            : (nowMinutes - leftMinutes) / (rightMinutes - leftMinutes);
        const pad = (n) => String(n).padStart(2, '0');
        nowLine = {
          x: leftX + fraction * (rightX - leftX),
          label: pad(now.getHours()) + ':' + pad(now.getMinutes()),
        };
      }

      return {
        minTemp: hMinTemp,
        maxTemp: hMaxTemp,
        tempRange: hTempRange,
        viewHeight: hViewHeight,
        padX: hPadX,
        padding: hPadding,
        plotHeight: hPlotHeight,
        stepX: hStepX,
        svgWidth: hSvgWidth,
        toY: hToY,
        pointsLine: displayedHours
          .map(
            (hr, i) =>
              (hPadding + hStepX * i).toFixed(1) +
              ',' +
              hToY(hr.temperature).toFixed(1),
          )
          .join(' '),
        nowLine: nowLine,
      };
    }

    /** Daily chart geometry (yesterday + forecast). */
    function buildDailyContext(data) {
      // Yesterday is optional: api-ninjas has no historical endpoint, so the
      // daily chart simply starts with today in that case.
      const chartDays = (data.yesterday ? [data.yesterday] : []).concat(
        data.forecast || [],
      );
      const minTemp = Math.min.apply(
        null,
        chartDays.map((day) => day.temperature_min),
      );
      const maxTemp = Math.max.apply(
        null,
        chartDays.map((day) => day.temperature_max),
      );
      const tempRange = Math.max(maxTemp - minTemp, 0.1);
      const chartHeight = 300;
      const dPadX = 50;
      const dPadding = 60;
      const plotHeight = chartHeight - 2 * dPadding;
      const stepX = chartDays.length > 1 ? 100 : 0;
      const dSvgWidth =
        chartDays.length < 2
          ? 300
          : dPadding + stepX * (chartDays.length - 1) + dPadding;
      const toY = (temp) =>
        chartHeight - dPadding - ((temp - minTemp) / tempRange) * plotHeight;

      return {
        chartDays: chartDays,
        minTemp: minTemp,
        maxTemp: maxTemp,
        tempRange: tempRange,
        chartHeight: chartHeight,
        padX: dPadX,
        padding: dPadding,
        plotHeight: plotHeight,
        stepX: stepX,
        svgWidth: dSvgWidth,
        toY: toY,
        maxPoints: chartDays
          .map(
            (day, i) =>
              (dPadding + stepX * i).toFixed(1) +
              ',' +
              toY(day.temperature_max).toFixed(1),
          )
          .join(' '),
        minPoints: chartDays
          .map(
            (day, i) =>
              (dPadding + stepX * i).toFixed(1) +
              ',' +
              toY(day.temperature_min).toFixed(1),
          )
          .join(' '),
      };
    }

    /** Everything the section builders need, computed once per render. */
    function buildContext(data, groups, todayIndex) {
      const lang = state.lang;
      const temp_unit = state.temp_unit;
      const wind_unit = state.wind_unit;
      const pressure_unit = state.pressure_unit;
      const theme = state.theme;
      const displayedHours = groups[state.selectedHourlyDay] || [];

      return {
        data: data,
        lang: lang,
        temp_unit: temp_unit,
        wind_unit: wind_unit,
        pressure_unit: pressure_unit,
        theme: theme,
        isDark: theme === Theme.Dark,
        tStr: YW.settings.tempUnitStr(temp_unit, lang),
        wStr: YW.settings.windUnitStr(wind_unit, lang),
        pStr: YW.settings.pressureUnitStr(pressure_unit, lang),
        condIcon: H.conditionIconFromText(data.current.condition),
        // Orange line for max temperatures, blue for min (same in both themes).
        maxLineColor: '#e8913a',
        minLineColor: '#006aff',
        pointFillMax: '#e8913a',
        pointFillMin: '#006aff',
        labelColor: 'var(--text)',
        minLineOpacity: 1.0,
        hourlyByDay: groups,
        todayIndex: todayIndex,
        displayedHours: displayedHours,
        dayLabels: buildDayLabels(groups, data, lang),
        hourly: buildHourlyContext(data, displayedHours, todayIndex),
        daily: buildDailyContext(data),
      };
    }

    let currentCtx = null;

    function hideTooltip(tooltipEl) {
      tooltipEl.style.display = 'none';
    }

    /** Fills a fixed-position tooltip and shows it at the computed position. */
    function showTooltip(tooltipEl, lines, pos) {
      mount(
        tooltipEl,
        lines.map((line) => h('div', {}, line)),
      );
      tooltipEl.style.display = '';
      tooltipEl.style.left = pos.left + 'px';
      tooltipEl.style.top = pos.top + 'px';
    }

    /** Keeps the hourly chart scrolled so the "now" line stays centred. */
    function scrollToNow(ctx) {
      if (!chartScrollEl || !ctx.hourly.nowLine) return;
      const container = chartScrollEl;
      requestAnimationFrame(() => {
        if (!container.querySelector('svg')) return;
        const scrollLeft = Math.max(0, ctx.hourly.nowLine.x - container.clientWidth / 2);
        if (typeof container.scrollTo === 'function') {
          container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        } else {
          container.scrollLeft = scrollLeft;
        }
      });
    }

    /** (Re)builds the whole view from the current state. */
    function render() {
      hourlyPoints = [];
      dailyPoints = [];
      hourlySvgEl = null;
      dailySvgEl = null;
      chartScrollEl = null;
      hoveredHour = null;
      hoveredDay = null;

      if (!state.data) {
        mount(el, [hourlyTooltipEl, dailyTooltipEl]);
        hideTooltip(hourlyTooltipEl);
        hideTooltip(dailyTooltipEl);
        return;
      }

      const data = state.data;
      const groups = groupHourlyByDay(data.hourly);
      const todayIndex = normalizeSelectedDay(groups, data);
      const ctx = buildContext(data, groups, todayIndex);
      currentCtx = ctx;

      mount(el, [
        currentCard(ctx),
        hourlySection(ctx),
        dailySection(ctx),
        astronomySection(ctx),
        hourlyTooltipEl,
        dailyTooltipEl,
      ]);

      hideTooltip(hourlyTooltipEl);
      hideTooltip(dailyTooltipEl);
      scrollToNow(ctx);
    }

    function update(next) {
      if (next) {
        Object.keys(next).forEach((key) => {
          if (next[key] !== undefined) state[key] = next[key];
        });
      }
      render();
    }

    function onHourHover(index) {
      if (hourlyPoints[hoveredHour]) {
        hourlyPoints[hoveredHour].circle.setAttribute('r', 5);
      }
      hoveredHour = index;
      const ctx = currentCtx;

      if (index === null || !ctx) {
        hideTooltip(hourlyTooltipEl);
        return;
      }
      const point = hourlyPoints[index];
      const hour = ctx.displayedHours[index];
      if (!point || !hour) return;
      point.circle.setAttribute('r', 7);

      const lang = ctx.lang;
      const windVal = H.convertWind(hour.wind_speed, ctx.wind_unit);
      const windCat = H.windCategory(hour.wind_speed);
      const windS =
        (lang === Language.English ? 'Wind' : 'Ветер') +
        ': ' +
        windVal.toFixed(1) +
        ' ' +
        ctx.wStr +
        ' (' +
        H.translateCategory(windCat, lang) +
        ')';
      const precipS =
        (lang === Language.English ? 'Precipitation' : 'Осадки') +
        ': ' +
        Math.round(hour.precipitation_probability) +
        '%';
      const pressureVal = H.convertPressure(hour.pressure, ctx.pressure_unit);
      const pressureS =
        (lang === Language.English ? 'Pressure' : 'Давление') +
        ': ' +
        pressureVal.toFixed(1) +
        ' ' +
        ctx.pStr +
        ' (' +
        H.translateCategory(H.pressureCategory(hour.pressure), lang) +
        ')';
      const uvS =
        '☀️ ' +
        (hour.uv_index || 0).toFixed(1) +
        ' (' +
        H.translateCategory(H.uvCategory(hour.uv_index || 0), lang) +
        ')';

      const lines = [
        H.conditionIconFromText(hour.condition) +
          ' ' +
          H.translateCondition(hour.condition, lang),
        H.convertTemp(hour.temperature, ctx.temp_unit).toFixed(0) + ctx.tStr,
        '💨 ' + windS,
      ];

      // Pressure, UV and precipitation are not published by api-ninjas: drop
      // the rows instead of showing a made-up zero.
      if (hour.precipitation_probability != null) {
        lines.push('🌧️ ' + precipS);
      }
      if (hour.pressure != null) {
        lines.push('📊 ' + pressureS);
      }
      if (hour.uv_index != null) {
        lines.push(uvS);
      }

      const pos = hourlySvgEl
        ? tooltipPosition(
            hourlySvgEl,
            ctx.hourly.padding + ctx.hourly.stepX * index,
            ctx.hourly.toY(hour.temperature),
            ctx.hourly.svgWidth,
            ctx.hourly.viewHeight,
            HOURLY_TOOLTIP_W,
            HOURLY_TOOLTIP_H,
            15,
          )
        : null;
      if (pos) showTooltip(hourlyTooltipEl, lines, pos);
    }

    function onDayHover(index) {
      if (dailyPoints[hoveredDay]) {
        dailyPoints[hoveredDay].maxCircle.setAttribute('r', 5);
        dailyPoints[hoveredDay].minCircle.setAttribute('r', 5);
      }
      hoveredDay = index;
      const ctx = currentCtx;

      if (index === null || !ctx) {
        hideTooltip(dailyTooltipEl);
        return;
      }
      const point = dailyPoints[index];
      const day = ctx.daily.chartDays[index];
      if (!point || !day) return;
      point.maxCircle.setAttribute('r', 7);
      point.minCircle.setAttribute('r', 7);

      const lang = ctx.lang;
      const highLabel = lang === Language.English ? 'Highest' : 'Макс';
      const lowLabel = lang === Language.English ? 'Lowest' : 'Мин';
      const windVal = H.convertWind(day.wind_speed_max, ctx.wind_unit);
      const windCat = H.windCategory(day.wind_speed_max);

      const lines = [
        H.conditionIconFromText(day.condition) +
          ' ' +
          H.translateCondition(day.condition, lang),
        highLabel +
          ': ' +
          H.convertTemp(day.temperature_max, ctx.temp_unit).toFixed(0) +
          ctx.tStr,
        lowLabel +
          ': ' +
          H.convertTemp(day.temperature_min, ctx.temp_unit).toFixed(0) +
          ctx.tStr,
        '💨 ' +
          (lang === Language.English ? 'Wind' : 'Ветер') +
          ': ' +
          windVal.toFixed(1) +
          ' ' +
          ctx.wStr +
          ' (' +
          H.translateCategory(windCat, lang) +
          ')',
      ];

      // api-ninjas publishes neither precipitation probability nor UV here:
      // skip those rows rather than printing zeros.
      if (day.precipitation_probability_max != null) {
        lines.push(
          '🌧️ ' +
            (lang === Language.English ? 'Precipitation' : 'Осадки') +
            ': ' +
            Math.round(day.precipitation_probability_max) +
            '%',
        );
      }
      if (day.uv_index_max != null) {
        lines.push(
          '☀️ ' +
            day.uv_index_max.toFixed(1) +
            ' (' +
            H.translateCategory(H.uvCategory(day.uv_index_max), lang) +
            ')',
        );
      }

      const pos = dailySvgEl
        ? tooltipPosition(
            dailySvgEl,
            ctx.daily.padding + ctx.daily.stepX * index,
            ctx.daily.toY(day.temperature_max),
            ctx.daily.svgWidth,
            ctx.daily.chartHeight,
            DAILY_TOOLTIP_W,
            DAILY_TOOLTIP_H,
            15,
          )
        : null;
      if (pos) showTooltip(dailyTooltipEl, lines, pos);
    }

    /** Current conditions card. */
    function currentCard(ctx) {
      const data = ctx.data;
      const lang = ctx.lang;
      const en = lang === Language.English;
      const current = data.current;

      const details = [
        h(
          'p',
          {},
          '💨 ' +
            (en ? 'Wind' : 'Ветер') +
            ': ' +
            H.convertWind(current.wind_speed, ctx.wind_unit).toFixed(1) +
            ' ' +
            ctx.wStr +
            ' (' +
            H.translateCategory(H.windCategory(current.wind_speed), lang) +
            ')',
        ),
      ];

      // api-ninjas always reports these two, so show them instead.
      if (current.feels_like != null) {
        details.push(
          h(
            'p',
            {},
            '🌡️ ' +
              (en ? 'Feels like' : 'Ощущается как') +
              ': ' +
              H.convertTemp(current.feels_like, ctx.temp_unit).toFixed(1) +
              ctx.tStr,
          ),
        );
      }
      if (current.humidity != null) {
        details.push(
          h(
            'p',
            {},
            '💧 ' +
              (en ? 'Humidity' : 'Влажность') +
              ': ' +
              Math.round(current.humidity) +
              '%',
          ),
        );
      }

      // Pressure, UV and precipitation probability are not part of the
      // api-ninjas payload: omit the rows instead of showing zeros.
      if (current.pressure != null) {
        details.push(
          h(
            'p',
            {},
            '📊 ' +
              (en ? 'Pressure' : 'Давление') +
              ': ' +
              H.convertPressure(current.pressure, ctx.pressure_unit).toFixed(1) +
              ' ' +
              ctx.pStr +
              ' (' +
              H.translateCategory(H.pressureCategory(current.pressure), lang) +
              ')',
          ),
        );
      }
      if (current.precipitation_probability != null) {
        details.push(
          h(
            'p',
            {},
            '🌧️ ' +
              (en ? 'Precipitation' : 'Осадки') +
              ': ' +
              Math.round(current.precipitation_probability) +
              '%',
          ),
        );
      }
      if (current.uv_index != null) {
        details.push(
          h(
            'p',
            {},
            '☀️ ' +
              (en ? 'UV Index' : 'Ультрафиолет') +
              ': ' +
              current.uv_index.toFixed(1) +
              ' (' +
              H.translateCategory(H.uvCategory(current.uv_index), lang) +
              ')',
          ),
        );
      }

      if (current.sea_temperature != null && YW.isCoastal(data.city)) {
        details.push(
          h(
            'p',
            {},
            '🌊 ' +
              (en ? 'Sea temp' : 'Темп. моря') +
              ': ' +
              H.convertTemp(current.sea_temperature || 0, ctx.temp_unit).toFixed(1) +
              ctx.tStr,
          ),
        );
      }

      return h('div', { class: 'current-weather glass-card' }, [
        h('div', { class: 'city-line' }, [h('h2', {}, data.city)]),
        h(
          'div',
          { class: 'temp-large' },
          H.convertTemp(current.temperature, ctx.temp_unit).toFixed(1) + ctx.tStr,
        ),
        h('div', { class: 'condition-line' }, [
          h('span', { class: 'condition-icon' }, ctx.condIcon),
          h(
            'span',
            { class: 'condition-text' },
            H.translateCondition(current.condition, lang),
          ),
        ]),
        h('div', { class: 'weather-details' }, details),
      ]);
    }

    /** Hourly forecast card: day tabs + the temperature line chart. */
    function hourlySection(ctx) {
      const en = ctx.lang === Language.English;
      const hours = ctx.displayedHours;
      const geo = ctx.hourly;
      const dayLabel = ctx.dayLabels[state.selectedHourlyDay] || '';

      const tabs = h(
        'div',
        { class: 'hourly-tabs' },
        ctx.hourlyByDay.map((_, i) =>
          h(
            'button',
            {
              class:
                'hourly-tab' +
                (state.selectedHourlyDay === i ? ' active' : ''),
              onclick: () => {
                state.selectedHourlyDay = i;
                render();
              },
            },
            ctx.dayLabels[i],
          ),
        ),
      );

      // Vertical grid lines
      const gridLines = hours.map((_, i) =>
        s('line', {
          x1: geo.padX + geo.stepX * i,
          y1: geo.padding - 10,
          x2: geo.padX + geo.stepX * i,
          y2: geo.viewHeight - geo.padding + 10,
          stroke: 'var(--muted, #444)',
          'stroke-width': 0.5,
          opacity: 0.3,
        }),
      );

      // Y-axis labels (0/25/50/75/100% of the temperature range)
      const yLabels = [0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const temp = geo.minTemp + frac * geo.tempRange;
        return s(
          'text',
          {
            x: geo.padX - 12,
            y: geo.toY(temp) + 4,
            'text-anchor': 'end',
            'font-size': 11,
            fill: 'var(--muted, #aaa)',
          },
          H.convertTemp(temp, ctx.temp_unit).toFixed(0) + '°',
        );
      });

      const line = s('polyline', {
        fill: 'none',
        stroke: ctx.maxLineColor,
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        points: geo.pointsLine,
      });

      // Data points (icon, temperature and hour labels)
      const points = hours.map((hour, i) => {
        const x = geo.padding + geo.stepX * i;
        const y = geo.toY(hour.temperature);
        const circle = s('circle', {
          cx: x,
          cy: y,
          r: 5,
          fill: ctx.maxLineColor,
          stroke: 'white',
          'stroke-width': 1.5,
          class: 'chart-point',
        });
        hourlyPoints[i] = { circle: circle };
        return s(
          'g',
          {
            class: 'chart-point-group',
            onmouseenter: () => onHourHover(i),
            onmouseleave: () => onHourHover(null),
          },
          [
            circle,
            s(
              'text',
              {
                x: x,
                y: y - 34,
                'text-anchor': 'middle',
                'font-size': 20,
                fill: 'white',
                class: 'chart-label-icon',
              },
              H.conditionIconFromText(hour.condition),
            ),
            s(
              'text',
              {
                x: x,
                y: y - 16,
                'text-anchor': 'middle',
                'font-size': 12,
                fill: ctx.labelColor,
                class: 'chart-label-temp',
              },
              H.convertTemp(hour.temperature, ctx.temp_unit).toFixed(0) +
                ctx.tStr,
            ),
            s(
              'text',
              {
                x: x,
                y: geo.viewHeight - 8,
                'text-anchor': 'middle',
                'font-size': 12,
                fill: 'var(--muted, #ccc)',
              },
              hour.time,
            ),
          ],
        );
      });

      // "Now" marker on today's chart only
      const nowMarker = [];
      if (geo.nowLine) {
        nowMarker.push(
          s('line', {
            x1: geo.nowLine.x,
            y1: geo.padding - 10,
            x2: geo.nowLine.x,
            y2: geo.viewHeight - geo.padding + 10,
            stroke: 'red',
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
            opacity: 0.8,
          }),
          s(
            'text',
            {
              x: geo.nowLine.x,
              y: geo.padding - 22,
              'text-anchor': 'middle',
              'font-size': 10,
              fill: 'red',
              'font-weight': 'bold',
            },
            geo.nowLine.label,
          ),
        );
      }

      const svg = s(
        'svg',
        {
          viewBox: '0 0 ' + geo.svgWidth + ' ' + geo.viewHeight,
          width: geo.svgWidth,
          style: { display: 'block', overflow: 'visible' },
        },
        [gridLines, yLabels, line, points, nowMarker],
      );
      hourlySvgEl = svg;
      chartScrollEl = h('div', { class: 'chart-scroll' }, [svg]);

      return h('div', { class: 'chart-section glass-card' }, [
        h(
          'h3',
          {},
          en
            ? 'Hourly Forecast for ' + dayLabel
            : 'Почасовой прогноз на ' + dayLabel,
        ),
        tabs,
        chartScrollEl,
      ]);
    }

    /** Daily forecast card: yesterday + forecast as max/min lines. */
    function dailySection(ctx) {
      const en = ctx.lang === Language.English;
      const geo = ctx.daily;
      const days = geo.chartDays;

      const gridLines = days.map((_, i) =>
        s('line', {
          x1: geo.padX + geo.stepX * i,
          y1: geo.padding - 10,
          x2: geo.padX + geo.stepX * i,
          y2: geo.chartHeight - geo.padding + 10,
          stroke: 'var(--muted, #444)',
          'stroke-width': 0.5,
          opacity: 0.3,
        }),
      );

      const yLabels = [0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const temp = geo.minTemp + frac * geo.tempRange;
        return s(
          'text',
          {
            x: geo.padX - 12,
            y: geo.toY(temp) + 4,
            'text-anchor': 'end',
            'font-size': 11,
            fill: 'var(--muted, #aaa)',
          },
          H.convertTemp(temp, ctx.temp_unit).toFixed(0) + '°',
        );
      });

      const maxLine = s('polyline', {
        fill: 'none',
        stroke: ctx.maxLineColor,
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        points: geo.maxPoints,
      });
      const minLine = s('polyline', {
        fill: 'none',
        stroke: ctx.minLineColor,
        'stroke-opacity': ctx.minLineOpacity,
        'stroke-width': 2.0,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        points: geo.minPoints,
      });

      const points = days.map((day, i) => {
        const x = geo.padding + geo.stepX * i;
        const yMax = geo.toY(day.temperature_max);
        const yMin = geo.toY(day.temperature_min);
        const maxCircle = s('circle', {
          cx: x,
          cy: yMax,
          r: 5,
          fill: ctx.pointFillMax,
          stroke: 'white',
          'stroke-width': 1.5,
          class: 'chart-point',
        });
        const minCircle = s('circle', {
          cx: x,
          cy: yMin,
          r: 5,
          fill: ctx.pointFillMin,
          stroke: 'white',
          'stroke-width': 1.5,
          class: 'chart-point',
        });
        dailyPoints[i] = { maxCircle: maxCircle, minCircle: minCircle };

        let label = '';
        if (i === 0 && ctx.data.yesterday) {
          label = en ? 'Yesterday' : 'Вчера';
        } else if (day.date === ctx.data.local_today) {
          label = en ? 'Today' : 'Сегодня';
        } else {
          const todayDate = new Date(ctx.data.local_today + 'T00:00:00');
          const thisDate = new Date(day.date + 'T00:00:00');
          const diff = Math.round(
            (thisDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          if (diff === 1) label = en ? 'Tomorrow' : 'Завтра';
          else label = H.formatDayLabel(day.date, ctx.lang);
        }

        const text = (opts, content) => s('text', opts, content);
        return s(
          'g',
          {
            class: 'chart-point-group',
            onmouseenter: () => onDayHover(i),
            onmouseleave: () => onDayHover(null),
          },
          [
            maxCircle,
            minCircle,
            text(
              {
                x: x,
                y: yMax - 16,
                'text-anchor': 'middle',
                'font-size': 12,
                fill: ctx.maxLineColor,
                class: 'chart-label-temp',
              },
              H.convertTemp(day.temperature_max, ctx.temp_unit).toFixed(0) +
                ctx.tStr,
            ),
            text(
              {
                x: x,
                y: yMin + 22,
                'text-anchor': 'middle',
                'font-size': 12,
                fill: ctx.minLineColor,
                class: 'chart-label-temp',
              },
              H.convertTemp(day.temperature_min, ctx.temp_unit).toFixed(0) +
                ctx.tStr,
            ),
            text(
              {
                x: x,
                y: yMax - 34,
                'text-anchor': 'middle',
                'font-size': 22,
                fill: 'white',
                class: 'chart-label-icon',
              },
              H.conditionIconFromText(day.condition),
            ),
            text(
              {
                x: x,
                y: geo.chartHeight - 8,
                'text-anchor': 'middle',
                'font-size': 13,
                fill: 'var(--muted, #ccc)',
              },
              label,
            ),
          ],
        );
      });

      const svg = s(
        'svg',
        {
          viewBox: '0 0 ' + geo.svgWidth + ' ' + geo.chartHeight,
          width: geo.svgWidth,
          style: { display: 'block', overflow: 'visible' },
        },
        [gridLines, yLabels, maxLine, minLine, points],
      );
      dailySvgEl = svg;

      return h('div', { class: 'chart-section glass-card' }, [
        h('h3', {}, en ? 'Daily Forecast' : 'Прогноз по дням'),
        h('div', { class: 'chart-scroll' }, [svg]),
      ]);
    }

    /** Sun-path geometry for the astronomy card (a continuous 24h sine arc). */
    function buildSunPath(riseMin, setMin) {
      const svgW = 400;
      const svgH = 200;
      const padL = 20;
      const padR = 20;
      const padT = 20;
      const padB = 32;
      const plotW = svgW - padL - padR;
      const plotH = svgH - padT - padB;

      // Horizon line — splits day (above) and night (below)
      const horizonY = padT + plotH * 0.55;
      // Minutes from midnight -> x position (full 24h: 0 -> left, 1440 -> right)
      const timeToX = (min) => padL + (min / 1440) * plotW;

      const noonMin = (riseMin + setMin) / 2;
      const riseX = timeToX(riseMin);
      const setX = timeToX(setMin);
      const noonX = timeToX(noonMin);

      // Arc peak Y (highest point of the sun) and night trough Y (lowest)
      const dayPeakY = padT + 8;
      const nightTroughY = svgH - padB - 8;
      const dayRy = horizonY - dayPeakY;
      const nightRy = nightTroughY - horizonY;

      // 12AM (below) -> sunrise -> noon (peak) -> sunset -> 12AM
      const steps = 120;
      const allPts = [];
      const dayPts = [];
      const nightPts = [];

      for (let i = 0; i <= steps; i++) {
        const min = (i / steps) * 1440;
        const x = timeToX(min);
        let y;
        let isDay;

        if (min >= riseMin && min <= setMin) {
          // Daytime: sinusoidal arc above the horizon
          isDay = true;
          const dayProgress = (min - riseMin) / (setMin - riseMin);
          y = horizonY - dayRy * Math.sin(dayProgress * Math.PI);
        } else {
          // Nighttime: sinusoidal arc below the horizon
          isDay = false;
          const nightDuration = 1440 - setMin + riseMin;
          const nightProgress =
            min >= setMin
              ? (min - setMin) / nightDuration
              : (min + 1440 - setMin) / nightDuration;
          y = horizonY + nightRy * Math.sin(nightProgress * Math.PI);
        }

        const pt = x.toFixed(1) + ',' + y.toFixed(1);
        allPts.push(pt);
        if (isDay) dayPts.push(pt);
        else nightPts.push(pt);
      }

      const dayArcD = 'M ' + dayPts.join(' L ');
      const nightArcD = 'M ' + nightPts.join(' L ');
      // Fill under the day arc (day area between arc and horizon)
      const fillPathD =
        dayArcD +
        ' L ' +
        setX.toFixed(1) +
        ',' +
        horizonY.toFixed(1) +
        ' L ' +
        riseX.toFixed(1) +
        ',' +
        horizonY.toFixed(1) +
        ' Z';

      // Current position of the sun on the very same arc
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const nowX = timeToX(nowMin);
      const isDaytime = nowMin >= riseMin && nowMin <= setMin;
      let nowY;
      if (isDaytime) {
        const dayProgress = (nowMin - riseMin) / (setMin - riseMin);
        nowY = horizonY - dayRy * Math.sin(dayProgress * Math.PI);
      } else {
        const nightDuration = 1440 - setMin + riseMin;
        const nightProgress =
          nowMin >= setMin
            ? (nowMin - setMin) / nightDuration
            : (nowMin + 1440 - setMin) / nightDuration;
        nowY = horizonY + nightRy * Math.sin(nightProgress * Math.PI);
      }

      return {
        svgW: svgW,
        svgH: svgH,
        padL: padL,
        padR: padR,
        padT: padT,
        padB: padB,
        horizonY: horizonY,
        timeToX: timeToX,
        riseX: riseX,
        setX: setX,
        noonX: noonX,
        dayPeakY: dayPeakY,
        dayArcD: dayArcD,
        nightArcD: nightArcD,
        fillPathD: fillPathD,
        allArcD: 'M ' + allPts.join(' L '),
        nowX: nowX,
        nowY: nowY,
        isDaytime: isDaytime,
      };
    }

    /** "Sun & Moon" card: 24-hour sun-path diagram + moon phase. */
    function astronomySection(ctx) {
      const firstDay = ctx.data.forecast[0];
      if (!firstDay) return null;

      const lang = ctx.lang;
      const en = lang === Language.English;
      const isDark = ctx.isDark;

      const moonPhase = firstDay.moon_phase_name || 'Unknown';
      const moonEmoji = H.moonEmojiFromPhase(moonPhase);
      const moonPercent =
        firstDay.moon_illumination != null
          ? Math.round(firstDay.moon_illumination) + '%'
          : 'N/A';
      const moonIllumStr = en
        ? 'Illumination: ' + moonPercent
        : 'Освещённость: ' + moonPercent;

      const sunriseTime = H.formatTime(firstDay.sunrise || 'N/A');
      const sunsetTime = H.formatTime(firstDay.sunset || 'N/A');
      const dayLengthRaw =
        sunriseTime !== 'N/A' && sunsetTime !== 'N/A'
          ? H.dayLengthApprox(sunriseTime, sunsetTime)
          : 'N/A';
      const dayLengthStr = en
        ? 'Day length: ' + dayLengthRaw
        : 'Длительность дня: ' +
          dayLengthRaw.replace('h', 'ч').replace('m', 'мин');

      const sun = buildSunPath(
        timeToMinutes(sunriseTime),
        timeToMinutes(sunsetTime),
      );

      const gridTimes = [
        { min: 0, label: '12AM' },
        { min: 360, label: '6AM' },
        { min: 720, label: '12PM' },
        { min: 1080, label: '6PM' },
      ];

      // Sky gradient swaps with the theme; the sun glow dims at night.
      const defs = s('defs', {}, [
        s(
          'linearGradient',
          { id: 'sunSkyGrad', x1: 0, y1: 0, x2: 0, y2: 1 },
          isDark
            ? [
                s('stop', { offset: '0%', 'stop-color': '#1a2a4a' }),
                s('stop', { offset: '50%', 'stop-color': '#1a1a3e' }),
                s('stop', { offset: '100%', 'stop-color': '#0d0d1a' }),
              ]
            : [
                s('stop', { offset: '0%', 'stop-color': '#87CEEB' }),
                s('stop', { offset: '50%', 'stop-color': '#b8d8f0' }),
                s('stop', { offset: '100%', 'stop-color': '#3a4a5c' }),
              ],
        ),
        s('radialGradient', { id: 'sunGlow', cx: '50%', cy: '50%', r: '50%' }, [
          s('stop', {
            offset: '0%',
            'stop-color': '#FFD700',
            'stop-opacity': sun.isDaytime ? 0.6 : 0.25,
          }),
          s('stop', {
            offset: '100%',
            'stop-color': '#FFD700',
            'stop-opacity': 0,
          }),
        ]),
      ]);

      const skyRect = s('rect', {
        x: 0,
        y: 0,
        width: sun.svgW,
        height: sun.svgH,
        fill: 'url(#sunSkyGrad)',
      });

      const dayFill = s('path', {
        d: sun.fillPathD,
        fill: 'white',
        'fill-opacity': isDark ? 0.04 : 0.08,
      });

      const horizonLine = s('line', {
        x1: sun.padL,
        y1: sun.horizonY,
        x2: sun.svgW - sun.padR,
        y2: sun.horizonY,
        stroke: 'white',
        'stroke-opacity': 0.3,
        'stroke-width': 1,
      });

      // Dashed 6-hour grid lines with their time captions.
      const gridGroup = s(
        'g',
        {},
        gridTimes.map((gt) => {
          const gx = sun.timeToX(gt.min);
          return s('g', {}, [
            s('line', {
              x1: gx,
              y1: sun.padT,
              x2: gx,
              y2: sun.svgH - sun.padB,
              stroke: 'white',
              'stroke-opacity': 0.12,
              'stroke-width': 0.8,
              'stroke-dasharray': '4 4',
            }),
            s(
              'text',
              {
                x: gx,
                y: sun.svgH - sun.padB + 14,
                'text-anchor': 'middle',
                'font-size': 9,
                fill: 'white',
                'fill-opacity': 0.55,
                'font-family': '-apple-system, sans-serif',
              },
              [gt.label],
            ),
          ]);
        }),
      );

      // Solid day arc (above the horizon), dashed night arc (below it).
      const dayArc = s('path', {
        d: sun.dayArcD,
        fill: 'none',
        stroke: 'white',
        'stroke-width': 1.8,
        'stroke-opacity': 0.5,
        'stroke-linecap': 'round',
      });

      const nightArc = s('path', {
        d: sun.nightArcD,
        fill: 'none',
        stroke: 'white',
        'stroke-width': 1.2,
        'stroke-opacity': 0.2,
        'stroke-linecap': 'round',
        'stroke-dasharray': '5 4',
      });

      // Sunrise / noon / sunset markers on the horizon.
      const riseDot = s('circle', {
        cx: sun.riseX,
        cy: sun.horizonY,
        r: 3,
        fill: 'white',
        'fill-opacity': 0.6,
      });

      const noonDot = s('circle', {
        cx: sun.noonX,
        cy: sun.dayPeakY,
        r: 2.5,
        fill: 'white',
        'fill-opacity': 0.4,
      });

      const setDot = s('circle', {
        cx: sun.setX,
        cy: sun.horizonY,
        r: 3,
        fill: 'white',
        'fill-opacity': 0.6,
      });

      // Sunrise / sunset clock times above the horizon line.
      const labelAttrs = {
        y: sun.horizonY - 8,
        'text-anchor': 'middle',
        'font-size': 8,
        fill: 'white',
        'fill-opacity': 0.7,
        'font-family': '-apple-system, sans-serif',
      };

      const riseText = s(
        'text',
        Object.assign({ x: sun.riseX }, labelAttrs),
        [sunriseTime],
      );

      const setText = s(
        'text',
        Object.assign({ x: sun.setX }, labelAttrs),
        [sunsetTime],
      );

      // Current sun position — always visible.
      const nowGlow = s('circle', {
        cx: sun.nowX,
        cy: sun.nowY,
        r: sun.isDaytime ? 16 : 10,
        fill: 'url(#sunGlow)',
      });

      const nowDot = s('circle', {
        cx: sun.nowX,
        cy: sun.nowY,
        r: sun.isDaytime ? 7 : 5,
        fill: '#FFD700',
        'fill-opacity': sun.isDaytime ? 1 : 0.5,
        stroke: 'white',
        'stroke-opacity': sun.isDaytime ? 1 : 0.5,
        'stroke-width': sun.isDaytime ? 1.5 : 1,
      });

      const dayLengthText = s(
        'text',
        {
          x: sun.svgW / 2,
          y: sun.svgH - 5,
          'text-anchor': 'middle',
          'font-size': 10,
          fill: 'white',
          'fill-opacity': 0.7,
          'font-family': '-apple-system, sans-serif',
        },
        [dayLengthStr],
      );

      const sunSvg = s(
        'svg',
        {
          viewBox: '0 0 ' + sun.svgW + ' ' + sun.svgH,
          style: {
            width: '100%',
            display: 'block',
            borderRadius: '10px',
            overflow: 'hidden',
          },
        },
        [
          defs,
          skyRect,
          dayFill,
          horizonLine,
          gridGroup,
          dayArc,
          nightArc,
          riseDot,
          noonDot,
          setDot,
          riseText,
          setText,
          nowGlow,
          nowDot,
          dayLengthText,
        ],
      );

      return h('div', { class: 'astronomy-section glass-card' }, [
        h('h3', {}, en ? 'Sun & Moon' : 'Солнце и Луна'),
        h('div', { class: 'astronomy-grid' }, [
          // Left: sun path diagram
          h('div', { class: 'astro-card sun-path-card' }, [sunSvg]),
          // Right: moon info
          h('div', { class: 'astro-card' }, [
            h('p', { style: { fontSize: '3rem' } }, [moonEmoji]),
            h('p', {}, [H.translateMoonPhase(moonPhase, lang)]),
            h('p', {}, [moonIllumStr]),
          ]),
        ]),
      ]);
    }

    return {
      el: el,
      update: update,
    };
  };

  YW.WeatherView = { groupHourlyByDay: groupHourlyByDay };
})(window.YW);
