// src/components/admin/_shared/ScrollChart.tsx
// A Recharts chart that never squeezes its labels. When every point gets at
// least `pointWidth` pixels it draws normally; on a narrower screen (phones)
// the plot scrolls sideways while the value axis stays fixed on the left, the
// edges fade to show there is more, and it opens on `focusIndex` (e.g. this
// month). Both halves use the same `yTicks`, so the axis lines up with the grid.
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import type { CSSProperties, PointerEvent, ReactElement } from 'react'

const FADE = 18
// Tooltip width to plan for before the first one has been drawn.
const TOOLTIP_GUESS = 180

type Margin = { top: number; right: number; left: number; bottom: number }

type RenderArgs = {
  /** The value axis to place in the chart (hidden while scrolling; the fixed one shows). */
  yAxis: ReactElement
  /** Pass to <Tooltip position>: keeps the tooltip inside the visible strip while scrolling. */
  tooltipPosition?: { x: number }
}

type ScrollChartProps = {
  data: any[]
  /** Pixels each point needs for its label and marks to read well. */
  pointWidth: number
  height: number
  /** Width of the value axis, the same in both modes. */
  axisWidth: number
  margin: Margin
  /** The value axis: ticks and formatting, shared by the plot and the fixed axis. */
  yTicks: number[]
  yDomain: [number, number]
  yTickFormatter: (v: number) => string
  yTick: any
  /** Builds the chart (a Recharts chart element, without a ResponsiveContainer). */
  render: (o: RenderArgs) => ReactElement
  /** The point to bring into view first when scrolling, e.g. the current month. */
  focusIndex?: number
  /** What swiping reveals, e.g. "months". */
  unit?: string
}

/** Round axis steps from 0 (or a negative low) to just past the high value.
 *  `integer` keeps steps whole, for counts. */
export function niceTicks(min: number, max: number, count = 4, integer = false) {
  const lo = Math.min(0, min)
  let hi = Math.max(0, max)
  // Nothing to show yet: a plain 0–4 (counts) or ₱0–1k scale, not 0–0.
  if (hi === lo) hi = lo + (integer ? count : 1000)
  const span = hi - lo
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const steps = (integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]).map((m) => m * mag)
  const step = Math.max(integer ? 1 : 0, steps.find((s) => s >= raw) ?? 10 * mag)
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return ticks
}

export function ScrollChart({
  data, pointWidth, height, axisWidth, margin, yTicks, yDomain, yTickFormatter, yTick,
  render, focusIndex, unit = 'months',
}: ScrollChartProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [edges, setEdges] = useState({ left: false, right: false })
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number } | undefined>()

  // The outer box is the same element in both modes, so turning a phone
  // sideways can switch back to the full chart.
  useLayoutEffect(() => {
    const node = boxRef.current
    if (!node) return
    const measure = () => setWidth(node.clientWidth)
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(node)
    return () => ro?.disconnect()
  }, [])

  const plotWidth = data.length * pointWidth + margin.right
  const scrolling = width > 0 && plotWidth > width - axisWidth

  const updateEdges = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
  }, [])

  // Open on the focus point (kept near the right edge, so earlier months are a
  // swipe back), once per switch into scrolling.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!scrolling || !el) return
    const target = focusIndex == null ? el.scrollWidth : (focusIndex + 1.5) * pointWidth - el.clientWidth
    el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth))
    updateEdges()
  }, [scrolling, focusIndex, pointWidth, updateEdges])

  // Recharts places the tooltip within the whole (wide) chart, which can be
  // off screen while scrolling; keep it beside the finger, inside the strip.
  const placeTooltip = (e: PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el) return
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left
    const tip = el.querySelector<HTMLElement>('.recharts-tooltip-wrapper')
    const w = tip?.offsetWidth || TOOLTIP_GUESS
    const lo = el.scrollLeft + 4
    const hi = Math.max(lo, el.scrollLeft + el.clientWidth - w - 4)
    setTooltipPosition({ x: Math.min(Math.max(x + 12, lo), hi) })
  }

  const axisProps = {
    tick: yTick,
    tickLine: false,
    axisLine: false,
    width: axisWidth,
    domain: yDomain,
    ticks: yTicks,
    interval: 0 as const,
    allowDataOverflow: true,
    tickFormatter: yTickFormatter,
  }
  const yAxis = <YAxis {...axisProps} hide={scrolling} />

  const fade = `linear-gradient(to right, ${edges.left ? 'transparent' : '#000'} 0, #000 ${FADE}px, #000 calc(100% - ${FADE}px), ${edges.right ? 'transparent' : '#000'} 100%)`
  const mask: CSSProperties = { maskImage: fade, WebkitMaskImage: fade }

  return (
    <div ref={boxRef}>
      {!scrolling ? (
        <div style={{ height }}>
          {width > 0 && (
            <ResponsiveContainer width="100%" height={height} debounce={100}>
              {render({ yAxis })}
            </ResponsiveContainer>
          )}
        </div>
      ) : (
        <>
          <div className="flex" style={{ height }}>
            {/* Fixed value axis: an empty chart with the same margins and x band. */}
            <div className="flex-shrink-0" style={{ width: axisWidth, height }}>
              <BarChart width={axisWidth} height={height} data={data} margin={{ ...margin, left: 0, right: 0 }}>
                <XAxis dataKey="label" tick={false} tickLine={false} axisLine={false} />
                <YAxis {...axisProps} />
                <Bar dataKey="__none" fill="transparent" isAnimationActive={false} />
              </BarChart>
            </div>
            <div
              ref={scrollRef}
              onScroll={updateEdges}
              className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={mask}
              role="region"
              aria-label={`Chart, swipe sideways to see all ${unit}`}
              tabIndex={0}
            >
              <div style={{ width: plotWidth, height }} onPointerDown={placeTooltip} onPointerMove={placeTooltip}>
                <ResponsiveContainer width={plotWidth} height={height}>
                  {render({ yAxis, tooltipPosition })}
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-foreground mt-1 pl-2">Swipe sideways to see all {unit}</p>
        </>
      )}
    </div>
  )
}
