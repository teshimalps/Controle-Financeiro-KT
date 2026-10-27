import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { auth, db } from "./firebase";
import { brlOc, estaEscondido, mesmoItem, saldoItem } from "./util.js";
import { arcaGrupos } from "./carteira.js";
import Olho, { useOlho } from "./Olho.jsx";
import Mercado, { Seta } from "./Mercado.jsx";
import useMercado from "./useMercado.js";
import { achaTicker, corVar, fmtVar } from "./mercado.js";

const campo = "w-full rounded-xl border border-borda bg-[#141414] px-3 py-2.5 text-tinta";
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const brl = (v) => brlOc(v, "carteira"); // valores da Wallet seguem o olho da Carteira
const sinal = (v) => `${v > 0 ? "+" : ""}${brl(v)}`;
const COR_REND = "#8B5CF6";
// Perfil do investidor: % ideal de cada grupo ARCA (acoes, real-estate, caixa, internacional), sempre somando 100
const PERFIS = {
  conservador: { nome: "Conservador", info: "Mais Caixa, risco baixo", alvo: { acoes: 10, "real-estate": 15, caixa: 65, internacional: 10 } },
  moderado: { nome: "Moderado", info: "Diversificado entre os 4 grupos", alvo: { acoes: 30, "real-estate": 25, caixa: 30, internacional: 15 } },
  arrojado: { nome: "Arrojado", info: "Mais risco em Ações, FIIs e Internacional", alvo: { acoes: 40, "real-estate": 25, caixa: 10, internacional: 25 } },
};
const pct = (v, t) => (t > 0 && v > 0 ? Math.round((v / t) * 100) : 0);

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

