import { WeatherResponse } from './types';
import { TempUnit, WindUnit } from './settings';

const API_URL = 'https://bba456glbns2mjqupmls.containers.yandexcloud.net';

export async function fetchWeather(
  city: string,
  _tempUnit: TempUnit,
  _windUnit: WindUnit,
): Promise<WeatherResponse> {
  const url = `${API_URL}/?city=${encodeURIComponent(city)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API error ${resp.status}: ${text}`);
  }
  const data: WeatherResponse = await resp.json();
  return data;
}
