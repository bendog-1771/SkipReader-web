import type { YujingSettings } from '../../shared/types';

export type LightMood = Exclude<YujingSettings['mood'], 'auto'>;
// A local-time artistic clock, not an astronomical sunrise calculation.
export function localLight(date = new Date()): LightMood {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}
