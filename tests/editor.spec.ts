import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function ready(page: Page) {
  await expect(page.locator('.artboard')).toHaveAttribute('aria-busy', 'false')
  await expect(
    page.getByRole('button', { name: 'PNGで保存', exact: true }),
  ).toBeEnabled()
}
async function pixels(page: Page) {
  return page.locator('.main-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas
      .getContext('2d')!
      .getImageData(0, 0, canvas.width, canvas.height).data
    let hash = 2166136261
    for (const byte of data) hash = Math.imul(hash ^ byte, 16777619)
    return {
      hash,
      width: canvas.width,
      height: canvas.height,
      corner: [...data.slice(0, 4)],
    }
  })
}
async function savePng(page: Page) {
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PNGで保存', exact: true }).click()
  const download = await downloadEvent
  const buffer = await readFile((await download.path())!)
  expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  const result = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0))
    const image = await createImageBitmap(
      new Blob([bytes], { type: 'image/png' }),
    )
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    let hash = 2166136261
    for (const byte of data) hash = Math.imul(hash ^ byte, 16777619)
    return {
      width: canvas.width,
      height: canvas.height,
      corner: [...data.slice(0, 4)],
      hash,
    }
  }, buffer.toString('base64'))
  return result
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await ready(page)
})

test('the ready-to-save sample, all seven presets, undo, redo and empty recovery', async ({
  page,
}) => {
  const issues: string[] = []
  page.on('pageerror', (e) => issues.push(e.message))
  const original = await pixels(page)
  expect(original.corner[3]).toBe(0)
  const hashes = new Set<number>()
  for (const name of [
    'キャンディ',
    'ソーダ',
    'レモン',
    'いちごミルク',
    'ゲーム',
    'ゆめかわ',
    'レトロポップ',
  ]) {
    await page
      .getByRole('button', { name: `${name} プリセット`, exact: true })
      .click()
    await ready(page)
    hashes.add((await pixels(page)).hash)
  }
  expect(hashes.size).toBe(7)
  await page
    .getByRole('textbox', { name: '作りたい文字' })
    .fill('ひらがな\nカタカナ 漢字\nABC 123 ☆♡')
  await ready(page)
  const changed = await pixels(page)
  await page.getByRole('button', { name: '元に戻す', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '作りたい文字' })).toHaveValue(
    'かわいい！',
  )
  await page.getByRole('button', { name: 'やり直す', exact: true }).click()
  await ready(page)
  expect((await pixels(page)).hash).toBe(changed.hash)
  await page.getByRole('textbox', { name: '作りたい文字' }).fill('   ')
  await expect(
    page.getByRole('button', { name: 'PNGで保存', exact: true }),
  ).toBeDisabled()
  await expect(page.getByText('どんなことばを、飾ろう？')).toBeVisible()
  await page.getByRole('textbox', { name: '作りたい文字' }).fill('復活！')
  await ready(page)
  expect(issues).toEqual([])
})

test('downloads actual transparent PNGs at 1x, 2x, 4x with accurate dimensions and matching preview', async ({
  page,
}) => {
  for (const scale of [1, 2, 4]) {
    await page.getByRole('button', { name: `${scale}×`, exact: true }).click()
    const result = await savePng(page)
    expect(result.width).toBe(900 * scale)
    expect(result.height).toBe(500 * scale)
    expect(result.corner[3]).toBe(0)
    await expect(page.getByTestId('export-size')).toHaveText(
      `${result.width.toLocaleString()} × ${result.height.toLocaleString()} px`,
    )
    if (scale === 1) expect(result.hash).toBe((await pixels(page)).hash)
  }
})

test('background-inclusive PNGs are opaque, colored previews match outputs and transparency overrides', async ({
  page,
}) => {
  await page.getByRole('button', { name: '1×', exact: true }).click()
  await page.getByRole('radio', { name: /背景込み/ }).check()
  expect((await savePng(page)).corner).toEqual([255, 255, 255, 255])
  await page
    .getByRole('button', { name: 'グラデーション背景', exact: true })
    .click()
  await ready(page)
  const preview = await pixels(page)
  const png = await savePng(page)
  expect(png.corner[3]).toBe(255)
  expect(png.hash).toBe(preview.hash)
  await page.getByRole('radio', { name: '透明背景', exact: true }).check()
  expect((await savePng(page)).corner[3]).toBe(0)
})

