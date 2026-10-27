import { useEffect, useRef, useState } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";
import { slug } from "./util.js";

const grupos = [["gasto", "Onde gastei"], ["entrada", "Entradas"], ["investimento", "Investimentos"], ["pagamento", "Formas de pagamento"]];
const campo = "rounded-xl border border-borda bg-[#141414] px-3 py-3 text-tinta";
const seletor = "h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0";

function Chip({ c, uid }) {
  const ref = doc(db, "users", uid, "categorias", c.id);
  const [edit, setEdit] = useState(false);
  const [nome, setNome] = useState(c.nome);
  const [corLocal, setCorLocal] = useState(c.cor || "#0057FF");
  const timer = useRef(null);

  // Salva a cor meio segundo depois de parar de arrastar no seletor
  function mudarCor(v) {
    setCorLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => updateDoc(ref, { cor: v }), 500);
  }
  async function salvarNome() {
    const n = nome.trim();
    setEdit(false);
    if (!n || n === c.nome) return;
    await updateDoc(ref, { nome: n });
    // Atualiza também os lançamentos antigos que usavam o nome anterior
    const campoNome = c.grupo === "pagamento" ? "pagamento" : "categoria";
    const s = await getDocs(query(collection(db, "users", uid, "lancamentos"), where(campoNome, "==", c.nome)));
    if (c.grupo !== "pagamento") { // mantém as metas mensais ligadas à categoria renomeada
      const mref = doc(db, "users", uid, "config", "metas"), ms = await getDoc(mref);
      if (ms.exists()) await updateDoc(mref, { mensais: (ms.data().mensais || []).map((m) => ({ ...m, vinc: (m.vinc || []).map((v) => (v === `cat:${c.nome}` ? `cat:${n}` : v)) })) });
    }
    if (c.grupo === "investimento" && c.pai !== "Rendimentos") { // rendimentos continuam ligados ao aportado renomeado
      const rs = await getDocs(query(collection(db, "users", uid, "categorias"), where("aporte", "==", c.nome)));
      await Promise.all(rs.docs.map((d) => updateDoc(d.ref, { aporte: n })));
    }
    if (s.size) { const b = writeBatch(db); s.docs.forEach((d) => b.update(d.ref, { [campoNome]: n })); await b.commit(); }
  }

  return (
    <span className="flex items-center gap-2 rounded-xl bg-[#141414] px-3 py-2 text-sm"
      style={{ border: `1px solid ${corLocal}`, boxShadow: `0 0 16px ${corLocal}66, inset 0 0 14px ${corLocal}22` }}>
      <input type="color" value={corLocal} onChange={(e) => mudarCor(e.target.value)} className={seletor} aria-label={`Cor de ${c.nome}`} />
      {edit ? (
        <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onBlur={salvarNome}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="w-36 rounded bg-black/40 px-2 py-1 text-tinta" />
      ) : (
        <button onClick={() => { setNome(c.nome); setEdit(true); }} className="font-bold" aria-label={`Renomear ${c.nome}`}>{c.nome}</button>
      )}
      {c.pai && c.pai !== "Rendimentos" && <i className="text-suave">({c.pai})</i>}
      <button onClick={() => deleteDoc(ref)} aria-label={`Apagar ${c.nome}`} className="text-suave">×</button>
    </span>
  );
}

