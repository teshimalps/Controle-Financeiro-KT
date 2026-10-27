import { useState } from "react";
import { brl, corTexto } from "./util.js";

export const tipoDe = (x) => (x.rendimento ? "rendimento" : x.tipo);
export const filtroVazio = { tipos: [], cats: [], pags: [], q: "" };
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const contar = (f) => f.tipos.length + f.cats.length + f.pags.length + (f.q.trim() ? 1 : 0);

// Sem nada marcado em um grupo, ele não filtra; marcando várias opções, mostra qualquer uma delas
export function filtrar(itens, f) {
  const q = norm(f.q);
  return itens.filter((i) =>
    (!f.tipos.length || f.tipos.includes(tipoDe(i))) &&
    (!f.cats.length || f.cats.includes(i.categoria)) &&
    (!f.pags.length || f.pags.includes(i.pagamento || "")) &&
    (!q || norm(`${i.descricao} ${i.categoria} ${i.pagamento}`).includes(q)));
}

const TIPOS = [["entrada", "Entradas"], ["saida", "Saídas"], ["investimento", "Investimentos"], ["rendimento", "Rendimentos"]];
const doTipo = (c, t) => t === "entrada" ? c.grupo === "entrada" : t === "saida" ? c.grupo === "gasto"
  : t === "investimento" ? c.grupo === "investimento" && c.pai !== "Rendimentos" : c.pai === "Rendimentos";

function Chip({ on, cor = "#0057FF", onClick, children }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="rounded-full px-3 py-1.5 text-sm font-bold"
      style={on ? { background: cor, color: "#fff", boxShadow: `0 0 10px ${cor}` } : { border: "1px solid #333", color: "#9A9A9A" }}>
      {children}
    </button>
  );
}

export default function Filtro({ itens, lista, cats, f, setF }) {
  const [aberto, setAberto] = useState(false);
  const n = contar(f);
  const alt = (campo, v) => setF({ ...f, [campo]: f[campo].includes(v) ? f[campo].filter((x) => x !== v) : [...f[campo], v] });

  // categorias: as cadastradas dos tipos escolhidos, mais as que já aparecem nos lançamentos e as já marcadas
  const reg = cats.filter((c) => c.grupo !== "pagamento");
  const doFiltro = f.tipos.length ? reg.filter((c) => f.tipos.some((t) => doTipo(c, t))) : reg;
  const usadas = itens.filter((i) => !f.tipos.length || f.tipos.includes(tipoDe(i))).map((i) => i.categoria);
  const optsCat = [...new Set([...doFiltro.map((c) => c.nome), ...usadas, ...f.cats])].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const corDe = (nome) => reg.find((c) => c.nome === nome)?.cor;
  const optsPag = [...new Set([...cats.filter((c) => c.grupo === "pagamento").map((c) => c.nome), ...itens.map((i) => i.pagamento || ""), ...f.pags])]
    .sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "pt-BR")));

  const tot = {};
  lista.forEach((i) => { const t = tipoDe(i); tot[t] = (tot[t] || 0) + i.valor; });

  return (
    <section className="painel3d rounded-2xl">
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="flex w-full items-center gap-2 p-4 text-left">
        <span className="font-bold">Filtro avançado</span>
        {n > 0 && <span className="rounded-full bg-neon px-2 text-xs font-bold text-white">{n}</span>}
        <span className="flex-1" />
        <svg viewBox="0 0 24 24" className={`h-5 w-5 text-suave transition-transform ${aberto ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {aberto && (
        <div className="space-y-4 px-4 pb-4">
          <input type="search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar por nome, categoria ou pagamento"
            className="w-full rounded-xl border border-borda bg-[#141414] px-3 py-2.5 text-tinta" />
          <div>
            <p className="mb-1 text-sm text-suave">Tipo</p>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map(([v, r]) => <Chip key={v} on={f.tipos.includes(v)} cor={v === "entrada" ? "#1E3A8A" : v === "saida" ? "#0057FF" : "#8B5CF6"} onClick={() => alt("tipos", v)}>{r}</Chip>)}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm text-suave">Categoria (uma ou mais)</p>
            <div className="flex flex-wrap gap-2">
              {optsCat.map((nome) => <Chip key={nome} on={f.cats.includes(nome)} cor={corDe(nome)} onClick={() => alt("cats", nome)}>{nome}</Chip>)}
              {!optsCat.length && <span className="text-sm text-suave">Nenhuma categoria ainda.</span>}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm text-suave">Forma de pagamento (uma ou mais)</p>
            <div className="flex flex-wrap gap-2">
              {optsPag.map((p) => <Chip key={p || "nenhuma"} on={f.pags.includes(p)} onClick={() => alt("pags", p)}>{p || "Sem forma de pagamento"}</Chip>)}
              {!optsPag.length && <span className="text-sm text-suave">Nenhuma forma de pagamento ainda.</span>}
            </div>
          </div>
        </div>
      )}
      {n > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-4 text-sm">
          <span className="text-suave">{lista.length} lançamento{lista.length !== 1 && "s"}</span>
          {[["entrada", "Entradas"], ["saida", "Saídas"], ["investimento", "Investido"], ["rendimento", "Rendimentos"]].filter(([t]) => tot[t] !== undefined).map(([t, r]) => (
            <span key={t} className="font-bold tabular-nums" style={{ color: corTexto[t === "rendimento" ? "investimento" : t] }}>{r} {brl(tot[t])}</span>
          ))}
          <button type="button" onClick={() => setF(filtroVazio)} className="ml-auto text-suave underline">Limpar filtros</button>
        </div>
      )}
    </section>
  );
}
