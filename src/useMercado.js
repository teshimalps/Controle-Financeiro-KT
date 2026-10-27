import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { carregarLista } from "./mercado.js";

// Token da brapi guardado só na conta da pessoa (users/{uid}/config/mercado). Só busca a lista quando `ativo`.
export default function useMercado(uid, ativo) {
  const [token, setToken] = useState(null); // null = lendo, "" = sem token
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "mercado"), (s) => setToken(String(s.data()?.brapiToken || "").trim())), [uid]);

  const carregar = useCallback(async (forcar = false) => {
    if (!token) return;
    setCarregando(true); setErro("");
    try { setLista(await carregarLista(token, forcar)); }
    catch (e) { setErro(e.message || "Não consegui carregar as cotações."); }
    finally { setCarregando(false); }
  }, [token]);

  useEffect(() => { if (ativo && token) carregar(false); }, [ativo, token, carregar]);

  const mapa = useMemo(() => new Map((lista || []).map((a) => [a.ticker, a])), [lista]);
  const salvarToken = (t) => setDoc(doc(db, "users", uid, "config", "mercado"), { brapiToken: String(t).trim() }, { merge: true });
  return { token, lista, mapa, erro, carregando, carregar, salvarToken };
}