test('font, advanced effects and random styles really change pixels while preserving text', async ({
  page,
}) => {
  const text = '推しの誕生日♡\nHAPPY BIRTHDAY!'
  await page.getByRole('textbox', { name: '作りたい文字' }).fill(text)
  for (const font of ['rounded', 'gothic', 'handwritten']) {
    await page
      .getByRole('combobox', { name: 'フォント', exact: true })
      .selectOption(font)
    await ready(page)
    expect((await pixels(page)).width).toBeGreaterThan(0)
  }
  await page.locator('.advanced > summary').click()
  await page.getByText('文字色・グラデーション', { exact: true }).click()
  await page.getByRole('button', { name: '単色', exact: true }).click()
  await ready(page)
  const solid = await pixels(page)
  await page
    .getByRole('button', { name: 'グラデーション', exact: true })
    .click()
  await ready(page)
  expect((await pixels(page)).hash).not.toBe(solid.hash)
  await page.locator('.detail > summary').filter({ hasText: '縁取り' }).click()
  await page.getByText('縁取りをつける', { exact: true }).click()
  await expect(
    page.getByRole('switch', { name: '縁取りをつける', exact: true }),
  ).not.toBeChecked()
  await ready(page)
  const withoutOutline = await pixels(page)
  await page.getByText('縁取りをつける', { exact: true }).click()
  await ready(page)
  expect((await pixels(page)).hash).not.toBe(withoutOutline.hash)
  await page.getByText('影と立体感', { exact: true }).click()
  await page.getByText('3D・押し出し', { exact: true }).click()
  await expect(
    page.getByRole('slider', { name: '立体の奥行き', exact: true }),
  ).toBeVisible()
  await page.getByText('小さな装飾', { exact: true }).click()
  for (const motif of [
    'none',
    'star',
    'heart',
    'sparkle',
    'circle',
    'flower',
    'music',
  ]) {
    await page
      .getByRole('combobox', { name: 'モチーフ', exact: true })
      .selectOption(motif)
    await ready(page)
  }
  let previous = (await pixels(page)).hash
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'おまかせ', exact: true }).click()
    await ready(page)
    const next = (await pixels(page)).hash
    expect(next).not.toBe(previous)
    previous = next
    await expect(
      page.getByRole('textbox', { name: '作りたい文字' }),
    ).toHaveValue(text)
  }
})

test('390px and 320px mobile layouts put the preview first without horizontal overflow', async ({
  page,
}) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      preview: document.querySelector('.preview-card')!.getBoundingClientRect()
        .top,
      settings: document
        .querySelector('.settings-panel')!
        .getBoundingClientRect().top,
      artboardRight: document
        .querySelector('.artboard')!
        .getBoundingClientRect().right,
      cardRight: document
        .querySelector('.preview-card')!
        .getBoundingClientRect().right,
    }))
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth)
    expect(layout.preview).toBeLessThan(layout.settings)
    expect(layout.artboardRight).toBeLessThan(layout.cardRight)
    await page
      .getByRole('textbox', { name: '作りたい文字' })
      .fill('スマホでも、かわいい！\n漢字・カナ・ABC☆')
    await ready(page)
    await page
      .getByRole('button', { name: 'PNGで保存', exact: true })
      .scrollIntoViewIfNeeded()
    await expect(
      page.getByRole('button', { name: 'PNGで保存', exact: true }),
    ).toBeInViewport()
  }
})

test('help dialog traps focus, Escape closes it, and keyboard returns to the opener', async ({
  page,
}) => {
  const help = page.getByRole('button', { name: '使いかた', exact: true })
  await help.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Tab')
  const inside = await page.evaluate(
    () => !!document.activeElement?.closest('dialog'),
  )
  expect(inside).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(help).toBeFocused()
})

test('font failures keep the design and recover through an in-place retry', async ({
  page,
}) => {
  await page.getByRole('textbox', { name: '作りたい文字' }).fill('消えないで♡')
  await ready(page)
  await page.evaluate(() => {
    const fonts = document.fonts as FontFaceSet & {
      savedLoad?: FontFaceSet['load']
    }
    fonts.savedLoad = fonts.load.bind(fonts)
    fonts.load = () => Promise.reject(new Error('simulated font failure'))
  })
  await page
    .getByRole('combobox', { name: 'フォント', exact: true })
    .selectOption('handwritten')
  await expect(page.getByRole('alert')).toContainText(
    'フォントを読み込めませんでした',
  )
  await expect(
    page.getByRole('button', { name: 'PNGで保存', exact: true }),
  ).toBeDisabled()
  await expect(page.getByRole('textbox', { name: '作りたい文字' })).toHaveValue(
    '消えないで♡',
  )
  await page.evaluate(() => {
    const fonts = document.fonts as FontFaceSet & {
      savedLoad?: FontFaceSet['load']
    }
    fonts.load = fonts.savedLoad!
    delete fonts.savedLoad
  })
  await page.getByRole('button', { name: '再試行', exact: true }).click()
  await ready(page)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '作りたい文字' })).toHaveValue(
    '消えないで♡',
  )
})
