import { useMemo, useState } from 'react'
import Filters from './components/Filters'
import KpiCards from './components/KpiCards'
import LateOrders from './components/LateOrders'
import ReworkChart from './components/ReworkChart'
import StageChart from './components/StageChart'
import TrendCharts from './components/TrendCharts'
import Upload from './components/Upload'
import { computeKpis, filterOrders, groupOrders, type Filters as FilterValues } from './lib/kpis'
import { ParseError, parseCsv, parseFile, type ParseResult } from './lib/parse'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; fileName: string; data: ParseResult }

const NO_FILTERS: FilterValues = { from: '', to: '', region: '' }

export default function App() {
  const [state, setState] = useState<State>({ status: 'idle' })
  const [filters, setFilters] = useState<FilterValues>(NO_FILTERS)

  async function load(fileName: string, read: () => Promise<ParseResult>) {
    setState({ status: 'loading' })
    setFilters(NO_FILTERS)
    try {
      const data = await read()
      if (!data.rows.length) {
        setState({ status: 'error', message: 'Nenhuma linha válida foi encontrada no arquivo.' })
        return
      }
      setState({ status: 'ready', fileName, data })
    } catch (err) {
      const message = err instanceof ParseError ? err.message : 'Não foi possível ler o arquivo.'
      setState({ status: 'error', message })
    }
  }

  const loadSample = () =>
    load('exemplo.csv', async () => {
      const res = await fetch('/exemplo.csv')
      if (!res.ok) throw new Error()
      return parseCsv(await res.text())
    })

  const rows = state.status === 'ready' ? state.data.rows : null
  const orders = useMemo(() => (rows ? groupOrders(rows) : []), [rows])
  const filtered = useMemo(() => filterOrders(orders, filters), [orders, filters])
  const kpis = useMemo(() => computeKpis(filtered), [filtered])

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Indicadores do processo</h1>
          <p className="subtitle">Lead time, gargalos, SLA e retrabalho a partir do log de etapas</p>
        </div>
        {state.status === 'ready' && (
          <div className="file-info">
            <span>
              Arquivo: <strong>{state.fileName}</strong>
            </span>
            <button type="button" className="button" onClick={() => setState({ status: 'idle' })}>
              Trocar arquivo
            </button>
          </div>
        )}
      </header>

      <main>
        {state.status !== 'ready' && (
          <>
            <Upload
              busy={state.status === 'loading'}
              onFile={(file) => load(file.name, () => parseFile(file))}
              onSample={loadSample}
            />
            {state.status === 'loading' && (
              <p className="status" role="status">
                Lendo arquivo…
              </p>
            )}
            {state.status === 'error' && (
              <p className="status status--error" role="alert">
                <strong>Erro:</strong> {state.message}
              </p>
            )}
          </>
        )}

        {state.status === 'ready' && (
          <>
            {state.data.skipped > 0 && (
              <p className="status status--warning" role="status">
                <strong>Atenção:</strong> {state.data.skipped}{' '}
                {state.data.skipped === 1 ? 'linha inválida foi ignorada' : 'linhas inválidas foram ignoradas'} (data,
                pedido, etapa, retrabalho ou SLA ausentes ou incorretos).
              </p>
            )}

            <Filters orders={orders} value={filters} onChange={setFilters} />

            {kpis ? (
              <>
                <KpiCards kpis={kpis} />
                <div className="grid">
                  <StageChart stages={kpis.stages} bottleneck={kpis.bottleneck} />
                  <TrendCharts weeks={kpis.weekly} />
                  <ReworkChart data={kpis.reworkByStep} />
                </div>
                <LateOrders orders={kpis.late} />
              </>
            ) : (
              <p className="status" role="status">
                Nenhum pedido encontrado para os filtros selecionados.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
