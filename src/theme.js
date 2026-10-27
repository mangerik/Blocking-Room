export const THEME_KEY = 'blocking-room.theme';
export const THEMES = ['light', 'dark'];

const validTheme = value => THEMES.includes(value) ? value : null;

export function storedTheme() {
  try {return validTheme(localStorage.getItem(THEME_KEY));} catch {return null;}
}

export function systemTheme() {
  try {return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';} catch {return 'light';}
}

export function currentTheme() {
  return validTheme(document.documentElement.dataset.theme) ?? storedTheme() ?? systemTheme();
}

export function applyTheme(theme, {persist = false, announce = true} = {}) {
  const next = validTheme(theme) ?? 'light';
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  const color = next === 'dark' ? '#161915' : '#f5f4ef';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  if (persist) {
    try {localStorage.setItem(THEME_KEY, next);} catch {/* Preferensi tema tetap aktif untuk sesi ini. */}
  }
  if (announce) window.dispatchEvent(new CustomEvent('blocking-room:theme', {detail: {theme: next}}));
  return next;
}

export function initTheme() {
  return applyTheme(storedTheme() ?? systemTheme(), {announce: false});
}

export function toggleTheme() {
  return applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', {persist: true});
}

