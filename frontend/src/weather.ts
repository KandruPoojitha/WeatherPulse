import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun } from 'lucide-react';
export function describeWeather(code: number | null, isDay = true) {
  if (code === 0) return { label: 'Clear sky', Icon: isDay ? Sun : Moon };
  if (code === 1) return { label: 'Mainly clear', Icon: isDay ? CloudSun : CloudMoon };
  if (code === 2) return { label: 'Partly cloudy', Icon: isDay ? CloudSun : CloudMoon };
  if (code === 3) return { label: 'Overcast', Icon: Cloud };
  if (code === 45 || code === 48) return { label: 'Foggy', Icon: CloudFog };
  if ([51, 53, 55, 56, 57].includes(code ?? -1)) return { label: 'Drizzle', Icon: CloudDrizzle };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code ?? -1)) return { label: 'Rainy', Icon: CloudRain };
  if ([71, 73, 75, 77, 85, 86].includes(code ?? -1)) return { label: 'Snowy', Icon: CloudSnow };
  if ([95, 96, 99].includes(code ?? -1)) return { label: 'Thunderstorm', Icon: CloudLightning };
  return { label: 'Weather conditions', Icon: CloudSun };
}
export const degrees = (value: number | null | undefined) => value == null ? '—' : `${Math.round(value)}°`;
export const number = (value: number | null | undefined, suffix = '') => value == null ? '—' : `${Math.round(value)}${suffix}`;
export const localHour = (s: string) => { const hour = Number(s.slice(11, 13)); return `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`; };
export const localClock = (s: string) => { const hr = Number(s.slice(11, 13)); return `${hr % 12 || 12}:${s.slice(14, 16)} ${hr >= 12 ? 'PM' : 'AM'}`; };
export const weekday = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
export function windDirection(deg: number | null) { if (deg == null) return '—'; return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]; }
