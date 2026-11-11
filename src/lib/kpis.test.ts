import { describe, expect, it } from 'vitest'
import type { StepRow } from './parse'
import {
  computeKpis,
  filterOrders,
  groupOrders,
  lateOrders,
  percentile,
  reworkByStep,
  stageStats,
  weekOf,
  weeklyStats,
} from './kpis'

const at = (day: number, hour: number) => Date.UTC(2026, 8, day, hour)

function row(orderId: string, step: string, start: number, end: number, extra: Partial<StepRow> = {}): StepRow {
  return { orderId, step, start, end, owner: 'X-01', region: 'Capital SP', rework: false, slaHours: 24, ...extra }
}

describe('groupOrders / lead time', () => {
  it('lead time vai do início da primeira etapa ao fim da última', () => {
    const [order] = groupOrders([
      row('P1', 'Entrega', at(2, 10), at(2, 14)),
      row('P1', 'Recebimento', at(1, 8), at(1, 9)),
      row('P1', 'Separação', at(1, 10), at(1, 12)),
    ])
    expect(order?.leadHours).toBe(30)
    expect(order?.rows.map((r) => r.step)).toEqual(['Recebimento', 'Separação', 'Entrega'])
  })

  it('pedido com uma etapa só tem lead time igual à execução', () => {
    const [order] = groupOrders([row('P1', 'Recebimento', at(1, 8), at(1, 11))])
    expect(order?.leadHours).toBe(3)
  })

  it('usa o maior fim mesmo quando a última etapa a começar termina antes', () => {
    const [order] = groupOrders([
      row('P1', 'A', at(1, 8), at(1, 20)),
      row('P1', 'B', at(1, 9), at(1, 10)),
    ])
    expect(order?.leadHours).toBe(12)
  })
})

describe('percentile', () => {
  it('interpola como o PERCENTIL.INC', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(percentile(values, 0.5)).toBe(5.5)
    expect(percentile(values, 0.9)).toBeCloseTo(9.1)
    expect(percentile([7], 0.9)).toBe(7)
    expect(percentile([], 0.9)).toBe(0)
  })
})

describe('stageStats', () => {
  it('calcula execução e espera em relação à etapa anterior do mesmo pedido', () => {
    const orders = groupOrders([
      row('P1', 'Separação', at(1, 8), at(1, 9)),
      row('P1', 'Conferência', at(1, 13), at(1, 14)),
      row('P2', 'Separação', at(1, 8), at(1, 11)),
      row('P2', 'Conferência', at(1, 13), at(1, 15)),
    ])
    const stats = stageStats(orders)
    expect(stats.map((s) => s.step)).toEqual(['Separação', 'Conferência'])
    expect(stats[0]).toMatchObject({ avgExecHours: 2, avgWaitHours: 0 })
    // esperas de 4h e 2h, execuções de 1h e 2h
    expect(stats[1]).toMatchObject({ avgExecHours: 1.5, avgWaitHours: 3, totalHours: 4.5 })
  })

  it('não gera espera negativa quando as etapas se sobrepõem', () => {
    const orders = groupOrders([row('P1', 'A', at(1, 8), at(1, 12)), row('P1', 'B', at(1, 10), at(1, 11))])
    expect(stageStats(orders)[1]?.avgWaitHours).toBe(0)
  })

  it('conta a espera de cada execução repetida por retrabalho', () => {
    const orders = groupOrders([
      row('P1', 'Separação', at(1, 8), at(1, 9)),
      row('P1', 'Conferência', at(1, 10), at(1, 11)),
      row('P1', 'Separação', at(1, 15), at(1, 16), { rework: true }),
      row('P1', 'Conferência', at(1, 16), at(1, 17), { rework: true }),
    ])
    const sep = stageStats(orders).find((s) => s.step === 'Separação')
    expect(sep).toMatchObject({ executions: 2, avgWaitHours: 4 })
  })
})

