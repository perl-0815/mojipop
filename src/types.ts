export type FontId = 'rounded' | 'gothic' | 'handwritten'
export type DecorationType =
  'none' | 'sparkle' | 'star' | 'heart' | 'circle' | 'flower' | 'music'
export interface Design {
  text: string
  font: FontId
  fontSize: number
  fontWeight: number
  letterSpacing: number
  lineHeight: number
  fillMode: 'solid' | 'gradient'
  fill: string
  fillEnd: string
  gradientAngle: number
  outline: boolean
  outlineColor: string
  outlineWidth: number
  outerOutline: boolean
  outerOutlineColor: string
  outerOutlineWidth: number
  shadow: boolean
  shadowColor: string
  shadowDistance: number
  shadowBlur: number
  shadowAngle: number
  extrusion: boolean
  extrusionDepth: number
  decoration: DecorationType
  decorationAmount: 'few' | 'normal' | 'many'
  background: 'transparent' | 'white' | 'solid' | 'gradient'
  backgroundColor: string
  backgroundEnd: string
}
export interface Preset {
  id: string
  name: string
  label: string
  surface: string
  colors: [string, string]
  design: Partial<Design>
}
export const FONT_FAMILIES: Record<FontId, string> = {
  rounded: '"M PLUS Rounded 1c", sans-serif',
  gothic: '"Dela Gothic One", sans-serif',
  handwritten: '"Yomogi", cursive',
}
