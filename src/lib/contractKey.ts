// 支払調書の契約書：貸主・物件の比べ方（空白・全角半角の違いを無視）。画面とサーバーの両方で使う
export const matchKey = (s: string | null | undefined) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '').trim()
