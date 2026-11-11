import Papa from 'papaparse'

export type StepRow = {
  orderId: string
  step: string
  start: number
  end: number
  owner: string
  region: string
  rework: boolean
  slaHours: number
}

export type ParseResult = {
  rows: StepRow[]
  skipped: number
}

export class ParseError extends Error {}

export const MAX_FILE_SIZE = 10 * 1024 * 1024

const COLUMNS = [
  'pedido_id',
  'etapa',
  'inicio',
  'fim',
  'responsavel',
  'regiao',
  'retrabalho',
  'sla_horas',
] as const

type Column = (typeof COLUMNS)[number]

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

// Datas são tratadas como hora local "ingênua" e guardadas em UTC,
// assim o resultado não muda com o fuso de quem abre o arquivo.
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/
const EXCEL_EPOCH_OFFSET = 25569
const DAY_MS = 86_400_000

function buildDate(y: number, mo: number, d: number, h: number, mi: number, s: number): number | null {
  const ms = Date.UTC(y, mo - 1, d, h, mi, s)
  const check = new Date(ms)
  // descarta datas como 31/02, que o Date.UTC aceitaria rolando para março
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
    return null
  }
  return ms
}

export function parseDate(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    const ms = (value - EXCEL_EPOCH_OFFSET) * DAY_MS
    // o serial do Excel é fracionário; arredondo para o minuto para tirar ruído de ponto flutuante
    return Math.round(ms / 60_000) * 60_000
  }
  if (typeof value !== 'string') return null

  const text = value.trim()
  let m = ISO_DATE.exec(text)
  if (m) return buildDate(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0))
  m = BR_DATE.exec(text)
  if (m) return buildDate(+m[3]!, +m[2]!, +m[1]!, +m[4]!, +m[5]!, +(m[6] ?? 0))
  return null
}

function parseRework(value: unknown): boolean | null {
  const v = normalizeHeader(value)
  if (v === 's' || v === 'sim') return true
  if (v === 'n' || v === 'nao') return false
  return null
}

function parseHours(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function isBlank(row: unknown[]): boolean {
  return row.every((cell) => text(cell) === '')
}

export function rowsFromTable(table: unknown[][]): ParseResult {
  const [header, ...body] = table.filter((row) => !isBlank(row))
  if (!header) throw new ParseError('O arquivo está vazio.')

  const names = header.map(normalizeHeader)
  const index = {} as Record<Column, number>
  const missing: string[] = []
  for (const col of COLUMNS) {
    const i = names.indexOf(col)
    if (i === -1) missing.push(col)
    index[col] = i
  }
  if (missing.length === 1) throw new ParseError(`Coluna obrigatória ausente: ${missing[0]}.`)
  if (missing.length > 1) throw new ParseError(`Colunas obrigatórias ausentes: ${missing.join(', ')}.`)

  const rows: StepRow[] = []
  let skipped = 0

  for (const raw of body) {
    const get = (col: Column) => raw[index[col]]
    const orderId = text(get('pedido_id'))
    const step = text(get('etapa'))
    const start = parseDate(get('inicio'))
    const end = parseDate(get('fim'))
    const rework = parseRework(get('retrabalho'))
    const slaHours = parseHours(get('sla_horas'))

    if (!orderId || !step || start === null || end === null || end < start || rework === null || slaHours === null) {
      skipped++
      continue
    }

    rows.push({
      orderId,
      step,
      start,
      end,
      owner: text(get('responsavel')),
      region: text(get('regiao')) || 'Sem região',
      rework,
      slaHours,
    })
  }

  return { rows, skipped }
}

export function parseCsv(content: string): ParseResult {
  const result = Papa.parse<string[]>(content, { skipEmptyLines: 'greedy' })
  return rowsFromTable(result.data)
}

// o SheetJS é a maior dependência do bundle, então só é baixado quando chega um xlsx
export async function parseWorkbook(data: ArrayBuffer): Promise<ParseResult> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(data, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) throw new ParseError('A planilha não tem nenhuma aba.')
  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false })
  return rowsFromTable(table)
}

// CSV exportado pelo Excel em pt-BR costuma vir em Windows-1252, não UTF-8
export function decodeText(data: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    return new TextDecoder('windows-1252').decode(data)
  }
}

export async function parseFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new ParseError('O arquivo passa de 10 MB. Envie um arquivo menor.')
  }
  const ext = file.name.toLowerCase().split('.').pop()
  const data = await file.arrayBuffer()
  if (ext === 'csv') return parseCsv(decodeText(data))
  if (ext === 'xlsx' || ext === 'xls') return parseWorkbook(data)
  throw new ParseError('Formato não suportado. Envie um arquivo .csv ou .xlsx.')
}
