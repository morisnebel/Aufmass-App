import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// Tageszeit nach lokaler Geräteuhr: Morgen 05–10:59, Tag 11–16:59, Abend 17–20:59, Nacht 21–04:59
export type DayPeriod = 'morning' | 'day' | 'evening' | 'night';

export const getDayPeriod = (date: Date = new Date()): DayPeriod => {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'day';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
};

export const GREETINGS: Record<DayPeriod, string> = {
  morning: 'Guten Morgen',
  day: 'Guten Tag',
  evening: 'Guten Abend',
  night: 'Gute Nacht',
};

// Aktualisiert sich jede Minute und beim Zurückkehren in die App
export function useDayPeriod(): DayPeriod {
  const [period, setPeriod] = useState<DayPeriod>(getDayPeriod());
  useEffect(() => {
    const update = () => setPeriod(getDayPeriod());
    const timer = setInterval(update, 60 * 1000);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') update(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, []);
  return period;
}