function Investimentos({ lista, uid }) {
  const aportes = lista.filter((c) => c.grupo === "investimento" && c.pai !== "Rendimentos");
  const rends = lista.filter((c) => c.grupo === "investimento" && c.pai === "Rendimentos");
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#8B5CF6");
  const [sobre, setSobre] = useState("");
  const [corR, setCorR] = useState("#B99BFF");
  const base = sobre || aportes[0]?.nome || "";

  async function criarAporte(e) {
    e.preventDefault();
    const n = nome.trim();
    if (!n) return;
    await setDoc(doc(db, "users", uid, "categorias", slug(n)), { nome: n, grupo: "investimento", pai: "", cor });
    setNome("");
  }
  async function criarRendimento(e) {
    e.preventDefault();
    if (!base) return;
    const n = `Rendimento ${base}`;
    await setDoc(doc(db, "users", uid, "categorias", slug(n)), { nome: n, grupo: "investimento", pai: "Rendimentos", aporte: base, cor: corR });
  }
  const cor48 = "h-12 w-12 cursor-pointer rounded-xl border border-borda bg-[#141414] p-1";

  return (
    <section className="painel3d space-y-5 rounded-2xl p-4">
      <h2 className="font-bold">Investimentos</h2>
      <div>
        <p className="font-bold text-suave">Aportados</p>
        <p className="mb-3 text-sm text-suave">Onde você investiu ou aportou (ex.: Cofrinho Nubank).</p>
        <div className="mb-3 flex flex-wrap gap-3">
          {aportes.map((c) => <Chip key={c.id} c={c} uid={uid} />)}
          {!aportes.length && <p className="text-sm text-suave">Nenhum aportado ainda.</p>}
        </div>
        <form onSubmit={criarAporte} className="flex flex-wrap items-center gap-2">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do investimento" className={`${campo} min-w-52 flex-1`} />
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className={cor48} aria-label="Cor do aportado" />
          <button className="rounded-xl bg-neon px-5 py-3 font-bold text-white">Criar aportado</button>
        </form>
      </div>
      <div>
        <p className="font-bold text-suave">Rendimentos</p>
        <p className="mb-3 text-sm text-suave">Quanto rendeu cada investimento. É opcional: crie só para os que você quiser acompanhar.</p>
        <div className="mb-3 flex flex-wrap gap-3">
          {rends.map((c) => <Chip key={c.id} c={c} uid={uid} />)}
          {!rends.length && <p className="text-sm text-suave">Nenhum rendimento ainda.</p>}
        </div>
        <form onSubmit={criarRendimento} className="flex flex-wrap items-center gap-2">
          <select value={base} onChange={(e) => setSobre(e.target.value)} className={`${campo} min-w-52 flex-1`} aria-label="Rendimento sobre qual investimento">
            {!aportes.length && <option value="">Crie um aportado primeiro</option>}
            {aportes.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
          <input type="color" value={corR} onChange={(e) => setCorR(e.target.value)} className={cor48} aria-label="Cor do rendimento" />
          <button disabled={!base} className="rounded-xl bg-neon px-5 py-3 font-bold text-white disabled:opacity-40">Criar rendimento</button>
        </form>
      </div>
    </section>
  );
}

export default function Categorias() {
  const uid = auth.currentUser.uid;
  const [lista, setLista] = useState([]);
  const [nome, setNome] = useState("");
  const [grupo, setGrupo] = useState("gasto");
  const [pai, setPai] = useState("Débito");
  const [cor, setCor] = useState("#0057FF");

  useEffect(() => onSnapshot(collection(db, "users", uid, "categorias"), (s) =>
    setLista(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.nome.localeCompare(b.nome)))), [uid]);

  async function criar(e) {
    e.preventDefault();
    const n = nome.trim();
    if (!n) return;
    await setDoc(doc(db, "users", uid, "categorias", slug(n)), { nome: n, grupo, pai: grupo === "pagamento" ? pai : "", cor });
    setNome("");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <form onSubmit={criar} className="painel3d flex flex-wrap items-center gap-2 rounded-2xl p-4">
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex.: Cofrinho Invest MP)" className={`${campo} min-w-52 flex-1`} />
        <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className={campo}>
          {grupos.filter(([v]) => v !== "investimento").map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
        {grupo === "pagamento" && (
          <select value={pai} onChange={(e) => setPai(e.target.value)} className={campo}><option>Débito</option><option>Crédito</option></select>
        )}
        <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-12 w-12 cursor-pointer rounded-xl border border-borda bg-[#141414] p-1" aria-label="Cor da nova categoria" />
        <button className="rounded-xl bg-neon px-5 py-3 font-bold text-white shadow-[0_0_20px_rgba(0,87,255,.6)]">Criar</button>
      </form>
      {grupos.map(([g, rotulo]) => g === "investimento" ? <Investimentos key={g} lista={lista} uid={uid} /> : (
        <section key={g} className="painel3d rounded-2xl p-4">
          <h2 className="mb-3 font-bold">{rotulo}</h2>
          <div className="flex flex-wrap gap-3">
            {lista.filter((c) => c.grupo === g).map((c) => <Chip key={c.id} c={c} uid={uid} />)}
            {!lista.some((c) => c.grupo === g) && <p className="text-sm text-suave">Nada criado ainda.</p>}
          </div>
        </section>
      ))}
      <p className="text-sm text-suave">Clique na bolinha para escolher qualquer cor e no nome para renomear. Renomear atualiza também os lançamentos antigos.</p>
    </div>
  );
}
