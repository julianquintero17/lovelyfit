# Calidad

## Automático (todo pasa)
- `npm test` — 20 pruebas: fechas en Buenos Aires, semana lunes–domingo, progresión, estadísticas,
  pasos sin sumar fuentes, sin datos ≠ 0, meta de pasos, importación sin duplicados, GPX, guardado local,
  seed, respaldo/importación LWW, mapeo de sync.
- `npm run test:e2e` — 4 pruebas en Chromium (viewport iPhone 13): sesión completa con recarga y
  recuperación, sustitución, meta semanal; **modo sin conexión** (comida, peso, cardio, reapertura);
  importación Atajos sin duplicar; sin desborde horizontal en todas las pantallas.
- `bash supabase/tests/run.sh` — migración en Postgres 16 + RLS: otro usuario no lee/escribe/suplanta,
  fotos aisladas por carpeta, anónimo sin acceso, escritura vieja ignorada (LWW).

No probado aquí: Safari/WebKit real, iPhone, Supabase real (no hay proyecto asignado).

## Checklist manual en iPhone
1. Instalar desde Safari → abrir desde el ícono.
2. Empezar → Hoy muestra el día del plan.
3. Iniciar sesión, completar 2 series con un toque, cerrar la app a la fuerza, reabrir → "Continuar sesión" con todo.
4. Modo avión → abrir la app → registrar comida con foto, peso y caminata → reabrir → siguen.
5. Terminar sesión → Hoy muestra 1/4.
6. Exportar respaldo → se descarga el JSON.
7. (Con nube) Entrar con código → badge "Sincronizado" → segundo dispositivo ve los datos.
8. Fechas: registrar algo a las 23:30 → queda en ese día.
