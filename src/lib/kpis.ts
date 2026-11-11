import type { StepRow } from './parse'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export type Order = {
  id: string
  region: string
  slaHours: number
  start: number
  end: number
  leadHours: number
  rows: StepRow[]
}

export type StageStat = {
  step: string
  avgExecHours: number
  avgWaitHours: number
  totalHours: number
  executions: number
}

export type WeekStat = {
  week: number
  orders: number
  avgLeadHours: number
  slaRate: number
}

export type LateOrder = {
  id: string
  region: string
  leadHours: number
  slaHours: number
  delayHours: number
}

export type Kpis = {
  orders: number
  lead: { mean: number; median: number; p90: number }
  slaRate: number
  reworkRate: number
  stages: StageStat[]
  bottleneck: string
  reworkByStep: { step: string; rate: number }[]
  weekly: WeekStat[]
  late: LateOrder[]
}

export type Filters = {
  from: string
  to: string
  region: string
}

export function groupOrders(rows: StepRow[]): Order[] {
  const byId = new Map<string, StepRow[]>()
  for (const row of rows) {
    const list = byId.get(row.orderId)
    if (list) list.push(row)
    else byId.set(row.orderId, [row])
  }

  return [...byId].map(([id, list]) => {
    const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end)
    const first = sorted[0]!
    const start = first.start
    const end = Math.max(...sorted.map((r) => r.end))
    return {
      id,
      region: first.region,
      slaHours: first.slaHours,
      start,
      end,
      leadHours: (end - start) / HOUR_MS,
      rows: sorted,
    }
  })
}

function dayStart(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

export function filterOrders(orders: Order[], filters: Filters): Order[] {
  const from = filters.from ? dayStart(filters.from) : -Infinity
  const to = filters.to ? dayStart(filters.to) + DAY_MS : Infinity
  return orders.filter(
    (o) => o.start >= from && o.start < to && (!filters.region || o.region === filters.region),
  )
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0
}

// mesma interpolação linear do PERCENTIL.INC do Excel, para bater com quem conferir na planilha
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * p
  const lower = Math.floor(pos)
  const upper = Math.ceil(pos)
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (pos - lower)
}

export function isWithinSla(order: Order): boolean {
  return order.leadHours <= order.slaHours
}

export function stageStats(orders: Order[]): StageStat[] {
  const acc = new Map<string, { exec: number[]; wait: number[]; position: number[] }>()
  const entry = (step: string) => {
    let e = acc.get(step)
    if (!e) acc.set(step, (e = { exec: [], wait: [], position: [] }))
    return e
  }

  for (const order of orders) {
    const seen = new Set<string>()
    order.rows.forEach((row, i) => {
      const e = entry(row.step)
      e.exec.push((row.end - row.start) / HOUR_MS)
      const prev = order.rows[i - 1]
      // sobreposição entre etapas não vira espera negativa
      if (prev) e.wait.push(Math.max(0, row.start - prev.end) / HOUR_MS)
      if (!seen.has(row.step)) {
        seen.add(row.step)
        e.position.push(i)
      }
    })
  }

  // a ordem das etapas vem dos próprios dados: posição média da primeira ocorrência em cada pedido
  return [...acc]
    .sort(([, a], [, b]) => mean(a.position) - mean(b.position))
    .map(([step, e]) => {
      const avgExecHours = mean(e.exec)
      const avgWaitHours = mean(e.wait)
      return { step, avgExecHours, avgWaitHours, totalHours: avgExecHours + avgWaitHours, executions: e.exec.length }
    })
}

export function reworkByStep(orders: Order[], steps: string[]): { step: string; rate: number }[] {
  return steps.map((step) => ({
    step,
    rate: orders.filter((o) => o.rows.some((r) => r.step === step && r.rework)).length / orders.length,
  }))
}

export function weekOf(ms: number): number {
  const day = new Date(ms).getUTCDay()
  const sinceMonday = (day + 6) % 7
  const date = Math.floor(ms / DAY_MS) * DAY_MS
  return date - sinceMonday * DAY_MS
}

export function weeklyStats(orders: Order[]): WeekStat[] {
  const byWeek = new Map<number, Order[]>()
  for (const order of orders) {
    const week = weekOf(order.start)
    byWeek.set(week, [...(byWeek.get(week) ?? []), order])
  }
  return [...byWeek]
    .sort(([a], [b]) => a - b)
    .map(([week, list]) => ({
      week,
      orders: list.length,
      avgLeadHours: mean(list.map((o) => o.leadHours)),
      slaRate: list.filter(isWithinSla).length / list.length,
    }))
}

export function lateOrders(orders: Order[], limit = 10): LateOrder[] {
  return orders
    .map((o) => ({
      id: o.id,
      region: o.region,
      leadHours: o.leadHours,
      slaHours: o.slaHours,
      delayHours: o.leadHours - o.slaHours,
    }))
    .filter((o) => o.delayHours > 0)
    .sort((a, b) => b.delayHours - a.delayHours)
    .slice(0, limit)
}

export function computeKpis(orders: Order[]): Kpis | null {
  if (!orders.length) return null

  const leads = orders.map((o) => o.leadHours)
  const stages = stageStats(orders)
  const bottleneck = stages.reduce((max, s) => (s.totalHours > max.totalHours ? s : max), stages[0]!)

  return {
    orders: orders.length,
    lead: { mean: mean(leads), median: percentile(leads, 0.5), p90: percentile(leads, 0.9) },
    slaRate: orders.filter(isWithinSla).length / orders.length,
    reworkRate: orders.filter((o) => o.rows.some((r) => r.rework)).length / orders.length,
    stages,
    bottleneck: bottleneck.step,
    reworkByStep: reworkByStep(
      orders,
      stages.map((s) => s.step),
    ),
    weekly: weeklyStats(orders),
    late: lateOrders(orders),
  }
}
