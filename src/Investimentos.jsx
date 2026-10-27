import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { auth, db } from "./firebase";
import { brlOc, estaEscondido, mesmoItem, paleta, saldoItem } from "./util.js";
import Olho, { useOlho } from "./Olho.jsx";

const campo = "w-full rounded-xl border border-borda bg-[#141414] px-3 py-2.5 text-tinta";
const cartao = "rounded-2xl bg-[#1A1A1A]";
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const brl = (v) => brlOc(v, "carteira"); // valores da carteira seguem o olho da Carteira
const sinal = (v) => `${v > 0 ? "+" : ""}${brl(v)}`;
const COR_REND = "#8B5CF6";

function Pizza({ fatias, alt = "h-56" }) {
  return (
    <div className={alt}>
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
  return (
    <input {...resto} type={estaEscondido("carteira") && txt === null ? "text" : "number"} inputMode="decimal" step="0.01"
      value={estaEscondido("carteira") && txt === null ? "R$ •••••" : txt ?? String(Number(valor.toFixed(2)))}
      onFocus={() => { if (txt === null) setTxt(String(Number(valor.toFixed(2)))); }}
      onChange={(e) => { setTxt(e.target.value); const n = Number(e.target.value); if (e.target.value !== "" && !Number.isNaN(n)) onCommit(n); }}
      onBlur={() => setTxt(null)} />
  );
}

export default function Investimentos() {
  const uid = auth.currentUser.uid;
  const [oculto, alternar] = useOlho("carteira");
  const [lista, setLista] = useState(null); // tipos (Renda fixa, Ações...), cada um com seus investimentos
  const [movs, setMovs] = useState([]);     // aportes, resgates e rendimentos lançados (todos os meses)
  const [cats, setCats] = useState([]);
  const [abertas, setAbertas] = useState({});
  const [novo, setNovo] = useState(null);
  const [rasc, setRasc] = useState({});
  const [erro, setErro] = useState("");
  const [status, setStatus] = useState("");
  const pendente = useRef(null), timer = useRef(null);

  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "carteira"), (s) => setLista((d) => d ?? (s.data()?.grupos || []))), [uid]);
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
      setStatus("Salvo automaticamente");
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
  const doItem = (it) => movs.filter((l) => mesmoItem(l, it, donoRend));
  const saldoDe = (it) => saldoItem(it, movs, donoRend);
  const rendDe = (it) => doItem(it).filter((l) => l.rendimento).reduce((s, l) => s + l.valor, 0);
  const aportDe = (it) => doItem(it).filter((l) => !l.rendimento).reduce((s, l) => s + l.valor, 0);
  const totG = (g) => ({ saldo: (g.itens || []).reduce((s, it) => s + saldoDe(it), 0), rend: (g.itens || []).reduce((s, it) => s + rendDe(it), 0) });
  const todos = lista.flatMap((g) => g.itens || []);
  const total = lista.reduce((s, g) => s + totG(g).saldo, 0);
  const totalRend = todos.reduce((s, it) => s + rendDe(it), 0);
  const fatias = lista.map((g) => ({ name: g.nome || "Sem nome", value: totG(g).saldo, rend: totG(g).rend, cor: g.cor })).filter((f) => f.value > 0);
  const pct = (v, t) => (t > 0 ? Math.round((v / t) * 100) : 0);

  const mudarG = (id, patch) => atualizar(lista.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const mudarI = (gid, iid, patch) => atualizar(lista.map((g) => (g.id === gid ? { ...g, itens: g.itens.map((i) => (i.id === iid ? { ...i, ...patch } : i)) } : g)));
  const mover = (de, iid, para) => {
    if (!para) return;
    const it = lista.find((g) => g.id === de).itens.find((i) => i.id === iid);
    atualizar(lista.map((g) => (g.id === de ? { ...g, itens: g.itens.filter((i) => i.id !== iid) } : g.id === para ? { ...g, itens: [...(g.itens || []), it] } : g)));
  };
  const campoRasc = (gid, k, v) => setRasc({ ...rasc, [gid]: { nome: "", valor: "", ...rasc[gid], [k]: v } });

  const criar = (e) => {
    e.preventDefault();
    if (!novo.nome.trim()) { setErro("Dê um nome ao tipo de investimento, como Renda fixa ou Ações."); return; }
    setErro("");
    atualizar([...lista, { id: novoId(), nome: novo.nome.trim(), cor: novo.cor, meta: Number(novo.meta) || 0, itens: [] }]);
    setNovo(null);
  };
  const addItem = (g) => {
    const r = rasc[g.id] || { nome: "", valor: "" };
    if (!r.nome.trim()) return;
    mudarG(g.id, { itens: [...(g.itens || []), { id: novoId(), nome: r.nome.trim(), inicial: Number(r.valor) || 0 }] });
    setRasc({ ...rasc, [g.id]: { nome: "", valor: "" } });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Investimentos</h1>
          <p className="text-sm text-suave">Sua carteira: tipos (Renda fixa, Ações...) e os investimentos de cada um, como seus cofrinhos. O saldo muda sozinho quando você aporta, resgata ou registra rendimento no chat ou no Resumo.</p>
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
        {fatias.length > 0 ? (
          <div className="mt-3 grid items-center gap-4 md:grid-cols-2">
            <Pizza fatias={fatias} />
            <ul className="space-y-2">
              {fatias.map((f) => (
                <li key={f.name} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: f.cor, boxShadow: `0 0 8px ${f.cor}` }} />
                    <span className="min-w-0 flex-1 truncate font-bold">{f.name}</span>
                    <span className="font-extrabold tabular-nums" style={{ color: f.cor }}>{pct(f.value, total)}%</span>
                    <span className="w-28 text-right tabular-nums text-suave">{brl(f.value)}</span>
                  </div>
                  {f.rend !== 0 && <p className="pl-5 text-xs tabular-nums text-suave">rendeu {sinal(f.rend)}</p>}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-sm text-suave">O gráfico aparece quando houver saldo nos seus investimentos.</p>
        )}
      </section>

      {lista.map((g) => {
        const t = totG(g), aberta = !!abertas[g.id], meta = Number(g.meta) || 0, p = meta > 0 ? (t.saldo / meta) * 100 : 0;
        const r = rasc[g.id] || { nome: "", valor: "" };
        const fat = (g.itens || []).map((it, k) => ({ name: it.nome || "Sem nome", value: saldoDe(it), cor: paleta[k % paleta.length] })).filter((f) => f.value > 0);
        return (
          <section key={g.id} className={cartao}>
            <button type="button" onClick={() => setAbertas({ ...abertas, [g.id]: !aberta })} aria-expanded={aberta} className="flex w-full items-center gap-3 p-4 text-left">
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: g.cor, boxShadow: `0 0 10px ${g.cor}` }} />
              <span className="min-w-0 flex-1 truncate font-bold">{g.nome || "Sem nome"}</span>
              <span className="text-sm tabular-nums text-suave">{pct(t.saldo, total)}%</span>
              <span className="font-bold tabular-nums">{brl(t.saldo)}</span>
              <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 text-suave transition-transform ${aberta ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <p className="-mt-2 px-4 pb-3 text-xs tabular-nums text-suave">
              {(g.itens || []).length} investimento{(g.itens || []).length !== 1 && "s"}{t.rend !== 0 && <> · rendeu <b style={{ color: COR_REND }}>{sinal(t.rend)}</b></>}
            </p>
            {meta > 0 && (
              <div className="px-4 pb-4">
                <div className="h-2 rounded-full bg-[#0F0F0F]"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(p, 100))}%`, background: g.cor, boxShadow: `0 0 10px ${g.cor}` }} /></div>
                <p className="mt-1.5 text-xs tabular-nums text-suave">{brl(t.saldo)} de {brl(meta)} · {t.saldo >= meta ? "meta batida" : `faltam ${brl(meta - t.saldo)}`}</p>
              </div>
            )}
            {aberta && (
              <div className="space-y-4 px-4 pb-4">
                {fat.length > 0 && (
                  <div className="grid items-center gap-3 md:grid-cols-2">
                    <Pizza fatias={fat} alt="h-48" />
                    <ul className="space-y-1.5">
                      {fat.map((f) => (
                        <li key={f.name} className="flex items-center gap-2 text-sm">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: f.cor }} />
                          <span className="min-w-0 flex-1 truncate font-bold">{f.name}</span>
                          <span className="tabular-nums text-suave">{pct(f.value, t.saldo)}%</span>
                          <span className="w-24 text-right tabular-nums">{brl(f.value)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                  <input type="color" value={g.cor} onChange={(e) => mudarG(g.id, { cor: e.target.value })} className="h-10 w-10 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Cor" />
                  <input className={campo} placeholder="Nome (ex.: Renda fixa)" value={g.nome} onChange={(e) => mudarG(g.id, { nome: e.target.value })} />
                </div>
                <label className="block text-sm text-suave">Meta de valor para este tipo (opcional, R$)
                  <input className={`${campo} mt-1`} type="number" inputMode="decimal" min="0" step="0.01" value={g.meta || ""} onChange={(e) => mudarG(g.id, { meta: e.target.value })} />
                </label>
                <div>
                  <p className="mb-2 text-sm font-bold">Investimentos em {g.nome || "este tipo"}</p>
                  <ul className="space-y-3">
                    {(g.itens || []).map((it) => {
                      const saldo = saldoDe(it), rend = rendDe(it), inicial = Number(it.inicial ?? it.valor) || 0, mov = saldo - inicial;
                      return (
                        <li key={it.id} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                          <input className={campo} value={it.nome} onChange={(e) => mudarI(g.id, it.id, { nome: e.target.value })} aria-label="Nome do investimento" />
                          <CampoValor className={campo} valor={saldo} onCommit={(n) => mudarI(g.id, it.id, { inicial: Number((n - mov).toFixed(2)) })} aria-label="Saldo" />
                          <button onClick={() => mudarG(g.id, { itens: g.itens.filter((x) => x.id !== it.id) })} aria-label={`Remover ${it.nome}`} className="px-2 text-xl text-suave">×</button>
                          <div className="col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-suave">
                            <span>{pct(saldo, t.saldo)}% do tipo</span>
                            <span>aportado {brl(aportDe(it) + inicial)}</span>
                            <span>rendeu <b style={{ color: COR_REND }}>{sinal(rend)}</b></span>
                            {lista.length > 1 && (
                              <select value="" onChange={(e) => mover(g.id, it.id, e.target.value)} className="rounded-lg border border-borda bg-[#141414] px-2 py-1 text-xs text-suave" aria-label="Mover para outro tipo">
                                <option value="">Mover para…</option>
                                {lista.filter((x) => x.id !== g.id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                              </select>
                            )}
                          </div>
                        </li>
                      );
                    })}
                    {!(g.itens || []).length && <li className="text-sm text-suave">Nenhum investimento ainda.</li>}
                  </ul>
                  <form onSubmit={(e) => { e.preventDefault(); addItem(g); }} className="mt-3 grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                    <input className={campo} placeholder="Nome (ex.: Cofrinho MP)" value={r.nome} onChange={(e) => campoRasc(g.id, "nome", e.target.value)} />
                    <input className={campo} type="number" inputMode="decimal" min="0" step="0.01" placeholder="Saldo atual" value={r.valor} onChange={(e) => campoRasc(g.id, "valor", e.target.value)} />
                    <button className="rounded-xl bg-neon px-4 py-2.5 font-bold text-white">Adicionar</button>
                  </form>
                </div>
                <button onClick={() => atualizar(lista.filter((x) => x.id !== g.id))} className="text-sm text-suave underline">Apagar este tipo de investimento</button>
              </div>
            )}
          </section>
        );
      })}

      {novo ? (
        <form onSubmit={criar} className={`${cartao} space-y-3 p-4`}>
          <p className="font-bold">Novo tipo de investimento</p>
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <input type="color" value={novo.cor} onChange={(e) => setNovo({ ...novo, cor: e.target.value })} className="h-10 w-10 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Cor" />
            <input autoFocus className={campo} placeholder="Nome (ex.: Renda fixa, Ações, Exterior)" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          </div>
          <label className="block text-sm text-suave">Meta de valor (opcional, R$)
            <input className={`${campo} mt-1`} type="number" inputMode="decimal" min="0" step="0.01" value={novo.meta} onChange={(e) => setNovo({ ...novo, meta: e.target.value })} />
          </label>
          {erro && <p role="alert" className="text-sm font-medium text-saida">{erro}</p>}
          <div className="flex gap-3">
            <button className="rounded-xl bg-neon px-5 py-2.5 font-bold text-white">Criar</button>
            <button type="button" onClick={() => { setNovo(null); setErro(""); }} className="text-sm text-suave underline">Cancelar</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setNovo({ nome: "", cor: paleta[lista.length % paleta.length], meta: "" })} className="btn-vidro">+ Novo tipo de investimento</button>
      )}
    </div>
  );
}
