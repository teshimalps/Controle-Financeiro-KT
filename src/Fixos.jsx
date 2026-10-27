import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { brl } from "./util.js";
import { atualizarMes, mesAtual } from "./fixos.js";

const campo = "w-full rounded-xl border border-borda bg-[#141414] px-3 py-2.5 text-tinta";
const cartao = "rounded-2xl bg-[#1A1A1A]";
const vazio = { nome: "", categoria: "", valor: "", pagamento: "", dia: 1 };

function Campos({ m, set, tipo, cats }) {
  const pags = [...new Set([...cats.filter((c) => c.grupo === "pagamento").map((c) => c.nome), ...(m.pagamento ? [m.pagamento] : [])])];
  return (
    <div className="grid grid-cols-2 gap-2">
      <input className={`${campo} col-span-2`} placeholder={tipo === "entrada" ? "Nome (ex.: Salário)" : "Nome (ex.: Netflix)"} value={m.nome} onChange={(e) => set({ nome: e.target.value })} />
      <label className="text-sm text-suave">Valor (R$)
        <input className={`${campo} mt-1`} type="number" inputMode="decimal" min="0" step="0.01" value={m.valor} onChange={(e) => set({ valor: e.target.value })} />
      </label>
      <label className="text-sm text-suave">Dia do mês
        <input className={`${campo} mt-1`} type="number" inputMode="numeric" min="1" max="31" value={m.dia ?? 1} onChange={(e) => set({ dia: e.target.value })} />
      </label>
      <label className="col-span-2 text-sm text-suave">Categoria (digite ou escolha)
        <input className={`${campo} mt-1`} list="cats-fixos" placeholder={tipo === "entrada" ? "Ex.: Salário" : "Ex.: Assinatura, Dízimo, Ajuda em casa"} value={m.categoria} onChange={(e) => set({ categoria: e.target.value })} />
      </label>
      {tipo === "saida" && (
        <label className="col-span-2 text-sm text-suave">Forma de pagamento
          <select className={`${campo} mt-1`} value={m.pagamento || ""} onChange={(e) => set({ pagamento: e.target.value })}>
            <option value="">Sem forma de pagamento</option>
            {pags.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

export default function Fixos() {
  const uid = auth.currentUser.uid;
  const [lista, setLista] = useState(null);
  const [cats, setCats] = useState([]);
  const [secao, setSecao] = useState("saida");
  const [abertas, setAbertas] = useState({});
  const [novo, setNovo] = useState(null);
  const [erro, setErro] = useState("");
  const [status, setStatus] = useState("");
  const pendente = useRef(null), timer = useRef(null), mudados = useRef(new Set());

  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "fixos"), (s) => setLista((d) => d ?? (s.data()?.lista || []))), [uid]);
  useEffect(() => onSnapshot(collection(db, "users", uid, "categorias"), (s) => setCats(s.docs.map((d) => d.data()))), [uid]);

  // Salvamento automático, igual ao das metas
  async function gravar() {
    clearTimeout(timer.current);
    const l = pendente.current;
    if (!l) return;
    pendente.current = null;
    const ids = [...mudados.current];
    mudados.current.clear();
    try {
      await setDoc(doc(db, "users", uid, "config", "fixos"), { lista: l.map((f) => ({ ...f, valor: Number(f.valor) || 0, dia: Math.min(Math.max(Math.floor(Number(f.dia)) || 1, 1), 31) })) }, { merge: true });
      ids.forEach((id) => { const f = l.find((x) => x.id === id); if (f) atualizarMes(uid, f); });
      setStatus("Salvo automaticamente");
    } catch { pendente.current = l; ids.forEach((id) => mudados.current.add(id)); setStatus("Não consegui salvar. Verifique a conexão."); }
  }
  const atualizar = (l, id) => {
    if (id) mudados.current.add(id);
    setLista(l); pendente.current = l; setStatus("Salvando…");
    clearTimeout(timer.current); timer.current = setTimeout(gravar, 400);
  };
  useEffect(() => {
    window.addEventListener("pagehide", gravar);
    return () => { window.removeEventListener("pagehide", gravar); gravar(); };
  }, []);

  if (!lista) return <p className="p-6 text-suave">Carregando…</p>;

  const tipoDe = (f) => (f.tipo === "entrada" ? "entrada" : "saida");
  const daSecao = lista.filter((f) => tipoDe(f) === secao);
  const ativos = daSecao.filter((f) => f.ativo !== false), parados = daSecao.filter((f) => f.ativo === false);
  const total = ativos.reduce((s, f) => s + (Number(f.valor) || 0), 0);
  const nomesCat = [...new Set(cats.filter((c) => c.grupo === (secao === "entrada" ? "entrada" : "gasto")).map((c) => c.nome))];
  const corDe = (n) => cats.find((c) => c.nome === n)?.cor || "#6B7280";
  const mudar = (id, patch) => atualizar(lista.map((f) => (f.id === id ? { ...f, ...patch } : f)), id);
  const rotulo = secao === "entrada" ? "entrada fixa" : "gasto fixo";

  const criar = (e) => {
    e.preventDefault();
    const v = Number(novo.valor);
    if (!novo.nome.trim() || !(v > 0)) { setErro("Informe o nome e um valor maior que zero."); return; }
    setErro("");
    atualizar([...lista, { ...novo, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, tipo: secao, nome: novo.nome.trim(), valor: v, ativo: true, inicio: mesAtual() }]);
    setNovo(null); // nasce fechado
  };

  const Card = ({ f }) => {
    const aberta = !!abertas[f.id], parado = f.ativo === false;
    return (
      <section className={`${cartao} ${parado ? "opacity-60" : ""}`}>
        <button type="button" onClick={() => setAbertas({ ...abertas, [f.id]: !aberta })} aria-expanded={aberta} className="flex w-full items-center gap-3 p-4 text-left">
          <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: corDe(f.categoria), boxShadow: `0 0 10px ${corDe(f.categoria)}` }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{f.nome || "Sem nome"}{parado && <span className="ml-2 text-xs font-normal text-suave">desativado</span>}</span>
            <span className="block truncate text-xs text-suave">{f.categoria || (secao === "entrada" ? "Entradas Fixas" : "Gastos Fixos")}{f.pagamento && ` · ${f.pagamento}`} · todo dia {Number(f.dia) || 1}</span>
          </span>
          <span className="font-bold tabular-nums">{brl(Number(f.valor) || 0)}</span>
          <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 text-suave transition-transform ${aberta ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {aberta && (
          <div className="space-y-3 px-4 pb-4">
            <Campos m={f} set={(patch) => mudar(f.id, patch)} tipo={secao} cats={cats} />
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={() => mudar(f.id, parado ? { ativo: true, inicio: mesAtual(), fim: "" } : { ativo: false, fim: mesAtual() })} className="rounded-xl border border-borda px-4 py-2 text-sm font-bold">
                {parado ? "Reativar" : "Desativar"}
              </button>
              <button onClick={() => atualizar(lista.filter((x) => x.id !== f.id))} className="text-sm text-suave underline">Apagar</button>
            </div>
            <p className="text-xs text-suave">Mudou o valor? Vale para este mês e os próximos; os meses passados ficam como estão.</p>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-8">
      <datalist id="cats-fixos">{nomesCat.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Fixos</h1>
          <p className="text-sm text-suave">O que está ativo entra sozinho todo mês. Você também pode criar pelo chat: "meu salário de 2000 é uma entrada fixa".</p>
        </div>
        <span role="status" className="shrink-0 text-sm text-suave">{status}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#141414] p-1">
        {[["saida", "Gastos fixos"], ["entrada", "Entradas fixas"]].map(([v, r]) => (
          <button key={v} onClick={() => { setSecao(v); setNovo(null); setErro(""); }} aria-pressed={secao === v}
            className={`rounded-xl py-2.5 text-sm font-bold ${secao === v ? "bg-neon text-white shadow-[0_0_16px_rgba(0,87,255,.5)]" : "text-suave"}`}>
            {r} ({lista.filter((f) => tipoDe(f) === v && f.ativo !== false).length})
          </button>
        ))}
      </div>
      <p className="text-sm font-bold tabular-nums">{secao === "entrada" ? "Entra" : "Sai"} por mês: {brl(total)}</p>

      {ativos.map((f) => <Card key={f.id} f={f} />)}
      {!ativos.length && !novo && <p className="text-sm text-suave">Nenhum {rotulo} ativo ainda.</p>}

      {novo ? (
        <form onSubmit={criar} className={`${cartao} space-y-3 p-4`}>
          <p className="font-bold">{secao === "entrada" ? "Nova entrada fixa" : "Novo gasto fixo"}</p>
          <Campos m={novo} set={(patch) => setNovo({ ...novo, ...patch })} tipo={secao} cats={cats} />
          {erro && <p role="alert" className="text-sm font-medium text-saida">{erro}</p>}
          <div className="flex gap-3">
            <button className="rounded-xl bg-neon px-5 py-2.5 font-bold text-white">Criar</button>
            <button type="button" onClick={() => { setNovo(null); setErro(""); }} className="text-sm text-suave underline">Cancelar</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setNovo({ ...vazio })} className="btn-vidro">{secao === "entrada" ? "+ Nova entrada fixa" : "+ Novo gasto fixo"}</button>
      )}

      {parados.length > 0 && (
        <>
          <p className="pt-2 text-sm font-bold text-suave">Desativados</p>
          {parados.map((f) => <Card key={f.id} f={f} />)}
        </>
      )}
    </div>
  );
}
