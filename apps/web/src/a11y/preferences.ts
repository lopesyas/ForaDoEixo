const KEY = 'a11y-preferences';
export const TEXT_STEPS = [1, 1.15, 1.3, 1.5] as const;

export interface Preferences {
  textStep: number; // índice em TEXT_STEPS
  highContrast: boolean;
}

export const defaultPreferences: Preferences = { textStep: 0, highContrast: false };

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultPreferences;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    const step = Number(parsed.textStep);
    return {
      textStep: Number.isInteger(step) && step >= 0 && step < TEXT_STEPS.length ? step : 0,
      highContrast: parsed.highContrast === true,
    };
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(p: Preferences) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function applyPreferences(p: Preferences, root: HTMLElement = document.documentElement) {
  root.style.setProperty('--text-scale', String(TEXT_STEPS[p.textStep] ?? 1));
  if (p.highContrast) root.setAttribute('data-contrast', 'high');
  else root.removeAttribute('data-contrast');
}
