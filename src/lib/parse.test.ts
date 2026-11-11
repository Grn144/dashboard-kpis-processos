import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { MAX_FILE_SIZE, ParseError, decodeText, parseCsv, parseDate, parseFile, parseWorkbook } from './parse'

const HEADER = 'pedido_id,etapa,inicio,fim,responsavel,regiao,retrabalho,sla_horas'

describe('parseDate', () => {
  it('aceita YYYY-MM-DD HH:mm', () => {
    expect(parseDate('2026-09-01 08:30')).toBe(Date.UTC(2026, 8, 1, 8, 30))
  })

  it('aceita DD/MM/YYYY HH:mm', () => {
    expect(parseDate('01/09/2026 08:30')).toBe(Date.UTC(2026, 8, 1, 8, 30))
  })

  it('aceita serial do Excel', () => {
    // 46266 = 2026-09-01; 0.5 = 12:00
    expect(parseDate(46266.5)).toBe(Date.UTC(2026, 8, 1, 12, 0))
  })

  it('arredonda ruído de ponto flutuante do Excel para o minuto', () => {
    expect(parseDate(46266 + 10 / 1440 + 1e-9)).toBe(Date.UTC(2026, 8, 1, 0, 10))
  })

  it('rejeita datas impossíveis e formatos desconhecidos', () => {
    expect(parseDate('31/02/2026 10:00')).toBeNull()
    expect(parseDate('2026-09-01 25:00')).toBeNull()
    expect(parseDate('2026-09-01')).toBeNull()
    expect(parseDate('ontem')).toBeNull()
    expect(parseDate('')).toBeNull()
    expect(parseDate(undefined)).toBeNull()
  })
})

describe('parseCsv', () => {
  it('lê as linhas e converte os tipos', () => {
    const { rows, skipped } = parseCsv(
      `${HEADER}\nP1,Separação,2026-09-01 08:00,2026-09-01 09:00,SEP-01,Capital SP,N,24`,
    )
    expect(skipped).toBe(0)
    expect(rows).toEqual([
      {
        orderId: 'P1',
        step: 'Separação',
        start: Date.UTC(2026, 8, 1, 8),
        end: Date.UTC(2026, 8, 1, 9),
        owner: 'SEP-01',
        region: 'Capital SP',
        rework: false,
        slaHours: 24,
      },
    ])
  })

  it('identifica colunas sem diferenciar maiúsculas, acentos e espaços, em qualquer ordem', () => {
    const csv = 'ETAPA;Pedido ID;Início;FIM;Responsável;Região;Retrabalho;SLA_Horas\nEntrega;P9;01/09/2026 10:00;01/09/2026 12:00;ENT-01;Interior SP;s;48'
    const { rows } = parseCsv(csv)
    expect(rows[0]).toMatchObject({ orderId: 'P9', step: 'Entrega', rework: true, slaHours: 48 })
  })

  it('aponta a coluna que está faltando', () => {
    expect(() => parseCsv('pedido_id,etapa,inicio,fim,responsavel,regiao,retrabalho\nP1')).toThrow(
      new ParseError('Coluna obrigatória ausente: sla_horas.'),
    )
  })

  it('lista todas as colunas faltando', () => {
    expect(() => parseCsv('pedido_id,etapa,inicio,fim,responsavel,regiao')).toThrow(
      'Colunas obrigatórias ausentes: retrabalho, sla_horas.',
    )
  })

  it('falha com mensagem clara em arquivo vazio', () => {
    expect(() => parseCsv('')).toThrow('O arquivo está vazio.')
  })

  it('ignora e conta linhas inválidas', () => {
    const csv = [
      HEADER,
      'P1,Separação,2026-09-01 08:00,2026-09-01 09:00,SEP-01,Capital SP,N,24',
      ',Separação,2026-09-01 08:00,2026-09-01 09:00,SEP-01,Capital SP,N,24',
      'P2,Separação,data ruim,2026-09-01 09:00,SEP-01,Capital SP,N,24',
      'P3,Separação,2026-09-01 10:00,2026-09-01 09:00,SEP-01,Capital SP,N,24',
      'P4,Separação,2026-09-01 08:00,2026-09-01 09:00,SEP-01,Capital SP,talvez,24',
      'P5,Separação,2026-09-01 08:00,2026-09-01 09:00,SEP-01,Capital SP,N,abc',
    ].join('\n')
    const { rows, skipped } = parseCsv(csv)
    expect(rows.map((r) => r.orderId)).toEqual(['P1'])
    expect(skipped).toBe(5)
  })

  it('descarta linhas vazias sem contar como inválidas', () => {
    const csv = `${HEADER}\n\n , , , , , , , \nP1,Entrega,2026-09-01 08:00,2026-09-01 09:00,ENT-01,Capital SP,N,24\n\n`
    const { rows, skipped } = parseCsv(csv)
    expect(rows).toHaveLength(1)
    expect(skipped).toBe(0)
  })

  it('aceita SLA com vírgula decimal', () => {
    const { rows } = parseCsv(`${HEADER}\nP1,Entrega,2026-09-01 08:00,2026-09-01 09:00,ENT-01,Capital SP,N,"24,5"`)
    expect(rows[0]?.slaHours).toBe(24.5)
  })
})

describe('parseWorkbook', () => {
  it('lê datas nativas do Excel e datas em texto', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Pedido_ID', 'Etapa', 'Inicio', 'Fim', 'Responsavel', 'Regiao', 'Retrabalho', 'SLA_horas'],
      ['P1', 'Separação', 46266.5, 46266.75, 'SEP-01', 'Capital SP', 'N', 24],
      ['P1', 'Conferência', '01/09/2026 18:00', '2026-09-01 19:00', 'CONF-01', 'Capital SP', 'S', 24],
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'log')
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    const { rows, skipped } = await parseWorkbook(data)
    expect(skipped).toBe(0)
    expect(rows[0]).toMatchObject({ start: Date.UTC(2026, 8, 1, 12), end: Date.UTC(2026, 8, 1, 18) })
    expect(rows[1]).toMatchObject({ start: Date.UTC(2026, 8, 1, 18), rework: true })
  })
})

describe('parseFile', () => {
  it('recusa arquivos acima de 10 MB', async () => {
    const big = new File([new Uint8Array(MAX_FILE_SIZE + 1)], 'grande.csv')
    await expect(parseFile(big)).rejects.toThrow('10 MB')
  })

  it('recusa extensões não suportadas', async () => {
    await expect(parseFile(new File(['x'], 'dados.json'))).rejects.toThrow('Formato não suportado')
  })

  it('lê CSV salvo em Windows-1252', async () => {
    const bytes = Uint8Array.from([...`${HEADER}\nP1,Separa`].map((c) => c.charCodeAt(0)))
    const tail = Uint8Array.from([0xe7, 0xe3, 0x6f, ...[...',2026-09-01 08:00,2026-09-01 09:00,SEP-01,Capital SP,N,24'].map((c) => c.charCodeAt(0))])
    expect(decodeText(new Uint8Array([...bytes, ...tail]).buffer)).toContain('Separação')

    const { rows } = await parseFile(new File([bytes, tail], 'log.csv'))
    expect(rows[0]?.step).toBe('Separação')
  })
})
