import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { StageStat } from '../lib/kpis'
import { formatHours } from '../lib/format'
import DataTable from './DataTable'
import { axisTick, tooltipProps, useNarrow } from './chart'

type Props = {
  stages: StageStat[]
  bottleneck: string
}

const label = (step: string, bottleneck: string) => (step === bottleneck ? `${step} (gargalo)` : step)

export default function StageChart({ stages, bottleneck }: Props) {
  const data = stages.map((s) => ({ ...s, label: label(s.step, bottleneck) }))
  const opacity = (step: string) => (step === bottleneck ? 1 : 0.45)
  const narrow = useNarrow()

  return (
    <figure className="panel panel--wide" aria-labelledby="stage-title" aria-describedby="stage-desc">
      <figcaption>
        <h2 id="stage-title">Tempo médio por etapa</h2>
        <p id="stage-desc" className="muted">
          Espera desde o fim da etapa anterior + execução. O gargalo é a etapa com maior tempo total:{' '}
          <strong>{bottleneck}</strong>.
        </p>
      </figcaption>
      <ResponsiveContainer width="100%" height={70 + stages.length * 44}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: narrow ? 12 : 24, bottom: 8, left: 0 }} barCategoryGap={10}>
          <CartesianGrid horizontal={false} stroke="var(--grid)" />
          <XAxis type="number" tick={axisTick} tickFormatter={(v: number) => `${v} h`} stroke="var(--axis)" />
          <YAxis
            type="category"
            dataKey="label"
            width={narrow ? 128 : 180}
            tickLine={false}
            stroke="var(--axis)"
            tick={({ x, y, payload }) => (
              <text
                x={x}
                y={y}
                dy={4}
                textAnchor="end"
                fontSize={narrow ? 11 : 13}
                fill="var(--text)"
                fontWeight={String(payload.value).endsWith('(gargalo)') ? 700 : 400}
              >
                {payload.value}
              </text>
            )}
          />
          <Tooltip {...tooltipProps} formatter={(v) => formatHours(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="avgWaitHours" name="Espera" stackId="t" fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2}>
            {data.map((d) => (
              <Cell key={d.step} fillOpacity={opacity(d.step)} />
            ))}
          </Bar>
          <Bar
            dataKey="avgExecHours"
            name="Execução"
            stackId="t"
            fill="var(--series-1)"
            stroke="var(--surface)"
            strokeWidth={2}
            radius={[0, 4, 4, 0]}
          >
            {data.map((d) => (
              <Cell key={d.step} fillOpacity={opacity(d.step)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <DataTable
        caption="Tempo médio por etapa"
        columns={['Etapa', 'Espera', 'Execução', 'Total', 'Execuções']}
        rows={stages.map((s) => [
          label(s.step, bottleneck),
          formatHours(s.avgWaitHours),
          formatHours(s.avgExecHours),
          formatHours(s.totalHours),
          s.executions,
        ])}
      />
    </figure>
  )
}
