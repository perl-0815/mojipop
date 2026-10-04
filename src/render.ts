import { FONT_FAMILIES, type Design, type DecorationType } from './types'
import { getFontWeight, loadFontWeight } from './fonts'

/** Preview and PNG export deliberately share this renderer. All units are CSS pixels. */
const MIN_WIDTH = 900
const MIN_HEIGHT = 500
const MAX_DIMENSION = 2048
const MAX_EXPORT_PIXELS = 32_000_000
const WRAP_WIDTH = 1500
const fontRequests = new Map<string, Promise<void>>()
let measuringContext: CanvasRenderingContext2D | undefined

type Glyph = { text: string; x: number; y: number }
type Bounds = { left: number; top: number; width: number; height: number }
type Layout = {
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
  fit: number
  fontSize: number
  glyphs: Glyph[]
  text: Bounds
  outline: number
  outerOutline: number
}

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min
}

function contextFor(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error(
      'このブラウザでは画像を作成できません。別のブラウザでお試しください。',
    )
  return context
}

function getMeasuringContext() {
  if (!measuringContext)
    measuringContext = contextFor(document.createElement('canvas'))
  return measuringContext
}

function fontString(design: Design, size = design.fontSize) {
  return `${getFontWeight(design.font, design.fontWeight)} ${size}px ${FONT_FAMILIES[design.font]}`
}

/** Include the actual text so every required Japanese unicode-range subset is loaded. */
export async function ensureFont(design: Design): Promise<void> {
  if (!document.fonts) return
  const sample = `${design.text}あA`
  const descriptor = fontString(design, 32)
  const key = `${descriptor}\n${sample}`
  const existing = fontRequests.get(key)
  if (existing) return existing
  const request = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const faces = await Promise.race([
        (async () => {
          await loadFontWeight(design.font, design.fontWeight)
          return document.fonts.load(descriptor, sample)
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('font timeout')), 20_000)
        }),
      ])
      if (faces.length === 0) throw new Error('font is not registered')
    } catch {
      fontRequests.delete(key)
      throw new Error(
        'フォントを読み込めませんでした。接続を確認して、もう一度お試しください。',
      )
    } finally {
      if (timer) clearTimeout(timer)
    }
  })()
  // Keep a bounded cache; promises never write to the preview or change the design.
  if (fontRequests.size >= 128)
    fontRequests.delete(fontRequests.keys().next().value!)
  fontRequests.set(key, request)
  return request
}

function graphemes(text: string): string[] {
  if ('Segmenter' in Intl) {
    return Array.from(
      new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text),
      (part) => part.segment,
    )
  }
  // Array.from preserves surrogate pairs; attached combining marks stay with their base.
  return Array.from(text).reduce<string[]>((parts, character) => {
    if (
      /^[\p{Mark}\p{Emoji_Modifier}\u200D\u{E0020}-\u{E007F}]$/u.test(
        character,
      ) &&
      parts.length
    )
      parts[parts.length - 1] += character
    else if (parts.length && parts[parts.length - 1].endsWith('\u200D'))
      parts[parts.length - 1] += character
    else if (
      /^\p{Regional_Indicator}$/u.test(character) &&
      parts.length &&
      /^\p{Regional_Indicator}$/u.test(parts[parts.length - 1])
    )
      parts[parts.length - 1] += character
    else parts.push(character)
    return parts
  }, [])
}

