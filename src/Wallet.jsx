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
  const [aberto, setAberto] = useState(null); // um grupo aberto por vez
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
  };

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
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm text-suave">Total da carteira</p>
            <p className="text-3xl font-extrabold tabular-nums" style={{ color: COR_REND }}>{brl(total)}</p>
          </div>
          <p className="text-sm tabular-nums text-suave">Rendimento acumulado: <b style={{ color: COR_REND }}>{sinal(totalRend)}</b></p>
        </div>
        <div className={`mt-3 grid items-center gap-4 ${fatias.length ? "md:grid-cols-2" : ""}`}>
          {fatias.length > 0 && <Pizza fatias={fatias} />}
          <ul className="space-y-3">
            {lista.map((g, k) => (
              <li key={g.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <Selo g={g} tam="h-6 w-6" />
                  <span className="min-w-0 flex-1 truncate font-bold">{g.nome}</span>
                  <span className="font-extrabold tabular-nums" style={{ color: g.cor }}>{pct(tot[k].saldo, total)}%</span>
                  <span className="w-28 text-right tabular-nums text-suave">{brl(tot[k].saldo)}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-[#0F0F0F]"><div className="h-full rounded-full" style={{ width: `${pct(tot[k].saldo, total)}%`, background: g.cor }} /></div>
              </li>
            ))}
          </ul>
        </div>
        {!fatias.length && <p className="mt-3 text-sm text-suave">A rosca aparece quando houver saldo nos seus investimentos.</p>}
      </section>

      {lista.map((g, k) => {
        const t = tot[k], ab = aberto === g.id, r = rasc[g.id] || { nome: "", valor: "" };
        return (
          <section key={g.id} className="rounded-2xl bg-[#1A1A1A]">
            <button type="button" onClick={() => setAberto(ab ? null : g.id)} aria-expanded={ab} className="flex w-full items-center gap-3 p-4 text-left">
              <Selo g={g} />
              <span className="min-w-0 flex-1">
                <b className="block truncate">{g.nome}</b>
                <span className="text-xs tabular-nums text-suave">{t.n} investimento{t.n !== 1 && "s"}{t.rend !== 0 && <> · rendeu <b style={{ color: COR_REND }}>{sinal(t.rend)}</b></>}</span>
              </span>
              <span className="font-bold tabular-nums">{brl(t.saldo)}</span>
              <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 text-suave transition-transform ${ab ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {ab && (
              <div className="space-y-3 px-4 pb-4">
                {!t.n && <p className="text-sm text-suave">Nenhum investimento ainda. Adicione abaixo.</p>}
                <ul className="space-y-2">
                  {(g.itens || []).map((it) => {
                    const saldo = saldoDe(it), rend = rendDe(it), inicial = Number(it.inicial ?? it.valor) || 0, mov = saldo - inicial;
                    return (
                      <li key={it.id} className="space-y-1">
                        <div className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                          <input className={campo} value={it.nome} onChange={(e) => mudarI(g.id, it.id, { nome: e.target.value })} aria-label="Nome do investimento" />
                          <CampoValor className={campo} valor={saldo} onCommit={(n) => mudarI(g.id, it.id, { inicial: Number((n - mov).toFixed(2)) })} aria-label={`Saldo de ${it.nome}`} />
                          <button type="button" onClick={() => remover(g, it)} aria-label={`Remover ${it.nome}`} className="px-2 text-xl text-suave">×</button>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs tabular-nums text-suave">
                          {rend !== 0 && <span>rendeu <b style={{ color: COR_REND }}>{sinal(rend)}</b></span>}
                          <select value="" onChange={(e) => mover(g.id, it.id, e.target.value)} className="rounded-lg border border-borda bg-[#141414] px-2 py-1 text-xs text-suave" aria-label={`Mover ${it.nome} para outro grupo`}>
                            <option value="">Mover para…</option>
                            {lista.filter((x) => x.id !== g.id).map((x) => <option key={x.id} value={x.id}>{x.letra} · {x.nome}</option>)}
                          </select>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <form onSubmit={(e) => { e.preventDefault(); addItem(g); }} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                  <input className={campo} placeholder="Novo investimento" value={r.nome} onChange={(e) => campoRasc(g.id, "nome", e.target.value)} />
                  <input className={campo} type="number" inputMode="decimal" min="0" step="0.01" placeholder="Saldo" value={r.valor} onChange={(e) => campoRasc(g.id, "valor", e.target.value)} />
                  <button className="rounded-xl bg-neon px-4 py-2.5 font-bold text-white">Adicionar</button>
                </form>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
