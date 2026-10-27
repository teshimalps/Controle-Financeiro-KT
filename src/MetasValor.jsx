import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { auth, db } from "./firebase";
import { brl, guardadoDe, paleta, restante } from "./util.js";

const campo = "w-full rounded-xl border border-borda bg-[#141414] px-3 py-2.5 text-tinta";
const cartao = "rounded-2xl bg-[#1A1A1A]";

function Campos({ m, set }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input type="color" value={m.cor} onChange={(e) => set({ cor: e.target.value })} className="h-10 w-10 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Cor da meta" />
        <input className={campo} placeholder="Nome (ex.: Comprar carro)" value={m.nome} onChange={(e) => set({ nome: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-suave">Valor da meta (R$)
          <input className={`${campo} mt-1`} type="number" inputMode="decimal" min="0" step="0.01" value={m.valor} onChange={(e) => set({ valor: e.target.value })} />
        </label>
        <label className="text-sm text-suave">Data (opcional)
          <input className={`${campo} mt-1`} type="date" value={m.data || ""} onChange={(e) => set({ data: e.target.value })} />
        </label>
        <label className="col-span-2 text-sm text-suave">Já guardado antes (opcional, R$)
          <input className={`${campo} mt-1`} type="number" inputMode="decimal" min="0" step="0.01" value={m.inicial ?? ""} onChange={(e) => set({ inicial: e.target.value })} />
        </label>
      </div>
    </div>
  );
}

export default function MetasValor() {
  const uid = auth.currentUser.uid;
  const [lista, setLista] = useState(null);
  const [inv, setInv] = useState([]);
  const [abertas, setAbertas] = useState({});
  const [novo, setNovo] = useState(null);
  const [status, setStatus] = useState("");
  const pendente = useRef(null), timer = useRef(null);

  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "metasValor"), (s) => setLista((d) => d ?? (s.data()?.lista || []))), [uid]);
  useEffect(() => onSnapshot(query(collection(db, "users", uid, "lancamentos"), where("tipo", "==", "investimento")), (s) => setInv(s.docs.map((d) => d.data()))), [uid]);

  // Salvamento automático, igual ao das metas mensais
  async function gravar() {
    clearTimeout(timer.current);
    const l = pendente.current;
    if (!l) return;
    pendente.current = null;
    try {
      await setDoc(doc(db, "users", uid, "config", "metasValor"), { lista: l.map((m) => ({ ...m, valor: Number(m.valor) || 0, inicial: Number(m.inicial) || 0, data: m.data || "" })) }, { merge: true });
      setStatus("Salvo automaticamente");
    } catch { pendente.current = l; setStatus("Não consegui salvar. Verifique a conexão."); }
  }
  const atualizar = (l) => { setLista(l); pendente.current = l; setStatus("Salvando…"); clearTimeout(timer.current); timer.current = setTimeout(gravar, 400); };
  useEffect(() => {
    window.addEventListener("pagehide", gravar);
    return () => { window.removeEventListener("pagehide", gravar); gravar(); };
  }, []);

  if (!lista) return <p className="p-6 text-suave">Carregando…</p>;

  const mudar = (id, patch) => atualizar(lista.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const criar = (e) => {
    e.preventDefault();
    if (!novo.nome.trim()) return;
    atualizar([...lista, { ...novo, id: Date.now().toString(36), nome: novo.nome.trim() }]);
    setNovo(null); // a meta nasce fechada
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Metas</h1>
          <p className="text-sm text-suave">Metas em dinheiro, como "Comprar carro: R$ 50.000". Você escolhe o que entra em cada meta: ao investir, diga "investi 400 na meta carro" no chat, ou use o Editar do lançamento no Resumo e escolha a meta.</p>
        </div>
        <span role="status" className="shrink-0 text-sm text-suave">{status}</span>
      </div>

      {lista.map((m) => {
        const aberta = !!abertas[m.id];
        const v = Number(m.valor) || 0, g = guardadoDe(m, inv), p = v > 0 ? (g / v) * 100 : 0, falta = Math.max(v - g, 0), r = restante(m.data, falta);
        return (
          <section key={m.id} className={cartao}>
            <button type="button" onClick={() => setAbertas({ ...abertas, [m.id]: !aberta })} aria-expanded={aberta} className="flex w-full items-center gap-3 p-4 text-left">
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: m.cor, boxShadow: `0 0 10px ${m.cor}` }} />
              <span className="min-w-0 flex-1 truncate font-bold">{m.nome || "Sem nome"}</span>
              <span className="font-bold tabular-nums" style={{ color: m.cor }}>{Math.floor(Math.min(p, 999))}%</span>
              <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 text-suave transition-transform ${aberta ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <div className="-mt-1 px-4 pb-4">
              <div className="h-2 rounded-full bg-[#0F0F0F]"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(p, 100))}%`, background: m.cor, boxShadow: `0 0 10px ${m.cor}` }} /></div>
              <p className="mt-1.5 text-xs tabular-nums text-suave">
                {brl(g)} de {brl(v)}{m.data && ` · até ${m.data.split("-").reverse().join("/")}`}{r && ` · ${r}`}
              </p>
            </div>
            {aberta && (
              <div className="space-y-3 px-4 pb-4">
                <Campos m={m} set={(patch) => mudar(m.id, patch)} />
                <button onClick={() => atualizar(lista.filter((x) => x.id !== m.id))} className="text-sm text-suave underline">Apagar meta</button>
              </div>
            )}
          </section>
        );
      })}

      {novo ? (
        <form onSubmit={criar} className={`${cartao} space-y-3 p-4`}>
          <p className="font-bold">Nova meta</p>
          <Campos m={novo} set={(patch) => setNovo({ ...novo, ...patch })} />
          <div className="flex gap-3">
            <button className="rounded-xl bg-neon px-5 py-2.5 font-bold text-white">Criar meta</button>
            <button type="button" onClick={() => setNovo(null)} className="text-sm text-suave underline">Cancelar</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setNovo({ nome: "", cor: paleta[lista.length % paleta.length], valor: "", data: "", inicial: "", cats: [] })} className="btn-vidro">+ Nova meta</button>
      )}
    </div>
  );
}
