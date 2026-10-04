import { expect, test } from '@playwright/test'
import type { Design } from '../src/types'

test('rounded presets preserve both gaps between the three strokes of ヨ', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.artboard')).toHaveAttribute('aria-busy', 'false')

  const results = await page.evaluate(async () => {
    const rendererPath = '/src/render.ts'
    const presetsPath = '/src/presets.ts'
    const { ensureFont, renderDesign } = (await import(
      rendererPath
    )) as typeof import('../src/render')
    const { DEFAULT_DESIGN, PRESETS } = (await import(
      presetsPath
    )) as typeof import('../src/presets')

    async function horizontalStrokes(design: Design) {
      // Isolate the letter's outlined silhouette. A shadow can intentionally lie
      // behind its gaps and must not be mistaken for the letter closing up.
      const isolated: Design = {
        ...design,
        text: 'ヨ',
        fontSize: 112,
        background: 'transparent',
        shadow: false,
        extrusion: false,
        decoration: 'none',
      }
      await ensureFont(isolated)
      const canvas = document.createElement('canvas')
      renderDesign(canvas, isolated, 1, true)
      const pixels = canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height).data
      const painted = (x: number, y: number) =>
        pixels[(y * canvas.width + x) * 4 + 3]! > 127
      let left = canvas.width
      let right = -1
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (!painted(x, y)) continue
          left = Math.min(left, x)
          right = Math.max(right, x)
        }
      }
      if (right < left) throw new Error('The glyph rendered no visible pixels')

      // Sample between the left ends and the right vertical stem; derive the
      // position from the rendered glyph so canvas padding is irrelevant.
      const column = Math.round(left + (right - left) * 0.4)
      let strokes = 0
      let previousPainted = false
      for (let y = 0; y < canvas.height; y++) {
        const currentPainted = painted(column, y)
        if (currentPainted && !previousPainted) strokes++
        previousPainted = currentPainted
      }
      return strokes
    }

    const presets = []
    for (const preset of PRESETS) {
      const design = { ...DEFAULT_DESIGN, ...preset.design }
      if (design.font !== 'rounded') continue
      presets.push({
        name: preset.name,
        strokes: await horizontalStrokes(design),
      })
    }
    const oldDefaultStrokes = await horizontalStrokes({
      ...DEFAULT_DESIGN,
      font: 'rounded',
      fontWeight: 800,
      outline: true,
      outlineWidth: 9,
      outerOutline: true,
      outerOutlineWidth: 2,
    })
    return { presets, oldDefaultStrokes }
  })

  expect(results.presets.length).toBeGreaterThan(0)
  for (const preset of results.presets) {
    expect(
      preset.strokes,
      `${preset.name}: both ヨ gaps should remain open`,
    ).toBe(3)
  }
  // This baseline guards against a test that passes without detecting the
  // original heavy-font / thick-outline combination reported by the user.
  expect(results.oldDefaultStrokes).toBeLessThan(3)
})
