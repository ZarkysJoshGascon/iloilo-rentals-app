// src/components/crm/Sparkline.tsx
// A tiny trend line for KPI tiles: a line with a soft wash under it and,
// when the values cross zero, a dashed zero line so losses read at a glance.
import { useId } from 'react'
import { cn } from '@/lib/utils'

// Line colour follows the text colour of the tone.
const TONES = {
  good: 'text-emerald-600 dark:text-emerald-400',
  bad: 'text-red-600 dark:text-red-400',
  neutral: 'text-brand',
}

const VIEW_W = 100

type SparklineProps = {
  values: any
  tone?: string
  height?: number
  label: string
  className?: string
}

/**
 * values  numbers in time order (nulls are skipped)
 * tone    'good' | 'bad' | 'neutral'
 */
export function Sparkline({ values, tone = 'neutral', height = 28, label, className }: SparklineProps) {
  const gradientId = useId()
  const pts = (values || []).filter((v) => Number.isFinite(v))
  if (pts.length < 2) return <div aria-hidden style={{ height }} className={className} />

  const min = Math.min(...pts, 0)
  const max = Math.max(...pts, 0)
  const span = max - min || 1
  const pad = 2
  const x = (i) => (i / (pts.length - 1)) * VIEW_W
  const y = (v) => pad + (1 - (v - min) / span) * (height - pad * 2)

  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const zeroY = y(0)
  const area = `${line} L${VIEW_W},${zeroY.toFixed(2)} L0,${zeroY.toFixed(2)} Z`
  const crossesZero = min < 0 && max > 0

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      className={cn('block w-full overflow-visible', TONES[tone] || TONES.neutral, className)}
      style={{ height }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} stroke="none" />
      {crossesZero && (
        <line
          x1="0" x2={VIEW_W} y1={zeroY} y2={zeroY}
          stroke="var(--foreground)" strokeOpacity={0.3} strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
