'use client';

import { useState } from 'react';
import { assetUrl } from '@/lib/assets';
import { isCoastal } from '@/lib/coastal';
import { fetchWeather } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import type { WeatherResponse, AiPredictResponse } from '@/lib/types';

interface AiModalProps {
  open: boolean;
  onClose: () => void;
  weather: WeatherResponse;
  theme?: 'light' | 'dark';
}

// ── Scoring helpers matching ai_service.py ──────────────────────────

function rainFlag(cond: string, prob: number): number {
  const c = cond.toLowerCase();
  return c.includes('rain') || c.includes('drizzle') || prob >= 30 ? 1 : 0;
}

function comfortScore(
  temp: number,
  wind: number,
  uv: number,
  prob: number,
  isRain: number,
): number {
  const probFraction = prob / 100;
  const s =
    10 -
    Math.abs(temp - 21) * 0.15 -
    wind * 0.2 -
    probFraction * 2 -
    Math.max(0, uv - 8) * 0.5 -
    (isRain ? 2 : 0);
  return Math.round(Math.max(0, Math.min(10, s)) * 10) / 10;
}

function walkScore(
  temp: number,
  wind: number,
  uv: number,
  prob: number,
  isRain: number,
): number {
  const probFraction = prob / 100;
  const s =
    10 -
    Math.abs(temp - 18) * 0.2 -
    wind * 0.2 -
    probFraction * 2 -
    (isRain ? 2 : 0) -
    (uv > 8 ? 1.5 : 0);
  return Math.round(Math.max(0, Math.min(10, s)) * 10) / 10;
}

function swimScore(
  temp: number,
  seaTemp: number | null,
  month: number,
  isRain: number,
  coastal: boolean,
): number {
  if (!coastal || !seaTemp || seaTemp <= 17) return 0;
  let s = 5 + (temp - 20) * 0.15;
  // Summer months bonus
  if ([6, 7, 8].includes(month)) s += 1.5;
  // Winter months penalty
  if ([11, 12, 1, 2, 3].includes(month)) s -= 2;
  if (isRain) s -= 2;
  return Math.round(Math.max(0, Math.min(10, s)) * 10) / 10;
}

