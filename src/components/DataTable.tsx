type Props = {
  caption: string
  columns: string[]
  rows: (string | number)[][]
}

// alternativa em texto para quem não consegue ler o gráfico
export default function DataTable({ caption, columns, rows }: Props) {
  return (
    <details className="data-table">
      <summary>Ver dados em tabela</summary>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c} scope="col" className={i > 0 ? 'num' : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([first, ...rest]) => (
              <tr key={first}>
                <th scope="row">{first}</th>
                {rest.map((cell, i) => (
                  <td key={i} className="num">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
