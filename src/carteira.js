// A carteira (aba Wallet) é a fonte única dos cofrinhos: todo lançamento de investimento
// (aporte, resgate, rendimento) pertence a um item dela. Se o item não existe, ele é cadastrado aqui.
import { doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const clonar = (grupos) => (grupos || []).map((g) => ({ ...g, itens: (g.itens || []).map((i) => ({ ...i })) }));
// Wallet no método ARCA: quatro grupos fixos. Itens de carteiras antigas (tipos criados à mão) são
// distribuídos nesses grupos pelo nome, sem perder o id (os lançamentos continuam ligados a eles).
export const ARCA = [
  { id: "acoes", letra: "A", nome: "Ações e Negócios", cor: "#00C2FF" },
  { id: "real-estate", letra: "R", nome: "Real Estate (FII)", cor: "#FBBF24" },
  { id: "caixa", letra: "C", nome: "Caixa (Renda Fixa)", cor: "#34D399" },
  { id: "internacional", letra: "A", nome: "Ativos Internacionais", cor: "#8B5CF6" },
];
const destinoAntigo = (nome) => {
  const n = norm(nome);
  if (/acoes|negocio|bolsa|dividendo/.test(n)) return "acoes";
  if (/fii|fundo|imobili|real estate|tijolo/.test(n)) return "real-estate";
  if (/exterior|internacional|global|dolar|stock|reit/.test(n)) return "internacional";
  return "caixa";
};
export const ehArca = (grupos) => Array.isArray(grupos) && grupos.length === ARCA.length && ARCA.every((a, k) => grupos[k]?.id === a.id);
export function arcaGrupos(grupos) {
  const saida = ARCA.map((a) => ({ ...a, meta: 0, itens: [] }));
  const por = Object.fromEntries(saida.map((g) => [g.id, g]));
  clonar(grupos).forEach((g) => {
    const alvo = por[g.id] || por[destinoAntigo(g.nome)];
    alvo.itens.push(...g.itens);
    if (!alvo.meta && Number(g.meta)) alvo.meta = Number(g.meta);
  });
  return saida;
}
const grupoCaixa = (grupos) => grupos.find((g) => g.id === "caixa");
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
  const grupos = arcaGrupos(cart.grupos);
  const importados = new Set(cart.importados || []);
  const existentes = grupos.flatMap((g) => g.itens);
  const marcar = cats.filter((c) => c.grupo === "investimento" && c.pai !== "Rendimentos" && !importados.has(norm(c.nome)));
  if (!marcar.length && ehArca(cart.grupos)) return; // nada a importar e a carteira já está no formato ARCA
  const novos = marcar.filter((c) => !achar(existentes, c.nome));
  if (novos.length) {
    const g = grupoCaixa(grupos); // cofrinho novo entra em Caixa (Renda Fixa)
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
  const grupos = arcaGrupos(cart.grupos);
  const dono = Object.fromEntries(cats.filter((c) => c.pai === "Rendimentos").map((c) => [c.nome, c.aporte]));
  const nomeDe = (l) => String((l.rendimento ? dono[l.categoria] || String(l.categoria || "").replace(/^Rendimentos?\s*/i, "") : l.categoria) || "").trim() || "Outros";
  const itens = grupos.flatMap((g) => g.itens);
  let criou = false;
  const ligacoes = orfaos.filter((l) => l.docId).map((l) => {
    const nome = nomeDe(l);
    let it = achar(itens, nome);
    if (!it) { it = { id: novoId(), nome, inicial: 0 }; grupoCaixa(grupos).itens.push(it); itens.push(it); criou = true; }
    return { docId: l.docId, investId: it.id };
  });
  if (criou || !ehArca(cart.grupos)) await setDoc(doc(db, "users", uid, "config", "carteira"), { grupos }, { merge: true });
  for (let k = 0; k < ligacoes.length; k += 400) {
    const lote = writeBatch(db);
    ligacoes.slice(k, k + 400).forEach((x) => lote.update(doc(db, "users", uid, "lancamentos", x.docId), { investId: x.investId }));
    await lote.commit();
  }
  return ligacoes.length;
}