function calculateLayout(design: Design): Layout {
  const context = getMeasuringContext()
  const fontSize = clamp(design.fontSize, 12, 320)
  context.font = fontString(design, fontSize)
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'
  const spacing = clamp(design.letterSpacing, -fontSize * 0.4, fontSize)
  const lineAdvance = fontSize * clamp(design.lineHeight, 0.8, 3)
  const metricCache = new Map<string, TextMetrics>()
  const measure = (text: string) => {
    let metrics = metricCache.get(text)
    if (!metrics) {
      metrics = context.measureText(text)
      metricCache.set(text, metrics)
    }
    return metrics
  }
  type Line = {
    glyphs: Glyph[]
    left: number
    right: number
    ascent: number
    descent: number
  }
  const reference = measure('あAg')
  const baseAscent = reference.actualBoundingBoxAscent || fontSize * 0.88
  const baseDescent = reference.actualBoundingBoxDescent || fontSize * 0.12
  const lines: Line[] = []
  const newLine = (): Line => ({
    glyphs: [],
    left: 0,
    right: 0,
    ascent: baseAscent,
    descent: baseDescent,
  })

  for (const input of design.text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = newLine()
    let cursor = 0
    for (const character of graphemes(input)) {
      const metrics = measure(character)
      let left = Math.min(cursor - metrics.actualBoundingBoxLeft, cursor)
      let right = Math.max(
        cursor + metrics.actualBoundingBoxRight,
        cursor + metrics.width,
      )
      if (
        line.glyphs.length > 0 &&
        Math.max(line.right, right) - Math.min(line.left, left) > WRAP_WIDTH
      ) {
        lines.push(line)
        line = newLine()
        cursor = 0
        left = Math.min(-metrics.actualBoundingBoxLeft, 0)
        right = Math.max(metrics.actualBoundingBoxRight, metrics.width)
      }
      line.glyphs.push({ text: character, x: cursor, y: 0 })
      line.left = Math.min(line.left, left)
      line.right = Math.max(line.right, right)
      line.ascent = Math.max(line.ascent, metrics.actualBoundingBoxAscent)
      line.descent = Math.max(line.descent, metrics.actualBoundingBoxDescent)
      cursor += metrics.width + spacing
    }
    lines.push(line)
  }

  const textWidth = Math.max(1, ...lines.map((line) => line.right - line.left))
  const textTop = Math.min(
    ...lines.map((line, index) => index * lineAdvance - line.ascent),
  )
  const textBottom = Math.max(
    ...lines.map((line, index) => index * lineAdvance + line.descent),
  )
  const textHeight = Math.max(1, textBottom - textTop)
  const outline = design.outline ? clamp(design.outlineWidth, 0, 40) : 0
  const outerOutline =
    design.outline && design.outerOutline
      ? clamp(design.outerOutlineWidth, 0, 32)
      : 0
  const effectPadding =
    outline +
    outerOutline +
    (design.shadow
      ? clamp(design.shadowDistance, 0, 120) +
        clamp(design.shadowBlur, 0, 80) * 3
      : 0) +
    (design.extrusion ? clamp(design.extrusionDepth, 0, 40) : 0)
  const decorationPadding = design.decoration === 'none' ? 0 : 66
  const padding =
    Math.max(54, fontSize * 0.3) + effectPadding + decorationPadding
  const naturalWidth = Math.max(MIN_WIDTH, textWidth + padding * 2)
  const naturalHeight = Math.max(MIN_HEIGHT, textHeight + padding * 2)
  const fit = Math.min(
    1,
    MAX_DIMENSION / naturalWidth,
    MAX_DIMENSION / naturalHeight,
  )
  const width = Math.max(
    MIN_WIDTH,
    Math.min(MAX_DIMENSION, Math.ceil(naturalWidth * fit)),
  )
  const height = Math.max(
    MIN_HEIGHT,
    Math.min(MAX_DIMENSION, Math.ceil(naturalHeight * fit)),
  )
  const left = (naturalWidth - textWidth) / 2
  const top = (naturalHeight - textHeight) / 2
  const glyphs = lines.flatMap((line, index) => {
    const lineLeft = (naturalWidth - (line.right - line.left)) / 2 - line.left
    return line.glyphs.map((glyph) => ({
      text: glyph.text,
      x: lineLeft + glyph.x,
      y: top - textTop + index * lineAdvance,
    }))
  })
  return {
    width,
    height,
    naturalWidth,
    naturalHeight,
    fit,
    fontSize,
    glyphs,
    text: { left, top, width: textWidth, height: textHeight },
    outline,
    outerOutline,
  }
}

export function getLayout(design: Design): { width: number; height: number } {
  const { width, height } = calculateLayout(design)
  return { width, height }
}

