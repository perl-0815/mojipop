import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Dices,
  Heart,
  Layers2,
  LoaderCircle,
  Maximize2,
  Paintbrush,
  Redo2,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Type,
  Undo2,
  X,
} from 'lucide-react'
import { DEFAULT_DESIGN, PRESETS, applyPreset, randomDesign } from './presets'
import {
  ensureFont,
  exportPng,
  getExportSize,
  getLayout,
  renderDesign,
} from './render'
import { FONT_FAMILIES, type Design, type DecorationType } from './types'
import { FONT_WEIGHT_OPTIONS, getFontWeight } from './fonts'

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  valueLabel,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  valueLabel?: string
  onChange: (n: number) => void
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <output>{valueLabel ?? `${value}${unit}`}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={valueLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            '--range': `${((value - min) / (max - min)) * 100}%`,
          } as CSSProperties
        }
      />
    </label>
  )
}
function FontWeight({
  font,
  value,
  onChange,
}: {
  font: Design['font']
  value: number
  onChange: (value: number) => void
}) {
  const options = FONT_WEIGHT_OPTIONS[font]
  if (options.length === 1) {
    return (
      <p className="font-weight-note">
        このフォントは太さ固定です。太さを調整する場合は「まるっとゴシック」を選んでください。
      </p>
    )
  }
  const index = options.findIndex(
    (option) => option.value === getFontWeight(font, value),
  )
  return (
    <div className="font-weight-control">
      <Range
        label="文字の太さ"
        min={0}
        max={options.length - 1}
        value={index}
        valueLabel={options[index].label}
        onChange={(next) => onChange(options[next].value)}
      />
      <div className="range-endpoints" aria-hidden="true">
        <span>細め</span>
        <span>極太</span>
      </div>
    </div>
  )
}
function Color({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <span className="color-input">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span>{value.toUpperCase()}</span>
      </span>
    </label>
  )
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="toggle-field">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  )
}
function Segments<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="segments" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? 'selected' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
function Detail({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <details className="detail">
      <summary>
        {icon}
        <span>{title}</span>
        <ChevronDown size={15} />
      </summary>
      <div className="detail-content">{children}</div>
    </details>
  )
}
function MiniArt({ presetId, text }: { presetId: string; text: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let active = true
    const design = {
      ...applyPreset(DEFAULT_DESIGN, presetId),
      text,
      fontSize: 120,
      background: 'transparent' as const,
    }
    ensureFont(design)
      .then(() => {
        if (active && ref.current) renderDesign(ref.current, design, 0.55, true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [presetId, text])
  return <canvas ref={ref} aria-hidden="true" />
}

export default function App() {
  const [design, setDesign] = useState<Design>({ ...DEFAULT_DESIGN })
  const [preset, setPreset] = useState<string>('candy')
  const [past, setPast] = useState<Design[]>([])
  const [future, setFuture] = useState<Design[]>([])
  const [scale, setScale] = useState<1 | 2 | 4>(2)
  const [transparentExport, setTransparentExport] = useState(true)
  const [size, setSize] = useState({ width: 900, height: 500 })
  const [loading, setLoading] = useState(true)
  const [renderedDesign, setRenderedDesign] = useState<Design | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fontRetry, setFontRetry] = useState(0)
  const [notice, setNotice] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const helpRef = useRef<HTMLDialogElement>(null)
  const downloadLock = useRef(false)
  const empty = !design.text.trim()
  // Mark a new design as pending before the font-loading effect runs. This
  // keeps export buttons and the busy state tied to the image actually shown.
  const isPreviewLoading = loading || (!error && renderedDesign !== design)

  const change = (next: Design, presetId = '') => {
    setPast((previous) => [...previous.slice(-39), design])
    setFuture([])
    setDesign(next)
    setPreset(presetId)
    setNotice('')
  }
  const patch = (values: Partial<Design>) => change({ ...design, ...values })
  const pickPreset = (id: string) => change(applyPreset(design, id), id)
  const undo = () => {
    if (!past.length) return
    setFuture((previous) => [design, ...previous])
    setDesign(past[past.length - 1])
    setPast((previous) => previous.slice(0, -1))
    setPreset('')
  }
  const redo = () => {
    if (!future.length) return
    setPast((previous) => [...previous, design])
    setDesign(future[0])
    setFuture((previous) => previous.slice(1))
    setPreset('')
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    ensureFont(design)
      .then(() => {
        if (!active || !canvasRef.current) return
        renderDesign(
          canvasRef.current,
          design,
          Math.min(window.devicePixelRatio || 1, 2),
        )
        setSize(getLayout(design))
        setRenderedDesign(design)
        setLoading(false)
      })
      .catch(() => {
        if (active) {
          setError(
            'フォントを読み込めませんでした。再試行するか、別のフォントを選んでください。',
          )
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [design, fontRetry])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const save = async () => {
    if (downloadLock.current || empty || isPreviewLoading || error) return
    downloadLock.current = true
    setSaving(true)
    setNotice('')
    try {
      const blob = await exportPng(design, scale, transparentExport)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      const name =
        design.text
          .trim()
          .replace(/[\\/:*?"<>|\r\n]/g, '_')
          .slice(0, 24) || '文字'
      anchor.download = `mojipop-${name}-${scale}x.png`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
      setNotice('PNGのダウンロードを開始しました')
    } catch {
      setNotice(
        '保存できませんでした。解像度を下げて、もう一度お試しください。',
      )
    } finally {
      setSaving(false)
      downloadLock.current = false
    }
  }

  const decorations: { value: DecorationType; label: string }[] = [
    { value: 'none', label: 'なし' },
    { value: 'sparkle', label: 'キラキラ' },
    { value: 'star', label: '星' },
    { value: 'heart', label: 'ハート' },
    { value: 'circle', label: '丸' },
    { value: 'flower', label: '小さな花' },
    { value: 'music', label: '音符' },
  ]
  const { width: exportWidth, height: exportHeight } = getExportSize(
    design,
    scale,
  )

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="./" aria-label="mojipop ホーム">
            <span className="brand-mark">
              m<span>✦</span>
            </span>
            <span>
              moji<span className="brand-pink">pop</span>
              <span className="brand-dot">.</span>
            </span>
          </a>
          <button
            className="help-button"
            onClick={() => helpRef.current?.showModal()}
          >
            <CircleHelp size={17} />
            <span>使いかた</span>
          </button>
        </div>
      </header>

      <main className="page-shell">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <h1 id="page-title">
              ことばに、
              <span className="headline-pop">
                ときめき
                <svg viewBox="0 0 170 10" aria-hidden="true">
                  <path d="M3 7Q85-2 167 6" />
                </svg>
              </span>
              を。
            </h1>
            <p>好きな文字とスタイルで、あなただけの「かわいい」をつくろう。</p>
          </div>
          <div className="intro-sticker" aria-hidden="true">
            <Sparkles size={19} />
            <span>
              MAKE IT
              <br />
              <strong>POP!</strong>
            </span>
            <Heart size={13} />
          </div>
        </section>

        <div className="workspace">
          <aside className="settings-panel" aria-label="文字の設定">
            <section className="setting-section text-section">
              <div className="section-heading">
                <h2>
                  <span className="step-number">01</span>ことばを入力
                </h2>
                <span className="muted-small">改行もできるよ</span>
              </div>
              <label className="sr-only" htmlFor="design-text">
                作りたい文字
              </label>
              <div className="textarea-wrap">
                <textarea
                  id="design-text"
                  value={design.text}
                  maxLength={120}
                  rows={2}
                  placeholder="好きなことばを入れてみよう"
                  onChange={(e) => patch({ text: e.target.value })}
                  spellCheck={false}
                />
                <span className="character-count">
                  {design.text.length} / 120
                </span>
              </div>
            </section>

            <section className="setting-section presets-section">
              <div className="section-heading">
                <h2>
                  <span className="step-number">02</span>スタイルを選ぶ
                </h2>
                <Sparkles className="section-spark" size={16} />
              </div>
              <div className="preset-grid">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={`preset ${preset === p.id ? 'active' : ''}`}
                    aria-pressed={preset === p.id}
                    aria-label={`${p.name} プリセット`}
                    onClick={() => pickPreset(p.id)}
                  >
                    <span
                      className="preset-art"
                      style={{ background: p.surface }}
                    >
                      <span
                        style={{
                          color: p.colors[0],
                          textShadow: `1px 2px 0 ${p.colors[1]}, -1px -1px 0 white, 1px -1px 0 white, -1px 1px 0 white`,
                          fontFamily: FONT_FAMILIES[p.design.font || 'rounded'],
                        }}
                      >
                        {p.id === 'game' ? 'Aa' : 'あ'}
                      </span>
                      {preset === p.id && (
                        <span className="preset-check">
                          <Check size={10} strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="preset-name">{p.name}</span>
                  </button>
                ))}
                <button
                  className="preset random-preset"
                  onClick={() => {
                    change(randomDesign(design))
                    setNotice('新しい組み合わせができました')
                  }}
                >
                  <span className="preset-art">
                    <Dices size={25} strokeWidth={1.7} />
                  </span>
                  <span className="preset-name">おまかせ</span>
                </button>
              </div>
            </section>

            <section className="setting-section customize-section">
              <div className="section-heading">
                <h2>
                  <span className="step-number">03</span>ちょっとアレンジ
                </h2>
                <SlidersHorizontal size={16} className="section-spark" />
              </div>
              <label className="select-field">
                <span>フォント</span>
                <select
                  value={design.font}
                  onChange={(e) => {
                    const font = e.target.value as Design['font']
                    patch({
                      font,
                      fontWeight: getFontWeight(font, design.fontWeight),
                    })
                  }}
                >
                  <option value="rounded">まるっとゴシック</option>
                  <option value="gothic">どっしりゴシック</option>
                  <option value="handwritten">ゆるっと手書き</option>
                </select>
              </label>
              <FontWeight
                font={design.font}
                value={design.fontWeight}
                onChange={(fontWeight) => patch({ fontWeight })}
              />
              <div className="quick-colors">
                <span>文字のカラー</span>
                <div>
                  {[
                    '#fa79a7',
                    '#73c8ea',
                    '#ffc44e',
                    '#b393e5',
                    '#80baa1',
                    '#4c4660',
                  ].map((color) => (
                    <button
                      key={color}
                      className={`color-dot ${design.fill === color ? 'active' : ''}`}
                      style={{ '--swatch': color } as CSSProperties}
                      aria-label={`文字色 ${color}`}
                      aria-pressed={design.fill === color}
                      onClick={() => patch({ fill: color, fillMode: 'solid' })}
                    >
                      {design.fill === color && <Check size={14} />}
                    </button>
                  ))}
                  <label className="custom-color" title="好きな色">
                    <input
                      type="color"
                      aria-label="自由な文字色"
                      value={design.fill}
                      onChange={(e) => patch({ fill: e.target.value })}
                    />
                    <span aria-hidden="true">+</span>
                  </label>
                </div>
              </div>
            </section>

            <details className="advanced">
              <summary>
                <SlidersHorizontal size={16} />
                もっと調整する
                <ChevronDown size={16} />
              </summary>
              <div className="advanced-inner">
                <Detail title="文字とサイズ" icon={<Type size={16} />}>
                  <Range
                    label="文字サイズ"
                    min={40}
                    max={200}
                    value={design.fontSize}
                    unit="px"
                    onChange={(fontSize) => patch({ fontSize })}
                  />
                  <Range
                    label="文字間隔"
                    min={-8}
                    max={24}
                    value={design.letterSpacing}
                    unit="px"
                    onChange={(letterSpacing) => patch({ letterSpacing })}
                  />
                  <Range
                    label="行間"
                    min={1}
                    max={2}
                    step={0.05}
                    value={design.lineHeight}
                    onChange={(lineHeight) => patch({ lineHeight })}
                  />
                </Detail>
                <Detail
                  title="文字色・グラデーション"
                  icon={<Paintbrush size={16} />}
                >
                  <Segments
                    label="文字色の種類"
                    value={design.fillMode}
                    onChange={(fillMode) => patch({ fillMode })}
                    options={[
                      { value: 'solid', label: '単色' },
                      { value: 'gradient', label: 'グラデーション' },
                    ]}
                  />
                  <Color
                    label={design.fillMode === 'gradient' ? '開始色' : '文字色'}
                    value={design.fill}
                    onChange={(fill) => patch({ fill })}
                  />
                  {design.fillMode === 'gradient' && (
                    <>
                      <Color
                        label="終了色"
                        value={design.fillEnd}
                        onChange={(fillEnd) => patch({ fillEnd })}
                      />
                      <Range
                        label="グラデーションの方向"
                        min={0}
                        max={360}
                        value={design.gradientAngle}
                        unit="°"
                        onChange={(gradientAngle) => patch({ gradientAngle })}
                      />
                    </>
                  )}
                </Detail>
                <Detail title="縁取り" icon={<Layers2 size={16} />}>
                  <Toggle
                    label="縁取りをつける"
                    checked={design.outline}
                    onChange={(outline) => patch({ outline })}
                  />
                  {design.outline && (
                    <>
                      <Color
                        label="縁の色"
                        value={design.outlineColor}
                        onChange={(outlineColor) => patch({ outlineColor })}
                      />
                      <Range
                        label="縁の太さ"
                        min={1}
                        max={24}
                        value={design.outlineWidth}
                        unit="px"
                        onChange={(outlineWidth) => patch({ outlineWidth })}
                      />
                      <Toggle
                        label="二重縁取り"
                        checked={design.outerOutline}
                        onChange={(outerOutline) => patch({ outerOutline })}
                      />
                      {design.outerOutline && (
                        <>
                          <Color
                            label="外側の縁の色"
                            value={design.outerOutlineColor}
                            onChange={(outerOutlineColor) =>
                              patch({ outerOutlineColor })
                            }
                          />
                          <Range
                            label="外側の縁の太さ"
                            min={1}
                            max={12}
                            step={0.5}
                            value={design.outerOutlineWidth}
                            unit="px"
                            onChange={(outerOutlineWidth) =>
                              patch({ outerOutlineWidth })
                            }
                          />
                        </>
                      )}
                    </>
                  )}
                </Detail>
                <Detail title="影と立体感" icon={<Layers2 size={16} />}>
                  <Toggle
                    label="影をつける"
                    checked={design.shadow}
                    onChange={(shadow) => patch({ shadow })}
                  />
                  {design.shadow && (
                    <>
                      <Segments
                        label="影の種類"
                        value={design.shadowBlur === 0 ? 'flat' : 'soft'}
                        onChange={(value) =>
                          patch({ shadowBlur: value === 'flat' ? 0 : 10 })
                        }
                        options={[
                          { value: 'flat', label: 'くっきり' },
                          { value: 'soft', label: 'ふんわり' },
                        ]}
                      />
                      <Color
                        label="影の色"
                        value={design.shadowColor}
                        onChange={(shadowColor) => patch({ shadowColor })}
                      />
                      <Range
                        label="影の距離"
                        min={0}
                        max={32}
                        value={design.shadowDistance}
                        unit="px"
                        onChange={(shadowDistance) => patch({ shadowDistance })}
                      />
                      <Range
                        label="影のぼかし"
                        min={0}
                        max={24}
                        value={design.shadowBlur}
                        unit="px"
                        onChange={(shadowBlur) => patch({ shadowBlur })}
                      />
                      <Range
                        label="影の方向"
                        min={0}
                        max={360}
                        value={design.shadowAngle}
                        unit="°"
                        onChange={(shadowAngle) => patch({ shadowAngle })}
                      />
                    </>
                  )}
                  <Toggle
                    label="3D・押し出し"
                    checked={design.extrusion}
                    onChange={(extrusion) => patch({ extrusion })}
                  />
                  {design.extrusion && (
                    <Range
                      label="立体の奥行き"
                      min={1}
                      max={20}
                      value={design.extrusionDepth}
                      unit="px"
                      onChange={(extrusionDepth) => patch({ extrusionDepth })}
                    />
                  )}
                </Detail>
                <Detail title="小さな装飾" icon={<Sparkles size={16} />}>
                  <label className="select-field">
                    <span>モチーフ</span>
                    <select
                      value={design.decoration}
                      onChange={(e) =>
                        patch({ decoration: e.target.value as DecorationType })
                      }
                    >
                      {decorations.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {design.decoration !== 'none' && (
                    <Segments
                      label="装飾の量"
                      value={design.decorationAmount}
                      onChange={(decorationAmount) =>
                        patch({ decorationAmount })
                      }
                      options={[
                        { value: 'few', label: '少ない' },
                        { value: 'normal', label: '普通' },
                        { value: 'many', label: '多い' },
                      ]}
                    />
                  )}
                </Detail>
              </div>
            </details>
            <div className="settings-bottom">
              <ShieldCheck size={13} />
              <span>文字や画像はサーバーへ送信されません</span>
            </div>
          </aside>

          <section className="preview-column" aria-label="プレビューと保存">
            <div className="preview-card">
              <div className="preview-header">
                <h2>
                  <span className="live-dot" />
                  プレビュー
                </h2>
                <div className="preview-tools">
                  <button
                    className="icon-button"
                    aria-label="元に戻す"
                    title="元に戻す"
                    disabled={!past.length}
                    onClick={undo}
                  >
                    <Undo2 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="やり直す"
                    title="やり直す"
                    disabled={!future.length}
                    onClick={redo}
                  >
                    <Redo2 size={17} />
                  </button>
                  <span className="tool-divider" />
                  <button
                    className="icon-button"
                    aria-label="最初のデザインに戻す"
                    title="最初のデザインに戻す（取り消せます）"
                    onClick={() => change({ ...DEFAULT_DESIGN }, 'candy')}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              </div>
              {error && (
                <div className="font-error" role="alert">
                  <p>{error}</p>
                  <button onClick={() => setFontRetry((value) => value + 1)}>
                    再試行
                  </button>
                </div>
              )}
              <div
                className={`artboard ${design.background === 'transparent' ? 'checkerboard' : ''}`}
                aria-busy={isPreviewLoading}
              >
                <span className="artboard-tag">
                  {design.background === 'transparent' ? (
                    <>
                      <span className="tiny-checker" />
                      透明背景
                    </>
                  ) : (
                    '背景あり'
                  )}
                </span>
                <canvas
                  ref={canvasRef}
                  className={empty ? 'main-canvas is-empty' : 'main-canvas'}
                  role="img"
                  aria-label={
                    empty
                      ? '文字を入力するとここに表示されます'
                      : `「${design.text}」の文字画像プレビュー`
                  }
                />
                {empty && (
                  <div className="empty-state">
                    <Type size={30} />
                    <p>どんなことばを、飾ろう？</p>
                    <span>文字を入力すると、ここに表示されます。</span>
                  </div>
                )}
                {isPreviewLoading && (
                  <span className="canvas-loading">
                    <LoaderCircle size={14} className="spinning" />
                    フォントを準備中
                  </span>
                )}
                <span className="artboard-size">
                  <Maximize2 size={11} />
                  {size.width} × {size.height}
                </span>
              </div>
              <div className="background-toolbar">
                <span className="toolbar-label">背景</span>
                <div
                  className="background-options"
                  role="group"
                  aria-label="背景の種類"
                >
                  <button
                    className={`background-swatch checkerboard ${design.background === 'transparent' ? 'active' : ''}`}
                    aria-label="透明な背景"
                    aria-pressed={design.background === 'transparent'}
                    title="透明"
                    onClick={() => patch({ background: 'transparent' })}
                  >
                    {design.background === 'transparent' && <Check size={13} />}
                  </button>
                  <button
                    className={`background-swatch white-bg ${design.background === 'white' ? 'active' : ''}`}
                    aria-label="白い背景"
                    aria-pressed={design.background === 'white'}
                    title="白"
                    onClick={() => patch({ background: 'white' })}
                  >
                    {design.background === 'white' && <Check size={13} />}
                  </button>
                  <button
                    className={`background-swatch color-bg ${design.background === 'solid' ? 'active' : ''}`}
                    aria-label="好きな色の背景"
                    aria-pressed={design.background === 'solid'}
                    title="好きな色"
                    style={{ background: design.backgroundColor }}
                    onClick={() => patch({ background: 'solid' })}
                  >
                    {design.background === 'solid' && <Check size={13} />}
                  </button>
                  <button
                    className={`background-swatch gradient-bg ${design.background === 'gradient' ? 'active' : ''}`}
                    aria-label="グラデーション背景"
                    aria-pressed={design.background === 'gradient'}
                    title="グラデーション"
                    style={{
                      background: `linear-gradient(135deg, ${design.backgroundColor}, ${design.backgroundEnd})`,
                    }}
                    onClick={() => patch({ background: 'gradient' })}
                  >
                    {design.background === 'gradient' && <Check size={13} />}
                  </button>
                </div>
                <span className="background-caption">
                  {
                    {
                      transparent: '透明',
                      white: '白',
                      solid: '好きな色',
                      gradient: 'グラデーション',
                    }[design.background]
                  }
                </span>
                <button
                  className="shuffle-button"
                  onClick={() => {
                    change(randomDesign(design))
                    setNotice('新しい組み合わせができました')
                  }}
                >
                  <Dices size={16} />
                  おまかせ<small>であそぶ</small>
                </button>
              </div>
              {(design.background === 'solid' ||
                design.background === 'gradient') && (
                <div className="background-colors">
                  <Color
                    label="背景色"
                    value={design.backgroundColor}
                    onChange={(backgroundColor) => patch({ backgroundColor })}
                  />
                  {design.background === 'gradient' && (
                    <Color
                      label="背景の終了色"
                      value={design.backgroundEnd}
                      onChange={(backgroundEnd) => patch({ backgroundEnd })}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="export-card">
              <div className="export-top">
                <div>
                  <h2>できたら、お持ち帰り。</h2>
                  <p>PNG画像で、くっきり保存。</p>
                </div>
                <span className="file-badge">PNG</span>
              </div>
              <div className="export-options">
                <div className="resolution-control">
                  <span>解像度</span>
                  <Segments
                    label="保存する解像度"
                    value={scale}
                    onChange={setScale}
                    options={[
                      { value: 1, label: '1×' },
                      { value: 2, label: '2×' },
                      { value: 4, label: '4×' },
                    ]}
                  />
                </div>
                <span className="export-size" data-testid="export-size">
                  {exportWidth.toLocaleString()} ×{' '}
                  {exportHeight.toLocaleString()} px
                </span>
              </div>
              {exportWidth < size.width * scale && (
                <p className="inline-message">
                  大きな画像のため、表示のサイズに調整して保存します。
                </p>
              )}
              <div className="export-bottom">
                <div
                  className="export-background"
                  role="group"
                  aria-label="保存する背景"
                >
                  <label>
                    <input
                      type="radio"
                      name="export-bg"
                      checked={transparentExport}
                      onChange={() => setTransparentExport(true)}
                    />
                    透明背景
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="export-bg"
                      checked={!transparentExport}
                      onChange={() => setTransparentExport(false)}
                    />
                    背景込み
                    {design.background === 'transparent' && (
                      <small>（白）</small>
                    )}
                  </label>
                </div>
                <button
                  className="download-button"
                  onClick={save}
                  disabled={empty || isPreviewLoading || saving || !!error}
                >
                  {saving ? (
                    <LoaderCircle size={18} className="spinning" />
                  ) : (
                    <ArrowDownToLine size={18} />
                  )}
                  {saving ? '書き出し中…' : 'PNGで保存'}
                </button>
              </div>
              {empty && (
                <p className="inline-message">
                  保存する文字を入力してください。
                </p>
              )}
            </div>

            <section className="inspiration">
              <div className="inspiration-heading">
                <h2>こんな気分も、ワンタップ。</h2>
                <span>TRY A LITTLE SOMETHING</span>
              </div>
              <div className="example-grid">
                {[
                  {
                    id: 'soda',
                    text: 'HELLO!',
                    name: 'さわやかに',
                    surface: '#edf7fa',
                  },
                  {
                    id: 'strawberry',
                    text: 'ありがとう',
                    name: 'やさしく',
                    surface: '#fff0f3',
                  },
                  {
                    id: 'retro',
                    text: '推しが尊い',
                    name: 'とびきり元気に',
                    surface: '#fff6df',
                  },
                ].map((example) => (
                  <button
                    key={example.id}
                    className="example-card"
                    style={{ background: example.surface }}
                    onClick={() =>
                      change(
                        {
                          ...applyPreset(design, example.id),
                          text: example.text,
                        },
                        example.id,
                      )
                    }
                  >
                    <MiniArt presetId={example.id} text={example.text} />
                    <span>
                      {example.name}
                      <ArrowRight size={12} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </section>
        </div>
        <footer className="page-footer">
          <span className="footer-wordmark">mojipop.</span>
          <span>小さなことばに、大きなときめき。</span>
        </footer>
      </main>
      <nav className="mobile-actions" aria-label="クイック操作">
        <button
          className="mobile-preview-button"
          onClick={() =>
            document.querySelector('.preview-card')?.scrollIntoView({
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                .matches
                ? 'instant'
                : 'smooth',
              block: 'start',
            })
          }
        >
          <Maximize2 size={16} />
          プレビューへ
        </button>
        <button
          className="download-button"
          disabled={empty || isPreviewLoading || saving || !!error}
          onClick={save}
        >
          {saving ? (
            <LoaderCircle size={16} className="spinning" />
          ) : (
            <ArrowDownToLine size={16} />
          )}
          {saving ? '書き出し中…' : '画像を保存'}
        </button>
      </nav>
      <div
        className={`toast ${notice ? 'visible' : ''}`}
        role="status"
        aria-live="polite"
      >
        {notice && (
          <>
            <Check size={17} />
            {notice}
          </>
        )}
      </div>
      <dialog
        ref={helpRef}
        className="help-dialog"
        aria-labelledby="help-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) helpRef.current?.close()
        }}
      >
        <div className="dialog-heading">
          <h2 id="help-title">かわいいまで、3ステップ。</h2>
          <button
            className="icon-button"
            aria-label="使いかたを閉じる"
            onClick={() => helpRef.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <ol>
          <li>
            <strong>好きなことばを入力</strong>
            <p>日本語も英語も、改行もOK。</p>
          </li>
          <li>
            <strong>ぴったりのスタイルを選ぶ</strong>
            <p>迷ったら「おまかせ」。色やフォントも自由にアレンジできます。</p>
          </li>
          <li>
            <strong>PNGで保存</strong>
            <p>
              背景を透かしたいときは「透明背景」を選択。大きく使うなら2×・4×がおすすめです。
            </p>
          </li>
        </ol>
        <p className="dialog-note">
          作成内容はこのブラウザ内だけで処理されます。再読み込みすると初期状態に戻ります。
        </p>
        <button
          className="download-button dialog-start"
          onClick={() => helpRef.current?.close()}
        >
          つくってみる
          <Sparkles size={17} />
        </button>
      </dialog>
    </>
  )
}
