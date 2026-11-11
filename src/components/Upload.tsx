import { useRef, useState } from 'react'

type Props = {
  onFile: (file: File) => void
  onSample: () => void
  busy: boolean
}

export default function Upload({ onFile, onSample, busy }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <section className="upload" aria-labelledby="upload-title">
      <div
        className={`dropzone${dragging ? ' dropzone--active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) onFile(file)
        }}
      >
        <h2 id="upload-title">Envie o log do processo</h2>
        <p>Arraste um arquivo .csv ou .xlsx para cá (até 10 MB).</p>
        <div className="upload-actions">
          <button type="button" className="button button--primary" disabled={busy} onClick={() => input.current?.click()}>
            Escolher arquivo
          </button>
          <button type="button" className="button" disabled={busy} onClick={onSample}>
            Usar dados de exemplo
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".csv,.xlsx,.xls"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            e.target.value = ''
          }}
        />
        <p className="hint">
          O arquivo é processado no seu navegador e não é enviado para nenhum servidor. Baixe o modelo em{' '}
          <a href="/exemplo.csv" download>CSV</a> ou <a href="/exemplo.xlsx" download>XLSX</a>.
        </p>
      </div>

      <details className="format">
        <summary>Formato esperado</summary>
        <p>Uma linha por etapa executada, com as colunas:</p>
        <code>pedido_id, etapa, inicio, fim, responsavel, regiao, retrabalho, sla_horas</code>
        <ul>
          <li>Datas em <code>2026-09-01 08:30</code>, <code>01/09/2026 08:30</code> ou data do Excel</li>
          <li>Retrabalho como <code>S</code> ou <code>N</code></li>
          <li>SLA do pedido em horas</li>
        </ul>
      </details>
    </section>
  )
}
