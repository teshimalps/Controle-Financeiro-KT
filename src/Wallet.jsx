import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { auth, db } from "./firebase";
import { brlOc, estaEscondido, mesmoItem, saldoItem } from "./util.js";
import { arcaGrupos } from "./carteira.js";
import Olho, { useOlho } from "./Olho.jsx";

const campo = "w-full rounded-xl border border-borda bg-[#141414] px-3 py-2.5 text-tinta";
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const brl = (v) => brlOc(v, "carteira"); // valores da Wallet seguem o olho da Carteira
const sinal = (v) => `${v > 0 ? "+" : ""}${brl(v)}`;
const COR_REND = "#8B5CF6";
const pct = (v, t) => (t > 0 && v > 0 ? Math.round((v / t) * 100) : 0);

function Pizza({ fatias }) {
  return (
    <div className="h-48">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={fatias} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={fatias.length > 1 ? 2 : 0} stroke="#212121" strokeWidth={2} isAnimationActive={false}>
            {fatias.map((f) => <Cell key={f.name} fill={f.cor} />)}
          </Pie>
          <Tooltip formatter={(v) => brl(v)} contentStyle={{ background: "#1A1A1A", border: "1px solid #333", borderRadius: 12 }} itemStyle={{ color: "#F2F2F2" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// Campo que mostra o saldo e deixa digitar sem "pular" enquanto você escreve
function CampoValor({ valor, onCommit, ...resto }) {
  const [txt, setTxt] = useState(null);
  const escondido = estaEscondido("carteira") && txt === null;
  return (
    <input {...resto} type={escondido ? "text" : "number"} inputMode="decimal" step="0.01"
      value={escondido ? "R$ •••••" : txt ?? String(Number(valor.toFixed(2)))}
      onFocus={() => { if (txt === null) setTxt(String(Number(valor.toFixed(2)))); }}
      onChange={(e) => { setTxt(e.target.value); const n = Number(e.target.value); if (e.target.value !== "" && !Number.isNaN(n)) onCommit(n); }}
      onBlur={() => setTxt(null)} />
  );
}

// Selo com a letra do grupo (A, R, C, A)
const Selo = ({ g, tam = "h-7 w-7" }) => (
  <span className={`grid ${tam} shrink-0 place-content-center rounded-lg text-sm font-extrabold text-black`} style={{ background: g.cor }} aria-hidden="true">{g.letra}</span>
);

// Wallet no método ARCA: Ações e Negócios, Real Estate (FII), Caixa (Renda Fixa) e Ativos Internacionais
export default function Wallet() {
  const uid = auth.currentUser.uid;
  const [oculto, alternar] = useOlho("carteira");
  const [lista, setLista] = useState(null); // os 4 grupos ARCA, cada um com seus investimentos
  const [movs, setMovs] = useState([]);     // aportes, resgates e rendimentos lançados (todos os meses)
  const [cats, setCats] = useState([]);
  const [modal, setModal] = useState(null); // { gid, tela: "lista" | "novo" } ou null
  const [rasc, setRasc] = useState({});
  const [status, setStatus] = useState("");
  const pendente = useRef(null), timer = useRef(null);

  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "carteira"), (s) => setLista((d) => d ?? arcaGrupos(s.data()?.grupos))), [uid]);
  useEffect(() => onSnapshot(query(collection(db, "users", uid, "lancamentos"), where("tipo", "==", "investimento")), (s) => setMovs(s.docs.map((d) => d.data()))), [uid]);
  useEffect(() => onSnapshot(collection(db, "users", uid, "categorias"), (s) => setCats(s.docs.map((d) => d.data()))), [uid]);

  async function gravar() {
    clearTimeout(timer.current);
    const l = pendente.current;
    if (!l) return;
    pendente.current = null;
    try {
      await setDoc(doc(db, "users", uid, "config", "carteira"), {
        grupos: l.map((g) => ({ ...g, meta: Number(g.meta) || 0, itens: (g.itens || []).map(({ valor, ...i }) => ({ ...i, inicial: Number(i.inicial ?? valor) || 0 })) })),
      }, { merge: true });
      setStatus("Salvo");
    } catch { pendente.current = l; setStatus("Não consegui salvar. Verifique a conexão."); }
  }
  const atualizar = (l) => { setLista(l); pendente.current = l; setStatus("Salvando…"); clearTimeout(timer.current); timer.current = setTimeout(gravar, 400); };
  useEffect(() => {
    window.addEventListener("pagehide", gravar);
    return () => { window.removeEventListener("pagehide", gravar); gravar(); };
  }, []);

  const fechar = () => { gravar(); setModal(null); };
  useEffect(() => {
    if (!modal) return undefined;
    const tecla = (e) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [modal]);

  if (!lista) return <p className="p-6 text-suave">Carregando…</p>;

  // saldo = valor inicial + aportes − resgates + rendimentos (muda sozinho a cada lançamento)
  const donoRend = Object.fromEntries(cats.filter((c) => c.pai === "Rendimentos").map((c) => [c.nome, c.aporte]));
  const rendDe = (it) => movs.filter((l) => l.rendimento && mesmoItem(l, it, donoRend)).reduce((s, l) => s + l.valor, 0);
  const saldoDe = (it) => saldoItem(it, movs, donoRend);
  const tot = lista.map((g) => ({
    n: (g.itens || []).length,
    saldo: (g.itens || []).reduce((s, it) => s + saldoDe(it), 0),
    rend: (g.itens || []).reduce((s, it) => s + rendDe(it), 0),
  }));
  const total = tot.reduce((s, t) => s + t.saldo, 0);
  const totalRend = tot.reduce((s, t) => s + t.rend, 0);
  const fatias = lista.map((g, k) => ({ name: `${g.letra} · ${g.nome}`, value: tot[k].saldo, cor: g.cor })).filter((f) => f.value > 0);

  const mudarI = (gid, iid, patch) => atualizar(lista.map((g) => (g.id === gid ? { ...g, itens: g.itens.map((i) => (i.id === iid ? { ...i, ...patch } : i)) } : g)));
  const mover = (de, iid, para) => {
    if (!para) return;
    const it = lista.find((g) => g.id === de).itens.find((i) => i.id === iid);
    atualizar(lista.map((g) => (g.id === de ? { ...g, itens: g.itens.filter((i) => i.id !== iid) } : g.id === para ? { ...g, itens: [...(g.itens || []), it] } : g)));
  };
  const remover = (g, it) => {
    if (!window.confirm(`Remover "${it.nome}" da Wallet? Os lançamentos dele ficam sem cofrinho até você ligá-los a outro.`)) return;
    atualizar(lista.map((x) => (x.id === g.id ? { ...x, itens: x.itens.filter((i) => i.id !== it.id) } : x)));
  };
  const campoRasc = (gid, k, v) => setRasc({ ...rasc, [gid]: { nome: "", valor: "", ...rasc[gid], [k]: v } });
  const addItem = (g) => {
    const r = rasc[g.id] || { nome: "", valor: "" };
    if (!r.nome.trim()) return;
    atualizar(lista.map((x) => (x.id === g.id ? { ...x, itens: [...(x.itens || []), { id: novoId(), nome: r.nome.trim(), inicial: Number(r.valor) || 0 }] } : x)));
    setRasc({ ...rasc, [g.id]: { nome: "", valor: "" } });
    setModal({ gid: g.id, tela: "lista" }); // volta para a lista, já com o novo investimento
  };
  const gm = modal ? lista.find((g) => g.id === modal.gid) : null; // grupo aberto no modal
  const km = gm ? lista.indexOf(gm) : -1;
  const r = gm ? rasc[gm.id] || { nome: "", valor: "" } : { nome: "", valor: "" };

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Wallet</h1>
          <p className="text-sm text-suave">Sua carteira no método ARCA. O saldo muda sozinho quando você aporta, resgata ou registra rendimento no chat ou no Resumo.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span role="status" className="text-sm text-suave">{status}</span>
          <Olho oculto={oculto} onClick={alternar} className="h-10 w-10" />
        </div>
      </div>

      <section className="painel3d rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-suave">Total da carteira</p>
            <p className="text-3xl font-extrabold tabular-nums" style={{ color: COR_REND }}>{brl(total)}</p>
            <p className="mt-1 text-sm tabular-nums text-suave">Rendimento acumulado: <b style={{ color: COR_REND }}>{sinal(totalRend)}</b></p>
          </div>
          {fatias.length > 0
            ? <div className="w-44"><Pizza fatias={fatias} /></div>
            : <p className="max-w-56 text-sm text-suave">A rosca aparece quando houver saldo nos seus investimentos.</p>}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {lista.map((g, k) => (
          <button key={g.id} type="button" onClick={() => setModal({ gid: g.id, tela: "lista" })} aria-label={`Abrir ${g.nome}`}
            className="rounded-2xl bg-[#1A1A1A] p-4 text-left transition hover:bg-[#222]" style={{ boxShadow: `0 0 14px ${g.cor}22` }}>
            <div className="flex items-center gap-3">
              <Selo g={g} />
              <b className="min-w-0 flex-1 truncate">{g.nome}</b>
              <span className="font-extrabold tabular-nums" style={{ color: g.cor }}>{pct(tot[k].saldo, total)}%</span>
            </div>
            <p className="mt-3 text-2xl font-extrabold tabular-nums">{brl(tot[k].saldo)}</p>
            <div className="mt-2 h-1.5 rounded-full bg-[#0F0F0F]"><div className="h-full rounded-full" style={{ width: `${pct(tot[k].saldo, total)}%`, background: g.cor }} /></div>
            <p className="mt-2 text-xs tabular-nums text-suave">{tot[k].n} investimento{tot[k].n !== 1 && "s"}{tot[k].rend !== 0 && <> · rendeu <b style={{ color: COR_REND }}>{sinal(tot[k].rend)}</b></>}</p>
          </button>
        ))}
      </div>

      {gm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
          <div role="dialog" aria-modal="true" aria-label={gm.nome} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-[#1A1A1A] p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <Selo g={gm} />
              <div className="min-w-0 flex-1">
                <b className="block truncate">{gm.nome}</b>
                <span className="text-xs tabular-nums text-suave">{tot[km].n} investimento{tot[km].n !== 1 && "s"} · {brl(tot[km].saldo)} · {pct(tot[km].saldo, total)}% da carteira</span>
              </div>
              <button type="button" onClick={fechar} aria-label="Fechar" className="px-2 text-2xl text-suave">×</button>
            </div>
            {modal.tela === "novo" ? (
              <form onSubmit={(e) => { e.preventDefault(); addItem(gm); }} className="space-y-3">
                <p className="font-bold">Novo investimento</p>
                <input autoFocus className={campo} placeholder="Nome (ex.: Cofrinho MP)" value={r.nome} onChange={(e) => campoRasc(gm.id, "nome", e.target.value)} aria-label="Nome do investimento" />
                <input className={campo} type="number" inputMode="decimal" min="0" step="0.01" placeholder="Saldo atual (opcional)" value={r.valor} onChange={(e) => campoRasc(gm.id, "valor", e.target.value)} aria-label="Saldo atual" />
                <div className="flex items-center gap-3">
                  <button className="rounded-xl bg-neon px-5 py-2.5 font-bold text-white">Adicionar</button>
                  <button type="button" onClick={() => setModal({ gid: gm.id, tela: "lista" })} className="text-sm text-suave underline">Voltar</button>
                </div>
              </form>
            ) : (
              <>
                {!tot[km].n && <p className="text-sm text-suave">Nenhum investimento ainda.</p>}
                <ul className="space-y-3">
                  {(gm.itens || []).map((it) => {
                    const saldo = saldoDe(it), rend = rendDe(it), inicial = Number(it.inicial ?? it.valor) || 0, mov = saldo - inicial;
                    return (
                      <li key={it.id} className="space-y-1">
                        <div className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                          <input className={campo} value={it.nome} onChange={(e) => mudarI(gm.id, it.id, { nome: e.target.value })} aria-label="Nome do investimento" />
                          <CampoValor className={campo} valor={saldo} onCommit={(n) => mudarI(gm.id, it.id, { inicial: Number((n - mov).toFixed(2)) })} aria-label={`Saldo de ${it.nome}`} />
                          <button type="button" onClick={() => remover(gm, it)} aria-label={`Remover ${it.nome}`} className="px-2 text-xl text-suave">×</button>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs tabular-nums text-suave">
                          {rend !== 0 && <span>rendeu <b style={{ color: COR_REND }}>{sinal(rend)}</b></span>}
                          <select value="" onChange={(e) => mover(gm.id, it.id, e.target.value)} className="rounded-lg border border-borda bg-[#141414] px-2 py-1 text-xs text-suave" aria-label={`Mover ${it.nome} para outro grupo`}>
                            <option value="">Mover para…</option>
                            {lista.filter((x) => x.id !== gm.id).map((x) => <option key={x.id} value={x.id}>{x.letra} · {x.nome}</option>)}
                          </select>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" onClick={() => setModal({ gid: gm.id, tela: "novo" })} className="btn-vidro w-full">+ Novo investimento</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