/** Translate common Open-Meteo condition strings to Russian (for the AI summary). */
function translateCondition(cond: string, lang: string): string {
  if (lang !== 'ru') return cond;
  const map: Record<string, string> = {
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
  return map[cond.toLowerCase()] ?? cond;
}

export default function AiModal({
  open,
  onClose,
  weather,
  theme,
}: AiModalProps) {
  const language = getSettings().language;
  const resolvedTheme = theme ?? 'light';
  const [loading, setLoading] = useState(false);
  const [todayData, setTodayData] = useState<{
    recommendations: string[];
    summary: string;
    comfortScore: number;
    walkScore: number;
    swimScore: number;
  } | null>(null);
  const [predictData, setPredictData] = useState<AiPredictResponse | null>(
    null,
  );
  const [error, setError] = useState('');

  const isDark = resolvedTheme === 'dark';
  const aiColor = isDark ? '#60a5fa' : '#2563eb'; // light blue for dark, blue for light
  const t = (en: string, ru: string) => (language === 'ru' ? ru : en);

  const handleFetch = async () => {
    setLoading(true);
    setError('');
    try {
      const current = weather.current;
      const forecast = weather.forecast;
      const now = new Date();
      const month = now.getMonth() + 1; // 1-indexed to match ai_service.py

      const cond = current.condition.toLowerCase();
      const isRain = rainFlag(
        current.condition,
        current.precipitation_probability,
      );
      const coastal = isCoastal(weather.city);

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

      // ── Recommendations ──
      const tips: string[] = [];

      // Scores first (so they show at the top of recommendations)
      tips.push(t(`⭐ Comfort: ${cScore}/10`, `⭐ Комфорт: ${cScore}/10`));
      tips.push(t(`🚶 Walk: ${wScore}/10`, `🚶 Прогулка: ${wScore}/10`));

      // Clothing tips (matching ai_service.py)
      if (cond.includes('rain') || cond.includes('drizzle')) {
        if (cond.includes('heavy') || cond.includes('violent')) {
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
      } else if (cond.includes('snow')) {
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

      // Swim (matching ai_service.py)
      if (coastal) {
        if (current.sea_temperature != null && current.sea_temperature > 17) {
          tips.push(
            t(
              `🏊 Swim: ${sScore}/10 (water ${current.sea_temperature.toFixed(0)}°C)`,
              `🏊 Купание: ${sScore}/10 (вода ${current.sea_temperature.toFixed(0)}°C)`,
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

      // Best times from hourly data (matching ai_service.py)
      if (weather.hourly && weather.hourly.length > 0) {
        let bestWalkTime = '';
        let bestWalkScoreVal = -1;
        let bestSwimTime = '';
        let bestSwimScoreVal = -1;
        const nowHour = now.getHours();

        for (const h of weather.hourly) {
          const hIsRain = rainFlag(h.condition, h.precipitation_probability);
          const hWalk = walkScore(
            h.temperature,
            h.wind_speed,
            h.uv_index,
            h.precipitation_probability,
            hIsRain,
          );
          if (hWalk > bestWalkScoreVal) {
            bestWalkScoreVal = hWalk;
            bestWalkTime = h.time;
          }

          // Best swim time (like ai_service.py's logic: between 10:00-18:00)
          const hHour = h.time ? parseInt(h.time.split(':')[0], 10) : nowHour;
          if (
            coastal &&
            current.sea_temperature != null &&
            current.sea_temperature > 17 &&
            hHour >= 10 &&
            hHour <= 18
          ) {
            const hSwim = swimScore(
              h.temperature,
              current.sea_temperature,
              month,
              hIsRain,
              coastal,
            );
            if (hSwim > bestSwimScoreVal) {
              bestSwimScoreVal = hSwim;
              bestSwimTime = h.time;
            }
          }
        }

        if (bestWalkTime) {
          tips.push(
            t(
              `🚶 Best walk time: ${bestWalkTime}`,
              `🚶‍♂️ Лучшее время для прогулки: ${bestWalkTime}`,
            ),
          );
        }
        if (bestSwimTime) {
          tips.push(
            t(
              `🏊 Best swim time: ${bestSwimTime}`,
              `🏊 Лучшее время для купания: ${bestSwimTime}`,
            ),
          );
        }
      }

      // ── Forecast outlook matching ai_service.py predict logic ──
      // ai_service.py: predict_period uses climate monthly averages + trends
      // For frontend mock, we use forecast data as climate proxy

      // Next week prediction
      const nextWeekDays = forecast.slice(0, 7);
      const weekAvgTemp =
        nextWeekDays.reduce(
          (sum, day) => sum + (day.temperature_max + day.temperature_min) / 2,
          0,
        ) / nextWeekDays.length;
      const weekTotalRain = nextWeekDays.reduce(
        (sum, day) => sum + day.precipitation_probability_max * 0.1,
        0,
      );
      const weekMaxUv = Math.max(
        ...nextWeekDays.map((day) => day.uv_index_max),
      );

      const mockPredictData: AiPredictResponse = {
        next_week: {
          avg_temp: Math.round(weekAvgTemp * 10) / 10,
          total_rain: Math.round(weekTotalRain * 10) / 10,
          max_uv: Math.round(weekMaxUv * 10) / 10,
        },
        next_months: [],
        summary: t(
          `Next week in ${weather.city}: Avg ${Math.round(weekAvgTemp * 10) / 10}°C, ${Math.round(weekTotalRain * 10) / 10}mm rain, max UV ${Math.round(weekMaxUv * 10) / 10}.`,
          `На следующей неделе в ${weather.city}: Средняя температура ${Math.round(weekAvgTemp * 10) / 10}°C, ${Math.round(weekTotalRain * 10) / 10}мм дождя, макс. Ультрафиолет ${Math.round(weekMaxUv * 10) / 10}.`,
        ),
      };

      // Next 6 months prediction (matching ai_service.py: predict_period with monthly averaging)
      // Use forecast monthly aggregates as climate proxy
      const forecastByMonth: Record<
        number,
        { temps: number[]; rains: number[]; uvs: number[] }
      > = {};
      for (const day of forecast) {
        const d = new Date(day.date);
        const m = d.getMonth() + 1;
        if (!forecastByMonth[m])
          forecastByMonth[m] = { temps: [], rains: [], uvs: [] };
        forecastByMonth[m].temps.push(
          (day.temperature_max + day.temperature_min) / 2,
        );
        forecastByMonth[m].rains.push(day.precipitation_probability_max * 0.1);
        forecastByMonth[m].uvs.push(day.uv_index_max);
      }

      for (let offset = 1; offset <= 6; offset++) {
        const targetMonth = ((now.getMonth() + offset) % 12) + 1;
        const targetYear =
          now.getFullYear() + (now.getMonth() + offset >= 12 ? 1 : 0);

        // Climate-based estimation like ai_service.py
        if (forecastByMonth[targetMonth]) {
          // Use available forecast data for this month
          const data = forecastByMonth[targetMonth];
          const avgTemp =
            data.temps.reduce((a, b) => a + b, 0) / data.temps.length;
          const totalRain = data.rains.reduce((a, b) => a + b, 0);
          const maxUv = Math.max(...data.uvs);

          mockPredictData.next_months.push({
            month: targetMonth,
            avg_temp: Math.round(avgTemp * 10) / 10,
            total_rain: Math.round(totalRain * 10) / 10,
            max_uv: Math.min(12, Math.round(maxUv * 10) / 10),
          });
        } else {
          // Fallback: smooth seasonal climate model when no forecast data
          // exists for that month yet. July is the warmest month in the
          // northern hemisphere (January in the south), and UV follows the
          // same seasonal curve; rain peaks in the transition months.
          const lat = weather.current.latitude ?? 0;
          const peakMonth = lat < 0 ? 1 : 7; // hemisphere-aware warmest month
          // 1.0 in the warmest month, -1.0 half a year later
          const seasonal = Math.cos(
            ((targetMonth - peakMonth) / 12) * 2 * Math.PI,
          );

          const avgTemp = Math.round((weekAvgTemp + seasonal * 8) * 10) / 10;
          const maxUv = Math.min(
            12,
            Math.max(
              1,
              Math.round(
                weekMaxUv * (0.35 + 0.65 * ((seasonal + 1) / 2)) * 10,
              ) / 10,
            ),
          );
          // Wetter in spring/autumn, drier at the temperature extremes
          const rainFactor = 0.6 + 0.9 * (1 - Math.abs(seasonal));
          const totalRain =
            Math.round(Math.max(0, weekTotalRain * 3 * rainFactor) * 10) / 10;

          mockPredictData.next_months.push({
            month: targetMonth,
            avg_temp: avgTemp,
            total_rain: totalRain,
            max_uv: maxUv,
          });
        }
      }

      setTodayData({
        recommendations: tips,
        summary: t(
          `Current conditions in ${weather.city}: ${current.temperature}°C, ${current.condition.toLowerCase()}. ${current.precipitation_probability}% chance of precipitation.`,
          `Текущие условия в городе ${weather.city}: ${current.temperature}°C, ${translateCondition(current.condition, language)}. Вероятность осадков ${current.precipitation_probability}%.`,
        ),
        comfortScore: cScore,
        walkScore: wScore,
        swimScore: sScore,
      });
      setPredictData(mockPredictData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('AI service error', 'Ошибка ИИ-сервиса'),
      );
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  // Extract recommendations from todayData
  const recommendations: string[] = [];
  if (todayData) {
    if (Array.isArray(todayData.recommendations)) {
      recommendations.push(...todayData.recommendations);
    }
    if (todayData.summary && typeof todayData.summary === 'string') {
      recommendations.push(todayData.summary);
    }
  }

  const monthNames =
    language === 'ru'
      ? [
          'Янв',
          'Фев',
          'Мар',
          'Апр',
          'Май',
          'Июн',
          'Июл',
          'Авг',
          'Сен',
          'Окт',
          'Ноя',
          'Дек',
        ]
      : [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal ai-results-modal">
        <div className="ai-modal-header">
          <div
            className="ai-brand"
            style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <img
              src={assetUrl('/yaroslav_ai.svg')}
              alt="AI"
              style={{ width: '32px', height: '32px' }}
            />
            <span
              className="ai-brand-name"
              style={{
                background: 'none',
                WebkitBackgroundClip: 'unset',
                WebkitTextFillColor: aiColor,
                backgroundClip: 'unset',
              }}
            >
              Yaroslav AI
            </span>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
            style={{ cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {!todayData && !predictData && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p
              style={{
                color: 'var(--yw-muted)',
                marginBottom: '1rem',
                fontSize: '0.9rem',
              }}
            >
              {t(
                'Get AI-powered recommendations based on current weather conditions',
                'Получите ИИ-рекомендации на основе текущих погодных условий',
              )}
            </p>
            <button className="primary-btn" onClick={handleFetch}>
              🧠 {t('Use Yaroslav AI', 'Использовать Yaroslav AI')}
            </button>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🤔</div>
            <p style={{ color: 'var(--yw-muted)' }}>
              {t('Thinking...', 'Думаю...')}
            </p>
          </div>
        )}

        {error && (
          <div
            style={{ textAlign: 'center', padding: '1rem 0', color: '#ef4444' }}
          >
            <p>{error}</p>
            <button
              className="primary-btn"
              style={{ marginTop: '0.75rem' }}
              onClick={handleFetch}
            >
              {t('Retry', 'Повторить')}
            </button>
          </div>
        )}

        {todayData && !loading && (
          <div>
            <h3
              style={{
                fontWeight: 600,
                marginBottom: '0.5rem',
                fontSize: '0.95rem',
              }}
            >
              💡 {t('Recommendations', 'Рекомендации')}
            </h3>
            {recommendations.length > 0 ? (
              <div>
                {recommendations.map((rec, i) => (
                  <div key={i} className="ai-rec-item">
                    {rec}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--yw-muted)', fontSize: '0.85rem' }}>
                {JSON.stringify(todayData, null, 2)}
              </p>
            )}

            {predictData && (
              <div style={{ marginTop: '1rem' }}>
                <h3
                  style={{
                    fontWeight: 600,
                    marginBottom: '0.75rem',
                    fontSize: '0.95rem',
                  }}
                >
                  🔮 {t('Forecast Outlook', 'Прогноз на будущее')}
                </h3>

                {/* ── Next Week ── */}
                <div
                  style={{
                    background: 'var(--yw-card-bg)',
                    borderRadius: '8px',
                    padding: '0.6rem 0.75rem',
                    marginBottom: '0.75rem',
                    border: '1px solid var(--yw-border)',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      marginBottom: '0.4rem',
                    }}
                  >
                    📅 {t('Next Week', 'Следующая неделя')}
                  </div>
                  {predictData.next_week && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                      }}
                    >
                      <div style={{ fontSize: '0.85rem' }}>
                        🌡️ {t('Avg', 'Средняя температура')}:{' '}
                        {predictData.next_week.avg_temp}°
                      </div>
                      <div style={{ fontSize: '0.85rem' }}>
                        🌧️ {t('Rain', 'Дождь')}:{' '}
                        {predictData.next_week.total_rain}mm
                      </div>
                      <div style={{ fontSize: '0.85rem' }}>
                        ☀️ {t('Max UV', 'Макс. Ультрафиолет')}:{' '}
                        {predictData.next_week.max_uv}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Next Months ── */}
                {predictData.next_months &&
                  predictData.next_months.length > 0 && (
                    <>
                      <h4
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          marginBottom: '0.5rem',
                          marginTop: '0.25rem',
                        }}
                      >
                        📅 {t('Next Months', 'Следующие месяцы')}
                      </h4>
                      {predictData.next_months.map((m, i) => (
                        <div
                          key={i}
                          style={{
                            background: 'var(--yw-card-bg)',
                            borderRadius: '8px',
                            padding: '0.6rem 0.75rem',
                            marginBottom: '0.5rem',
                            border: '1px solid var(--yw-border)',
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: '0.9rem',
                              marginBottom: '0.4rem',
                            }}
                          >
                            📅 {monthNames[(m.month - 1) % 12]}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.25rem',
                            }}
                          >
                            <div style={{ fontSize: '0.85rem' }}>
                              🌡️ {t('Avg', 'Средняя температура')}: {m.avg_temp}
                              °
                            </div>
                            <div style={{ fontSize: '0.85rem' }}>
                              🌧️ {t('Rain', 'Дождь')}: {m.total_rain}mm
                            </div>
                            <div style={{ fontSize: '0.85rem' }}>
                              ☀️ {t('Max UV', 'Макс. Ультрафиолет')}: {m.max_uv}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
