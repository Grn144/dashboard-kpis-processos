import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { WeekStat } from '../lib/kpis'
import { formatDay, formatHours, formatPercent } from '../lib/format'
import DataTable from './DataTable'
import { axisTick, tooltipProps } from './chart'

type Point = WeekStat & { label: string }

type TrendProps = {
  id: string
  title: string
  description: string
  data: Point[]
  dataKey: 'avgLeadHours' | 'slaRate'
  name: string
  format: (value: number) => string
  domain?: [number, number]
}

function Trend({ id, title, description, data, dataKey, name, format, domain }: TrendProps) {
  return (
    <figure className="panel" aria-labelledby={id}>
      <figcaption>
        <h2 id={id}>{title}</h2>
        <p className="muted">{description}</p>
      </figcaption>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tick={axisTick} stroke="var(--axis)" />
          <YAxis domain={domain} tick={axisTick} tickFormatter={(v: number) => format(v)} stroke="var(--axis)" width={56} />
          <Tooltip
            {...tooltipProps}
            cursor={{ stroke: 'var(--axis)' }}
            labelFormatter={(l) => `Semana de ${String(l)}`}
            formatter={(v) => [format(Number(v)), name]}
          />
          <Line
            type="linear"
            dataKey={dataKey}
            name={name}
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'var(--series-1)', stroke: 'var(--surface)', strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: 'var(--surface)', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <DataTable
        caption={title}
        columns={['Semana', 'Pedidos', name]}
        rows={data.map((w) => [w.label, w.orders, format(w[dataKey])])}
      />
    </figure>
  )
}

// lead time e SLA têm escalas diferentes, então ficam em gráficos separados em vez de eixo duplo
export default function TrendCharts({ weeks }: { weeks: WeekStat[] }) {
  const data = weeks.map((w) => ({ ...w, label: formatDay(w.week) }))
  const description = 'Semanas a partir de segunda-feira, pela data de início do pedido'

  return (
    <>
      <Trend
        id="lead-trend-title"
        title="Lead time médio por semana"
        description={description}
        data={data}
        dataKey="avgLeadHours"
        name="Lead time médio"
        format={formatHours}
      />
      <Trend
        id="sla-trend-title"
        title="Pedidos dentro do SLA por semana"
        description={description}
        data={data}
        dataKey="slaRate"
        name="Dentro do SLA"
        format={formatPercent}
        domain={[0, 1]}
      />
    </>
  )
}
