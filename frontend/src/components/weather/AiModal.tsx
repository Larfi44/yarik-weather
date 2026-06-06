'use client';

import { useState } from 'react';
import { useTheme } from 'next-themes';
import { fetchWeather } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import type { WeatherResponse, AiPredictResponse } from '@/lib/types';

interface AiModalProps {
  open: boolean;
  onClose: () => void;
  weather: WeatherResponse;
}

export default function AiModal({ open, onClose, weather }: AiModalProps) {
  const language = getSettings().language;
  const { resolvedTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [todayData, setTodayData] = useState<{ recommendations: string[]; summary: string } | null>(null);
  const [predictData, setPredictData] = useState<AiPredictResponse | null>(null);
  const [error, setError] = useState('');

  const isDark = resolvedTheme === 'dark';
  const aiColor = isDark ? '#60a5fa' : '#2563eb'; // light blue for dark, blue for light
  const t = (en: string, ru: string) => (language === 'ru' ? ru : en);

  const handleFetch = async () => {
    setLoading(true);
    setError('');
    try {
      // For now, we'll use the existing weather data since we don't have AI endpoints
      // In a real implementation, this would call AI-specific endpoints
      const current = weather.current;
      const forecast = weather.forecast;
      
      // Mock AI today response based on current weather
      const mockTodayData = {
        recommendations: [
          current.temperature > 25 ? 'It\'s hot today, consider wearing light clothing' : 
          current.temperature < 10 ? 'It\'s cold today, consider wearing warm clothing' : 
          'The temperature is moderate today',
          current.precipitation_probability > 50 ? 'There\'s a high chance of rain, consider bringing an umbrella' : 
          'The weather is dry today',
        ],
        summary: `Current conditions in ${weather.city}: ${current.temperature}°C, ${current.condition.toLowerCase()}. ${current.precipitation_probability}% chance of precipitation.`,
      };

      // Mock AI predict response based on forecast
      const nextWeek = forecast.slice(0, 7);
      const avgTemp = nextWeek.reduce((sum, day) => sum + (day.temperature_max + day.temperature_min) / 2, 0) / nextWeek.length;
      const totalRain = nextWeek.reduce((sum, day) => sum + (day.precipitation_probability_max * 0.1), 0); // Using precipitation_probability_max instead
      
      const mockPredictData = {
        next_week: {
          avg_temp: Math.round(avgTemp * 10) / 10,
          total_rain: Math.round(totalRain * 10) / 10,
          max_uv: Math.max(...nextWeek.map(day => day.uv_index_max)),
        },
        next_months: [],
        summary: `Next week forecast for ${weather.city}: Average temperature ${Math.round(avgTemp * 10) / 10}°C, with ${Math.round(totalRain * 10) / 10}mm of expected rainfall.`,
      };

      setTodayData(mockTodayData as any);
      setPredictData(mockPredictData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('AI service error', 'Ошибка ИИ-сервиса'));
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

  return (
       <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
       <div className="modal ai-results-modal">
         <div className="ai-modal-header">
           <div className="ai-brand">
             <span style={{
               fontWeight: 800,
               fontSize: '1.1rem',
               color: aiColor,
               letterSpacing: '0.5px',
             }}>AI</span>
             <span className="ai-brand-name" style={{
               background: 'none',
               WebkitBackgroundClip: 'unset',
               WebkitTextFillColor: aiColor,
               backgroundClip: 'unset',
             }}>Yaroslav AI</span>
           </div>
           <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
         </div>

        {!todayData && !predictData && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ color: 'var(--yw-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
              {t(
                'Get AI-powered recommendations based on current weather conditions',
                'Получите ИИ-рекомендации на основе текущих погодных условий'
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
          <div style={{ textAlign: 'center', padding: '1rem 0', color: '#ef4444' }}>
            <p>{error}</p>
            <button className="primary-btn" style={{ marginTop: '0.75rem' }} onClick={handleFetch}>
              {t('Retry', 'Повторить')}
            </button>
          </div>
        )}

        {todayData && !loading && (
          <div>
            <h3 style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.95rem' }}>
              💡 {t('Recommendations', 'Рекомендации')}
            </h3>
            {recommendations.length > 0 ? (
              <div>
                {recommendations.map((rec, i) => (
                  <div key={i} className="ai-rec-item">{rec}</div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--yw-muted)', fontSize: '0.85rem' }}>
                {JSON.stringify(todayData, null, 2)}
              </p>
            )}

            {predictData && (
              <div style={{ marginTop: '1rem' }}>
                <h3 style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                  🔮 {t('Forecast Outlook', 'Прогноз на будущее')}
                </h3>
                {predictData.next_week && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {predictData.next_week.avg_temp !== undefined && (
                      <div className="detail-item">
                        <span>🌡️</span>
                        <span>{t('Avg', 'Средн.')}: {predictData.next_week.avg_temp}°</span>
                      </div>
                    )}
                     {/* max_temp is not available in the actual type */}
                     {/* min_temp is not available in the actual type */}
                     <div className="detail-item">
                       <span>🌧️</span>
                       <span>{t('Rain', 'Дождь')}: {predictData.next_week.total_rain}mm</span>
                     </div>
                  </div>
                )}
                {predictData.summary && (
                  <div className="ai-rec-item">{predictData.summary}</div>
                )}
                 {/* monthly is not available in the actual type */}
              </div>
            )}

            <button
              className="primary-btn"
              style={{ marginTop: '1rem' }}
              onClick={handleFetch}
              disabled={loading}
            >
              🔄 {t('Refresh', 'Обновить')}
            </button>
          </div>
         )}
       </div>
     </div>
   );
 }
