import { expect, test, type Page } from '@playwright/test'

const SHOTS = process.env.SHOTS_DIR

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  await page.locator('.toast').waitFor({ state: 'detached', timeout: 6000 }).catch(() => undefined)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function onboard(page: Page) {
  await page.goto('/')
  await page.getByLabel('¿Cómo te llamamos?').fill('Julián')
  await page.getByLabel('Altura (cm)').fill('180')
  await page.getByTestId('onboard-start').click()
  await expect(page.getByText(/Buen día|Buenas tardes|Buenas noches/)).toBeVisible()
  // Guía de primer uso: visible una vez y se puede cerrar
  await expect(page.getByText('Cómo usar Lovely Fit')).toBeVisible()
  await page.getByRole('button', { name: 'Entendido' }).click()
  await expect(page.getByText('Cómo usar Lovely Fit')).toBeHidden()
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('sesión de fuerza completa: un toque, autoguardado, recuperación y meta semanal', async ({ page }) => {
  await onboard(page)
  await shot(page, '01-hoy')
  await page.goto('/entrenar/')
  await shot(page, '02-entrenar')
  await page.getByTestId('start-0').click()
  await expect(page.getByRole('heading', { name: 'A · Torso' })).toBeVisible()

  const first = page.getByTestId('exercise-card').first()
  await first.getByLabel('Kilos serie 1').fill('72,5')
  await first.getByTestId('set-check').first().click()
  await expect(page.getByTestId('rest-bar')).toBeVisible()
  await expect(page.getByTestId('save-state')).toContainText('Guardado en el teléfono')
  // Repes vacías + un toque = se completa con la sugerencia (rep mín = 8)
  await expect(first.getByLabel('Repeticiones serie 1')).toHaveValue('8')
  await shot(page, '03-sesion')

  // Recargar a mitad de sesión: nada se pierde
  await page.reload()
  const again = page.getByTestId('exercise-card').first()
  await expect(again.getByLabel('Kilos serie 1')).toHaveValue('72,5')
  await expect(again.getByTestId('set-check').first()).toHaveAttribute('aria-pressed', 'true')

  // Desde Hoy se ofrece continuar
  await page.goto('/')
  await page.getByTestId('resume-session').click()
  await expect(page.getByRole('heading', { name: 'A · Torso' })).toBeVisible()

  // Sustituir el segundo ejercicio
  const second = page.getByTestId('exercise-card').nth(1)
  await second.getByLabel('Opciones del ejercicio').click()
  await page.getByRole('button', { name: /Sustituir ejercicio/ }).click()
  await page.getByLabel('Buscar ejercicio').fill('remo sentado')
  await page.getByRole('button', { name: /Remo sentado en polea/ }).click()
  await expect(page.getByTestId('exercise-card').nth(1)).toContainText('en lugar de Remo con pecho apoyado')

  await page.getByTestId('finish').click()
  await page.getByRole('button', { name: '4', exact: true }).click()
  await page.getByTestId('finish-confirm').click()
  await expect(page.getByText('Resumen')).toBeVisible()
  await expect(page.getByText(/Terminada/)).toBeVisible()
  // Reabrir no puede crear dos sesiones en curso: acá no hay otra, así que reabre y se vuelve a cerrar
  await page.getByRole('button', { name: 'Reabrir' }).click()
  await page.getByTestId('finish').click()
  await page.getByTestId('finish-confirm').click()
  await expect(page.getByText(/Terminada/)).toBeVisible()

  await page.goto('/')
  await expect(page.getByTestId('week-count')).toContainText('1')
  await noHorizontalScroll(page)
})

test('registro offline: la app abre sin conexión y guarda comidas, peso y cardio', async ({ page, context }) => {
  await onboard(page)
  // Esperar a que el service worker termine de precachear
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return reg.active?.state
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await context.setOffline(true)
  await page.goto('/comidas/')
  await expect(page.getByRole('heading', { name: 'Comidas' })).toBeVisible()
  await page.getByTestId('add-meal').click()
  await page.getByRole('button', { name: 'Pollo con ensalada', exact: true }).click()
  await page.getByRole('button', { name: 'grande' }).click()
  await page.getByTestId('meal-save').click()
  await expect(page.getByText('Pollo con ensalada').first()).toBeVisible()
  await expect(page.getByText('sin estimación').first()).toBeVisible()
  await expect(page.getByTestId('kcal-summary')).toContainText('no mostramos un total')
  await shot(page, '04-comidas')

  await page.goto('/')
  await page.getByTestId('quick-weight').click()
  await page.getByTestId('measure-value').fill('82,4')
  await page.getByTestId('measure-save').click()
  await expect(page.getByText('82,4 kg')).toBeVisible()
  await expect(page.getByTestId('sync-badge')).toHaveAttribute('data-state', /local-only|offline|signed-out/)

  await page.goto('/entrenar/')
  await page.getByTestId('add-cardio').click()
  await page.getByTestId('act-min').fill('35')
  await page.getByTestId('act-save').click()
  await expect(page.getByText(/35 min/)).toBeVisible()

  // Reabrir sin conexión: todo sigue ahí
  await page.reload()
  await page.goto('/progreso/')
  await expect(page.getByText('82,4 kg')).toBeVisible()
  await shot(page, '05-progreso')
  await context.setOffline(false)
})

test('importación desde Atajos: confirma y no duplica', async ({ page }) => {
  await onboard(page)
  for (let i = 0; i < 2; i++) {
    await page.goto('/importar/?date=2026-10-16&steps=8.123')
    await expect(page.getByText('8123').or(page.getByText('8.123')).first()).toBeVisible()
    await page.getByTestId('import-confirm').click()
    await expect(page.getByRole('status').filter({ hasText: /Pasos: (nuevo|sin cambios)/ })).toBeVisible()
  }
  const count = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        const r = indexedDB.open('lovely-fit')
        r.onsuccess = () => {
          const q = r.result.transaction('dailyMetrics').objectStore('dailyMetrics').count()
          q.onsuccess = () => res(q.result)
        }
      }),
  )
  expect(count).toBe(1)
  await page.goto('/importar/?date=2026-13-40&steps=10')
  await expect(page.getByText('No se pudo leer el dato')).toBeVisible()
})

