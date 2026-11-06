// 人間の持ち主の表示名。wrangler.toml の [vars] OWNER_NAME（未設定なら「オーナー」）。
// 画面と AI 向けの文言に出すだけの値で、DB に入る内部の役割ID（'yanagi'）とは別物。
export const ownerName = (env) => String(env?.OWNER_NAME || 'オーナー').slice(0, 40);
// 案内役（オプション機能）は NAVI_ENABLED="1" のときだけ有効
export const naviEnabled = (env) => env?.NAVI_ENABLED === '1';
