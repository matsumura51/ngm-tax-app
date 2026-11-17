'use client'
// Googleドライブの接続（支払調書の契約書の保存先）。管理者だけ
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Status = { configured: boolean; connected: boolean; email: string; connected_by: string; connected_at: string | null }

function Inner() {
  const params = useSearchParams()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [st, setSt] = useState<Status | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setIsAdmin(false); return }
      const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
      setIsAdmin(data?.role === 'admin')
      const r = await fetch('/api/drive/status')
      const j = await r.json()
      if (r.ok) setSt(j); else setErr(j.error || '状態を読めませんでした')
    })()
  }, [])
  if (isAdmin === null) return <div className="p-6 text-gray-400">読み込み中...</div>
  if (!isAdmin) return <div className="p-6 text-gray-500">管理者だけが開けるページです</div>
  const ok = params.get('ok'), error = params.get('error')
  return (
    <div className="p-6 max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Googleドライブの接続</h1>
      {ok && <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 px-4 py-3 text-sm">接続しました。支払調書に契約書を添付できます。</div>}
      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{err}</div>}
      <div className="bg-white rounded-xl shadow p-5 space-y-3 text-sm text-gray-700">
        <p>支払調書に添付する契約書は、<b>m.jun@tax-machida.com</b> のGoogleドライブの「支払調書_契約書」フォルダに保存します（顧問先ごとのフォルダはアプリが作ります）。</p>
        <p className="text-gray-500">アプリに許可するのは「このアプリが作ったファイルだけを扱う」権限です。ドライブにあるほかのファイルは、アプリからも見えません。スタッフにドライブの共有はせず、契約書は業務管理アプリの画面からだけ見られます。</p>
        {st && <div className="border-t pt-3">
          {!st.configured ? <p className="text-red-600">サーバーの設定（GOOGLE_DRIVE_CLIENT_ID・GOOGLE_DRIVE_CLIENT_SECRET）がまだです。</p>
            : st.connected ? <p>状態：<b className="text-green-700">接続済み</b>（{st.email || 'アカウント不明'}・{st.connected_by}・{st.connected_at ? new Date(st.connected_at).toLocaleString('ja-JP') : ''}）</p>
            : <p>状態：<b className="text-red-600">未接続</b></p>}
        </div>}
        {st?.configured && <div>
          <a href="/api/drive/connect" className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">{st.connected ? 'もう一度接続する' : '接続する'}</a>
          <p className="text-xs text-gray-500 mt-2">Googleの画面で <b>m.jun@tax-machida.com</b> を選び、「許可」を押してください。接続が切れたとき（パスワードを変えたときなど）も、ここからもう一度接続します。</p>
        </div>}
      </div>
    </div>
  )
}

export default function DriveConnectPage() {
  return <Suspense fallback={<div className="p-6 text-gray-400">読み込み中...</div>}><Inner /></Suspense>
}
