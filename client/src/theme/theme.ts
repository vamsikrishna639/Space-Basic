// Appearance (SPEC.md, Settings > Appearance): System | Light | Dark, persisted on this device. "System" follows
// the phone's light/dark setting. Auth screens are always light; in-app screens read the [data-theme] tokens.

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'sb.appearance';

export function storedChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function saveChoice(choice: ThemeChoice): void {
  try { localStorage.setItem(KEY, choice); } catch { /* private mode: keep it for this session only */ }
  applyTheme(choice);
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): 'light' | 'dark' {
  return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
}

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function applyTheme(choice: ThemeChoice = storedChoice()): void {
  document.documentElement.dataset.theme = resolveTheme(choice, media?.matches ?? false);
}

/** Apply now and follow the phone's setting while "System" is chosen. */
export function initTheme(): void {
  applyTheme();
  media?.addEventListener('change', () => applyTheme());
}
