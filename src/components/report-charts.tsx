"use client"

import { Bar, BarChart, Cell, PolarAngleAxis, RadialBar, RadialBarChart, XAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

// Flodesk-style report charts, shared by an email's report and a person's analytics.

export type GlanceBar = { label: string; value: number; color: string }

const glanceConfig = { value: { label: "Count", color: "var(--chart-1)" } } satisfies ChartConfig

// The count over the label, so a bar with nothing yet still reads "0".
function GlanceTick({ x, y, payload, data }: { x?: number; y?: number; payload?: { value: string }; data: GlanceBar[] }) {
  const value = data.find((row) => row.label === payload?.value)?.value ?? 0
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text textAnchor="middle" dy={14} className="fill-foreground font-medium tabular-nums" fontSize={14}>
        {value}
      </text>
      <text textAnchor="middle" dy={32} className="fill-muted-foreground" fontSize={12}>
        {payload?.value}
      </text>
    </g>
  )
}

// Tall bars, one color each, with the counts written underneath.
export function GlanceChart({ data, className = "aspect-auto h-44 w-full sm:h-64" }: { data: GlanceBar[]; className?: string }) {
  return (
    <ChartContainer config={glanceConfig} className={className}>
      <BarChart data={data} margin={{ top: 8, left: 8, right: 8, bottom: 8 }} barCategoryGap="30%">
        <XAxis dataKey="label" tickLine={false} axisLine={false} height={44} interval={0} tick={<GlanceTick data={data} />} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell key={entry.label} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

// One ring for a single rate. The number sits in the middle, so the ring only shows the share.
export function RateRing({ title, value, caption, color }: { title: string; value: number | null; caption: string; color: string }) {
  const config = { value: { label: title, color } } satisfies ChartConfig
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <div className="relative size-40">
          <ChartContainer config={config} className="aspect-square size-40">
            <RadialBarChart data={[{ value: value ?? 0 }]} innerRadius="84%" outerRadius="100%" startAngle={90} endAngle={-270}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
              <RadialBar dataKey="value" fill="var(--color-value)" background={{ fill: "var(--muted)" }} cornerRadius={4} isAnimationActive={false} />
            </RadialBarChart>
          </ChartContainer>
          <span className="absolute inset-0 flex items-center justify-center font-heading text-3xl font-normal tabular-nums">
            {value === null ? "-" : `${value}%`}
          </span>
        </div>
        <p className="max-w-56 text-center text-xs text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  )
}
