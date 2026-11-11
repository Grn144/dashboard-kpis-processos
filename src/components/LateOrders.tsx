import type { LateOrder } from '../lib/kpis'
import { formatHours } from '../lib/format'

export default function LateOrders({ orders }: { orders: LateOrder[] }) {
  return (
    <section className="panel" aria-labelledby="late-title">
      <h2 id="late-title">Pedidos mais atrasados em relação ao SLA</h2>
      {orders.length === 0 ? (
        <p className="muted">Nenhum pedido fora do SLA no período.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Pedido</th>
                <th scope="col">Região</th>
                <th scope="col" className="num">Lead time</th>
                <th scope="col" className="num">SLA</th>
                <th scope="col" className="num">Atraso</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <th scope="row">{o.id}</th>
                  <td>{o.region}</td>
                  <td className="num">{formatHours(o.leadHours)}</td>
                  <td className="num">{formatHours(o.slaHours)}</td>
                  <td className="num late">+{formatHours(o.delayHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
