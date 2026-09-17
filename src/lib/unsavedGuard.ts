'use client'

// 入力中のフォームを離れる際の確認ガード。
// フォーム側は setUnsavedChanges(true/false) で状態を更新し、
// ナビゲーション側（サイドバー等）は confirmLeaveIfDirty() で確認ダイアログを出す。
let dirty = false
const MESSAGE = '入力項目が消えますがよろしいですか？'

export function setUnsavedChanges(value: boolean) {
  dirty = value
}

export function hasUnsavedChanges() {
  return dirty
}

// クリックで別ページへ移動する前に呼ぶ。falseが返ったら移動をキャンセルする。
export function confirmLeaveIfDirty(): boolean {
  if (!dirty) return true
  const ok = window.confirm(MESSAGE)
  if (ok) dirty = false
  return ok
}

// タブを閉じる・リロード時の警告（表示文言はブラウザ標準のものになる）
export function registerBeforeUnloadGuard(): () => void {
  function handler(e: BeforeUnloadEvent) {
    if (!dirty) return
    e.preventDefault()
    e.returnValue = ''
  }
  window.addEventListener('beforeunload', handler)
  return () => window.removeEventListener('beforeunload', handler)
}
