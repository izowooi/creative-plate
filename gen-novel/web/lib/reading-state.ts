export type Preferences = { theme: 'light' | 'sepia' | 'dark'; font: 'sans' | 'serif'; size: number; leading: number };
export type ReadingPosition = { episodeId: string; progress: number; paragraph: number; updatedAt: number };
export const defaultPreferences: Preferences = { theme: 'light', font: 'sans', size: 19, leading: 1.95 };
export const preferenceKey = 'novel-reader:preferences:v1';
export const positionKey = (book: string) => `novel-reader:position:v1:${book}`;

export function parsePreferences(raw: string | null): Preferences {
  try {
    const value = JSON.parse(raw ?? '{}');
    return {
      theme: ['light', 'sepia', 'dark'].includes(value?.theme) ? value.theme : 'light',
      font: value?.font === 'serif' ? 'serif' : 'sans',
      size: typeof value?.size === 'number' && Number.isFinite(value.size) ? Math.max(16, Math.min(28, value.size)) : 19,
      leading: [1.65, 1.95, 2.3].includes(value?.leading) ? value.leading : 1.95,
    };
  } catch { return { ...defaultPreferences }; }
}
export function parsePosition(raw: string | null): ReadingPosition | null {
  try {
    const p = JSON.parse(raw ?? 'null');
    if (!p || typeof p.episodeId !== 'string' || !/^ep-\d+$/.test(p.episodeId) ||
      typeof p.progress !== 'number' || !Number.isFinite(p.progress) ||
      !Number.isSafeInteger(p.paragraph) || p.paragraph < 0 || !Number.isFinite(p.updatedAt)) return null;
    return { ...p, progress: Math.max(0, Math.min(100, p.progress)) };
  } catch { return null; }
}
export function localRead(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
export function localWrite(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