function pixelDimensions(width: number, height: number, scale: number) {
  const requestedScale = clamp(scale, 0.25, 4)
  const safeScale = Math.min(
    requestedScale,
    Math.sqrt(MAX_EXPORT_PIXELS / (width * height)),
  )
  return {
    width: Math.max(1, Math.floor(width * safeScale)),
    height: Math.max(1, Math.floor(height * safeScale)),
  }
}

/** The pixel cap can lower 4× for a very large design; use this for truthful UI dimensions. */
export function getExportSize(design: Design, scale: 1 | 2 | 4) {
  const { width, height } = getLayout(design)
  return pixelDimensions(width, height, scale)
}

function applyTextTransform(
  context: CanvasRenderingContext2D,
  layout: Layout,
  design: Design,
) {
  context.translate(layout.width / 2, layout.height / 2)
  context.scale(layout.fit, layout.fit)
  context.translate(-layout.naturalWidth / 2, -layout.naturalHeight / 2)
  context.font = fontString(design, layout.fontSize)
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'
  context.lineJoin = 'round'
  context.miterLimit = 2
}

function strokeGlyphs(
  context: CanvasRenderingContext2D,
  layout: Layout,
  color: string,
  thickness: number,
) {
  if (thickness <= 0) return
  context.strokeStyle = color
  context.lineWidth = thickness * 2
  for (const glyph of layout.glyphs)
    context.strokeText(glyph.text, glyph.x, glyph.y)
}

function fillGlyphs(
  context: CanvasRenderingContext2D,
  layout: Layout,
  fill: string | CanvasGradient,
) {
  context.fillStyle = fill
  for (const glyph of layout.glyphs)
    context.fillText(glyph.text, glyph.x, glyph.y)
}

function silhouette(
  context: CanvasRenderingContext2D,
  layout: Layout,
  color: string,
) {
  strokeGlyphs(context, layout, color, layout.outline + layout.outerOutline)
  fillGlyphs(context, layout, color)
}

/** 0° is left → right; 90° is top → bottom. */
function textGradient(
  context: CanvasRenderingContext2D,
  design: Design,
  bounds: Bounds,
) {
  const radians = (design.gradientAngle * Math.PI) / 180
  const dx = Math.cos(radians)
  const dy = Math.sin(radians)
  const radius = Math.max(
    1,
    (Math.abs(dx) * bounds.width + Math.abs(dy) * bounds.height) / 2,
  )
  const cx = bounds.left + bounds.width / 2
  const cy = bounds.top + bounds.height / 2
  const gradient = context.createLinearGradient(
    cx - dx * radius,
    cy - dy * radius,
    cx + dx * radius,
    cy + dy * radius,
  )
  gradient.addColorStop(0, design.fill)
  gradient.addColorStop(1, design.fillEnd)
  return gradient
}

