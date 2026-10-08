// 担当者名の照合用キー。空白（全角・半角）を除き、旧字体・異体字を新字体にそろえる。
// 例：ユーザー登録「關口　義宏」と顧客カルテの主担当「関口　義宏」を同じ人として扱う
const VARIANTS: Record<string, string> = {
  '關': '関', '髙': '高', '﨑': '崎', '嵜': '崎', '邊': '辺', '邉': '辺', '齋': '斎', '齊': '斉',
  '濱': '浜', '澤': '沢', '櫻': '桜', '廣': '広', '國': '国', '眞': '真', '德': '徳', '惠': '恵',
}

export function staffKey(name: string | null | undefined): string {
  return (name || '').replace(/[\s　]/g, '').replace(/[關髙﨑嵜邊邉齋齊濱澤櫻廣國眞德惠]/g, c => VARIANTS[c] || c)
}
