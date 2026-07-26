'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Schedule } from '@/lib/types'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

const COLOR_MAP: Record<string, string> = {
  '外出': 'bg-orange-400',
  '来客（顧問先）': 'bg-blue-500',
  '来客（業者）': 'bg-cyan-500',
  '所内行事': 'bg-purple-500',
  '所内ミーティング': 'bg-indigo-500',
  '休み': 'bg-gray-400',
  '白': 'bg-white border border-gray-300',
  '緑': 'bg-green-500',
  'グレー': 'bg-gray-500',
  '茶': 'bg-amber-700',
  '紫': 'bg-violet-500',
  '黄': 'bg-yellow-400',
  '紺': 'bg-blue-900',
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [today] = useState(new Date())
  const [viewDate, setViewDate] = useState(new Date())

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  useEffect(() => {
    load()
  }, [viewDate])

  async function load() {
    const supabase = createClient()
    const start = new Date(year, month, 1).toISOString()
    const end = new Date(year, month + 1, 0, 23, 59).toISOString()
    const { data } = await supabase
      .from('schedules')
      .select('*')
      .gte('start_datetime', start)
      .lte('start_datetime', end)
      .order('start_datetime')
    setSchedules(data || [])
  }

  function prevMonth() {
    setViewDate(new Date(year, month - 1, 1))
  }
  function nextMonth() {
    setViewDate(new Date(year, month + 1, 1))
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)
  const weeks: (number | null)[][] = []
  let day = 1 - firstDay
  for (let w = 0; w < 6; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      week.push(day > 0 && day <= daysInMonth ? day : null)
      day++
    }
    weeks.push(week)
    if (day > daysInMonth) break
  }

  function getSchedulesForDay(d: number) {
    return schedules.filter(s => {
      const sd = new Date(s.start_datetime)
      return sd.getFullYear() === year && sd.getMonth() === month && sd.getDate() === d
    })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-800">スケジュール</h1>
        <Link
          href="/schedules/new"
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> 新規追加
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <ChevronLeft size={20} />
          </button>
          <span className="font-bold text-lg">
            {year}年{month + 1}月
          </span>
          <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-500 mb-2">
          {['日', '月', '火', '水', '木', '金', '土'].map(d => (
            <div key={d} className={`py-1 ${d === '日' ? 'text-red-500' : d === '土' ? 'text-blue-500' : ''}`}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((d, i) => {
            const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear()
            const daySchedules = d ? getSchedulesForDay(d) : []
            return (
              <div
                key={i}
                className={`min-h-20 border rounded-lg p-1 ${d ? 'bg-white hover:bg-gray-50' : 'bg-gray-50'}`}
              >
                {d && (
                  <>
                    <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-blue-600 text-white' :
                      i % 7 === 0 ? 'text-red-500' :
                      i % 7 === 6 ? 'text-blue-500' : 'text-gray-700'
                    }`}>{d}</div>
                    <div className="space-y-0.5">
                      {daySchedules.slice(0, 3).map(s => (
                        <Link key={s.id} href={`/schedules/${s.id}`}>
                          <div className={`text-white text-xs px-1 py-0.5 rounded truncate ${COLOR_MAP[s.color || '白'] || 'bg-blue-500'}`}>
                            {new Date(s.start_datetime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} {s.title}
                          </div>
                        </Link>
                      ))}
                      {daySchedules.length > 3 && (
                        <div className="text-xs text-gray-400 pl-1">+{daySchedules.length - 3}件</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
