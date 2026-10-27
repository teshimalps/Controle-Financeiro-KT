import { useCallback, useEffect, useState } from "react";
import { corVar, fmtPreco, fmtVar } from "./mercado.js";
import { Seta } from "./Mercado.jsx";
import { lerHistorico, registrarPrecos, serieDe } from "./historico.js";

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

// Índices (Ibovespa e bolsas do mundo) pelo HG Brasil Finance, com a chave gratuita da própria pessoa
async function buscarIndices(chave, sinal) {
  const base = `https://api.hgbrasil.com/finance?key=${encodeURIComponent(chave)}`;
  let j;
  try { j = await json(base, sinal); } catch (e1) {
    if (e1.name === "AbortError") throw e1;
    try { j = await json(`${base}&format=json-cors`, sinal); } catch (e2) {
      if (e2.name === "AbortError") throw e2;
      // "Failed to fetch" = o navegador bloqueou o pedido (domínio da chave, tipo da chave ou bloqueador de anúncios)
      throw new Error(/^\d+$/.test(e2.message) ? `a HG Brasil respondeu erro ${e2.message}` : "o navegador bloqueou o pedido: confira se a chave é do tipo Uso exposto com o domínio deste site e desative bloqueadores de anúncios para ele");
    }
  }
  if (j.valid_key === false) throw new Error("chave inválida ou domínio não cadastrado na chave");
  return j.results.stocks;
}
// Gráfico pequeno de linha com os dias guardados pelo app. Cor pela tendência do período.
function Mini({ serie, largura = 72, altura = 28 }) {
  if (!serie || serie.length < 2) return <span className="inline-block" style={{ width: largura }} aria-hidden="true" />;
  const min = Math.min(...serie), max = Math.max(...serie), dx = largura / (serie.length - 1);
  const pts = serie.map((v, i) => `${(i * dx).toFixed(1)},${(altura - 2 - ((v - min) / (max - min || 1)) * (altura - 4)).toFixed(1)}`).join(" ");
  const cor = corVar(serie[serie.length - 1] - serie[0]);
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label="Histórico de preços guardado no app" className="shrink-0">
      <title>Histórico guardado pelo app</title>
      <polyline points={pts} fill="none" stroke={cor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" pathLength="1" className="anim-tracar" />
    </svg>
  );
}
async function carregarTudo(token, hgKey, sinal) {
  const ano = new Date().getFullYear();
  const pega = (p) => p.then((v) => v, () => null); // cada bloco falha sozinho
  const [selic, ipca12, selicA, selicB, ipcaA, ipcaB, moedas, indices, ranking] = await Promise.all([
    pega(sgs(432, sinal)), pega(sgs(13522, sinal)),
    pega(focus("Selic", ano, sinal)), pega(focus("Selic", ano + 1, sinal)),
    pega(focus("IPCA", ano, sinal)), pega(focus("IPCA", ano + 1, sinal)),
    pega(json("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL,ETH-BRL", sinal)),
    hgKey ? buscarIndices(hgKey, sinal).then((v) => v, (e) => ({ erro: e.message || "indisponível" })) : Promise.resolve(null),
    token ? pega(json(`https://brapi.dev/api/quote/list?type=stock&limit=100&sortBy=volume&sortOrder=desc&token=${encodeURIComponent(token)}`, sinal).then((j) => (j.stocks || [])
      .filter((s) => TICKER.test(s.stock || "") && Number.isFinite(Number(s.change)))
      .map((s) => ({ ticker: s.stock, nome: s.name || s.stock, preco: Number(s.close), variacao: Number(s.change) })))) : Promise.resolve(null),
  ]);
  return { t: Date.now(), ano, selic, ipca12, selicA, selicB, ipcaA, ipcaB, moedas, indices, ranking };
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
const Rank = ({ lista, hist }) => (
  <ul className="divide-y divide-white/5">
    {lista.map((a, i) => (
      <li key={a.ticker} className="anim-entra flex items-center gap-3 py-2.5" style={{ animationDelay: `${i * 70 + 500}ms` }}>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.nome}</p><p className="text-xs text-suave">{a.ticker} · {fmtPreco(a.preco)}</p></div>
        <Mini serie={serieDe(hist, a.ticker, a.preco)} />
        <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums" style={{ color: corVar(a.variacao) }}><Seta v={a.variacao} /> {fmtVar(a.variacao)}</span>
      </li>
    ))}
  </ul>
);

