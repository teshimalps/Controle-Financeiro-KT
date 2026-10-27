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
  return { ano, selic, ipca12, selicA, selicB, ipcaA, ipcaB, moedas, ibov, ranking };
}

function Bloco({ titulo, children }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
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
    {lista.map((a) => (
      <li key={a.ticker} className="flex items-center justify-between gap-3 py-2">
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Bloco titulo="Juros e inflação">
            <Linha rotulo="Selic hoje" valor={d.selic != null ? pc(d.selic) : null} />
            <Linha rotulo={`Selic esperada ${d.ano}`} sub="mercado (Boletim Focus)" valor={d.selicA != null ? pc(d.selicA) : null} />
            <Linha rotulo={`Selic esperada ${d.ano + 1}`} sub="mercado (Boletim Focus)" valor={d.selicB != null ? pc(d.selicB) : null} />
            <Linha rotulo="Inflação (IPCA, 12 meses)" valor={d.ipca12 != null ? pc(d.ipca12) : null} />
            <Linha rotulo={`IPCA esperado ${d.ano}`} sub="mercado (Boletim Focus)" valor={d.ipcaA != null ? pc(d.ipcaA) : null} />
            <Linha rotulo={`IPCA esperado ${d.ano + 1}`} sub="mercado (Boletim Focus)" valor={d.ipcaB != null ? pc(d.ipcaB) : null} />
          </Bloco>
          <Bloco titulo="Câmbio e cripto">
            {moeda("USDBRL", "Dólar")}{moeda("EURBRL", "Euro")}{moeda("BTCBRL", "Bitcoin", true)}{moeda("ETHBRL", "Ethereum", true)}
          </Bloco>
          <Bloco titulo="Bolsa brasileira">
            {token === "" ? <p className="text-sm text-suave">Cole o token da brapi em “Ver mais ações” (grupo Ações) para ver o Ibovespa e o ranking.</p> : (
              <>
                <Linha rotulo="Ibovespa" valor={d.ibov ? <>{Number(d.ibov.regularMarketPrice).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} <span className="text-xs" style={{ color: corVar(Number(d.ibov.regularMarketChangePercent)) }}><Seta v={Number(d.ibov.regularMarketChangePercent)} /> {fmtVar(Number(d.ibov.regularMarketChangePercent))}</span></> : null} />
                {!alta && <p className="text-sm text-suave">Ranking indisponível agora.</p>}
              </>
            )}
          </Bloco>
          {alta && <Bloco titulo="5 ações que mais subiram"><Rank lista={alta} /></Bloco>}
          {queda && <Bloco titulo="5 ações que mais caíram"><Rank lista={queda} /></Bloco>}
        </div>
      )}
      <p className="text-[11px] text-suave">Fontes: Banco Central do Brasil (Selic, IPCA e Boletim Focus), AwesomeAPI (câmbio e cripto) e brapi (bolsa). Ranking entre as 100 ações mais negociadas. Informativo, não é recomendação de investimento.</p>
    </div>
  );
}
