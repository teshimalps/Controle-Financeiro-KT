import { useCallback, useEffect, useState } from "react";
import { corVar, fmtPreco, fmtVar } from "./mercado.js";
import { Seta } from "./Mercado.jsx";

const pc = (v) => `${Number(v).toFixed(2).replace(".", ",")}%`;
const json = async (url, sinal) => { const r = await fetch(url, { signal: sinal }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const sgs = async (serie, sinal) => Number((await json(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`, sinal))[0].valor);
// Mediana das expectativas do mercado (Boletim Focus, Banco Central) para o fim de um ano
const focus = async (indicador, ano, sinal) => {
  const q = `$top=1&$filter=Indicador eq '${indicador}' and DataReferencia eq '${ano}'&$orderby=Data desc&$format=json`;
  const x = (await json(`https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?${encodeURI(q)}`, sinal)).value[0];
  const [, m, dia] = String(x.Data).slice(0, 10).split("-");
  return { valor: Number(x.Mediana), data: `${dia}/${m}` };
};
const TICKER = /^[A-Z]{4}\d{1,2}$/;

// Cotação + últimos ~30 dias (fechamentos) de um papel ou índice, com cache de 10 min (a brapi grátis aceita 1 papel por pedido)
const cacheQuote = new Map();
async function quoteComSerie(simbolo, token, sinal, historico = true) {
  const chave = `${simbolo}|${token}|${historico}`, c = cacheQuote.get(chave);
  if (c && Date.now() - c.t < 10 * 60 * 1000) return c.r;
  const j = await json(`https://brapi.dev/api/quote/${encodeURIComponent(simbolo)}?${historico ? "range=1mo&interval=1d&" : ""}token=${encodeURIComponent(token)}`, sinal);
  const q = j.results[0];
  const r = { preco: Number(q.regularMarketPrice), variacao: Number(q.regularMarketChangePercent), serie: (q.historicalDataPrice || []).map((x) => Number(x.close)).filter(Number.isFinite) };
  cacheQuote.set(chave, { t: Date.now(), r });
  return r;
}
// Ibovespa: tenta o índice; se a fonte não entregar, usa o BOVA11 (ETF que replica o índice) só para variação e gráfico
async function buscarIbov(token, sinal) {
  let ultimo = null;
  for (const [simbolo, historico, pontos] of [["^BVSP", true, true], ["^BVSP", false, true], ["BOVA11", true, false], ["BOVA11", false, false]]) {
    try { return { ...(await quoteComSerie(simbolo, token, sinal, historico)), pontos }; } catch (e) { ultimo = e; }
  }
  throw new Error(ultimo?.message === "401" ? "401: o plano gratuito da brapi não libera o índice" : ultimo?.message || "sem resposta");
}

// Gráfico pequeno de linha (últimos 30 dias). Cor pela tendência do período.
function Mini({ serie, largura = 72, altura = 28 }) {
  if (!serie || serie.length < 2) return <span className="inline-block" style={{ width: largura }} aria-hidden="true" />;
  const min = Math.min(...serie), max = Math.max(...serie), dx = largura / (serie.length - 1);
  const pts = serie.map((v, i) => `${(i * dx).toFixed(1)},${(altura - 2 - ((v - min) / (max - min || 1)) * (altura - 4)).toFixed(1)}`).join(" ");
  const cor = corVar(serie[serie.length - 1] - serie[0]);
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label="Últimos 30 dias" className="shrink-0">
      <title>Últimos 30 dias</title>
      <polyline points={pts} fill="none" stroke={cor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" pathLength="1" className="anim-tracar" />
    </svg>
  );
}
// Carrega o gráfico de uma ação sozinho, sem atrasar o resto da tela
function MiniAcao({ ticker, token }) {
  const [serie, setSerie] = useState(null);
  useEffect(() => {
    if (!token) return undefined;
    const c = new AbortController();
    quoteComSerie(ticker, token, c.signal).then((r) => setSerie(r.serie), () => {});
    return () => c.abort();
  }, [ticker, token]);
  return <Mini serie={serie} />;
}

async function carregarTudo(token, sinal) {
  const ano = new Date().getFullYear();
  const pega = (p) => p.then((v) => v, () => null); // cada bloco falha sozinho
  const [selic, ipca12, selicA, selicB, ipcaA, ipcaB, moedas, ibov, ranking] = await Promise.all([
    pega(sgs(432, sinal)), pega(sgs(13522, sinal)),
    pega(focus("Selic", ano, sinal)), pega(focus("Selic", ano + 1, sinal)),
    pega(focus("IPCA", ano, sinal)), pega(focus("IPCA", ano + 1, sinal)),
    pega(json("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL,ETH-BRL", sinal)),
    token ? buscarIbov(token, sinal).then((v) => v, (e) => ({ erro: e.message || "indisponível" })) : Promise.resolve(null),
    token ? pega(json(`https://brapi.dev/api/quote/list?type=stock&limit=100&sortBy=volume&sortOrder=desc&token=${encodeURIComponent(token)}`, sinal).then((j) => (j.stocks || [])
      .filter((s) => TICKER.test(s.stock || "") && Number.isFinite(Number(s.change)))
      .map((s) => ({ ticker: s.stock, nome: s.name || s.stock, preco: Number(s.close), variacao: Number(s.change) })))) : Promise.resolve(null),
  ]);
  return { t: Date.now(), ano, selic, ipca12, selicA, selicB, ipcaA, ipcaB, moedas, ibov, ranking };
}

// Número que "sobe" de zero até o valor quando os dados chegam
function Contador({ valor, formato }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (valor == null) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(valor); return undefined; }
    let raf;
    const t0 = performance.now();
    const passo = (t) => {
      const p = Math.min(1, (t - t0) / 900);
      setV(valor * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return valor == null ? "—" : formato(v);
}

// Cartão de destaque (1/4 da linha) com um ou dois números grandes
function Destaque({ titulo, itens, atraso }) {
  return (
    <section className="anim-entra rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 md:p-6" style={{ animationDelay: `${atraso}ms` }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-suave">{titulo}</p>
      <div className="mt-4 space-y-4">
        {itens.map((i) => (
          <div key={i.rotulo}>
            <p className="text-3xl font-semibold tracking-tight tabular-nums"><Contador valor={i.valor} formato={pc} /></p>
            <p className="mt-1 text-sm text-suave">{i.rotulo}</p>
            {i.sub && <p className="text-[11px] text-suave">{i.sub}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function Bloco({ titulo, children, atraso = 0 }) {
  return (
    <section className="anim-entra rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6" style={{ animationDelay: `${atraso}ms` }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-suave">{titulo}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}
const Linha = ({ rotulo, valor, cor, sub }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-sm text-suave">{rotulo}{sub && <span className="block text-[11px]">{sub}</span>}</span>
    <b className="text-lg font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>{valor ?? "—"}</b>
  </div>
);
const Rank = ({ lista, token }) => (
  <ul className="divide-y divide-white/5">
    {lista.map((a, i) => (
      <li key={a.ticker} className="anim-entra flex items-center gap-3 py-2.5" style={{ animationDelay: `${i * 70 + 500}ms` }}>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.nome}</p><p className="text-xs text-suave">{a.ticker} · {fmtPreco(a.preco)}</p></div>
        <MiniAcao ticker={a.ticker} token={token} />
        <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums" style={{ color: corVar(a.variacao) }}><Seta v={a.variacao} /> {fmtVar(a.variacao)}</span>
      </li>
    ))}
  </ul>
);

// Resumo do Brasil e do mundo: bolsa, juros, inflação, câmbio e criptomoedas
export default function Panorama({ token }) {
  const [d, setD] = useState(null);
  const [carregando, setCarregando] = useState(false);

  const atualizar = useCallback((sinal) => {
    if (token === null) return undefined;
    setCarregando(true);
    return carregarTudo(token, sinal).then((r) => { if (!sinal?.aborted) setD(r); }).finally(() => { if (!sinal?.aborted) setCarregando(false); });
  }, [token]);
  useEffect(() => { const c = new AbortController(); atualizar(c.signal); return () => c.abort(); }, [atualizar]);

  const m = d?.moedas;
  const moeda = (chave, nome, cripto) => {
    const x = m?.[chave];
    return x ? <Linha key={chave} rotulo={nome} valor={<>{cripto ? Number(x.bid).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : fmtPreco(Number(x.bid))} <span className="text-xs" style={{ color: corVar(Number(x.pctChange)) }}><Seta v={Number(x.pctChange)} /> {fmtVar(Number(x.pctChange))}</span></>} /> : <Linha key={chave} rotulo={nome} valor={null} />;
  };
  const alta = d?.ranking ? [...d.ranking].sort((a, b) => b.variacao - a.variacao).slice(0, 5) : null;
  const queda = d?.ranking ? [...d.ranking].sort((a, b) => a.variacao - b.variacao).slice(0, 5) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-suave">Panorama</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Brasil e mundo hoje</h2>
        </div>
        <button type="button" onClick={() => atualizar()} disabled={carregando} className="rounded-full border border-white/15 px-4 py-1.5 text-sm font-semibold disabled:opacity-40">{carregando ? "Atualizando…" : "Atualizar"}</button>
      </div>
      {!d && <p className="text-sm text-suave">Carregando…</p>}
      {d && (
        <div key={d.t} className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Destaque titulo="Juros hoje" atraso={0} itens={[{ rotulo: "Selic atual", valor: d.selic, sub: "meta definida pelo Copom" }]} />
            <Destaque titulo="Juros esperados" atraso={80} itens={[{ rotulo: `Selic no fim de ${d.ano}`, valor: d.selicA?.valor, sub: d.selicA && `Focus de ${d.selicA.data}` }, { rotulo: `Selic no fim de ${d.ano + 1}`, valor: d.selicB?.valor, sub: d.selicB && `Focus de ${d.selicB.data}` }]} />
            <Destaque titulo="Inflação hoje" atraso={160} itens={[{ rotulo: "IPCA em 12 meses", valor: d.ipca12, sub: "inflação oficial" }]} />
            <Destaque titulo="Inflação esperada" atraso={240} itens={[{ rotulo: `IPCA no fim de ${d.ano}`, valor: d.ipcaA?.valor, sub: d.ipcaA && `Focus de ${d.ipcaA.data}` }, { rotulo: `IPCA no fim de ${d.ano + 1}`, valor: d.ipcaB?.valor, sub: d.ipcaB && `Focus de ${d.ipcaB.data}` }]} />
          </div>
          <p className="-mt-2 text-[11px] text-suave">Valores “esperados”: mediana de economistas no Boletim Focus (Banco Central), publicado às segundas com respostas da semana anterior. Ele demora a refletir choques como o das eleições; os juros futuros (DI) reagem na hora e já estão mais altos.</p>
          <Bloco titulo="Mercados" atraso={320}>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-semibold">Câmbio</p>
                {moeda("USDBRL", "Dólar")}{moeda("EURBRL", "Euro")}
              </div>
              <div className="space-y-3">
                <p className="text-sm font-semibold">Cripto</p>
                {moeda("BTCBRL", "Bitcoin", true)}{moeda("ETHBRL", "Ethereum", true)}
              </div>
            </div>
            <div className="space-y-3 border-t border-white/10 pt-4">
              <p className="text-sm font-semibold">Bolsa brasileira</p>
              {token === "" ? <p className="text-sm text-suave">Cole o token da brapi em “Ver mais ações” (grupo Ações) para ver o Ibovespa e os rankings.</p> : !d.ibov || d.ibov.erro ? (
                <p className="text-sm text-suave">Ibovespa indisponível agora{d.ibov?.erro ? ` (${d.ibov.erro})` : ""}.</p>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-suave">{d.ibov.pontos ? "Ibovespa" : "Ibovespa (via BOVA11, só a variação)"}</p>
                    {d.ibov.pontos && <p className="text-2xl font-semibold tabular-nums"><Contador valor={d.ibov.preco} formato={(v) => Math.round(v).toLocaleString("pt-BR")} /> <span className="text-xs text-suave">pontos</span></p>}
                  </div>
                  <Mini serie={d.ibov.serie} largura={120} altura={40} />
                  <span className="shrink-0 text-lg font-semibold tabular-nums" style={{ color: corVar(d.ibov.variacao) }}><Seta v={d.ibov.variacao} /> {fmtVar(d.ibov.variacao)}</span>
                </div>
              )}
            </div>
          </Bloco>
          {(alta || queda) && (
            <div className="grid gap-4 md:grid-cols-2">
              {alta && <Bloco titulo="5 ações que mais subiram" atraso={400}><Rank lista={alta} token={token} /></Bloco>}
              {queda && <Bloco titulo="5 ações que mais caíram" atraso={480}><Rank lista={queda} token={token} /></Bloco>}
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-suave">Fontes: Banco Central do Brasil (Selic, IPCA e Boletim Focus), AwesomeAPI (câmbio e cripto) e brapi (bolsa). Ranking entre as 100 ações mais negociadas; gráficos dos últimos 30 dias. Informativo, não é recomendação de investimento.</p>
    </div>
  );
}
