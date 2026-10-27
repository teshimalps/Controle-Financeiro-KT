import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { paleta } from "./util.js";

const campo = "rounded-xl border border-borda bg-[#141414] px-3 py-2.5 text-tinta";
const cartao = "rounded-2xl bg-[#1A1A1A]";

function Chips({ opcoes, vinc, cor, alternar }) {
  return (
    <div>
      <p className="mb-1 text-sm text-suave">Conta nesta meta:</p>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <button key={o.k} type="button" onClick={() => alternar(o.k)} aria-pressed={vinc.includes(o.k)} className="rounded-full px-3 py-1.5 text-sm font-bold"
            style={vinc.includes(o.k) ? { background: cor, color: "#fff", boxShadow: `0 0 12px ${cor}` } : { border: "1px solid #333", color: "#9A9A9A" }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MetasMensais() {
  const uid = auth.currentUser.uid;
  const [draft, setDraft] = useState(null);
  const [cats, setCats] = useState([]);
  const [abertas, setAbertas] = useState({});
  const [novo, setNovo] = useState(null);
  const [status, setStatus] = useState("");
  const pendente = useRef(null), timer = useRef(null);

  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "metas"), (s) => setDraft((d) => d ?? (s.data()?.mensais || []))), [uid]);
  useEffect(() => onSnapshot(collection(db, "users", uid, "categorias"), (s) => setCats(s.docs.map((d) => d.data()))), [uid]);

  // Salvamento automático: grava 0,4 s depois de você parar de mexer, ao sair da aba e ao fechar a página
  async function gravar() {
    clearTimeout(timer.current);
    const lista = pendente.current;
    if (!lista) return;
    pendente.current = null;
    try {
      await setDoc(doc(db, "users", uid, "config", "metas"), { mensais: lista.map((m) => ({ ...m, pct: Number(m.pct) || 0 })) }, { merge: true });
      setStatus("Salvo automaticamente");
    } catch { pendente.current = lista; setStatus("Não consegui salvar. Verifique a conexão."); }
  }
  const atualizar = (lista) => {
    setDraft(lista); pendente.current = lista; setStatus("Salvando…");
    clearTimeout(timer.current); timer.current = setTimeout(gravar, 400);
  };
  useEffect(() => {
    window.addEventListener("pagehide", gravar);
    return () => { window.removeEventListener("pagehide", gravar); gravar(); };
  }, []);

  if (!draft) return <p className="p-6 text-suave">Carregando…</p>;

  const opcoes = [
    { k: "tipo:saida", label: "Todas as saídas" },
    { k: "tipo:investimento", label: "Todos os investimentos" },
    { k: "fixo", label: "Gastos fixos (aba Fixos)" },
    ...cats.filter((c) => c.grupo === "gasto" || (c.grupo === "investimento" && c.pai !== "Rendimentos")).map((c) => ({ k: `cat:${c.nome}`, label: c.nome })),
  ];
  const total = draft.reduce((s, m) => s + (Number(m.pct) || 0), 0);
  const mudar = (id, patch) => atualizar(draft.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const alternar = (m, k) => mudar(m.id, { vinc: m.vinc.includes(k) ? m.vinc.filter((x) => x !== k) : [...m.vinc, k] });
  const limitar = (v) => (v === "" ? "" : Math.max(0, Math.min(100, Math.floor(Number(v)))));
  const criar = (e) => {
    e.preventDefault();
    if (!novo.nome.trim()) return;
    atualizar([...draft, { id: Date.now().toString(36), nome: novo.nome.trim(), cor: novo.cor, pct: Number(novo.pct) || 0, vinc: novo.vinc }]);
    setNovo(null); // a meta nasce fechada
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-extrabold">Metas mensais</h1>
        <p className="text-sm text-suave">Divida o que entra em cada mês em metas. O total precisa fechar 100%. Se uma categoria estiver ligada a uma meta específica, ela conta só nela.</p>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[#0F0F0F]">
        {draft.map((m) => <div key={m.id} style={{ width: `${Math.min(Number(m.pct) || 0, 100)}%`, background: m.cor, boxShadow: `0 0 10px ${m.cor}` }} />)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className={`font-bold ${total === 100 || !draft.length ? "text-[#34D399]" : "text-saida"}`}>
          Total: {total}%{draft.length > 0 && total < 100 && ` — faltam ${100 - total}% para fechar 100%`}{total > 100 && ` — passou ${total - 100}%`}
        </p>
        <span role="status" className="text-suave">{status}</span>
      </div>

      {draft.map((m) => {
        const aberta = !!abertas[m.id];
        return (
          <section key={m.id} className={cartao}>
            <button type="button" onClick={() => setAbertas({ ...abertas, [m.id]: !aberta })} aria-expanded={aberta} className="flex w-full items-center gap-3 p-4 text-left">
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: m.cor, boxShadow: `0 0 10px ${m.cor}` }} />
              <span className="min-w-0 flex-1 truncate font-bold">{m.nome || "Sem nome"}</span>
              <span className="font-bold tabular-nums" style={{ color: m.cor }}>{Number(m.pct) || 0}%</span>
              <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 text-suave transition-transform ${aberta ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {aberta && (
              <div className="space-y-3 px-4 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="color" value={m.cor} onChange={(e) => mudar(m.id, { cor: e.target.value })} className="h-10 w-10 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Cor da meta" />
                  <input className={`${campo} min-w-0 flex-1`} placeholder="Nome (ex.: Guardar)" value={m.nome} onChange={(e) => mudar(m.id, { nome: e.target.value })} />
                  <label className="flex items-center gap-1 font-bold">
                    <input type="number" inputMode="numeric" min="0" max="100" className={`${campo} w-20`} value={m.pct} aria-label="Porcentagem" onChange={(e) => mudar(m.id, { pct: limitar(e.target.value) })} /> %
                  </label>
                </div>
                <Chips opcoes={opcoes} vinc={m.vinc || []} cor={m.cor} alternar={(k) => alternar({ ...m, vinc: m.vinc || [] }, k)} />
                <button onClick={() => atualizar(draft.filter((x) => x.id !== m.id))} className="text-sm text-suave underline">Apagar meta</button>
              </div>
            )}
          </section>
        );
      })}

      {novo ? (
        <form onSubmit={criar} className={`${cartao} space-y-3 p-4`}>
          <p className="font-bold">Nova meta</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="color" value={novo.cor} onChange={(e) => setNovo({ ...novo, cor: e.target.value })} className="h-10 w-10 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Cor da meta" />
            <input autoFocus className={`${campo} min-w-0 flex-1`} placeholder="Nome (ex.: Para Mim)" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <label className="flex items-center gap-1 font-bold">
              <input type="number" inputMode="numeric" min="0" max="100" className={`${campo} w-20`} value={novo.pct} aria-label="Porcentagem" onChange={(e) => setNovo({ ...novo, pct: limitar(e.target.value) })} /> %
            </label>
          </div>
          <Chips opcoes={opcoes} vinc={novo.vinc} cor={novo.cor} alternar={(k) => setNovo({ ...novo, vinc: novo.vinc.includes(k) ? novo.vinc.filter((x) => x !== k) : [...novo.vinc, k] })} />
          <div className="flex gap-3">
            <button className="rounded-xl bg-neon px-5 py-2.5 font-bold text-white">Criar meta</button>
            <button type="button" onClick={() => setNovo(null)} className="text-sm text-suave underline">Cancelar</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setNovo({ nome: "", cor: paleta[draft.length % paleta.length], pct: Math.max(0, 100 - total), vinc: [] })} className="btn-vidro">+ Nova meta</button>
      )}
    </div>
  );
}
