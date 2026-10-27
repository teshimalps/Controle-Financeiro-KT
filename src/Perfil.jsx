import { useEffect, useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Avatar from "./Avatar.jsx";
import CampoSenha from "./CampoSenha.jsx";
import ZerarInvestimentos from "./ZerarInvestimentos.jsx";

const campo = "w-full rounded-xl border border-borda bg-[#141414] px-4 py-3 text-tinta";
const erroSenha = {
  "auth/invalid-credential": "A senha atual está incorreta.",
  "auth/wrong-password": "A senha atual está incorreta.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco.",
  "auth/weak-password": "A nova senha precisa ter pelo menos 6 caracteres.",
};

// Recorta no centro, deixa quadrada 256x256 e guarda como texto (não precisa de Storage)
function redimensionar(file, lado = 256) {
  return new Promise((ok, falha) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement("canvas");
      c.width = c.height = lado;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, lado, lado);
      URL.revokeObjectURL(url);
      ok(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => falha(new Error("imagem"));
    img.src = url;
  });
}

export default function Perfil({ user, perfil }) {
  const uid = user.uid;
  const [nome, setNome] = useState(perfil.nome || user.displayName || "");
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [msgFoto, setMsgFoto] = useState("");
  const [msgNome, setMsgNome] = useState("");
  const [msgSenha, setMsgSenha] = useState("");
  const painel = "painel3d space-y-3 rounded-2xl p-4";
  const [convite, setConvite] = useState(!!window.__instalar);
  useEffect(() => {
    const f = () => setConvite(true);
    window.addEventListener("instalar-disponivel", f);
    return () => window.removeEventListener("instalar-disponivel", f);
  }, []);
  const instalado = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;

  async function trocarFoto(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      await setDoc(doc(db, "users", uid), { foto: await redimensionar(f) }, { merge: true });
      setMsgFoto("Foto atualizada.");
    } catch { setMsgFoto("Não consegui usar essa imagem."); }
  }
  async function salvarNome(e) {
    e.preventDefault();
    const n = nome.trim();
    if (!n) return;
    await updateProfile(user, { displayName: n });
    await setDoc(doc(db, "users", uid), { nome: n }, { merge: true });
    setMsgNome("Nome salvo.");
  }
  async function trocarSenha(e) {
    e.preventDefault();
    setMsgSenha("");
    if (nova.length < 6) { setMsgSenha("A nova senha precisa ter pelo menos 6 caracteres."); return; }
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, atual));
      await updatePassword(user, nova);
      setAtual(""); setNova("");
      setMsgSenha("Senha alterada.");
    } catch (err) { setMsgSenha(erroSenha[err.code] || "Não foi possível alterar a senha."); }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-extrabold">Perfil</h1>
      <section className={painel}>
        <div className="flex items-center gap-4">
          <Avatar foto={perfil.foto} nome={nome} tam={88} />
          <div className="space-y-2">
            <label className="btn-vidro inline-block cursor-pointer text-sm">
              Trocar foto
              <input type="file" accept="image/*" onChange={trocarFoto} className="sr-only" />
            </label>
            {perfil.foto && (
              <button onClick={() => setDoc(doc(db, "users", uid), { foto: "" }, { merge: true })} className="block text-sm text-suave underline">Remover foto</button>
            )}
          </div>
        </div>
        {msgFoto && <p role="status" className="text-sm text-suave">{msgFoto}</p>}
      </section>
      <form onSubmit={salvarNome} className={painel}>
        <h2 className="font-bold">Dados</h2>
        <input className={campo} value={nome} onChange={(e) => { setNome(e.target.value); setMsgNome(""); }} placeholder="Nome" autoComplete="name" />
        <p className="text-sm text-suave">E-mail: {user.email}</p>
        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-neon px-5 py-2.5 font-bold text-white">Salvar nome</button>
          {msgNome && <span role="status" className="text-sm text-suave">{msgNome}</span>}
        </div>
      </form>
      <form onSubmit={trocarSenha} className={painel}>
        <h2 className="font-bold">Alterar senha</h2>
        <CampoSenha className={campo} placeholder="Senha atual" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} required />
        <CampoSenha className={campo} placeholder="Nova senha (mínimo 6 caracteres)" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} required />
        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-neon px-5 py-2.5 font-bold text-white">Alterar senha</button>
          {msgSenha && <span role="status" className="text-sm text-suave">{msgSenha}</span>}
        </div>
      </form>
      {!instalado && (
        <section className={painel}>
          <h2 className="font-bold">Instalar o app</h2>
          {convite ? (
            <button onClick={() => window.__instalar?.prompt()} className="rounded-xl bg-neon px-5 py-2.5 font-bold text-white">Instalar Ora Finance</button>
          ) : (
            <p className="text-sm text-suave">No iPhone: abra no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. No Android: no Chrome, abra o menu ⋮ e toque em Instalar app.</p>
          )}
        </section>
      )}
      <ZerarInvestimentos uid={uid} painel={painel} />
      <button onClick={() => signOut(auth)} className="btn-vidro w-full">Sair da conta</button>
    </div>
  );
}