// Wallet no método ARCA: Ações e Negócios, Real Estate (FII), Caixa (Renda Fixa) e Ativos Internacionais
export default function Wallet() {
  const uid = auth.currentUser.uid;
  const [oculto, alternar] = useOlho("carteira");
  const [lista, setLista] = useState(null); // os 4 grupos ARCA, cada um com seus investimentos
  const [movs, setMovs] = useState([]);     // aportes, resgates e rendimentos lançados (todos os meses)
  const [cats, setCats] = useState([]);
  const [perfil, setPerfil] = useState("moderado");
  const [modal, setModal] = useState(null); // { gid, tela: "lista" | "novo" } ou null
  const [rasc, setRasc] = useState({});
  const [status, setStatus] = useState("");
  const mercado = useMercado(uid, modal?.gid === "acoes");
  const pendente = useRef(null), timer = useRef(null);

  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "carteira"), (s) => {
    setLista((d) => d ?? arcaGrupos(s.data()?.grupos));
    if (PERFIS[s.data()?.perfil]) setPerfil(s.data().perfil);
  }), [uid]);
  const escolherPerfil = (k) => {
    setPerfil(k);
    setDoc(doc(db, "users", uid, "config", "carteira"), { perfil: k }, { merge: true }).catch(() => setStatus("Não consegui salvar o perfil. Verifique a conexão."));
  };
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
  const addTicker = (g, ticker) => atualizar(lista.map((x) => (x.id === g.id ? { ...x, itens: [...(x.itens || []), { id: novoId(), nome: ticker, inicial: 0 }] } : x)));
  const alvo = (g) => PERFIS[perfil].alvo[g.id] ?? 0;
  const dif = (g, k) => { const d = pct(tot[k].saldo, total) - alvo(g); return d === 0 ? "na meta" : d > 0 ? `${d} p.p. acima` : `${-d} p.p. abaixo`; };
  const cotacao = (it) => mercado.mapa.get(achaTicker(it.nome)); // cotação real, se o nome tiver o código da ação
  const posicao = gm?.id === "acoes" ? (gm.itens || []).reduce((acc, it) => {
    const c = cotacao(it), sd = saldoDe(it);
    return c ? { n: acc.n + 1, dia: acc.dia + (sd * c.variacao) / (100 + c.variacao) } : acc;
  }, { n: 0, dia: 0 }) : null;
  const km = gm ? lista.indexOf(gm) : -1;
  const r = gm ? rasc[gm.id] || { nome: "", valor: "" } : { nome: "", valor: "" };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-6xl flex-col gap-5 p-4 md:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-suave">Método ARCA</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Wallet</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span role="status" className="text-sm text-suave">{status}</span>
          <Olho oculto={oculto} onClick={alternar} className="h-10 w-10" />
        </div>
      </div>

      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-suave">Patrimônio investido</p>
            <p className="mt-2 text-5xl font-semibold tracking-tight tabular-nums md:text-6xl">{brl(total)}</p>
            <p className="mt-2 text-sm tabular-nums text-suave">Rendimento acumulado <b className="ml-1 font-semibold" style={{ color: COR_REND }}>{sinal(totalRend)}</b></p>
          </div>
          <div className="w-full sm:w-auto" role="radiogroup" aria-label="Perfil do investidor">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-suave">Perfil · <span className="normal-case tracking-normal">{PERFIS[perfil].info}</span></p>
            <div className="inline-flex w-full rounded-full border border-white/10 bg-black/30 p-1 sm:w-auto">
              {Object.entries(PERFIS).map(([k, v]) => (
                <button key={k} type="button" role="radio" aria-checked={perfil === k} onClick={() => escolherPerfil(k)}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition sm:flex-none ${perfil === k ? "bg-white text-black" : "text-suave hover:text-tinta"}`}>{v.nome}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 flex h-2 overflow-hidden rounded-full bg-black/40" role="img" aria-label="Distribuição da carteira entre os quatro grupos">
          {total > 0 && lista.map((g, k) => tot[k].saldo > 0 && <div key={g.id} style={{ width: `${(tot[k].saldo / total) * 100}%`, background: g.cor }} />)}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-suave">
          {lista.map((g, k) => (
            <li key={g.id} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: g.cor }} />{g.nome}<b className="tabular-nums text-tinta">{pct(tot[k].saldo, total)}%</b></li>
          ))}
        </ul>
      </section>

      <div className="grid flex-1 auto-rows-fr gap-4 md:grid-cols-2">
        {lista.map((g, k) => (
          <button key={g.id} type="button" onClick={() => setModal({ gid: g.id, tela: "lista" })} aria-label={`Abrir ${g.nome}`}
            className="group relative flex min-h-48 flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-left transition duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.06] md:p-8">
            <span className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${g.cor}, transparent)` }} aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-suave"><span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: g.cor }} />{g.nome}</p>
              <span className="text-suave transition group-hover:translate-x-0.5 group-hover:text-tinta" aria-hidden="true">→</span>
            </div>
            <div>
              <p className="text-4xl font-semibold tracking-tight tabular-nums md:text-5xl">{brl(tot[k].saldo)}</p>
              <p className="mt-2 text-sm tabular-nums text-suave"><b className="text-tinta">{pct(tot[k].saldo, total)}%</b> da carteira · meta {alvo(g)}%{total > 0 && <> · {dif(g, k)}</>}</p>
              <div className="relative mt-4 h-1 rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${pct(tot[k].saldo, total)}%`, background: g.cor }} />
                <span className="absolute -top-1.5 h-4 w-px bg-white/70" style={{ left: `${alvo(g)}%` }} aria-hidden="true" />
              </div>
              <p className="mt-4 text-xs tabular-nums text-suave">{tot[k].n} investimento{tot[k].n !== 1 && "s"}{tot[k].rend !== 0 && <> · rendeu <b style={{ color: COR_REND }}>{sinal(tot[k].rend)}</b></>}</p>
            </div>
          </button>
        ))}
      </div>

      {gm && (
        <div className="anim-fundo fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
          <div role="dialog" aria-modal="true" aria-label={gm.nome} className="anim-modal relative max-h-[92vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-t-3xl border border-white/10 bg-[#171717] p-6 shadow-2xl sm:rounded-3xl md:p-8">
            <span className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${gm.cor}, transparent)` }} aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-suave"><span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: gm.cor }} />{gm.nome}</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{brl(tot[km].saldo)}</p>
                <p className="mt-1 text-sm tabular-nums text-suave">{pct(tot[km].saldo, total)}% da carteira · meta {alvo(gm)}% · {tot[km].n} investimento{tot[km].n !== 1 && "s"}</p>
              </div>
              <button type="button" onClick={fechar} aria-label="Fechar" className="-mr-2 -mt-2 px-3 py-1 text-3xl leading-none text-suave hover:text-tinta">×</button>
            </div>

            {modal.tela === "mercado" ? (
              <div className="space-y-3">
                <button type="button" onClick={() => setModal({ gid: gm.id, tela: "lista" })} className="text-sm text-suave underline">← Minha posição</button>
                <p className="text-lg font-semibold">Ações da bolsa</p>
                <Mercado mercado={mercado} jaTem={(gm.itens || []).map((i) => achaTicker(i.nome)).filter(Boolean)} onAdd={(tk) => addTicker(gm, tk)} />
              </div>
            ) : modal.tela === "novo" ? (
              <form onSubmit={(e) => { e.preventDefault(); addItem(gm); }} className="space-y-3">
                <p className="text-lg font-semibold">Novo investimento</p>
                <input autoFocus className={campo} placeholder={gm.id === "acoes" ? "Nome ou código (ex.: WEGE3)" : "Nome (ex.: Cofrinho MP)"} value={r.nome} onChange={(e) => campoRasc(gm.id, "nome", e.target.value)} aria-label="Nome do investimento" />
                <input className={campo} type="number" inputMode="decimal" min="0" step="0.01" placeholder="Saldo atual (opcional)" value={r.valor} onChange={(e) => campoRasc(gm.id, "valor", e.target.value)} aria-label="Saldo atual" />
                <div className="flex items-center gap-4">
                  <button className="rounded-xl bg-white px-6 py-2.5 font-semibold text-black">Adicionar</button>
                  <button type="button" onClick={() => setModal({ gid: gm.id, tela: "lista" })} className="text-sm text-suave underline">Voltar</button>
                </div>
              </form>
            ) : (
              <>
                {posicao && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-suave">Minha posição hoje</p>
                    {posicao.n > 0 ? (
                      <p className="mt-1 text-xl font-semibold tabular-nums" style={{ color: corVar(posicao.dia) }}>
                        <Seta v={posicao.dia} /> {sinal(posicao.dia)} <span className="text-sm">({fmtVar(tot[km].saldo > 0 ? (posicao.dia / tot[km].saldo) * 100 : 0)})</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-suave">{mercado.token ? (mercado.carregando ? "Carregando cotações…" : mercado.erro || "Cadastre suas ações pelo código (ex.: WEGE3) para ver a variação do dia.") : "Ligue as cotações em “Ver mais ações” para ver quanto suas ações sobem ou descem."}</p>
                    )}
                  </div>
                )}
                {!tot[km].n && <p className="text-sm text-suave">Nenhum investimento ainda.</p>}
                <ul className="space-y-4">
                  {(gm.itens || []).map((it) => {
                    const saldo = saldoDe(it), rend = rendDe(it), inicial = Number(it.inicial ?? it.valor) || 0, mov = saldo - inicial, c = cotacao(it);
                    return (
                      <li key={it.id} className="space-y-1.5">
                        <div className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
                          <input className={campo} value={it.nome} onChange={(e) => mudarI(gm.id, it.id, { nome: e.target.value })} aria-label="Nome do investimento" />
                          <CampoValor className={campo} valor={saldo} onCommit={(n) => mudarI(gm.id, it.id, { inicial: Number((n - mov).toFixed(2)) })} aria-label={`Saldo de ${it.nome}`} />
                          <button type="button" onClick={() => remover(gm, it)} aria-label={`Remover ${it.nome}`} className="px-2 text-xl text-suave hover:text-tinta">×</button>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-suave">
                          {c && <span className="font-semibold" style={{ color: corVar(c.variacao) }}><Seta v={c.variacao} /> {fmtVar(c.variacao)} hoje</span>}
                          {rend !== 0 && <span>rendeu <b style={{ color: COR_REND }}>{sinal(rend)}</b></span>}
                          <select value="" onChange={(e) => mover(gm.id, it.id, e.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-suave" aria-label={`Mover ${it.nome} para outro grupo`}>
                            <option value="">Mover para…</option>
                            {lista.filter((x) => x.id !== gm.id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                          </select>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => setModal({ gid: gm.id, tela: "novo" })} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold hover:bg-white/5">+ Novo investimento</button>
                  {gm.id === "acoes" && <button type="button" onClick={() => setModal({ gid: gm.id, tela: "mercado" })} className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black">Ver mais ações</button>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
