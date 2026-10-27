import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { paleta } from "./util.js";

const campo = "w-full rounded-xl border border-borda bg-[#141414] px-3 py-2.5 text-tinta";

function Fixa({ m, uid, invest }) {
  const [f, setF] = useState(m);
  const [msg, setMsg] = useState("");
  const set = (k, v) => { setMsg(""); setF({ ...f, [k]: v }); };
  const cats = f.cats || [];
  async function salvar() {
    await updateDoc(doc(db, "users", uid, "metasFixas", m.id), {
      nome: f.nome.trim() || "Meta", cor: f.cor, valor: Number(f.valor) || 0, inicial: Number(f.inicial) || 0, data: f.data || "", cats,
    });
    setMsg("Salva.");
  }
  return (
    <section className="painel3d space-y-3 rounded-2xl p-4" style={{ borderColor: `${f.cor}88`, boxShadow: `0 0 18px ${f.cor}33` }}>
      <div className="flex items-center gap-2">
        <input type="color" value={f.cor} onChange={(e) => set("cor", e.target.value)} className="h-10 w-10 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Cor da meta" />
        <input className={campo} placeholder="Nome (ex.: Carro próprio)" value={f.nome} onChange={(e) => set("nome", e.target.value)} />
        <button onClick={() => deleteDoc(doc(db, "users", uid, "metasFixas", m.id))} aria-label={`Apagar meta ${m.nome}`} className="px-2 text-xl text-suave">×</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-suave">Valor da meta (R$)
          <input className={`${campo} mt-1`} type="number" inputMode="decimal" min="0" step="0.01" value={f.valor} onChange={(e) => set("valor", e.target.value)} />
        </label>
        <label className="text-sm text-suave">Já guardado antes (R$)
          <input className={`${campo} mt-1`} type="number" inputMode="decimal" min="0" step="0.01" value={f.inicial || ""} onChange={(e) => set("inicial", e.target.value)} />
        </label>
        <label className="col-span-2 text-sm text-suave">Data para bater a meta (opcional)
          <input className={`${campo} mt-1`} type="date" value={f.data || ""} onChange={(e) => set("data", e.target.value)} />
        </label>
      </div>
      <div>
        <p className="mb-1 text-sm text-suave">Investimentos que contam nesta meta:</p>
        <div className="flex flex-wrap gap-2">
          {invest.length === 0 && <span className="text-sm text-suave">Crie categorias de investimento na aba Categorias.</span>}
          {invest.map((n) => (
            <button key={n} type="button" aria-pressed={cats.includes(n)} onClick={() => set("cats", cats.includes(n) ? cats.filter((x) => x !== n) : [...cats, n])}
              className="rounded-full px-3 py-1.5 text-sm font-bold"
              style={cats.includes(n) ? { background: f.cor, color: "#fff", boxShadow: `0 0 12px ${f.cor}` } : { border: "1px solid #333", color: "#9A9A9A" }}>{n}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={salvar} className="rounded-xl bg-neon px-5 py-2.5 font-bold text-white">Salvar</button>
        {msg && <span role="status" className="text-sm text-suave">{msg}</span>}
      </div>
    </section>
  );
}

export default function MetasFixas() {
  const uid = auth.currentUser.uid;
  const [lista, setLista] = useState(null);
  const [invest, setInvest] = useState([]);
  useEffect(() => onSnapshot(collection(db, "users", uid, "metasFixas"), (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.criada || 0) - (b.criada || 0)))), [uid]);
  useEffect(() => onSnapshot(collection(db, "users", uid, "categorias"), (s) => setInvest(s.docs.map((d) => d.data()).filter((c) => c.grupo === "investimento").map((c) => c.nome))), [uid]);
  if (!lista) return <p className="p-6 text-suave">Carregando…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-extrabold">Metas fixas</h1>
        <p className="text-sm text-suave">Metas em dinheiro, como "Carro próprio: 50000". O valor guardado é o que você já tinha mais os investimentos registrados nas categorias ligadas à meta.</p>
      </div>
      {lista.map((m) => <Fixa key={m.id} m={m} uid={uid} invest={invest} />)}
      <button onClick={() => addDoc(collection(db, "users", uid, "metasFixas"), { nome: "Nova meta", cor: paleta[lista.length % paleta.length], valor: 0, inicial: 0, data: "", cats: [], criada: Date.now() })} className="btn-vidro">+ Nova meta</button>
    </div>
  );
}
