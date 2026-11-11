const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })

export const formatHours = (hours: number) => `${number.format(hours)} h`
export const formatPercent = (value: number) => percent.format(value)
export const formatDay = (ms: number) => date.format(ms)

export function toInputDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
