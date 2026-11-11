import { useSyncExternalStore } from 'react'

export const axisTick = { fill: 'var(--text-muted)', fontSize: 12 }

export const tooltipProps = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    fontSize: 13,
  },
  labelStyle: { color: 'var(--text)', fontWeight: 600 },
  cursor: { fill: 'var(--hover)' },
}

const narrowQuery = '(max-width: 600px)'

// o Recharts não quebra o texto do eixo, então em tela estreita a coluna de rótulos encolhe junto com a fonte
export function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(narrowQuery)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => window.matchMedia(narrowQuery).matches,
  )
}
