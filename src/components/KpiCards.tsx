import type { Kpis } from '../lib/kpis'
import { formatHours, formatPercent } from '../lib/format'

export default function KpiCards({ kpis }: { kpis: Kpis }) {
  const bottleneck = kpis.stages.find((s) => s.step === kpis.bottleneck)!

  return (
    <section className="cards" aria-label="Resumo dos indicadores">
      <article className="card">
        <h2>Pedidos</h2>
        <p className="card-value">{kpis.orders.toLocaleString('pt-BR')}</p>
        <p className="card-detail">no período filtrado</p>
      </article>
      <article className="card">
        <h2>Lead time médio</h2>
        <p className="card-value">{formatHours(kpis.lead.mean)}</p>
        <p className="card-detail">
          mediana {formatHours(kpis.lead.median)} · P90 {formatHours(kpis.lead.p90)}
        </p>
      </article>
      <article className="card">
        <h2>Dentro do SLA</h2>
        <p className="card-value">{formatPercent(kpis.slaRate)}</p>
        <p className="card-detail">dos pedidos entregues no prazo</p>
      </article>
      <article className="card">
        <h2>Retrabalho</h2>
        <p className="card-value">{formatPercent(kpis.reworkRate)}</p>
        <p className="card-detail">dos pedidos com ao menos uma etapa refeita</p>
      </article>
      <article className="card card--highlight">
        <h2>Gargalo</h2>
        <p className="card-value card-value--text">{kpis.bottleneck}</p>
        <p className="card-detail">
          {formatHours(bottleneck.avgWaitHours)} de espera + {formatHours(bottleneck.avgExecHours)} de execução
        </p>
      </article>
    </section>
  )
}
