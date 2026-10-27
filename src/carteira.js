// Traz para a carteira (aba Investimentos) os cofrinhos que você já tinha como categoria de investimento.
// Cada nome é importado uma única vez: se você apagar um item da carteira, ele não volta.
import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let rodando = false;

export async function sincronizar(uid, cart, cats) {
  if (rodando) return;
  const grupos = (cart.grupos || []).map((g) => ({ ...g, itens: [...(g.itens || [])] }));
  const importados = new Set(cart.importados || []);
  const existentes = new Set(grupos.flatMap((g) => g.itens.map((i) => norm(i.nome))));
  const marcar = cats.filter((c) => c.grupo === "investimento" && c.pai !== "Rendimentos" && !importados.has(norm(c.nome)));
  if (!marcar.length) return;
  const novos = marcar.filter((c) => !existentes.has(norm(c.nome)));
  if (novos.length) {
    let g = grupos.find((x) => norm(x.nome) === "cofrinhos");
    if (!g) { g = { id: novoId(), nome: "Cofrinhos", cor: "#8B5CF6", meta: 0, itens: [] }; grupos.push(g); }
    novos.forEach((c) => g.itens.push({ id: novoId(), nome: c.nome, inicial: 0 }));
  }
  rodando = true;
  try {
    await setDoc(doc(db, "users", uid, "config", "carteira"), { grupos, importados: [...importados, ...marcar.map((c) => norm(c.nome))] }, { merge: true });
  } catch (e) { console.error(e); } finally { rodando = false; }
}