function decorationPath(
  context: CanvasRenderingContext2D,
  type: DecorationType,
  radius: number,
) {
  context.beginPath()
  if (type === 'star') {
    for (let index = 0; index < 10; index++) {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5
      const distance = index % 2 === 0 ? radius : radius * 0.46
      const x = Math.cos(angle) * distance
      const y = Math.sin(angle) * distance
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.closePath()
  } else if (type === 'heart') {
    context.moveTo(0, radius * 0.83)
    context.bezierCurveTo(
      -radius * 1.6,
      -radius * 0.08,
      -radius * 0.78,
      -radius * 1.24,
      0,
      -radius * 0.47,
    )
    context.bezierCurveTo(
      radius * 0.78,
      -radius * 1.24,
      radius * 1.6,
      -radius * 0.08,
      0,
      radius * 0.83,
    )
    context.closePath()
  } else if (type === 'sparkle') {
    context.moveTo(0, -radius)
    context.quadraticCurveTo(radius * 0.15, -radius * 0.15, radius, 0)
    context.quadraticCurveTo(radius * 0.15, radius * 0.15, 0, radius)
    context.quadraticCurveTo(-radius * 0.15, radius * 0.15, -radius, 0)
    context.quadraticCurveTo(-radius * 0.15, -radius * 0.15, 0, -radius)
    context.closePath()
  } else if (type === 'flower') {
    for (let index = 0; index < 5; index++) {
      const angle = (index * Math.PI * 2) / 5 - Math.PI / 2
      const x = Math.cos(angle) * radius * 0.51
      const y = Math.sin(angle) * radius * 0.51
      context.moveTo(x + radius * 0.51, y)
      context.arc(x, y, radius * 0.51, 0, Math.PI * 2)
    }
  } else if (type === 'music') {
    context.ellipse(
      -radius * 0.25,
      radius * 0.43,
      radius * 0.44,
      radius * 0.3,
      -0.35,
      0,
      Math.PI * 2,
    )
    context.rect(radius * 0.05, -radius * 0.85, radius * 0.2, radius * 1.25)
    context.moveTo(radius * 0.25, -radius * 0.85)
    context.bezierCurveTo(
      radius * 1.02,
      -radius * 0.5,
      radius * 0.99,
      -radius * 0.1,
      radius * 0.62,
      radius * 0.1,
    )
    context.bezierCurveTo(
      radius * 0.78,
      -radius * 0.3,
      radius * 0.35,
      -radius * 0.37,
      radius * 0.25,
      -radius * 0.38,
    )
    context.closePath()
  } else {
    context.arc(0, 0, radius * 0.7, 0, Math.PI * 2)
  }
}

function drawDecorations(
  context: CanvasRenderingContext2D,
  design: Design,
  layout: Layout,
) {
  if (design.decoration === 'none' || !design.text.trim()) return
  const bounds = layout.text
  const gap = 38 + layout.outline + layout.outerOutline
  const centerX = bounds.left + bounds.width / 2
  const centerY = bounds.top + bounds.height / 2
  // Fixed balanced anchors keep decorations stable while dragging a control.
  const anchors = [
    [bounds.left - gap, centerY - bounds.height * 0.25, 18, -0.2],
    [bounds.left + bounds.width + gap, centerY + bounds.height * 0.16, 16, 0.2],
    [centerX + bounds.width * 0.27, bounds.top - gap, 13, 0.15],
    [
      centerX - bounds.width * 0.29,
      bounds.top + bounds.height + gap,
      12,
      -0.12,
    ],
    [centerX - bounds.width * 0.32, bounds.top - gap - 2, 10, -0.1],
    [centerX + bounds.width * 0.32, bounds.top + bounds.height + gap, 9, 0.2],
    [bounds.left - gap + 6, centerY + bounds.height * 0.4, 8, 0.1],
    [
      bounds.left + bounds.width + gap - 4,
      centerY - bounds.height * 0.47,
      9,
      -0.2,
    ],
    [centerX + bounds.width * 0.05, bounds.top - gap - 8, 7, 0.2],
    [
      centerX + bounds.width * 0.02,
      bounds.top + bounds.height + gap + 6,
      7,
      -0.1,
    ],
  ]
  const amount =
    design.decorationAmount === 'few'
      ? 2
      : design.decorationAmount === 'many'
        ? 10
        : 4
  for (let index = 0; index < amount; index++) {
    const [x, y, radius, rotation] = anchors[index]
    context.save()
    context.translate(x, y)
    context.rotate(rotation)
    decorationPath(context, design.decoration, radius)
    context.fillStyle =
      index % 3 === 0
        ? design.fill
        : index % 3 === 1
          ? design.fillEnd
          : '#f6be55'
    context.strokeStyle = '#ffffff'
    context.lineWidth = 3
    context.lineJoin = 'round'
    context.stroke()
    context.fill()
    if (design.decoration === 'flower') {
      context.beginPath()
      context.arc(0, 0, radius * 0.26, 0, Math.PI * 2)
      context.fillStyle = '#fff4bc'
      context.fill()
    }
    context.restore()
  }
}

export function renderDesign(
  canvas: HTMLCanvasElement,
  design: Design,
  scale = 1,
  transparent = false,
): { width: number; height: number } {
  // Chromium otherwise inherits font smoothing from the page only for attached
  // canvases, causing the live preview to rasterize differently from PNG export.
  canvas.style.setProperty('-webkit-font-smoothing', 'auto')
  const layout = calculateLayout(design)
  const size = pixelDimensions(layout.width, layout.height, scale)
  canvas.width = size.width
  canvas.height = size.height
  const context = contextFor(canvas)
  const pixelScaleX = size.width / layout.width
  const pixelScaleY = size.height / layout.height
  context.scale(pixelScaleX, pixelScaleY)

  if (!transparent && design.background !== 'transparent') {
    if (design.background === 'gradient') {
      const gradient = context.createLinearGradient(
        0,
        0,
        layout.width,
        layout.height,
      )
      gradient.addColorStop(0, design.backgroundColor)
      gradient.addColorStop(1, design.backgroundEnd)
      context.fillStyle = gradient
    } else {
      context.fillStyle =
        design.background === 'white' ? '#ffffff' : design.backgroundColor
    }
    context.fillRect(0, 0, layout.width, layout.height)
  }

  if (design.shadow && layout.glyphs.length > 0) {
    const angle = (design.shadowAngle * Math.PI) / 180
    const distance = clamp(design.shadowDistance, 0, 120)
    const blur = clamp(design.shadowBlur, 0, 80)
    if (blur > 0) {
      // A single silhouette makes a coherent shadow, including overlapping letters.
      // This temporary mask stays at logical resolution to bound export memory.
      const mask = document.createElement('canvas')
      mask.width = layout.width
      mask.height = layout.height
      const maskContext = contextFor(mask)
      applyTextTransform(maskContext, layout, design)
      silhouette(maskContext, layout, design.shadowColor)
      context.save()
      context.shadowColor = design.shadowColor
      context.shadowBlur = blur * pixelScaleX * layout.fit
      context.shadowOffsetX =
        Math.cos(angle) * distance * pixelScaleX * layout.fit
      context.shadowOffsetY =
        Math.sin(angle) * distance * pixelScaleY * layout.fit
      context.drawImage(mask, 0, 0, layout.width, layout.height)
      context.restore()
      mask.width = 1
      mask.height = 1
    } else {
      context.save()
      applyTextTransform(context, layout, design)
      context.translate(Math.cos(angle) * distance, Math.sin(angle) * distance)
      silhouette(context, layout, design.shadowColor)
      context.restore()
    }
  }

  context.save()
  applyTextTransform(context, layout, design)
  if (design.extrusion) {
    const depth = Math.round(clamp(design.extrusionDepth, 0, 40))
    for (let offset = depth; offset > 0; offset--) {
      context.save()
      context.translate(offset * 0.72, offset * 0.72)
      silhouette(context, layout, design.shadowColor)
      context.restore()
    }
  }
  // Paint each layer across all glyphs before the next layer: tight tracking stays clean.
  if (layout.outerOutline > 0)
    strokeGlyphs(
      context,
      layout,
      design.outerOutlineColor,
      layout.outline + layout.outerOutline,
    )
  strokeGlyphs(context, layout, design.outlineColor, layout.outline)
  fillGlyphs(
    context,
    layout,
    design.fillMode === 'gradient'
      ? textGradient(context, design, layout.text)
      : design.fill,
  )
  drawDecorations(context, design, layout)
  context.restore()
  return size
}

export async function exportPng(
  design: Design,
  scale: 1 | 2 | 4,
  transparent: boolean,
): Promise<Blob> {
  // Snapshot before awaiting font files so edits during export cannot change the image.
  const snapshot = { ...design }
  // The background-inclusive export uses white when the editor is set to transparency.
  if (!transparent && snapshot.background === 'transparent')
    snapshot.background = 'white'
  await ensureFont(snapshot)
  const canvas = document.createElement('canvas')
  renderDesign(canvas, snapshot, scale, transparent)
  try {
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else
          reject(
            new Error(
              'PNGを作成できませんでした。解像度を下げてお試しください。',
            ),
          )
      }, 'image/png')
    })
  } finally {
    canvas.width = 1
    canvas.height = 1
  }
}
