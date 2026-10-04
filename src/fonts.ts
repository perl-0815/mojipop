import type { FontId } from './types'

type FontWeightOption = { readonly value: number; readonly label: string }

/** Offer actual font files, not values that the browser maps or synthesizes. */
export const FONT_WEIGHT_OPTIONS: Record<FontId, readonly FontWeightOption[]> =
  {
    rounded: [
      { value: 300, label: '細め' },
      { value: 400, label: 'ふつう' },
      { value: 500, label: 'やや太め' },
      { value: 700, label: '太め' },
      { value: 800, label: 'かなり太め' },
      { value: 900, label: '極太' },
    ],
    gothic: [{ value: 400, label: '標準' }],
    handwritten: [{ value: 400, label: '標準' }],
  }

export function getFontWeight(font: FontId, requested: number): number {
  const target = Number.isFinite(requested) ? requested : 400
  return FONT_WEIGHT_OPTIONS[font].reduce((nearest, option) => {
    const distance = Math.abs(option.value - target)
    const nearestDistance = Math.abs(nearest.value - target)
    return distance < nearestDistance ||
      (distance === nearestDistance && option.value < nearest.value)
      ? option
      : nearest
  }).value
}

// The initial page already includes rounded 400/800 and each fixed-weight font.
// Extra weights register their unicode-range faces only when selected.
const additionalRoundedWeights: Record<number, () => Promise<unknown>> = {
  300: () => import('@fontsource/m-plus-rounded-1c/300.css'),
  500: () => import('@fontsource/m-plus-rounded-1c/500.css'),
  700: () => import('@fontsource/m-plus-rounded-1c/700.css'),
  900: () => import('@fontsource/m-plus-rounded-1c/900.css'),
}
const cssRequests = new Map<number, Promise<void>>()

export async function loadFontWeight(
  font: FontId,
  requested: number,
): Promise<void> {
  const weight = getFontWeight(font, requested)
  const load = font === 'rounded' ? additionalRoundedWeights[weight] : undefined
  if (!load) return
  const existing = cssRequests.get(weight)
  if (existing) return existing
  const request = load()
    .then(() => {})
    .catch((error: unknown) => {
      cssRequests.delete(weight)
      throw error
    })
  cssRequests.set(weight, request)
  return request
}
