// Cotações reais da B3 pela brapi.dev (plano gratuito, com token da própria pessoa).
const URL_LISTA = "https://brapi.dev/api/quote/list";
const TICKER = /^[A-Z]{4}\d{1,2}$/; // ignora fracionário (final F) e outros códigos
let cache = null; // { t, token, lista }

export const achaTicker = (nome) => (String(nome || "").toUpperCase().match(/\b[A-Z]{4}\d{1,2}\b/) || [])[0] || "";

export async function carregarLista(token, forcar = false) {
  if (!forcar && cache && cache.token === token && Date.now() - cache.t < 5 * 60 * 1000) return cache.lista;
  const out = [];
  let pagina = 1, total = 1;
  while (pagina <= total && pagina <= 15) {
    const r = await fetch(`${URL_LISTA}?type=stock&limit=100&page=${pagina}&sortBy=volume&sortOrder=desc&token=${encodeURIComponent(token)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || `A fonte de cotações respondeu erro ${r.status}.`);
    for (const s of j.stocks || []) {
      const preco = Number(s.close), variacao = Number(s.change);
      if (!TICKER.test(s.stock || "") || !Number.isFinite(preco)) continue;
      out.push({ ticker: s.stock, nome: s.name || s.stock, preco, variacao: Number.isFinite(variacao) ? variacao : 0, volume: Number(s.volume) || 0, valorMercado: Number(s.market_cap) || 0, setor: s.sector || "" });
    }
    total = j.totalPages || 1;
    pagina += 1;
  }
  cache = { t: Date.now(), token, lista: out };
  return out;
}

export const fmtPreco = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtVar = (v) => `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}%`;
export const corVar = (v) => (v > 0 ? "#34D399" : v < 0 ? "#F87171" : "#9A9A9A");