describe('SLA e atrasos', () => {
  const orders = groupOrders([
    row('P1', 'A', at(1, 0), at(1, 24 - 1)),
    row('P2', 'A', at(1, 0), at(2, 0)),
    row('P3', 'A', at(1, 0), at(3, 0), { region: 'Interior SP', slaHours: 48 }),
    row('P4', 'A', at(1, 0), at(4, 6), { region: 'Interior SP', slaHours: 48 }),
    row('P5', 'A', at(1, 0), at(2, 10)),
  ])

  it('lead time igual ao SLA ainda está no prazo', () => {
    expect(computeKpis(orders)?.slaRate).toBeCloseTo(3 / 5)
  })

  it('ordena os atrasados pelo tamanho do atraso', () => {
    expect(lateOrders(orders)).toEqual([
      { id: 'P4', region: 'Interior SP', leadHours: 78, slaHours: 48, delayHours: 30 },
      { id: 'P5', region: 'Capital SP', leadHours: 34, slaHours: 24, delayHours: 10 },
    ])
  })
})

describe('retrabalho', () => {
  const orders = groupOrders([
    row('P1', 'Separação', at(1, 8), at(1, 9)),
    row('P1', 'Conferência', at(1, 10), at(1, 11)),
    row('P1', 'Separação', at(1, 12), at(1, 13), { rework: true }),
    row('P1', 'Conferência', at(1, 13), at(1, 14), { rework: true }),
    row('P2', 'Separação', at(1, 8), at(1, 9)),
    row('P2', 'Conferência', at(1, 10), at(1, 11)),
    row('P3', 'Separação', at(1, 8), at(1, 9)),
    row('P3', 'Entrega', at(1, 10), at(1, 11), { rework: true }),
    row('P4', 'Separação', at(1, 8), at(1, 9)),
  ])

  it('conta pedidos, não linhas', () => {
    expect(computeKpis(orders)?.reworkRate).toBe(0.5)
  })

  it('separa por etapa', () => {
    expect(reworkByStep(orders, ['Separação', 'Conferência', 'Entrega'])).toEqual([
      { step: 'Separação', rate: 0.25 },
      { step: 'Conferência', rate: 0.25 },
      { step: 'Entrega', rate: 0.25 },
    ])
  })
})

describe('gargalo', () => {
  it('é a etapa com maior espera + execução', () => {
    // Separação executa mais (4h), mas Conferência soma 6h de espera + 1h
    const orders = groupOrders([
      row('P1', 'Separação', at(1, 8), at(1, 12)),
      row('P1', 'Conferência', at(1, 18), at(1, 19)),
      row('P1', 'Entrega', at(1, 19), at(1, 22)),
    ])
    expect(computeKpis(orders)?.bottleneck).toBe('Conferência')
  })
})

describe('semanas e filtros', () => {
  it('agrupa pela segunda-feira da semana de início do pedido', () => {
    // 2026-09-06 é domingo, 2026-09-07 é segunda
    expect(weekOf(at(6, 23))).toBe(Date.UTC(2026, 7, 31))
    expect(weekOf(at(7, 0))).toBe(Date.UTC(2026, 8, 7))

    const weeks = weeklyStats(
      groupOrders([
        row('P1', 'A', at(1, 0), at(1, 10)),
        row('P2', 'A', at(2, 0), at(3, 6)),
        row('P3', 'A', at(8, 0), at(8, 4)),
      ]),
    )
    expect(weeks).toEqual([
      { week: Date.UTC(2026, 7, 31), orders: 2, avgLeadHours: 20, slaRate: 0.5 },
      { week: Date.UTC(2026, 8, 7), orders: 1, avgLeadHours: 4, slaRate: 1 },
    ])
  })

  it('filtra por período (inclusivo) e região', () => {
    const orders = groupOrders([
      row('P1', 'A', at(1, 8), at(1, 9)),
      row('P2', 'A', at(2, 23), at(3, 1), { region: 'Interior SP' }),
      row('P3', 'A', at(3, 0), at(3, 1)),
    ])
    const ids = (f: Parameters<typeof filterOrders>[1]) => filterOrders(orders, f).map((o) => o.id)
    expect(ids({ from: '2026-09-02', to: '2026-09-02', region: '' })).toEqual(['P2'])
    expect(ids({ from: '', to: '', region: 'Capital SP' })).toEqual(['P1', 'P3'])
    expect(ids({ from: '', to: '', region: '' })).toHaveLength(3)
  })

  it('sem pedidos não há KPIs', () => {
    expect(computeKpis([])).toBeNull()
  })
})
