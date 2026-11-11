// Gera public/exemplo.csv e public/exemplo.xlsx com um processo logístico fictício.
// Rodar com: npm run gerar-dados
import { writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

// mulberry32: seed fixa para os arquivos saírem sempre iguais
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = rng(20260901)
const between = (min: number, max: number) => min + random() * (max - min)
const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)]!

const REGIONS = [
  { name: 'Capital SP', sla: 24, weight: 0.35, transit: [2, 5] },
  { name: 'Grande SP', sla: 36, weight: 0.25, transit: [3, 8] },
  { name: 'Interior SP', sla: 48, weight: 0.25, transit: [6, 16] },
  { name: 'Outros estados', sla: 96, weight: 0.15, transit: [16, 36] },
] as const

function pickRegion() {
  let r = random()
  for (const region of REGIONS) {
    if ((r -= region.weight) < 0) return region
  }
  return REGIONS[0]
}

// armazém funciona de segunda a sábado, das 7h às 19h
const OPEN = 7
const CLOSE = 19

function nextWorkTime(t: number): number {
  const d = new Date(t)
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60
  const dayStart = t - (t % DAY)
  if (d.getUTCDay() === 0) return dayStart + DAY + OPEN * HOUR
  if (hour < OPEN) return dayStart + OPEN * HOUR
  if (hour >= CLOSE) return nextWorkTime(dayStart + DAY + OPEN * HOUR)
  return t
}

type Team = { code: string; freeAt: number }[]

const team = (prefix: string, size: number): Team =>
  Array.from({ length: size }, (_, i) => ({ code: `${prefix}-${String(i + 1).padStart(2, '0')}`, freeAt: 0 }))

const teams = {
  receiving: team('REC', 2),
  picking: team('SEP', 3),
  checking: team('CONF', 1),
  packing: team('EMB', 2),
  shipping: team('EXP', 2),
}
const carriers = ['TRP-01', 'TRP-02', 'TRP-03', 'TRP-04']
const drivers = ['ENT-01', 'ENT-02', 'ENT-03', 'ENT-04', 'ENT-05']

type Row = {
  id: string
  step: string
  start: number
  end: number
  owner: string
  region: string
  rework: boolean
  sla: number
}

function work(members: Team, ready: number, minutes: number) {
  const worker = members.reduce((best, w) => (w.freeAt < best.freeAt ? w : best))
  const start = nextWorkTime(Math.max(ready, worker.freeAt))
  const end = start + Math.round(minutes) * MIN
  worker.freeAt = end
  return { start, end, owner: worker.code }
}

// frota própria sai a cada 2h, das 8h às 20h
function nextPickup(t: number): number {
  const dayStart = t - (t % DAY)
  for (const hour of [8, 10, 12, 14, 16, 18, 20]) {
    const slot = dayStart + hour * HOUR
    if (slot >= t && new Date(slot).getUTCDay() !== 0) return slot
  }
  return nextPickup(dayStart + DAY)
}

function deliveryWindow(t: number): number {
  const hour = new Date(t).getUTCHours()
  if (hour >= 8 && hour < 20) return t
  const dayStart = t - (t % DAY)
  return dayStart + (hour >= 20 ? DAY : 0) + 8 * HOUR
}

const rows: Row[] = []
const start = Date.UTC(2026, 8, 1)
const end = Date.UTC(2026, 10, 1)
let orderNumber = 10001

for (let day = start; day < end; day += DAY) {
  if (new Date(day).getUTCDay() === 0) continue
  const october = new Date(day).getUTCMonth() === 9
  // outubro tem mais volume e mais reprovação na conferência
  const volume = Math.round(october ? between(6.5, 9.5) : between(5, 8))
  const failRate = october ? 0.17 : 0.1

  const arrivals = Array.from({ length: volume }, () => day + Math.round(between(OPEN, CLOSE - 1) * 60) * MIN).sort(
    (a, b) => a - b,
  )

  for (const arrival of arrivals) {
    const id = `PED-${orderNumber++}`
    const region = pickRegion()
    const add = (step: string, slot: { start: number; end: number; owner: string }, rework = false) => {
      const start = Math.round(slot.start / MIN) * MIN
      const end = Math.round(slot.end / MIN) * MIN
      rows.push({ id, step, start, end, owner: slot.owner, region: region.name, rework, sla: region.sla })
      return end
    }

    let t = add('Recebimento do pedido', work(teams.receiving, arrival, between(10, 30)))
    t = add('Separação', work(teams.picking, t + between(5, 40) * MIN, between(30, 80)))
    t = add('Conferência', work(teams.checking, t, between(67, 97)))

    if (random() < failRate) {
      t = add('Separação', work(teams.picking, t + between(5, 20) * MIN, between(20, 50)), true)
      t = add('Conferência', work(teams.checking, t, between(30, 50)), true)
    }

    t = add('Embalagem', work(teams.packing, t + between(5, 30) * MIN, between(15, 40)))
    t = add('Expedição', work(teams.shipping, t + between(10, 60) * MIN, between(15, 35)))

    const [minTransit, maxTransit] = region.transit
    const carrier = pick(carriers)
    let pickup = nextPickup(t)
    let arrivalAtCustomer = pickup + between(minTransit, maxTransit) * HOUR
    add('Transporte', { start: pickup, end: arrivalAtCustomer, owner: carrier })
    let deliveryStart = deliveryWindow(arrivalAtCustomer + between(0, 2) * HOUR)
    t = add('Entrega', { start: deliveryStart, end: deliveryStart + between(10, 50) * MIN, owner: pick(drivers) })

    if (random() < 0.04) {
      pickup = nextPickup(t + 12 * HOUR)
      arrivalAtCustomer = pickup + between(minTransit, maxTransit) * HOUR
      add('Transporte', { start: pickup, end: arrivalAtCustomer, owner: carrier }, true)
      deliveryStart = deliveryWindow(arrivalAtCustomer + between(0, 2) * HOUR)
      add('Entrega', { start: deliveryStart, end: deliveryStart + between(10, 50) * MIN, owner: pick(drivers) }, true)
    }
  }
}

const HEADER = ['pedido_id', 'etapa', 'inicio', 'fim', 'responsavel', 'regiao', 'retrabalho', 'sla_horas']
const pad = (n: number) => String(n).padStart(2, '0')
const formatDate = (ms: number) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
const excelSerial = (ms: number) => ms / DAY + 25569
const flag = (rework: boolean) => (rework ? 'S' : 'N')

const csv = [
  HEADER.join(','),
  ...rows.map((r) =>
    [r.id, r.step, formatDate(r.start), formatDate(r.end), r.owner, r.region, flag(r.rework), r.sla].join(','),
  ),
].join('\n')
writeFileSync('public/exemplo.csv', csv + '\n')

// no xlsx as datas vão como data nativa do Excel, não como texto
const sheet = XLSX.utils.aoa_to_sheet([
  HEADER,
  ...rows.map((r) => [r.id, r.step, excelSerial(r.start), excelSerial(r.end), r.owner, r.region, flag(r.rework), r.sla]),
])
for (let i = 1; i <= rows.length; i++) {
  for (const col of ['C', 'D']) {
    const cell = sheet[`${col}${i + 1}`]
    if (cell) cell.z = 'dd/mm/yyyy hh:mm'
  }
}
sheet['!cols'] = [12, 22, 17, 17, 12, 15, 11, 10].map((wch) => ({ wch }))
const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, sheet, 'log_etapas')
writeFileSync('public/exemplo.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }))

console.log(`${orderNumber - 10001} pedidos, ${rows.length} linhas`)
