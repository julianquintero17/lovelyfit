import { expect, test, type Page } from '@playwright/test'

// UAT automática: en cada pantalla y en los dos temas
//  1) mide alineación (bases de campos en una misma fila, centros en filas) y desbordes
//  2) toca cada botón "seguro" (no destructivo) y verifica que no haya errores de la app

const PAGES = ['/', '/entrenar/', '/entrenar/plan/', '/entrenar/ejercicios/', '/comidas/', '/progreso/', '/datos/']
const DESTRUCTIVE = /borrar|descartar|quitar|cerrar sesión|eliminar|desconectar|cancelar|pausar|generar token|conectar salud|exportar|importar|desactivar|reabrir|terminar/i

async function setup(page: Page, theme: string) {
  await page.addInitScript((t) => localStorage.setItem('lf-theme', t), theme)
  await page.goto('/')
  await page.getByLabel('¿Cómo te llamamos?').fill('Julián')
  await page.getByTestId('onboard-start').click()
  await page.getByRole('button', { name: 'Entendido' }).click()
  // Una sesión con datos para que las pantallas no estén vacías
  await page.goto('/entrenar/')
  await page.getByTestId('start-0').click()
  const card = page.getByTestId('exercise-card').first()
  await card.getByLabel('Kilos serie 1').fill('70')
  await card.getByTestId('set-check').first().click()
}

async function layoutIssues(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const vw = document.documentElement.clientWidth
    const label = (el: Element) => (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.tagName).trim().slice(0, 40)
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
    }
    // Desbordes horizontales (fuera de las tiras de chips con scroll)
    for (const el of document.querySelectorAll('main button, main input, main select, main .card, main a')) {
      if (!visible(el) || el.closest('.scroll-x')) continue
      const r = el.getBoundingClientRect()
      if (r.left < -1 || r.right > vw + 1) out.push(`desborda la pantalla: ${label(el)}`)
      const card = el.parentElement?.closest('.card')
      if (card && !el.classList.contains('card')) {
        const c = card.getBoundingClientRect()
        if (r.right > c.right + 1 || r.left < c.left - 1) out.push(`se sale de su tarjeta: ${label(el)}`)
      }
    }
    // Bases: campos de una misma fila de grilla deben terminar a la misma altura
    for (const grid of document.querySelectorAll('main .grid2, main .grid3')) {
      const inputs = [...grid.querySelectorAll(':scope > label.field > .input')].filter(visible)
      const rows = new Map<number, number[]>()
      for (const i of inputs) {
        const r = i.getBoundingClientRect()
        const row = Math.round(r.top / 40)
        rows.set(row, [...(rows.get(row) ?? []), r.bottom])
      }
      const bottoms = inputs.map((i) => i.getBoundingClientRect())
      for (let a = 0; a < bottoms.length; a++)
        for (let b = a + 1; b < bottoms.length; b++) {
          const A = bottoms[a], B = bottoms[b]
          const sameRow = A.top < B.bottom && B.top < A.bottom
          const offRow = Math.abs(A.bottom - B.bottom) > 2 && Math.abs(A.top - B.top) < 60
          if (sameRow || offRow) if (Math.abs(A.bottom - B.bottom) > 2) out.push(`campos desalineados (${Math.round(Math.abs(A.bottom - B.bottom))}px): ${label(inputs[a].parentElement!)} / ${label(inputs[b].parentElement!)}`)
        }
    }
    // Centros: en filas .row/.setrow/.stepper-row los controles deben estar centrados entre sí
    for (const row of document.querySelectorAll('main .row, main .setrow, main .stepper-row, main .sethead')) {
      const kids = [...row.children].filter((k) => visible(k) && /BUTTON|INPUT|SPAN|A|SELECT/.test(k.tagName))
      const rs = kids.map((k) => k.getBoundingClientRect())
      for (let a = 0; a < rs.length; a++)
        for (let b = a + 1; b < rs.length; b++) {
          const A = rs[a], B = rs[b]
          if (!(A.top < B.bottom && B.top < A.bottom)) continue // distinta línea (wrap)
          const d = Math.abs((A.top + A.bottom) / 2 - (B.top + B.bottom) / 2)
          if (d > 3 && getComputedStyle(row).alignItems === 'center') out.push(`no centrados (${Math.round(d)}px): ${label(kids[a])} / ${label(kids[b])}`)
        }
    }
    return [...new Set(out)]
  })
}

for (const theme of ['claro', 'verde']) {
  test(`UAT ${theme}: alineación y todos los botones`, async ({ page }) => {
    test.setTimeout(240_000)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(`${page.url()}: ${m.text()}`))
    page.on('dialog', (d) => d.dismiss())
    await setup(page, theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

    const issues: string[] = []
    let clicked = 0
    for (const path of PAGES) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/uat-${theme}${path.replace(/\//g, '_')}.png`, fullPage: true })
      issues.push(...(await layoutIssues(page)).map((i) => `${path} ${i}`))

      const count = await page.locator('main button:visible').count()
      for (let i = 0; i < count; i++) {
        const btn = page.locator('main button:visible').nth(i)
        if (!(await btn.count())) break
        const name = ((await btn.getAttribute('aria-label')) || (await btn.innerText())).trim()
        if (DESTRUCTIVE.test(name) || (await btn.isDisabled())) continue
        await btn.click({ timeout: 3000 }).catch(() => undefined)
        clicked++
        // Si abrió una hoja, revisar su alineación y cerrarla
        if (await page.locator('.sheet').count()) {
          issues.push(...(await page.evaluate(() => {
            const out: string[] = []
            const sheet = document.querySelector('.sheet')!
            for (const grid of sheet.querySelectorAll('.grid2, .grid3')) {
              const ins = [...grid.querySelectorAll(':scope > label.field > .input')].map((x) => x.getBoundingClientRect())
              for (let a = 0; a < ins.length; a++) for (let b = a + 1; b < ins.length; b++)
                if (Math.abs(ins[a].top - ins[b].top) < 60 && Math.abs(ins[a].bottom - ins[b].bottom) > 2) out.push(`hoja "${sheet.getAttribute('aria-label')}": campos desalineados`)
            }
            return out
          })).map((i) => `${path} ${i}`))
          await page.keyboard.press('Escape')
        }
        if (new URL(page.url()).pathname !== path) {
          await page.goto(path)
          await page.waitForLoadState('networkidle')
        }
      }
    }
    console.log(`[${theme}] botones tocados: ${clicked}`)
    expect.soft([...new Set(issues)], 'problemas de alineación').toEqual([])
    expect(errors, 'errores de la app').toEqual([])
  })
}
