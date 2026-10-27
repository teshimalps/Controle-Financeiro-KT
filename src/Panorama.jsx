import { useCallback, useEffect, useState } from "react";
import { corVar, fmtPreco, fmtVar } from "./mercado.js";
import { Seta } from "./Mercado.jsx";

const pc = (v) => `${Number(v).toFixed(2).replace(".", ",")}%`;
const json = async (url, sinal) => { const r = await fetch(url, { signal: sinal }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const sgs = async (serie, sinal) => Number((await json(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`, sinal))[0].valor);
// Mediana das expectativas do mercado (Boletim Focus, Banco Central) para o fim de um ano
const focus = async (indicador, ano, sinal) => {
  const q = `$top=1&$filter=Indicador eq '${indicador}' and DataReferencia eq '${ano}'&$orderby=Data desc&$format=json`;
  return Number((await json(`https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?${encodeURI(q)}`, sinal)).value[0].Mediana);
};
const TICKER = /^[A-Z]{4}\d{1,2}$/;

async function carregarTudo(token, sinal) {
  const ano = new Date().getFullYear();
  const pega = (p) => p.then((v) => v, () => null); // cada bloco falha sozinho
  const [selic, ipca12, selicA, selicB, ipcaA, ipcaB, moedas, ibov, ranking] = await Promise.all([
    pega(sgs(432, sinal)), pega(sgs(13522, sinal)),
    pega(focus("Selic", ano, sinal)), pega(focus("Selic", ano + 1, sinal)),
    pega(focus("IPCA", ano, sinal)), pega(focus("IPCA", ano + 1, sinal)),
    pega(json("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL,ETH-BRL", sinal)),
    token ? pega(json(`https://brapi.dev/api/quote/%5EBVSP?token=${encodeURIComponent(token)}`, sinal).then((j) => j.results[0])) : Promise.resolve(null),
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
const Rank = ({ lista }) => (
  <ul className="divide-y divide-white/5">
    {lista.map((a, i) => (
      <li key={a.ticker} className="anim-entra flex items-center justify-between gap-3 py-2" style={{ animationDelay: `${i * 70 + 500}ms` }}>
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{a.nome}</p><p className="text-xs text-suave">{a.ticker} · {fmtPreco(a.preco)}</p></div>
        <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: corVar(a.variacao) }}><Seta v={a.variacao} /> {fmtVar(a.variacao)}</span>
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
            <Destaque titulo="Juros esperados" atraso={80} itens={[{ rotulo: `Selic no fim de ${d.ano}`, valor: d.selicA }, { rotulo: `Selic no fim de ${d.ano + 1}`, valor: d.selicB }]} />
            <Destaque titulo="Inflação hoje" atraso={160} itens={[{ rotulo: "IPCA em 12 meses", valor: d.ipca12, sub: "inflação oficial" }]} />
            <Destaque titulo="Inflação esperada" atraso={240} itens={[{ rotulo: `IPCA no fim de ${d.ano}`, valor: d.ipcaA }, { rotulo: `IPCA no fim de ${d.ano + 1}`, valor: d.ipcaB }]} />
          </div>
          <p className="-mt-2 text-[11px] text-suave">Valores “esperados”: mediana do mercado no Boletim Focus (Banco Central).</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Bloco titulo="Câmbio e cripto" atraso={320}>
              {moeda("USDBRL", "Dólar")}{moeda("EURBRL", "Euro")}{moeda("BTCBRL", "Bitcoin", true)}{moeda("ETHBRL", "Ethereum", true)}
            </Bloco>
            <Bloco titulo="Bolsa brasileira" atraso={400}>
              {token === "" ? <p className="text-sm text-suave">Cole o token da brapi em “Ver mais ações” (grupo Ações) para ver o Ibovespa e o ranking.</p> : (
                <>
                  <Linha rotulo="Ibovespa" valor={d.ibov ? <>{Number(d.ibov.regularMarketPrice).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} <span className="text-xs" style={{ color: corVar(Number(d.ibov.regularMarketChangePercent)) }}><Seta v={Number(d.ibov.regularMarketChangePercent)} /> {fmtVar(Number(d.ibov.regularMarketChangePercent))}</span></> : null} />
                  {!alta && <p className="text-sm text-suave">Ranking indisponível agora.</p>}
                </>
              )}
            </Bloco>
            {alta && <Bloco titulo="5 ações que mais subiram" atraso={480}><Rank lista={alta} /></Bloco>}
            {queda && <Bloco titulo="5 ações que mais caíram" atraso={560}><Rank lista={queda} /></Bloco>}
          </div>
        </div>
      )}
      <p className="text-[11px] text-suave">Fontes: Banco Central do Brasil (Selic, IPCA e Boletim Focus), AwesomeAPI (câmbio e cripto) e brapi (bolsa). Ranking entre as 100 ações mais negociadas. Informativo, não é recomendação de investimento.</p>
    </div>
  );
}
