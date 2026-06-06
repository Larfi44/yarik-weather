export interface CurrentData {
  temperature: number;
  wind_speed: number;
  condition: string;
  pressure: number;
  sea_temperature: number | null;
  uv_index: number;
  precipitation_probability: number;
  latitude?: number;
  longitude?: number;
}

export interface HourlyData {
  date: string;
  time: string;
  temperature: number;
  wind_speed: number;
  condition: string;
  pressure: number;
  sea_temperature: number | null;
  uv_index: number;
  precipitation_probability: number;
}

export interface DailyData {
  date: string;
  temperature_max: number;
  temperature_min: number;
  wind_speed_max: number;
  condition: string;
  sunrise: string | null;
  sunset: string | null;
  moon_phase_name: string | null;
  moon_illumination: number | null;
  uv_index_max: number;
  precipitation_probability_max: number;
}

export interface WeatherResponse {
  city: string;
  current: CurrentData;
  hourly: HourlyData[];
  yesterday: DailyData;
  forecast: DailyData[];
  local_yesterday: string;
  local_today: string;
}

export interface AiPredictNextWeek {
  avg_temp: number;
  total_rain: number;
  max_uv: number;
}

export interface AiPredictMonth {
  month: number;
  avg_temp: number;
  total_rain: number;
  max_uv: number;
}

export interface AiPredictResponse {
  next_week: AiPredictNextWeek;
  next_months: AiPredictMonth[];
  summary: string;
}