test('pantallas sin desborde horizontal en 390 px', async ({ page }) => {
  await onboard(page)
  for (const path of ['/', '/entrenar/', '/entrenar/plan/', '/entrenar/ejercicios/', '/comidas/', '/progreso/', '/datos/']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await noHorizontalScroll(page)
    if (path === '/datos/') await shot(page, '06-datos')
    if (path === '/entrenar/plan/') await shot(page, '07-plan')
  }
})

test('modo libre: elegir ejercicios tocando y registrar con botones', async ({ page }) => {
  await onboard(page)
  await page.goto('/entrenar/')
  await page.getByTestId('start-free').click()
  // La grilla se abre sola; filtrar por polea y elegir
  await page.getByRole('button', { name: 'polea', exact: true }).click()
  await page.getByTestId('exercise-tile').filter({ hasText: 'Jalón al pecho' }).click()
  const card = page.getByTestId('exercise-card').first()
  await expect(card).toContainText('Jalón al pecho')
  const stepper = card.getByTestId('set-stepper')
  await stepper.getByRole('button', { name: /Sumar 5 kg/ }).click()
  await stepper.getByRole('button', { name: /Sumar 5 kg/ }).click()
  await expect(card.getByLabel('Kilos serie 1')).toHaveValue('10')
  await card.getByTestId('set-check').first().click()
  // Segunda serie: "igual que la anterior"
  await card.getByTestId('repeat-set').click()
  await expect(card.getByLabel('Kilos serie 2')).toHaveValue('10')
  await expect(page.getByTestId('save-state')).toContainText('Guardado')
  await shot(page, '08-libre')
})

test('cargar una sesión que ya hice, con fecha', async ({ page }) => {
  await onboard(page)
  await page.goto('/entrenar/')
  await page.getByTestId('past-session').click()
  await page.getByTestId('past-create').click()
  await page.getByLabel('Buscar ejercicio').fill('prensa')
  await page.getByTestId('exercise-tile').filter({ hasText: 'Prensa de piernas' }).click()
  const card = page.getByTestId('exercise-card').first()
  await card.getByLabel('Kilos serie 1').fill('120')
  await card.getByTestId('set-check').first().click()
  await expect(page.getByTestId('rest-bar')).toHaveCount(0) // sesión pasada: sin descanso
  await page.goto('/')
  await expect(page.getByTestId('week-count')).toContainText('1')
})
