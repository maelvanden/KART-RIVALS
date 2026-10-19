import { useQuery } from '@tanstack/react-query';

import type { IconName } from '@/components/ui/icon';
import { icons } from '@/components/ui/icon';

/** Météo d'un circuit outdoor : Open-Meteo, gratuit et sans clé. */
export type TrackWeather = {
  temperature: number;
  wind: number;
  code: number;
  /** Pluie tombée sur les 6 dernières heures (mm). */
  rainLast6h: number;
  /** Il pleut en ce moment (mm sur l'heure en cours). */
  rainingNow: boolean;
  /** Probabilité de pluie max sur les 3 prochaines heures (%). */
  rainSoon: number;
  days: { date: string; code: number; min: number; max: number; rain: number }[];
};

type Response = {
  current: { temperature_2m: number; precipitation: number; weather_code: number; wind_speed_10m: number; time: string };
  hourly: { time: string[]; precipitation: number[]; precipitation_probability: number[] };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
};

export function useTrackWeather(coords: { lat: number; lng: number } | null) {
  return useQuery({
    queryKey: ['weather', coords?.lat, coords?.lng],
    enabled: !!coords,
    staleTime: 15 * 60_000,
    retry: 1,
    queryFn: async (): Promise<TrackWeather> => {
      const params = new URLSearchParams({
        latitude: String(coords!.lat),
        longitude: String(coords!.lng),
        current: 'temperature_2m,precipitation,weather_code,wind_speed_10m',
        hourly: 'precipitation,precipitation_probability',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        past_hours: '6',
        forecast_hours: '4',
        forecast_days: '4',
        timezone: 'Europe/Paris',
      });
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!res.ok) throw new Error('Météo indisponible.');
      const data = (await res.json()) as Response;
      const now = data.current.time;
      const h = data.hourly;
      let rainLast6h = 0;
      let rainSoon = 0;
      h.time.forEach((t, i) => {
        if (t <= now) rainLast6h += h.precipitation[i] ?? 0;
        else rainSoon = Math.max(rainSoon, h.precipitation_probability[i] ?? 0);
      });
      return {
        temperature: Math.round(data.current.temperature_2m),
        wind: Math.round(data.current.wind_speed_10m),
        code: data.current.weather_code,
        rainLast6h: Math.round(rainLast6h * 10) / 10,
        rainingNow: data.current.precipitation > 0,
        rainSoon,
        days: data.daily.time.map((date, i) => ({
          date,
          code: data.daily.weather_code[i],
          min: Math.round(data.daily.temperature_2m_min[i]),
          max: Math.round(data.daily.temperature_2m_max[i]),
          rain: data.daily.precipitation_probability_max[i] ?? 0,
        })),
      };
    },
  });
}

/** Code météo WMO → libellé et icône. */
export function weatherLabel(code: number): { label: string; icon: IconName } {
  if (code === 0) return { label: 'Ensoleillé', icon: icons.sun };
  if (code <= 2) return { label: 'Éclaircies', icon: icons.partlyCloudy };
  if (code === 3) return { label: 'Couvert', icon: icons.cloud };
  if (code <= 48) return { label: 'Brouillard', icon: icons.fog };
  if (code <= 57) return { label: 'Bruine', icon: icons.rain };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: 'Pluie', icon: icons.rain };
  if (code <= 77 || code === 85 || code === 86) return { label: 'Neige', icon: icons.snow };
  return { label: 'Orage', icon: icons.storm };
}

/** État probable de la piste pour rouler. */
export function trackCondition(w: TrackWeather): { label: string; tone: 'dry' | 'wet' | 'warn' } {
  if (w.rainingNow) return { label: 'Il pleut : piste mouillée', tone: 'wet' };
  if (w.rainLast6h >= 0.5) return { label: 'Piste probablement humide', tone: 'wet' };
  if (w.rainSoon >= 50) return { label: `Pluie probable dans les 3 h (${w.rainSoon} %)`, tone: 'warn' };
  return { label: 'Piste sèche', tone: 'dry' };
}