// Resumo do Brasil e do mundo: bolsa, juros, inflação, câmbio e criptomoedas
export default function Panorama({ uid, token, hgKey, salvarHg }) {
  const [d, setD] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [chaveTxt, setChaveTxt] = useState("");
  const [trocando, setTrocando] = useState(false);
  const [hist, setHist] = useState([]); // dias de preços guardados
  useEffect(() => { lerHistorico(uid).then(setHist, () => {}); }, [uid]);

  const atualizar = useCallback((sinal) => {
    if (token === null || hgKey === null) return undefined;
    setCarregando(true);
    return carregarTudo(token, hgKey, sinal).then((r) => { if (!sinal?.aborted) { setD(r); registrarPrecos(uid, r.ranking, "top100"); } }).finally(() => { if (!sinal?.aborted) setCarregando(false); });
  }, [token, hgKey, uid]);
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
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Bolsas</p>
                {hgKey && !trocando && <button type="button" onClick={() => setTrocando(true)} className="text-xs text-suave underline">Trocar chave</button>}
              </div>
              {!hgKey || trocando ? (
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (chaveTxt.trim()) { salvarHg(chaveTxt); setChaveTxt(""); setTrocando(false); } }}>
                  <p className="text-sm text-suave">{trocando ? "Cole a nova chave da HG Brasil (tipo Uso exposto, domínio orafinancebr.web.app)." : <>Para ver o Ibovespa (pontos) e as bolsas do mundo, crie uma chave gratuita em <b>hgbrasil.com/finance</b> e cole aqui. Fica salva só na sua conta.</>}</p>
                  <div className="flex gap-2">
                    <input className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-tinta" placeholder="Chave do HG Brasil" value={chaveTxt} onChange={(e) => setChaveTxt(e.target.value)} aria-label="Chave do HG Brasil" autoComplete="off" />
                    <button className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black">Salvar</button>
                    {trocando && <button type="button" onClick={() => { setTrocando(false); setChaveTxt(""); }} className="shrink-0 text-sm text-suave underline">Cancelar</button>}
                  </div>
                </form>
              ) : !d.indices || d.indices.erro ? (
                <p className="text-sm text-suave">Bolsas indisponíveis agora{d.indices?.erro ? ` (${d.indices.erro})` : ""}.</p>
              ) : (
                <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {[["IBOVESPA", "Ibovespa"], ["NASDAQ", "Nasdaq (EUA)"], ["DOWJONES", "Dow Jones (EUA)"], ["CAC", "CAC 40 (França)"], ["NIKKEI", "Nikkei 225 (Japão)"], ["IFIX", "IFIX (FIIs)"]].map(([k, nome]) => {
                    const x = d.indices[k];
                    const v = Number(x?.variation), pts = Number(x?.points);
                    return x ? <Linha key={k} rotulo={nome} valor={<>{Number.isFinite(pts) ? <Contador valor={pts} formato={(n) => Math.round(n).toLocaleString("pt-BR")} /> : "—"} <span className="text-xs" style={{ color: corVar(v) }}><Seta v={v} /> {fmtVar(v)}</span></>} /> : null;
                  })}
                </div>
              )}
            </div>
          </Bloco>
          {(alta || queda) && (
            <div className="grid gap-4 md:grid-cols-2">
              {alta && <Bloco titulo="5 ações que mais subiram" atraso={400}><Rank lista={alta} hist={hist} /></Bloco>}
              {queda && <Bloco titulo="5 ações que mais caíram" atraso={480}><Rank lista={queda} hist={hist} /></Bloco>}
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-suave">Fontes: Banco Central do Brasil (Selic, IPCA e Boletim Focus), AwesomeAPI (câmbio e cripto), HG Brasil (índices das bolsas) e brapi (ações). Ranking entre as 100 ações mais negociadas; gráficos formados com os preços que o app guarda a cada dia útil (começam amanhã e ganham pontos com o tempo). Informativo, não é recomendação de investimento.</p>
    </div>
  );
}
