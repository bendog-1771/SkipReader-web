import type { ThemeName, YujingSettings } from '../../shared/types';
export const themePalettes: Record<ThemeName, Record<string,string>>;
export function scenePalette(settings: Partial<YujingSettings> & {theme?:ThemeName}): Record<string,string>;
export function gamePalette(theme?:ThemeName): Record<string,string>;
