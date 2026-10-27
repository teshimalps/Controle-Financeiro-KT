import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import Login from "./Login.jsx";
import Chat from "./Chat.jsx";
import Resumo from "./Resumo.jsx";
import Categorias from "./Categorias.jsx";
import MetasMensais from "./MetasMensais.jsx";
import MetasValor from "./MetasValor.jsx";
import Fixos from "./Fixos.jsx";
import Investimentos from "./Investimentos.jsx";
import Rendimentos from "./Rendimentos.jsx";
import { gerarFixos } from "./fixos.js";
import Perfil from "./Perfil.jsx";
import Avatar from "./Avatar.jsx";

// [id, nome no computador, nome curto no celular]
const abas = [
  ["chat", "Chat", "Chat"], ["resumo", "Resumo", "Resumo"], ["inv", "Investimentos", "Invest."], ["rend", "Rendimentos", "Rend."], ["fixos", "Fixos", "Fixos"], ["mensais", "Metas mensais", "Mensais"], ["metas", "Metas", "Metas"], ["cat", "Categorias", "Categorias"],
];

// Abas fixas na barra do celular; as outras ficam no menu "Mais"
const PRINCIPAIS = ["chat", "resumo", "inv", "fixos"];

export default function App() {
  const [user, setUser] = useState(undefined);
  const [aba, setAba] = useState("chat");
  const [perfil, setPerfil] = useState({});
  const [mais, setMais] = useState(false);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    document.title = user ? "Ora Finance - Home" : user === null ? "Ora Finance - Login" : "Ora Finance";
  }, [user]);
  useEffect(() => (user ? onSnapshot(doc(db, "users", user.uid), (s) => setPerfil(s.data() || {})) : undefined), [user]);
  // Gastos e entradas fixos: gera os lançamentos do mês ao abrir, ao mudar um fixo e ao voltar para o app
  useEffect(() => {
    if (!user) return undefined;
    let lista = [];
    const rodar = () => gerarFixos(user.uid, lista);
    const off = onSnapshot(doc(db, "users", user.uid, "config", "fixos"), (s) => { lista = s.data()?.lista || []; rodar(); });
    const ver = () => { if (document.visibilityState === "visible") rodar(); };
    document.addEventListener("visibilitychange", ver);
    return () => { off(); document.removeEventListener("visibilitychange", ver); };
  }, [user]);

  if (user === undefined) return <p className="p-6 text-suave">Carregando…</p>;
  if (!user) return <Login />;

  const nome = perfil.nome || user.displayName || "";
  const tela = aba === "chat" ? <Chat /> : aba === "resumo" ? <Resumo onNova={() => setAba("cat")} onMetas={() => setAba("mensais")} onValor={() => setAba("metas")} /> : aba === "rend" ? <Rendimentos /> : aba === "inv" ? <Investimentos /> : aba === "fixos" ? <Fixos /> : aba === "mensais" ? <MetasMensais /> : aba === "metas" ? <MetasValor /> : aba === "cat" ? <Categorias /> : <Perfil user={user} perfil={perfil} />;

  return (
    <div className="altura-app flex flex-col md:flex-row">
      <header className="flex items-center justify-between border-b border-borda px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
        <img src="/logo.png" alt="Ora Finance" className="h-8 w-auto" />
        <button onClick={() => setAba("perfil")} aria-label="Perfil"><Avatar foto={perfil.foto} nome={nome} tam={34} /></button>
      </header>
      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-borda md:p-5">
        <img src="/logo.png" alt="Ora Finance" className="mb-6 w-36 self-start" />
        <nav className="flex flex-col gap-1">
          {abas.map(([id, longo]) => (
            <button key={id} onClick={() => setAba(id)}
              className={`rounded-xl px-4 py-2.5 text-left font-bold ${aba === id ? "bg-neon text-white shadow-[0_0_20px_rgba(0,87,255,.6)]" : "text-suave hover:text-tinta"}`}>{longo}</button>
          ))}
        </nav>
        <button onClick={() => setAba("perfil")} className={`mt-auto flex items-center gap-3 rounded-xl p-2 text-left hover:bg-white/5 ${aba === "perfil" ? "bg-white/10" : ""}`}>
          <Avatar foto={perfil.foto} nome={nome} tam={40} />
          <span className="truncate text-sm font-bold">{nome || "Perfil"}</span>
        </button>
      </aside>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{tela}</main>
      {mais && (
        <>
          <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMais(false)} />
          <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] right-2 z-40 w-56 rounded-2xl border border-borda bg-[#1A1A1A] p-2 shadow-xl md:hidden">
            {abas.filter(([id]) => !PRINCIPAIS.includes(id)).map(([id, longo]) => (
              <button key={id} onClick={() => { setAba(id); setMais(false); }}
                className={`block w-full rounded-xl px-4 py-3 text-left font-bold ${aba === id ? "bg-neon text-white" : "text-suave"}`}>{longo}</button>
            ))}
          </div>
        </>
      )}
      <nav className="grid grid-cols-5 border-t border-borda bg-fundo pb-[env(safe-area-inset-bottom)] md:hidden">
        {abas.filter(([id]) => PRINCIPAIS.includes(id)).map(([id, , curto]) => (
          <button key={id} onClick={() => { setAba(id); setMais(false); }} aria-current={aba === id}
            className={`border-t-2 px-0.5 py-3 text-[11px] font-bold ${aba === id ? "border-neon text-[#4D8DFF]" : "border-transparent text-suave"}`}>{curto}</button>
        ))}
        <button onClick={() => setMais(!mais)} aria-expanded={mais}
          className={`border-t-2 px-0.5 py-3 text-[11px] font-bold ${mais || !PRINCIPAIS.includes(aba) && aba !== "perfil" ? "border-neon text-[#4D8DFF]" : "border-transparent text-suave"}`}>Mais</button>
      </nav>
    </div>
  );
}
