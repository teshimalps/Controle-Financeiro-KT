import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { brl, escurecer, guardadoDe, restante } from "./util.js";

function Anel({ pct, cor }) {
  const r = 42, C = 2 * Math.PI * r;
  const base = Math.min(Math.max(pct, 0), 100), extra = Math.min(Math.max(pct - 100, 0), 100);
  const arco = (p) => `${(C * p) / 100} ${C}`;
  const c = { cx: 50, cy: 50, r, fill: "none", strokeWidth: 10, transform: "rotate(-90 50 50)" };
  return (
    <svg viewBox="-8 -8 116 116" style={{ overflow: "visible" }} className="w-full" role="img" aria-label={`${Math.floor(pct)}%`}>
      <circle {...c} stroke="#0F0F0F" />
      <circle {...c} stroke="#2A2A2A" strokeWidth="1" />
      <circle {...c} stroke={cor} strokeDasharray={arco(base)} style={{ filter: `drop-shadow(0 0 3px ${cor})` }} />
      {extra > 0 && <circle {...c} stroke={escurecer(cor, 0.5)} strokeDasharray={arco(extra)} />}
      <text x="50" y="56" textAnchor="middle" fill="#F2F2F2" fontSize="20" fontWeight="800">{Math.floor(pct)}%</text>
    </svg>
  );
}

// 6 metas por linha no computador, 4 no celular
function useColunas() {
  const q = "(min-width: 768px)";
  const [pc, setPc] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q), f = () => setPc(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return pc ? 6 : 4;
}

export default function MetasResumo({ uid, itens, entrou, valor, cats, onAbrir, onAbrirValor }) {
  const [mensais, setMensais] = useState([]);
  const [inv, setInv] = useState([]);
  const [pag, setPag] = useState(0);
  const colunas = useColunas();
  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "metas"), (s) => setMensais(s.data()?.mensais || [])), [uid]);
  useEffect(() => onSnapshot(query(collection(db, "users", uid, "lancamentos"), where("tipo", "==", "investimento")), (s) => setInv(s.docs.map((d) => d.data()))), [uid]);

  // Cada lançamento conta numa meta só: a que tem a categoria dele vence a que tem só o tipo
  const usado = Object.fromEntries(mensais.map((m) => [m.id, 0]));
  itens.filter((i) => !i.rendimento).forEach((i) => {
    const alvo = (i.fixo && i.tipo === "saida" ? mensais.find((m) => m.vinc?.includes("fixo")) : null) || mensais.find((m) => m.vinc?.includes(`cat:${i.categoria}`)) || mensais.find((m) => m.vinc?.includes(`tipo:${i.tipo}`));
    if (alvo) usado[alvo.id] += i.valor;
  });

  // Até 8 metas ficam em 1 linha por página; com mais de 8, cada página mostra 2 linhas
  const porPagina = colunas * (mensais.length > 8 ? 2 : 1);
  const paginas = Math.ceil(mensais.length / porPagina);
  const atual = Math.min(pag, Math.max(paginas - 1, 0));
  const visiveis = mensais.slice(atual * porPagina, (atual + 1) * porPagina);

  return (
    <>
      {mensais.length > 0 && (
        <section className="painel3d rounded-2xl p-3 md:p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">Metas mensais</h2>
            <button onClick={onAbrir} className="text-sm text-suave underline">Editar</button>
          </div>
          <p className="mb-3 text-sm text-suave">Base: {brl(entrou)} que entraram no mês</p>
          <div className="flex items-center gap-2">
            <div key={`${atual}-${colunas}`} className="entrar grid flex-1 gap-x-2 gap-y-4 md:gap-x-3" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
              {visiveis.map((m) => {
                const alvo = (entrou * m.pct) / 100, p = alvo > 0 ? (usado[m.id] / alvo) * 100 : 0;
                return (
                  <div key={m.id} className="min-w-0 text-center">
                    <div className="mx-auto w-full max-w-[110px]"><Anel pct={p} cor={m.cor} /></div>
                    <p className="mt-1 truncate text-xs font-bold md:text-sm" style={{ color: m.cor }}>{m.nome}</p>
                    <p className="truncate text-[10px] tabular-nums text-suave md:text-xs">{brl(usado[m.id])}</p>
                    <p className="hidden truncate text-xs text-suave md:block">de {brl(alvo)} · {m.pct}%</p>
                  </div>
                );
              })}
            </div>
            {paginas > 1 && (
              <button onClick={() => setPag((atual + 1) % paginas)} aria-label={atual + 1 < paginas ? "Ver próximas metas" : "Voltar às primeiras metas"}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-neon/60 bg-[#141414] text-[#4D8DFF] shadow-[0_0_14px_rgba(0,87,255,.45)] md:h-9 md:w-9">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
              </button>
            )}
          </div>
          {paginas > 1 && (
            <div className="mt-3 flex justify-center gap-2">
              {Array.from({ length: paginas }, (_, k) => (
                <button key={k} onClick={() => setPag(k)} aria-label={`Página ${k + 1}`} className={`h-2 rounded-full transition-all ${k === atual ? "w-5 bg-neon shadow-[0_0_8px_rgba(0,87,255,.8)]" : "w-2 bg-[#333]"}`} />
              ))}
            </div>
          )}
        </section>
      )}
      {valor.length > 0 && (
        <section className="painel3d rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-bold">Metas por valor</h2>
            <button onClick={onAbrirValor} className="text-sm text-suave underline">Editar</button>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {valor.map((m) => {
              const v = Number(m.valor) || 0, g = guardadoDe(m, inv, cats), p = v > 0 ? (g / v) * 100 : 0, falta = Math.max(v - g, 0), r = restante(m.data, falta);
              return (
                <div key={m.id}>
                  <div className="flex justify-between gap-2 text-sm"><b className="truncate" style={{ color: m.cor }}>{m.nome}</b><span className="tabular-nums">{Math.floor(Math.min(p, 999))}%</span></div>
                  <div className="mt-1.5 h-3 rounded-full bg-[#0F0F0F] shadow-[inset_0_1px_3px_rgba(0,0,0,.8)]">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(p, 100))}%`, background: `linear-gradient(90deg, ${escurecer(m.cor, 0.6)}, ${m.cor})`, boxShadow: `0 0 12px ${m.cor}` }} />
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-suave">{brl(g)} de {brl(v)} · {falta > 0 ? `faltam ${brl(falta)}` : "meta batida"}</p>
                  {r && <p className="text-xs text-suave">{r}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
