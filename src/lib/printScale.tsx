'use client'

import { useEffect, useState } from 'react'

// 印刷の文字の大きさ（指摘事項・質問事項の印刷で共通）。選んだ大きさはこのパソコンに覚えておく
export const PRINT_SCALES = [
  { key: 'normal', label: '標準', scale: 1 },
  { key: 'large', label: '大', scale: 1.4 },
  { key: 'xlarge', label: '特大', scale: 1.8 },
] as const

const STORAGE_KEY = 'printFontScale'
const DEFAULT_KEY = 'large'

export function usePrintScale(): [number, string, (key: string) => void] {
  const [key, setKey] = useState<string>(DEFAULT_KEY)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && PRINT_SCALES.some(s => s.key === saved)) setKey(saved)
    } catch { /* 保存できない環境では既定（大）のまま */ }
  }, [])
  function change(k: string) {
    setKey(k)
    try { localStorage.setItem(STORAGE_KEY, k) } catch { /* 無視 */ }
  }
  const scale = PRINT_SCALES.find(s => s.key === key)?.scale ?? 1.4
  return [scale, key, change]
}

export function PrintScaleSelect({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} title="印刷の文字の大きさ"
      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-600">
      {PRINT_SCALES.map(s => <option key={s.key} value={s.key}>文字：{s.label}</option>)}
    </select>
  )
}
