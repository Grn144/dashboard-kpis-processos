import type { Filters as FilterValues, Order } from '../lib/kpis'
import { toInputDate } from '../lib/format'

type Props = {
  orders: Order[]
  value: FilterValues
  onChange: (value: FilterValues) => void
}

export default function Filters({ orders, value, onChange }: Props) {
  const regions = [...new Set(orders.map((o) => o.region))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const starts = orders.map((o) => o.start)
  const min = toInputDate(Math.min(...starts))
  const max = toInputDate(Math.max(...starts))
  const active = value.from || value.to || value.region

  return (
    <form className="filters" aria-label="Filtros" onSubmit={(e) => e.preventDefault()}>
      <label>
        De
        <input type="date" min={min} max={max} value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
      </label>
      <label>
        Até
        <input type="date" min={min} max={max} value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </label>
      <label>
        Região
        <select value={value.region} onChange={(e) => onChange({ ...value, region: e.target.value })}>
          <option value="">Todas</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="button" disabled={!active} onClick={() => onChange({ from: '', to: '', region: '' })}>
        Limpar filtros
      </button>
      <p className="filters-note">O período considera a data de início do pedido.</p>
    </form>
  )
}
