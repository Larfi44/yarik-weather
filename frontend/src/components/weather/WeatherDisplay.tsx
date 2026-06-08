'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Language,
  TempUnit,
  WindUnit,
  PressureUnit,
  Theme,
  tempUnitStr,
  windUnitStr,
  pressureUnitStr,
} from '@/lib/settings';
import { WeatherResponse, HourlyData, DailyData } from '@/lib/types';
import {
  convertTemp,
  convertWind,
  convertPressure,
  conditionIconFromText,
  translateCondition,
  translateCategory,
  windCategory,
  pressureCategory,
  uvCategory,
  moonEmojiFromPhase,
  translateMoonPhase,
  formatTime,
  dayLengthApprox,
  formatDayLabel,
  monthNameEn,
  monthNameRu,
} from '@/lib/helpers';

interface WeatherDisplayProps {
  data: WeatherResponse;
  temp_unit: TempUnit;
  wind_unit: WindUnit;
  pressure_unit: PressureUnit;
  lang: Language;
  theme: Theme;
}

export default function WeatherDisplay({
  data,
  temp_unit,
  wind_unit,
  pressure_unit,
  lang,
  theme,
}: WeatherDisplayProps) {
  const tStr = tempUnitStr(temp_unit, lang);
  const wStr = windUnitStr(wind_unit, lang);
  const pStr = pressureUnitStr(pressure_unit, lang);
  const condIcon = conditionIconFromText(data.current.condition);

  // Using orange from dark theme for max temperature line and blue from light theme for min temperature line
  const maxLineColor = theme === Theme.Dark ? '#e8913a' : '#e8913a'; // Orange from dark theme
  const minLineColor = theme === Theme.Dark ? '#006aff' : '#006aff'; // Blue from light theme
  const pointFillMax = maxLineColor;
  const pointFillMin = minLineColor;
  const labelColor = 'var(--text)';
  const minLineOpacity = 1.0;

  // ── Hourly chart data ──
  const hourlyByDay = useMemo(() => {
    const groups: HourlyData[][] = [];
    let currentGroup: HourlyData[] = [];
    let currentDate: string | null = null;
    for (const h of data.hourly) {
      if (h.date !== currentDate) {
        if (currentGroup.length > 0) groups.push(currentGroup);
        currentGroup = [];
        currentDate = h.date;
      }
      currentGroup.push(h);
    }
    if (currentGroup.length > 0) groups.push(currentGroup);
    return groups;
  }, [data.hourly]);

  const todayIndex = useMemo(() => {
    return hourlyByDay.findIndex((g) => g[0]?.date === data.local_today);
  }, [hourlyByDay, data.local_today]);

  const [selectedHourlyDay, setSelectedHourlyDay] = useState(
    Math.max(todayIndex, 0),
  );
  const [hHovered, setHHovered] = useState<number | null>(null);
  const [dHovered, setDHovered] = useState<number | null>(null);

  const hourlySvgRef = useRef<SVGSVGElement>(null);
  const dailySvgRef = useRef<SVGSVGElement>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);

  const [hTooltipPos, setHTooltipPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [dTooltipPos, setDTooltipPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const displayedHours = hourlyByDay[selectedHourlyDay] || [];

  const dayLabels = useMemo(() => {
    return hourlyByDay.map((group) => {
      const date = group[0]?.date;
      if (!date) return '';
      if (date === data.local_today)
        return lang === Language.English ? 'Today' : 'Сегодня';
      if (date === data.local_yesterday)
        return lang === Language.English ? 'Yesterday' : 'Вчера';
      // Check if tomorrow
      const todayDate = new Date(data.local_today + 'T00:00:00');
      const thisDate = new Date(date + 'T00:00:00');
      const diff =
        (thisDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24);
      if (Math.round(diff) === 1)
        return lang === Language.English ? 'Tomorrow' : 'Завтра';
      return formatDayLabel(date, lang);
    });
  }, [hourlyByDay, data.local_today, data.local_yesterday, lang]);

  // ── Hourly SVG ──
  const hMinTemp = Math.min(...displayedHours.map((h) => h.temperature));
  const hMaxTemp = Math.max(...displayedHours.map((h) => h.temperature));
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

  const hToY = (t: number) =>
    hViewHeight - hPadding - ((t - hMinTemp) / hTempRange) * hPlotHeight;

  const hPointsLine = displayedHours
    .map(
      (h, i) =>
        `${(hPadding + hStepX * i).toFixed(1)},${hToY(h.temperature).toFixed(1)}`,
    )
    .join(' ');

  // Now line
  const nowLine = useMemo(() => {
    if (todayIndex !== selectedHourlyDay) return null;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let leftIdx = 0;
    let rightIdx = 0;
    for (let i = 0; i < displayedHours.length; i++) {
      const parts = displayedHours[i].time.split(':');
      const minutes =
        (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
      if (minutes <= nowMinutes) leftIdx = i;
      else if (rightIdx === 0) {
        rightIdx = i;
        break;
      }
    }
    if (leftIdx === 0 && rightIdx === 0) rightIdx = 0;
    const leftX = hPadding + hStepX * leftIdx;
    const rightX = hPadding + hStepX * rightIdx;
    const leftParts = displayedHours[leftIdx].time.split(':');
    const leftMinutes =
      (parseInt(leftParts[0]) || 0) * 60 + (parseInt(leftParts[1]) || 0);
    const rightMinutes =
      leftIdx === rightIdx
        ? leftMinutes + 60
        : (() => {
            const p = displayedHours[rightIdx].time.split(':');
            return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0);
          })();
    const fraction =
      rightMinutes === leftMinutes
        ? 0
        : (nowMinutes - leftMinutes) / (rightMinutes - leftMinutes);
    const nowX = leftX + fraction * (rightX - leftX);
    const nowLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return { x: nowX, label: nowLabel };
  }, [todayIndex, selectedHourlyDay, displayedHours]);

  // Auto-scroll hourly chart to center the nowLine on mount and when data or day changes
  useEffect(() => {
    if (!chartScrollRef.current || !nowLine) return;
    const container = chartScrollRef.current;
    // Wait for render
    requestAnimationFrame(() => {
      const svgEl = container.querySelector('svg');
      if (!svgEl) return;
      const scrollLeft = nowLine.x - container.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
    });
  }, [nowLine, displayedHours, selectedHourlyDay]);

  // Hourly tooltip
  const hourlyTooltip =
    hHovered !== null
      ? (() => {
          const h = displayedHours[hHovered];
          if (!h) return null;
          const condText = translateCondition(h.condition, lang);
          const windVal = convertWind(h.wind_speed, wind_unit);
          const windCat = windCategory(h.wind_speed);
          const windS = `${lang === Language.English ? 'Wind' : 'Ветер'}: ${windVal.toFixed(1)} ${wStr} (${translateCategory(windCat, lang)})`;
          const precipS = `${lang === Language.English ? 'Precipitation' : 'Осадки'}: ${Math.round(h.precipitation_probability)}%`;
          const pressureVal = convertPressure(h.pressure, pressure_unit);
          const pressureS = `${lang === Language.English ? 'Pressure' : 'Давление'}: ${pressureVal.toFixed(1)} ${pStr} (${translateCategory(pressureCategory(h.pressure), lang)})`;
          const uvS = `☀️ ${h.uv_index.toFixed(1)} (${translateCategory(uvCategory(h.uv_index), lang)})`;
          return {
            condText,
            condIcon: conditionIconFromText(h.condition),
            tempStr: `${convertTemp(h.temperature, temp_unit).toFixed(0)}${tStr}`,
            windS,
            precipS,
            pressureS,
            uvS,
          };
        })()
      : null;

  // ── Daily chart data ──
  const chartDays = useMemo(() => {
    const days: DailyData[] = [data.yesterday, ...data.forecast];
    return days;
  }, [data.yesterday, data.forecast]);

  const minTemp = Math.min(...chartDays.map((d) => d.temperature_min));
  const maxTemp = Math.max(...chartDays.map((d) => d.temperature_max));
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

  const toY = (t: number) =>
    chartHeight - dPadding - ((t - minTemp) / tempRange) * plotHeight;

  const maxPoints = chartDays
    .map(
      (d, i) =>
        `${(dPadding + stepX * i).toFixed(1)},${toY(d.temperature_max).toFixed(1)}`,
    )
    .join(' ');
  const minPoints = chartDays
    .map(
      (d, i) =>
        `${(dPadding + stepX * i).toFixed(1)},${toY(d.temperature_min).toFixed(1)}`,
    )
    .join(' ');

  // Daily tooltip
  const dailyTooltip =
    dHovered !== null
      ? (() => {
          const day = chartDays[dHovered];
          if (!day) return null;
          const condText = translateCondition(day.condition, lang);
          const highLabel = lang === Language.English ? 'Highest' : 'Макс';
          const lowLabel = lang === Language.English ? 'Lowest' : 'Мин';
          const highStr = `${highLabel}: ${convertTemp(day.temperature_max, temp_unit).toFixed(0)}${tStr}`;
          const lowStr = `${lowLabel}: ${convertTemp(day.temperature_min, temp_unit).toFixed(0)}${tStr}`;
          const windVal = convertWind(day.wind_speed_max, wind_unit);
          const windCat = windCategory(day.wind_speed_max);
          const windS = `${lang === Language.English ? 'Wind' : 'Ветер'}: ${windVal.toFixed(1)} ${wStr} (${translateCategory(windCat, lang)})`;
          const precipS = `${lang === Language.English ? 'Precipitation' : 'Осадки'}: ${Math.round(day.precipitation_probability_max)}%`;
          const uvS = `☀️ ${day.uv_index_max.toFixed(1)} (${translateCategory(uvCategory(day.uv_index_max), lang)})`;
          return {
            condText,
            condIcon: conditionIconFromText(day.condition),
            highStr,
            lowStr,
            windS,
            precipS,
            uvS,
          };
        })()
      : null;

  // ── Astronomy section ──
  const firstDay = data.forecast[0];
  const astronomySection = firstDay
    ? (() => {
        const moonPhase = firstDay.moon_phase_name || 'Unknown';
        const moonEmoji = moonEmojiFromPhase(moonPhase);
        const moonPercent =
          firstDay.moon_illumination != null
            ? `${Math.round(firstDay.moon_illumination)}%`
            : 'N/A';
        const moonIllumStr =
          lang === Language.English
            ? `Illumination: ${moonPercent}`
            : `Освещённость: ${moonPercent}`;
        const sunriseTime = formatTime(firstDay.sunrise || 'N/A');
        const sunsetTime = formatTime(firstDay.sunset || 'N/A');
        const dayLengthRaw =
          sunriseTime !== 'N/A' && sunsetTime !== 'N/A'
            ? dayLengthApprox(sunriseTime, sunsetTime)
            : 'N/A';
        const dayLengthStr =
          lang === Language.English
            ? `Day length: ${dayLengthRaw}`
            : `Длительность дня: ${dayLengthRaw.replace('h', 'ч').replace('m', 'мин')}`;

        const toMin = (s: string) => {
          const p = s.split(':');
          return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0);
        };
        const riseMin = toMin(sunriseTime);
        const setMin = toMin(sunsetTime);

        const sunriseLabel =
          lang === Language.English
            ? `Sunrise: ${sunriseTime}`
            : `Восход: ${sunriseTime}`;
        const sunsetLabel =
          lang === Language.English
            ? `Sunset: ${sunsetTime}`
            : `Закат: ${sunsetTime}`;

        return {
          moonEmoji,
          moonPhase,
          moonIllumStr,
          sunriseLabel,
          sunsetLabel,
          dayLengthStr,
          sunriseTime,
          sunsetTime,
          riseMin,
          setMin,
        };
      })()
    : null;

  const hourlyTitle =
    lang === Language.English
      ? `Hourly Forecast for ${dayLabels[selectedHourlyDay]}`
      : `Почасовой прогноз на ${dayLabels[selectedHourlyDay]}`;

  return (
    <div className="weather-container">
      {/* Current weather */}
      <div className="current-weather glass-card">
        <div className="city-line">
          <h2>{data.city}</h2>
        </div>
        <div className="temp-large">
          {convertTemp(data.current.temperature, temp_unit).toFixed(1)}
          {tStr}
        </div>
        <div className="condition-line">
          <span className="condition-icon">{condIcon}</span>
          <span className="condition-text">
            {translateCondition(data.current.condition, lang)}
          </span>
        </div>
        <div className="weather-details">
          <p>
            💨 {lang === Language.English ? 'Wind' : 'Ветер'}:{' '}
            {convertWind(data.current.wind_speed, wind_unit).toFixed(1)} {wStr}{' '}
            ({translateCategory(windCategory(data.current.wind_speed), lang)})
          </p>
          <p>
            📊 {lang === Language.English ? 'Pressure' : 'Давление'}:{' '}
            {convertPressure(data.current.pressure, pressure_unit).toFixed(1)}{' '}
            {pStr} (
            {translateCategory(pressureCategory(data.current.pressure), lang)})
          </p>
          <p>
            💧 {lang === Language.English ? 'Precipitation' : 'Осадки'}:{' '}
            {Math.round(data.current.precipitation_probability)}%
          </p>
          <p>
            ☀️ {lang === Language.English ? 'UV Index' : 'УФ-индекс'}:{' '}
            {data.current.uv_index.toFixed(1)} (
            {translateCategory(uvCategory(data.current.uv_index), lang)})
          </p>
          {data.current.sea_temperature != null && (
            <p>
              🌊 {lang === Language.English ? 'Sea temp' : 'Темп. моря'}:{' '}
              {convertTemp(data.current.sea_temperature, temp_unit).toFixed(1)}
              {tStr}
            </p>
          )}
        </div>
      </div>

      {/* Hourly chart */}
      <div className="chart-section glass-card">
        <h3>{hourlyTitle}</h3>
        <div className="hourly-tabs">
          {hourlyByDay.map((_, i) => (
            <button
              key={i}
              className={`hourly-tab${selectedHourlyDay === i ? ' active' : ''}`}
              onClick={() => setSelectedHourlyDay(i)}
            >
              {dayLabels[i]}
            </button>
          ))}
        </div>
        <div className="chart-scroll" ref={chartScrollRef}>
          <svg
            ref={hourlySvgRef}
            viewBox={`0 0 ${hSvgWidth} ${hViewHeight}`}
            width={hSvgWidth}
            style={{ display: 'block', overflow: 'visible' }}
          >
            {/* Grid lines */}
            {displayedHours.map((_, i) => {
              const x = hPadX + hStepX * i;
              return (
                <line
                  key={`hg${i}`}
                  x1={x}
                  y1={hPadding - 10}
                  x2={x}
                  y2={hViewHeight - hPadding + 10}
                  stroke="var(--muted, #444)"
                  strokeWidth={0.5}
                  opacity={0.3}
                />
              );
            })}
            {/* Y-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
              const temp = hMinTemp + frac * hTempRange;
              const y = hToY(temp);
              return (
                <text
                  key={`hy${i}`}
                  x={hPadX - 12}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--muted, #aaa)"
                >
                  {convertTemp(temp, temp_unit).toFixed(0)}°
                </text>
              );
            })}
            <polyline
              fill="none"
              stroke={maxLineColor}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={hPointsLine}
            />
            {displayedHours.map((h, i) => {
              const x = hPadding + hStepX * i;
              const y = hToY(h.temperature);
              const icon = conditionIconFromText(h.condition);
              const tempStr = `${convertTemp(h.temperature, temp_unit).toFixed(0)}${tStr}`;
              return (
                <g
                  key={`hp${i}`}
                  className="chart-point-group"
                  onMouseEnter={() => {
                    setHHovered(i);
                    // Calculate tooltip position using viewport coordinates
                    if (hourlySvgRef.current) {
                      const svgRect =
                        hourlySvgRef.current.getBoundingClientRect();
                      const scaleX = svgRect.width / hSvgWidth;
                      const scaleY = svgRect.height / hViewHeight;
                      const px = (hPadding + hStepX * i) * scaleX;
                      const py = hToY(displayedHours[i].temperature) * scaleY;
                      const tw = 180;
                      const th = 130;
                      const offset = 15;
                      const left =
                        px < svgRect.width / 2
                          ? svgRect.left + px + offset
                          : svgRect.left + px - tw - offset;
                      const top = svgRect.top + py - th / 1.5;
                      setHTooltipPos({ left, top });
                    }
                  }}
                  onMouseLeave={() => {
                    setHHovered(null);
                    setHTooltipPos(null);
                  }}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={hHovered === i ? 7 : 5}
                    fill={maxLineColor}
                    stroke="white"
                    strokeWidth={1.5}
                    className="chart-point"
                  />
                  <text
                    x={x}
                    y={y - 34}
                    textAnchor="middle"
                    fontSize="20"
                    fill="white"
                    className="chart-label-icon"
                  >
                    {icon}
                  </text>
                  <text
                    x={x}
                    y={y - 16}
                    textAnchor="middle"
                    fontSize="12"
                    fill={labelColor}
                    className="chart-label-temp"
                  >
                    {tempStr}
                  </text>
                  <text
                    x={x}
                    y={hViewHeight - 8}
                    textAnchor="middle"
                    fontSize="12"
                    fill="var(--muted, #ccc)"
                  >
                    {h.time}
                  </text>
                </g>
              );
            })}
            {/* Now line */}
            {nowLine && (
              <>
                <line
                  x1={nowLine.x}
                  y1={hPadding - 10}
                  x2={nowLine.x}
                  y2={hViewHeight - hPadding + 10}
                  stroke="red"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.8}
                />
                <text
                  x={nowLine.x}
                  y={hPadding - 22}
                  textAnchor="middle"
                  fontSize="10"
                  fill="red"
                  fontWeight="bold"
                >
                  {nowLine.label}
                </text>
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Daily chart */}
      <div className="chart-section glass-card">
        <h3>
          {lang === Language.English ? 'Daily Forecast' : 'Прогноз по дням'}
        </h3>
        <div className="chart-scroll">
          <svg
            ref={dailySvgRef}
            viewBox={`0 0 ${dSvgWidth} ${chartHeight}`}
            width={dSvgWidth}
            style={{ display: 'block', overflow: 'visible' }}
          >
            {/* Grid lines */}
            {chartDays.map((_, i) => {
              const x = dPadX + stepX * i;
              return (
                <line
                  key={`dg${i}`}
                  x1={x}
                  y1={dPadding - 10}
                  x2={x}
                  y2={chartHeight - dPadding + 10}
                  stroke="var(--muted, #444)"
                  strokeWidth={0.5}
                  opacity={0.3}
                />
              );
            })}
            {/* Y-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
              const temp = minTemp + frac * tempRange;
              const y = toY(temp);
              return (
                <text
                  key={`dy${i}`}
                  x={dPadX - 12}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--muted, #aaa)"
                >
                  {convertTemp(temp, temp_unit).toFixed(0)}°
                </text>
              );
            })}
            <polyline
              fill="none"
              stroke={maxLineColor}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={maxPoints}
            />
            <polyline
              fill="none"
              stroke={minLineColor}
              strokeOpacity={minLineOpacity}
              strokeWidth={2.0}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={minPoints}
            />
            {chartDays.map((day, i) => {
              const x = dPadding + stepX * i;
              const yMax = toY(day.temperature_max);
              const yMin = toY(day.temperature_min);
              const icon = conditionIconFromText(day.condition);
              const maxTempStr = `${convertTemp(day.temperature_max, temp_unit).toFixed(0)}${tStr}`;
              const minTempStr = `${convertTemp(day.temperature_min, temp_unit).toFixed(0)}${tStr}`;
              let label = '';
              if (i === 0)
                label = lang === Language.English ? 'Yesterday' : 'Вчера';
              else if (day.date === data.local_today)
                label = lang === Language.English ? 'Today' : 'Сегодня';
              else {
                const todayDate = new Date(data.local_today + 'T00:00:00');
                const thisDate = new Date(day.date + 'T00:00:00');
                const diff = Math.round(
                  (thisDate.getTime() - todayDate.getTime()) /
                    (1000 * 60 * 60 * 24),
                );
                if (diff === 1)
                  label = lang === Language.English ? 'Tomorrow' : 'Завтра';
                else label = formatDayLabel(day.date, lang);
              }
              return (
                <g
                  key={`dp${i}`}
                  className="chart-point-group"
                  onMouseEnter={() => {
                    setDHovered(i);
                    // Calculate tooltip position using viewport coordinates
                    if (dailySvgRef.current) {
                      const svgRect =
                        dailySvgRef.current.getBoundingClientRect();
                      const scaleX = svgRect.width / dSvgWidth;
                      const scaleY = svgRect.height / chartHeight;
                      const px = (dPadding + stepX * i) * scaleX;
                      const py = toY(chartDays[i].temperature_max) * scaleY;
                      const tw = 180;
                      const th = 110;
                      const offset = 15;
                      const left =
                        px < svgRect.width / 2
                          ? svgRect.left + px + offset
                          : svgRect.left + px - tw - offset;
                      const top = svgRect.top + py - th / 1.5;
                      setDTooltipPos({ left, top });
                    }
                  }}
                  onMouseLeave={() => {
                    setDHovered(null);
                    setDTooltipPos(null);
                  }}
                >
                  <circle
                    cx={x}
                    cy={yMax}
                    r={dHovered === i ? 7 : 5}
                    fill={pointFillMax}
                    stroke="white"
                    strokeWidth={1.5}
                    className="chart-point"
                  />
                  <circle
                    cx={x}
                    cy={yMin}
                    r={dHovered === i ? 7 : 5}
                    fill={pointFillMin}
                    stroke="white"
                    strokeWidth={1.5}
                    className="chart-point"
                  />
                  <text
                    x={x}
                    y={yMax - 16}
                    textAnchor="middle"
                    fontSize="12"
                    fill={maxLineColor}
                    className="chart-label-temp"
                  >
                    {maxTempStr}
                  </text>
                  <text
                    x={x}
                    y={yMin + 22}
                    textAnchor="middle"
                    fontSize="12"
                    fill={minLineColor}
                    className="chart-label-temp"
                  >
                    {minTempStr}
                  </text>
                  <text
                    x={x}
                    y={yMax - 34}
                    textAnchor="middle"
                    fontSize="22"
                    fill="white"
                    className="chart-label-icon"
                  >
                    {icon}
                  </text>
                  <text
                    x={x}
                    y={chartHeight - 8}
                    textAnchor="middle"
                    fontSize="13"
                    fill="var(--muted, #ccc)"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Hourly Tooltip (fixed position) */}
      {hourlyTooltip && hTooltipPos && (
        <div
          className="chart-tooltip-fixed"
          style={{ left: hTooltipPos.left, top: hTooltipPos.top }}
        >
          <div>
            {hourlyTooltip.condIcon} {hourlyTooltip.condText}
          </div>
          <div>{hourlyTooltip.tempStr}</div>
          <div>💨 {hourlyTooltip.windS}</div>
          <div>🌧️ {hourlyTooltip.precipS}</div>
          <div>📊 {hourlyTooltip.pressureS}</div>
          <div>{hourlyTooltip.uvS}</div>
        </div>
      )}

      {/* Daily Tooltip (fixed position) */}
      {dailyTooltip && dTooltipPos && (
        <div
          className="chart-tooltip-fixed"
          style={{ left: dTooltipPos.left, top: dTooltipPos.top }}
        >
          <div>
            {dailyTooltip.condIcon} {dailyTooltip.condText}
          </div>
          <div>{dailyTooltip.highStr}</div>
          <div>{dailyTooltip.lowStr}</div>
          <div>💨 {dailyTooltip.windS}</div>
          <div>🌧️ {dailyTooltip.precipS}</div>
          <div>{dailyTooltip.uvS}</div>
        </div>
      )}

      {/* Astronomy section */}
      {astronomySection &&
        (() => {
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

          // Map minutes-from-midnight to x position (full 24h: 0→left, 1440→right)
          const timeToX = (min: number) => padL + (min / 1440) * plotW;

          const riseMin = astronomySection.riseMin;
          const setMin = astronomySection.setMin;
          const noonMin = (riseMin + setMin) / 2;

          const riseX = timeToX(riseMin);
          const setX = timeToX(setMin);
          const noonX = timeToX(noonMin);

          // Arc peak Y (highest point of sun, near top)
          const dayPeakY = padT + 8;
          // Night trough Y (lowest point of sun, near bottom)
          const nightTroughY = svgH - padB - 8;

          // Vertical radius: distance from horizon to peak / trough
          const dayRy = horizonY - dayPeakY;
          const nightRy = nightTroughY - horizonY;

          // Generate the full 24-hour sun path from left edge (12AM) to right edge (12AM)
          // The path goes: 12AM (below) → sunrise (horizon) → noon (peak) → sunset (horizon) → midnight (below) → 12AM (below)
          const steps = 120;
          const allPts: string[] = [];
          const dayPts: string[] = [];
          const nightPts: string[] = [];

          for (let i = 0; i <= steps; i++) {
            const min = (i / steps) * 1440;
            const x = timeToX(min);
            let y: number;
            let isDay: boolean;

            if (min >= riseMin && min <= setMin) {
              // Daytime: sinusoidal arc above horizon
              isDay = true;
              const dayProgress = (min - riseMin) / (setMin - riseMin); // 0→1
              y = horizonY - dayRy * Math.sin(dayProgress * Math.PI);
            } else {
              // Nighttime: sinusoidal arc below horizon
              isDay = false;
              const nightDuration = 1440 - setMin + riseMin;
              let nightProgress: number;
              if (min >= setMin) {
                nightProgress = (min - setMin) / nightDuration;
              } else {
                nightProgress = (min + 1440 - setMin) / nightDuration;
              }
              y = horizonY + nightRy * Math.sin(nightProgress * Math.PI);
            }

            const pt = `${x.toFixed(1)},${y.toFixed(1)}`;
            allPts.push(pt);
            if (isDay) dayPts.push(pt);
            else nightPts.push(pt);
          }

          const fullArcD = `M ${allPts.join(' L ')}`;
          const dayArcD = `M ${dayPts.join(' L ')}`;
          const nightArcD = `M ${nightPts.join(' L ')}`;

          // Fill under day arc (day area between arc and horizon)
          const fillPathD = `${dayArcD} L ${setX.toFixed(1)},${horizonY.toFixed(1)} L ${riseX.toFixed(1)},${horizonY.toFixed(1)} Z`;

          // Current time position on the arc
          const now = new Date();
          const nowMin = now.getHours() * 60 + now.getMinutes();
          const nowX = timeToX(nowMin);
          const isDaytime = nowMin >= riseMin && nowMin <= setMin;

          let nowY: number;
          if (isDaytime) {
            const dayProgress = (nowMin - riseMin) / (setMin - riseMin);
            nowY = horizonY - dayRy * Math.sin(dayProgress * Math.PI);
          } else {
            const nightDuration = 1440 - setMin + riseMin;
            let nightProgress: number;
            if (nowMin >= setMin) {
              nightProgress = (nowMin - setMin) / nightDuration;
            } else {
              nightProgress = (nowMin + 1440 - setMin) / nightDuration;
            }
            nowY = horizonY + nightRy * Math.sin(nightProgress * Math.PI);
          }

          // Grid time markers
          const isDark = theme === Theme.Dark;
          const gridTimes = [
            { min: 0, label: '12AM' },
            { min: 360, label: '6AM' },
            { min: 720, label: '12PM' },
            { min: 1080, label: '6PM' },
          ];

          // Sunrise/sunset time labels below horizon
          const riseLabel = astronomySection.sunriseTime;
          const setLabel = astronomySection.sunsetTime;

          return (
            <div className="astronomy-section glass-card">
              <h3>
                {lang === Language.English ? 'Sun & Moon' : 'Солнце и Луна'}
              </h3>
              <div className="astronomy-grid">
                {/* Left: Sun path diagram */}
                <div className="astro-card sun-path-card">
                  <svg
                    viewBox={`0 0 ${svgW} ${svgH}`}
                    style={{
                      width: '100%',
                      display: 'block',
                      borderRadius: '10px',
                      overflow: 'hidden',
                    }}
                  >
                    <defs>
                      <linearGradient
                        id="sunSkyGrad"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        {isDark ? (
                          <>
                            <stop offset="0%" stopColor="#1a2a4a" />
                            <stop offset="50%" stopColor="#1a1a3e" />
                            <stop offset="100%" stopColor="#0d0d1a" />
                          </>
                        ) : (
                          <>
                            <stop offset="0%" stopColor="#87CEEB" />
                            <stop offset="50%" stopColor="#b8d8f0" />
                            <stop offset="100%" stopColor="#3a4a5c" />
                          </>
                        )}
                      </linearGradient>
                      <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
                        <stop
                          offset="0%"
                          stopColor="#FFD700"
                          stopOpacity={isDaytime ? 0.6 : 0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor="#FFD700"
                          stopOpacity="0"
                        />
                      </radialGradient>
                    </defs>

                    {/* Sky background */}
                    <rect
                      x="0"
                      y="0"
                      width={svgW}
                      height={svgH}
                      fill="url(#sunSkyGrad)"
                    />

                    {/* Fill under day arc (subtle day area) */}
                    <path
                      d={fillPathD}
                      fill="white"
                      fillOpacity={isDark ? 0.04 : 0.08}
                    />

                    {/* Horizon line */}
                    <line
                      x1={padL}
                      y1={horizonY}
                      x2={svgW - padR}
                      y2={horizonY}
                      stroke="white"
                      strokeOpacity="0.3"
                      strokeWidth="1"
                    />

                    {/* Vertical grid lines (dashed) */}
                    {gridTimes.map((gt, i) => {
                      const gx = timeToX(gt.min);
                      return (
                        <g key={`sg${i}`}>
                          <line
                            x1={gx}
                            y1={padT}
                            x2={gx}
                            y2={svgH - padB}
                            stroke="white"
                            strokeOpacity="0.12"
                            strokeWidth="0.8"
                            strokeDasharray="4 4"
                          />
                          <text
                            x={gx}
                            y={svgH - padB + 14}
                            textAnchor="middle"
                            fontSize="9"
                            fill="white"
                            fillOpacity="0.55"
                            fontFamily="-apple-system, sans-serif"
                          >
                            {gt.label}
                          </text>
                        </g>
                      );
                    })}

                    {/* Full 24-hour sun path — one continuous line from 12AM (left) to 12AM (right) */}
                    {/* Day portion (above horizon) — solid, brighter */}
                    <path
                      d={dayArcD}
                      fill="none"
                      stroke="white"
                      strokeWidth="1.8"
                      strokeOpacity="0.5"
                      strokeLinecap="round"
                    />
                    {/* Night portion (below horizon) — dashed, dimmer */}
                    <path
                      d={nightArcD}
                      fill="none"
                      stroke="white"
                      strokeWidth="1.2"
                      strokeOpacity="0.2"
                      strokeLinecap="round"
                      strokeDasharray="5 4"
                    />

                    {/* Sunrise / sunset dots on horizon */}
                    <circle
                      cx={riseX}
                      cy={horizonY}
                      r="3"
                      fill="white"
                      fillOpacity="0.6"
                    />
                    <circle
                      cx={noonX}
                      cy={dayPeakY}
                      r="2.5"
                      fill="white"
                      fillOpacity="0.4"
                    />
                    <circle
                      cx={setX}
                      cy={horizonY}
                      r="3"
                      fill="white"
                      fillOpacity="0.6"
                    />

                    {/* Sunrise / sunset labels */}
                    <text
                      x={riseX}
                      y={horizonY - 8}
                      textAnchor="middle"
                      fontSize="8"
                      fill="white"
                      fillOpacity="0.7"
                      fontFamily="-apple-system, sans-serif"
                    >
                      {riseLabel}
                    </text>
                    <text
                      x={setX}
                      y={horizonY - 8}
                      textAnchor="middle"
                      fontSize="8"
                      fill="white"
                      fillOpacity="0.7"
                      fontFamily="-apple-system, sans-serif"
                    >
                      {setLabel}
                    </text>

                    {/* Current sun position — ALWAYS visible */}
                    <circle
                      cx={nowX}
                      cy={nowY}
                      r={isDaytime ? 16 : 10}
                      fill="url(#sunGlow)"
                    />
                    <circle
                      cx={nowX}
                      cy={nowY}
                      r={isDaytime ? 7 : 5}
                      fill="#FFD700"
                      fillOpacity={isDaytime ? 1 : 0.5}
                      stroke="white"
                      strokeOpacity={isDaytime ? 1 : 0.5}
                      strokeWidth={isDaytime ? 1.5 : 1}
                    />

                    {/* Day length at bottom center */}
                    <text
                      x={svgW / 2}
                      y={svgH - 5}
                      textAnchor="middle"
                      fontSize="10"
                      fill="white"
                      fillOpacity="0.7"
                      fontFamily="-apple-system, sans-serif"
                    >
                      {astronomySection.dayLengthStr}
                    </text>
                  </svg>
                </div>

                {/* Right: Moon info */}
                <div className="astro-card">
                  <p style={{ fontSize: '3rem' }}>
                    {astronomySection.moonEmoji}
                  </p>
                  <p>{translateMoonPhase(astronomySection.moonPhase, lang)}</p>
                  <p>{astronomySection.moonIllumStr}</p>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
