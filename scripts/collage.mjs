// Arma docs/preview.png con tres capturas lado a lado (para el README).
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
const imgs = ['01-hoy', '03-sesion', '05-progreso'].map((n) => 'data:image/png;base64,' + readFileSync(`docs/screenshots/${n}.png`).toString('base64'))
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const p = await b.newPage({ viewport: { width: 1400, height: 900 } })
await p.setContent(`<body style="margin:0;background:#F5F2EA;display:flex;gap:40px;justify-content:center;align-items:center;height:900px">
${imgs.map((s) => `<img src="${s}" style="flex:none;width:auto;height:780px;border-radius:28px;box-shadow:0 18px 40px rgba(40,49,31,.18);border:1px solid #C9C7BD">`).join('')}</body>`)
await p.screenshot({ path: 'docs/preview.png' })
await b.close()
