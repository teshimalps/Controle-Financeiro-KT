import { useState } from "react";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import CampoSenha from "./CampoSenha.jsx";

const erros = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/email-already-in-use": "Este e-mail já tem cadastro. Use Entrar.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/invalid-email": "Digite um e-mail válido.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente de novo.",
};

export default function Login() {
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro(""); setInfo(""); setBusy(true);
    try {
      if (novo) {
        const { user } = await createUserWithEmailAndPassword(auth, email, senha);
        await updateProfile(user, { displayName: nome.trim() });
        await setDoc(doc(db, "users", user.uid), { nome: nome.trim(), email });
      } else {
        await signInWithEmailAndPassword(auth, email, senha);
      }
    } catch (err) {
      setErro(erros[err.code] || "Não foi possível entrar. Tente de novo.");
    } finally { setBusy(false); }
  }

  async function esqueci() {
    setErro(""); setInfo("");
    if (!email.trim()) { setErro("Digite seu e-mail acima para receber o link."); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo("Se este e-mail tiver cadastro, enviamos um link para criar uma nova senha. Olhe também o spam.");
    } catch (err) {
      setErro(erros[err.code] || "Não foi possível enviar o e-mail agora.");
    }
  }

  const campo = "w-full rounded-xl border border-borda bg-painel px-4 py-3 text-base text-tinta placeholder:text-suave";
  return (
    <main className="grid min-h-[100dvh] place-items-center p-4 sm:p-6">
      <form onSubmit={enviar} className="glow w-full max-w-sm space-y-4 rounded-3xl border border-neon/50 bg-fundo p-6 sm:p-8">
        <img src="/logo.png" alt="Ora Finance" className="mx-auto w-48 sm:w-56" />
        <p className="text-center text-suave">Diga o que entrou e o que saiu. A IA organiza.</p>
        {novo && <input className={campo} placeholder="Nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} required />}
        <input className={campo} type="email" placeholder="E-mail" autoComplete="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <CampoSenha className={campo} placeholder="Senha" autoComplete={novo ? "new-password" : "current-password"} value={senha} onChange={(e) => setSenha(e.target.value)} required />
        {!novo && (
          <button type="button" onClick={esqueci} className="text-sm font-medium text-suave underline">Esqueci minha senha</button>
        )}
        {erro && <p role="alert" className="font-medium text-saida">{erro}</p>}
        {info && <p role="status" className="text-sm font-medium text-[#34D399]">{info}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-neon py-3 font-bold text-white disabled:opacity-60">
          {novo ? "Criar conta" : "Entrar"}
        </button>
        <button type="button" onClick={() => { setNovo(!novo); setErro(""); setInfo(""); }} className="w-full py-1 text-sm font-medium text-suave underline">
          {novo ? "Já tenho conta" : "Criar uma conta"}
        </button>
      </form>
    </main>
  );
}
