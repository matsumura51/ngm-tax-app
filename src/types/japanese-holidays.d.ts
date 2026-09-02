declare module 'japanese-holidays' {
  export interface Holiday {
    month: number
    date: number
    name: string
  }
  export function isHoliday(date: Date): string | undefined
  export function isHolidayAt(date: Date): string | undefined
  export function getHolidaysOf(year: number, month?: number): Holiday[]
}
