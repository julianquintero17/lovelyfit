// Tema por dispositivo: 'claro' (crema), 'verde' (oscuro, invertido) o 'auto' (sigue al sistema).
export type Theme = 'claro' | 'verde' | 'auto'

const KEY = 'lf-theme'
const BG: Record<'claro' | 'verde', string> = { claro: '#FEF8EF', verde: '#1E2617' }

/** Corre antes del primer pintado: resuelve 'auto' y deja el atributo listo. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${KEY}')||'claro';var d=t==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'verde':'claro'):t;document.documentElement.setAttribute('data-theme',d);document.documentElement.setAttribute('data-theme-pref',t)}catch(e){}})()`

export function getTheme(): Theme {
  try {
    return (localStorage.getItem(KEY) as Theme) || 'claro'
  } catch {
    return 'claro'
  }
}

export function applyTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* sin storage: se aplica solo en esta sesión */
  }
  const resolved = t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'verde' : 'claro') : t
  document.documentElement.setAttribute('data-theme', resolved)
  document.documentElement.setAttribute('data-theme-pref', t)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', BG[resolved]))
}
