'use client'

import { useState, useEffect } from 'react'

// 検索・絞り込み条件をsessionStorageに保持するuseState代替。
// 検索結果の詳細ページへ遷移して戻ってきた際に、検索条件・結果がリセットされないようにするため。
export function useSessionState(key: string, defaultValue: string): [string, (v: string) => void] {
  const [value, setValue] = useState<string>(() => {
    try { return sessionStorage.getItem(key) ?? defaultValue } catch { return defaultValue }
  })
  useEffect(() => {
    try { sessionStorage.setItem(key, value) } catch { /* noop */ }
  }, [key, value])
  return [value, setValue]
}
