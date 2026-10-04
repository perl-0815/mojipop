import type { DecorationType, Design, Preset } from './types'

type Style = Omit<
  Design,
  | 'text'
  | 'fontSize'
  | 'letterSpacing'
  | 'lineHeight'
  | 'background'
  | 'backgroundColor'
  | 'backgroundEnd'
>

// Each preset contains a complete style, so switching away from a 3D or
// handwritten preset never leaves behind an unrelated effect.
const baseStyle: Style = {
  font: 'rounded',
  fontWeight: 700,
  fillMode: 'gradient',
  fill: '#FF85B5',
  fillEnd: '#F0448C',
  gradientAngle: 90,
  outline: true,
  outlineColor: '#FFFFFF',
  outlineWidth: 5,
  outerOutline: true,
  outerOutlineColor: '#D75189',
  outerOutlineWidth: 2,
  shadow: true,
  shadowColor: '#EAA0BE',
  shadowDistance: 10,
  shadowBlur: 0,
  shadowAngle: 70,
  extrusion: false,
  extrusionDepth: 8,
  decoration: 'sparkle',
  decorationAmount: 'normal',
}

function preset(
  id: string,
  name: string,
  label: string,
  surface: string,
  style: Partial<Style>,
): Preset {
  const design = { ...baseStyle, ...style }
  return {
    id,
    name,
    label,
    surface,
    colors: [design.fill, design.fillEnd],
    design,
  }
}

export const PRESETS: Preset[] = [
  preset('candy', 'キャンディ', 'とびきり、あまく', '#FFF0F6', {}),
  preset('soda', 'ソーダ', 'しゅわっと爽やか', '#EAF8FF', {
    fill: '#6CDCEB',
    fillEnd: '#328BCC',
    outerOutlineColor: '#4899BE',
    shadowColor: '#A8D9EB',
    shadowDistance: 8,
    shadowBlur: 3,
    decoration: 'circle',
  }),
  preset('lemon', 'レモン', 'ぱっと、元気に', '#FFF8DC', {
    fill: '#FFE369',
    fillEnd: '#FFBD39',
    outlineColor: '#FFFBE9',
    outlineWidth: 5,
    outerOutlineColor: '#EC983E',
    outerOutlineWidth: 3,
    shadowColor: '#F1B768',
    shadowDistance: 9,
    decoration: 'star',
  }),
  preset('strawberry', 'いちごミルク', 'ふんわり、やさしく', '#FFF2F3', {
    fill: '#F6B1C4',
    fillEnd: '#E991AB',
    outlineColor: '#FFFCF8',
    outlineWidth: 6,
    outerOutlineColor: '#D58B9E',
    outerOutlineWidth: 1.5,
    shadowColor: '#E8BECA',
    shadowDistance: 6,
    shadowBlur: 5,
    decoration: 'heart',
    decorationAmount: 'few',
  }),
  preset('game', 'ゲーム', 'ワクワクをプラス', '#EEF3FF', {
    font: 'gothic',
    fontWeight: 400,
    fill: '#A5F0D4',
    fillEnd: '#55BFD0',
    outlineWidth: 6,
    outerOutlineColor: '#344D83',
    outerOutlineWidth: 4,
    shadowColor: '#344D83',
    shadowDistance: 9,
    shadowAngle: 55,
    extrusion: true,
    extrusionDepth: 9,
    decoration: 'star',
    decorationAmount: 'few',
  }),
  preset('dreamy', 'ゆめかわ', '夢みるパステル', '#F4EEFF', {
    fill: '#EFA8D5',
    fillEnd: '#8ACDE9',
    gradientAngle: 35,
    outlineWidth: 5,
    outerOutlineColor: '#A38BCD',
    shadowColor: '#CAB8E8',
    shadowDistance: 8,
    shadowBlur: 3,
    decoration: 'sparkle',
  }),
  preset('retro', 'レトロポップ', 'なつかしくて、新しい', '#FFF3DD', {
    font: 'gothic',
    fontWeight: 400,
    fillMode: 'solid',
    fill: '#E76150',
    fillEnd: '#E76150',
    outlineColor: '#FFF1CB',
    outlineWidth: 8,
    outerOutlineColor: '#8A5142',
    outerOutlineWidth: 2,
    shadowColor: '#DEA654',
    shadowDistance: 10,
    shadowAngle: 60,
    decoration: 'flower',
    decorationAmount: 'few',
  }),
]

export const DEFAULT_DESIGN: Design = {
  text: 'かわいい！',
  fontSize: 112,
  letterSpacing: 2,
  lineHeight: 1.35,
  background: 'transparent',
  backgroundColor: '#FFF3F7',
  backgroundEnd: '#EDEBFF',
  ...baseStyle,
}

export function applyPreset(current: Design, id: string): Design {
  const selected = PRESETS.find((item) => item.id === id)
  if (!selected) return current
  return { ...current, ...selected.design }
}

function choose<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]!
}

const decorations: Record<string, readonly DecorationType[]> = {
  candy: ['sparkle', 'heart', 'flower'],
  soda: ['circle', 'sparkle', 'star'],
  lemon: ['star', 'flower', 'sparkle'],
  strawberry: ['heart', 'flower', 'sparkle'],
  game: ['star', 'sparkle', 'music'],
  dreamy: ['sparkle', 'star', 'heart'],
  retro: ['flower', 'circle', 'music'],
}

export function randomDesign(current: Design): Design {
  // Always pick another color family. This also makes repeated clicks feel
  // different when the random source happens to return the same value.
  const candidates = PRESETS.filter((item) => item.design.fill !== current.fill)
  const selected = choose(candidates.length ? candidates : PRESETS)
  const next = applyPreset(current, selected.id)

  return {
    ...next,
    gradientAngle: choose([35, 70, 90, 115]),
    outlineWidth: choose(next.font === 'rounded' ? [4, 5] : [6, 7, 8]),
    shadowDistance: choose([6, 8, 10]),
    shadowAngle: choose([55, 70, 90]),
    decoration: choose(decorations[selected.id] ?? ['sparkle']),
    decorationAmount: choose(['few', 'normal']),
  }
}
