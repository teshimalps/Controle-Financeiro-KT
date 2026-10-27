// A carteira (aba Investimentos) é a fonte única dos cofrinhos: todo lançamento de investimento
// (aporte, resgate, rendimento) pertence a um item dela. Se o item não existe, ele é cadastrado aqui.
import { doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const clonar = (grupos) => (grupos || []).map((g) => ({ ...g, itens: (g.itens || []).map((i) => ({ ...i })) }));
const grupoCofrinhos = (grupos) => {
  let g = grupos.find((x) => norm(x.nome) === "cofrinhos");
  if (!g) { g = { id: novoId(), nome: "Cofrinhos", cor: "#8B5CF6", meta: 0, itens: [] }; grupos.push(g); }
  return g;
};
// Acha o item da carteira pelo nome: igual, ou um contido no outro ("MP" e "Cofrinho MP"), como o Chat faz
const achar = (itens, nome) => {
  const n = norm(nome);
  if (!n) return null;
  return itens.find((i) => norm(i.nome) === n) || itens.find((i) => { const e = norm(i.nome); return e.length > 2 && n.length > 2 && (e.includes(n) || n.includes(e)); }) || null;
};
let rodando = false;

// Traz para a carteira os cofrinhos que você já tinha como categoria de investimento.
// Cada nome é importado uma única vez: se você apagar um item da carteira, ele não volta.
export async function sincronizar(uid, cart, cats) {
  if (rodando) return;
  const grupos = clonar(cart.grupos);
  const importados = new Set(cart.importados || []);
  const existentes = grupos.flatMap((g) => g.itens);
  const marcar = cats.filter((c) => c.grupo === "investimento" && c.pai !== "Rendimentos" && !importados.has(norm(c.nome)));
  if (!marcar.length) return;
  const novos = marcar.filter((c) => !achar(existentes, c.nome));
  if (novos.length) {
    const g = grupoCofrinhos(grupos);
    novos.forEach((c) => g.itens.push({ id: novoId(), nome: c.nome, inicial: 0 }));
  }
  rodando = true;
  try {
    await setDoc(doc(db, "users", uid, "config", "carteira"), { grupos, importados: [...importados, ...marcar.map((c) => norm(c.nome))] }, { merge: true });
  } catch (e) { console.error(e); } finally { rodando = false; }
}

// Lançamentos de investimento que não pertencem a nenhum item da carteira (sobra de antes da ligação):
// cadastra o investimento que faltar e liga cada lançamento a ele. Não apaga nem altera valores.
// `orfaos` vêm com `docId` (id do documento do lançamento). Devolve quantos lançamentos foram ligados.
export async function vincularOrfaos(uid, cart, orfaos, cats) {
  const grupos = clonar(cart.grupos);
  const dono = Object.fromEntries(cats.filter((c) => c.pai === "Rendimentos").map((c) => [c.nome, c.aporte]));
  const nomeDe = (l) => String((l.rendimento ? dono[l.categoria] || String(l.categoria || "").replace(/^Rendimentos?\s*/i, "") : l.categoria) || "").trim() || "Outros";
  const itens = grupos.flatMap((g) => g.itens);
  let criou = false;
  const ligacoes = orfaos.filter((l) => l.docId).map((l) => {
    const nome = nomeDe(l);
    let it = achar(itens, nome);
    if (!it) { it = { id: novoId(), nome, inicial: 0 }; grupoCofrinhos(grupos).itens.push(it); itens.push(it); criou = true; }
    return { docId: l.docId, investId: it.id };
  });
  if (criou) await setDoc(doc(db, "users", uid, "config", "carteira"), { grupos }, { merge: true });
  for (let k = 0; k < ligacoes.length; k += 400) {
    const lote = writeBatch(db);
    ligacoes.slice(k, k + 400).forEach((x) => lote.update(doc(db, "users", uid, "lancamentos", x.docId), { investId: x.investId }));
    await lote.commit();
  }
  return ligacoes.length;
}
