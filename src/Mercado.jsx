import { useMemo, useState } from "react";
import { corVar, fmtPreco, fmtVar } from "./mercado.js";

const campo = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-tinta placeholder:text-suave/70";
export const Seta = ({ v }) => <span aria-hidden="true">{v > 0 ? "▲" : v < 0 ? "▼" : "•"}</span>;

const ORDENS = {
  altas: ["Maiores altas", (a, b) => b.variacao - a.variacao],
  quedas: ["Maiores quedas", (a, b) => a.variacao - b.variacao],
  volume: ["Mais negociadas", (a, b) => b.volume - a.volume],
  nome: ["A a Z", (a, b) => a.ticker.localeCompare(b.ticker)],
};
const vazios = { varMin: "", varMax: "", precoMin: "", precoMax: "", setor: "", volumeMin: "", mercadoMin: "" };
const n = (v) => (v === "" ? null : Number(v));

function Campo({ rotulo, valor, onChange, ...resto }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-suave">{rotulo}</span>
      <input className={campo} type="number" inputMode="decimal" value={valor} onChange={(e) => onChange(e.target.value)} aria-label={rotulo} {...resto} />
    </label>
  );
}

// Cartão para colar o token da brapi (gratuito) e ligar as cotações reais
export function PedirToken({ mercado }) {
  const [txt, setTxt] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (txt.trim()) mercado.salvarToken(txt).then(() => setMsg("")).catch(() => setMsg("Não consegui salvar. Verifique a conexão.")); }} className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="font-semibold">Ligue as cotações da bolsa</p>
      <p className="text-sm text-suave">Para ver preços e variação do dia das ações da B3, crie uma conta gratuita em <b>brapi.dev</b>, copie seu token e cole aqui. Ele fica salvo só na sua conta.</p>
      <input className={campo} placeholder="Cole o token da brapi" value={txt} onChange={(e) => setTxt(e.target.value)} aria-label="Token da brapi" autoComplete="off" />
      <button className="rounded-xl bg-neon px-5 py-2.5 font-semibold text-white">Salvar token</button>
      {msg && <p role="alert" className="text-sm text-[#F87171]">{msg}</p>}
    </form>
  );
}

