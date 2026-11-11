import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatPercent } from '../lib/format'
import DataTable from './DataTable'
import { axisTick, tooltipProps, useNarrow } from './chart'

type Props = {
  data: { step: string; rate: number }[]
}

export default function ReworkChart({ data }: Props) {
  const narrow = useNarrow()
  // marcas a cada 5 p.p. para o eixo não mostrar valores quebrados como 3,5%
  const top = Math.max(0.05, Math.ceil(Math.max(...data.map((d) => d.rate)) * 20) / 20)
  const ticks = Array.from({ length: Math.round(top * 20) + 1 }, (_, i) => i / 20)

  return (
    <figure className="panel panel--wide" aria-labelledby="rework-title">
      <figcaption>
        <h2 id="rework-title">Retrabalho por etapa</h2>
        <p className="muted">% dos pedidos com a etapa refeita ao menos uma vez</p>
      </figcaption>
      <ResponsiveContainer width="100%" height={50 + data.length * 36}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 8 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--grid)" />
          <XAxis
            type="number"
            tick={axisTick}
            domain={[0, ticks.at(-1)!]}
            ticks={ticks}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            stroke="var(--axis)"
          />
          <YAxis
            type="category"
            dataKey="step"
            width={narrow ? 128 : 180}
            tickLine={false}
            tick={{ ...axisTick, fill: 'var(--text)', fontSize: narrow ? 11 : 13 }}
            stroke="var(--axis)"
          />
          <Tooltip {...tooltipProps} formatter={(v) => [formatPercent(Number(v)), 'Pedidos com retrabalho']} />
          <Bar dataKey="rate" name="Retrabalho" fill="var(--series-1)" radius={[0, 4, 4, 0]}>
            <LabelList
              dataKey="rate"
              position="right"
              formatter={(v) => (Number(v) > 0 ? formatPercent(Number(v)) : '')}
              fill="var(--text-secondary)"
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <DataTable
        caption="Retrabalho por etapa"
        columns={['Etapa', 'Pedidos com retrabalho']}
        rows={data.map((d) => [d.step, formatPercent(d.rate)])}
      />
    </figure>
  )
}
