import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const SAMPLE = '星のカービィワールドビヨンド'
const WEIGHTS = [
  { value: 300, label: '細め' },
  { value: 400, label: 'ふつう' },
  { value: 500, label: 'やや太め' },
  { value: 700, label: '太め' },
  { value: 800, label: 'かなり太め' },
  { value: 900, label: '極太' },
]

async function ready(page: Page) {
  await expect(page.locator('.artboard')).toHaveAttribute('aria-busy', 'false')
  await expect(
    page.getByRole('button', { name: 'PNGで保存', exact: true }),
  ).toBeEnabled()
}

async function previewPixels(page: Page) {
  return page.locator('.main-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas
      .getContext('2d')!
      .getImageData(0, 0, canvas.width, canvas.height).data
    let hash = 2166136261
    for (const byte of data) hash = Math.imul(hash ^ byte, 16777619)
    return { width: canvas.width, height: canvas.height, hash }
  })
}

async function downloadedPixels(page: Page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PNGで保存', exact: true }).click()
  const download = await pending
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) =>
      character.charCodeAt(0),
    )
    const image = await createImageBitmap(
      new Blob([bytes], { type: 'image/png' }),
    )
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    image.close()
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    let hash = 2166136261
    for (const byte of data) hash = Math.imul(hash ^ byte, 16777619)
    return { width: canvas.width, height: canvas.height, hash }
  }, bytes.toString('base64'))
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await ready(page)
})

test('six rounded weights load real faces and visibly change the same Japanese text', async ({
  page,
}) => {
  const weight = page.getByRole('slider', { name: '文字の太さ', exact: true })
  await expect(weight).toBeVisible()
  await expect(weight).toHaveValue('3')
  await expect(weight).toHaveAttribute('aria-valuetext', '太め')
  const text = page.getByRole('textbox', { name: '作りたい文字' })
  await text.fill(SAMPLE)
  await ready(page)
  const hashes = new Set<number>()

  await weight.focus()
  await weight.press('Home')
  for (const [index, expected] of WEIGHTS.entries()) {
    if (index > 0) await weight.press('ArrowRight')
    await expect(weight).toHaveValue(String(index))
    await expect(weight).toHaveAttribute('aria-valuetext', expected.label)
    await ready(page)

    // A browser may silently use the nearest face or synthesize bold when an
    // advertised weight is missing. Inspect the actual matching FontFace too.
    const faces = await page.evaluate(
      async ({ value, sample }) => {
        const loaded = await document.fonts.load(
          `${value} 32px "M PLUS Rounded 1c"`,
          sample,
        )
        return loaded.map((face) => ({
          family: face.family.replaceAll('"', ''),
          weight: face.weight,
          status: face.status,
        }))
      },
      { value: expected.value, sample: SAMPLE },
    )
    expect(faces.length).toBeGreaterThan(0)
    for (const face of faces) {
      expect(face.family).toBe('M PLUS Rounded 1c')
      expect(face.weight).toBe(String(expected.value))
      expect(face.status).toBe('loaded')
    }
    const result = await previewPixels(page)
    expect(hashes.has(result.hash)).toBe(false)
    hashes.add(result.hash)
    await expect(text).toHaveValue(SAMPLE)
  }
  expect(hashes.size).toBe(6)
})

test('medium and bold Japanese text export exactly as previewed and survive undo/redo', async ({
  page,
}) => {
  const text = page.getByRole('textbox', { name: '作りたい文字' })
  await text.fill(SAMPLE)
  const weight = page.getByRole('slider', { name: '文字の太さ', exact: true })
  await weight.focus()
  await weight.press('Home')
  await weight.press('ArrowRight')
  await weight.press('ArrowRight')
  await expect(weight).toHaveAttribute('aria-valuetext', 'やや太め')
  await ready(page)
  await page.getByRole('button', { name: '1×', exact: true }).click()
  const medium = await previewPixels(page)
  expect(await downloadedPixels(page)).toEqual(medium)

  await weight.focus()
  await weight.press('ArrowRight')
  await expect(weight).toHaveAttribute('aria-valuetext', '太め')
  await ready(page)
  const bold = await previewPixels(page)
  expect(bold.hash).not.toBe(medium.hash)
  expect(await downloadedPixels(page)).toEqual(bold)

  await page.getByRole('button', { name: '元に戻す', exact: true }).click()
  await expect(weight).toHaveAttribute('aria-valuetext', 'やや太め')
  await ready(page)
  expect(await previewPixels(page)).toEqual(medium)
  await page.getByRole('button', { name: 'やり直す', exact: true }).click()
  await expect(weight).toHaveAttribute('aria-valuetext', '太め')
  await ready(page)
  expect(await previewPixels(page)).toEqual(bold)
  await expect(text).toHaveValue(SAMPLE)
})

test('fixed-weight fonts explain their limit and never synthesize an unsupported bold face', async ({
  page,
}) => {
  const text = page.getByRole('textbox', { name: '作りたい文字' })
  await text.fill(SAMPLE)
  const fonts = page.getByRole('combobox', { name: 'フォント', exact: true })
  for (const font of ['gothic', 'handwritten']) {
    await fonts.selectOption(font)
    await ready(page)
    await expect(
      page.getByRole('slider', { name: '文字の太さ', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByText(/このフォントは太さ固定です/)).toBeVisible()
    await expect(text).toHaveValue(SAMPLE)
  }

  // Exercise persisted or externally supplied old 800-weight designs directly,
  // so hiding the UI slider alone cannot make this regression test pass.
  const rendered = await page.evaluate(async (sample) => {
    const rendererPath = '/src/render.ts'
    const presetsPath = '/src/presets.ts'
    const { ensureFont, renderDesign } = await import(rendererPath)
    const { DEFAULT_DESIGN } = await import(presetsPath)
    const results = []
    for (const font of ['gothic', 'handwritten']) {
      const variants = []
      for (const fontWeight of [400, 800]) {
        const design = { ...DEFAULT_DESIGN, text: sample, font, fontWeight }
        await ensureFont(design)
        const canvas = document.createElement('canvas')
        renderDesign(canvas, design, 1, true)
        const data = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data
        let hash = 2166136261
        for (const byte of data) hash = Math.imul(hash ^ byte, 16777619)
        variants.push({ width: canvas.width, height: canvas.height, hash })
      }
      results.push({ font, regular: variants[0], requestedBold: variants[1] })
    }
    return results
  }, SAMPLE)
  for (const result of rendered) {
    expect(result.requestedBold, result.font).toEqual(result.regular)
  }
})