// Lista de todas as ações da bolsa, com variação do dia e busca avançada (recolhida, sem nada marcado)
export default function Mercado({ mercado, jaTem, onAdd }) {
  const [texto, setTexto] = useState("");
  const [ordem, setOrdem] = useState("volume");
  const [avancada, setAvancada] = useState(false);
  const [f, setF] = useState(vazios);
  const [limite, setLimite] = useState(40);
  const [comprando, setComprando] = useState(null); // ação em que se está informando quantidade e preço pago
  const [qtd, setQtd] = useState("");
  const [pago, setPago] = useState("");
  const mudar = (k, v) => { setF((x) => ({ ...x, [k]: v })); setLimite(40); };

  const setores = useMemo(() => [...new Set((mercado.lista || []).map((a) => a.setor).filter(Boolean))].sort(), [mercado.lista]);
  const filtrada = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const [vMin, vMax, pMin, pMax, volMin, mercMin] = [n(f.varMin), n(f.varMax), n(f.precoMin), n(f.precoMax), n(f.volumeMin), n(f.mercadoMin)];
    return (mercado.lista || [])
      .filter((a) => (!q || a.ticker.toLowerCase().includes(q) || a.nome.toLowerCase().includes(q))
        && (vMin == null || a.variacao >= vMin) && (vMax == null || a.variacao <= vMax)
        && (pMin == null || a.preco >= pMin) && (pMax == null || a.preco <= pMax)
        && (!f.setor || a.setor === f.setor)
        && (volMin == null || a.volume >= volMin * 1e6) && (mercMin == null || a.valorMercado >= mercMin * 1e9))
      .sort(ORDENS[ordem][1]);
  }, [mercado.lista, texto, ordem, f]);
  const ativos = Object.values(f).filter((v) => v !== "").length;
  const tem = (t) => (jaTem || []).includes(t);

  if (mercado.token === null) return <p className="text-sm text-suave">Carregando…</p>;
  if (!mercado.token) return <PedirToken mercado={mercado} />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className={campo} placeholder="Buscar código ou nome" value={texto} onChange={(e) => { setTexto(e.target.value); setLimite(40); }} aria-label="Buscar ações" />
        <select className="w-44 shrink-0 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-tinta" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordenar">
          {Object.entries(ORDENS).map(([k, [nome]]) => <option key={k} value={k}>{nome}</option>)}
        </select>
      </div>

      <button type="button" onClick={() => setAvancada(!avancada)} aria-expanded={avancada} className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2.5 text-sm font-semibold">
        <span>Busca avançada{ativos > 0 && <span className="ml-2 rounded-full bg-neon px-2 py-0.5 text-xs text-white">{ativos}</span>}</span>
        <span className="text-suave">{avancada ? "Fechar" : "Abrir"}</span>
      </button>
      {avancada && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:grid-cols-3">
          <Campo rotulo="Variação mín. (%)" valor={f.varMin} onChange={(v) => mudar("varMin", v)} step="0.1" />
          <Campo rotulo="Variação máx. (%)" valor={f.varMax} onChange={(v) => mudar("varMax", v)} step="0.1" />
          <Campo rotulo="Preço mín. (R$)" valor={f.precoMin} onChange={(v) => mudar("precoMin", v)} step="0.01" min="0" />
          <Campo rotulo="Preço máx. (R$)" valor={f.precoMax} onChange={(v) => mudar("precoMax", v)} step="0.01" min="0" />
          <Campo rotulo="Volume mín. (R$ mi)" valor={f.volumeMin} onChange={(v) => mudar("volumeMin", v)} min="0" />
          <Campo rotulo="Valor de mercado mín. (R$ bi)" valor={f.mercadoMin} onChange={(v) => mudar("mercadoMin", v)} min="0" />
          <label className="col-span-2 block space-y-1 sm:col-span-3">
            <span className="text-[11px] uppercase tracking-wider text-suave">Setor</span>
            <select className={campo} value={f.setor} onChange={(e) => mudar("setor", e.target.value)} aria-label="Setor">
              <option value="">Todos</option>
              {setores.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setF(vazios)} className="col-span-2 text-left text-sm text-suave underline sm:col-span-3">Limpar filtros</button>
        </div>
      )}

      {mercado.erro && (
        <div role="alert" className="space-y-2 rounded-xl border border-[#F87171]/30 p-3 text-sm text-[#F87171]">
          <p>{mercado.erro}</p>
          <button type="button" onClick={() => mercado.carregar(true)} className="underline">Tentar de novo</button>
        </div>
      )}
      {mercado.carregando && <p className="text-sm text-suave">Carregando cotações…</p>}
      {mercado.lista && <p className="text-xs text-suave">{filtrada.length} {filtrada.length === 1 ? "ação" : "ações"} · variação do último pregão, atualizada a cada poucos minutos</p>}

      <ul className="divide-y divide-white/5">
        {filtrada.slice(0, limite).map((a) => (
          <li key={a.ticker} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <b className="tracking-wide">{a.ticker}</b>
              <p className="truncate text-xs text-suave">{a.nome}</p>
            </div>
            <div className="text-right tabular-nums">
              <p className="font-semibold">{fmtPreco(a.preco)}</p>
              <p className="text-xs font-semibold" style={{ color: corVar(a.variacao) }}><Seta v={a.variacao} /> {fmtVar(a.variacao)}</p>
            </div>
            <button type="button" disabled={tem(a.ticker)} onClick={() => { setComprando(comprando === a.ticker ? null : a.ticker); setQtd(""); setPago(String(a.preco)); }} className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">{tem(a.ticker) ? "Na carteira" : "+ Carteira"}</button>
            {comprando === a.ticker && (
              <form className="basis-full space-y-2 pt-2" onSubmit={(e) => { e.preventDefault(); if (Number(qtd) > 0 && Number(pago) > 0) { onAdd(a.ticker, Number(qtd), Number(pago)); setComprando(null); } }}>
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="Quantidade comprada" valor={qtd} onChange={setQtd} step="any" min="0" autoFocus />
                  <Campo rotulo="Preço pago (por ação)" valor={pago} onChange={setPago} step="0.01" min="0" />
                </div>
                <button className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black">Adicionar à carteira</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {filtrada.length > limite && <button type="button" onClick={() => setLimite(limite + 40)} className="btn-vidro w-full">Mostrar mais</button>}
      {mercado.lista && !filtrada.length && <p className="text-sm text-suave">Nenhuma ação encontrada com esses filtros.</p>}
    </div>
  );
}
