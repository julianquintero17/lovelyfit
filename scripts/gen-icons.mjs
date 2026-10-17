// Genera íconos PNG a partir de un SVG provisorio (monograma, NO es un logo aprobado).
import { chromium } from '@playwright/test'

const svg = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#435229"/>
  <circle cx="50" cy="50" r="${34 - pad}" fill="none" stroke="#FEF8EF" stroke-width="2.5"/>
  <text x="50" y="${61 - pad * 0.1}" text-anchor="middle" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="${30 - pad * 0.6}" fill="#FEF8EF" letter-spacing="1">LF</text>
  <circle cx="${72 - pad * 0.6}" cy="${30 + pad * 0.6}" r="${5 - pad * 0.1}" fill="#B47C65"/>
</svg>`

const targets = [
  ['public/icon-192.png', 192, 0],
  ['public/icon-512.png', 512, 0],
  ['public/apple-touch-icon.png', 180, 0],
  ['public/icon-maskable-512.png', 512, 8],
  ['public/favicon.png', 48, 0],
]
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const page = await browser.newPage()
for (const [file, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0">${svg(size, pad)}</body></html>`)
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size } })
}
await browser.close()
console.log('íconos ok')
