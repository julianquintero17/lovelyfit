import type { SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p,
})

export const IconToday = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
)
export const IconTrain = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" /></svg>
)
export const IconMeal = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="13" r="6.5" /><path d="M12 6.5V3M9 3.5c0 1.5 1.3 3 3 3s3-1.5 3-3" /></svg>
)
export const IconProgress = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 19V5M4 19h16M7.5 15l3.5-4 3 2.5L19 8" /></svg>
)
export const IconUser = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" /></svg>
)
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconMinus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 12h14" /></svg>
)
export const IconBack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M15 5l-7 7 7 7" /></svg>
)
export const IconMore = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
)
export const IconCamera = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
)
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>
)
export const IconUp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 15l6-6 6 6" /></svg>
)
export const IconDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 9l6 6 6-6" /></svg>
)
export const IconSwap = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>
)
export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" /></svg>
)
