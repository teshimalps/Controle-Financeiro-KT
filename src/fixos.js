// Gastos e entradas fixos: cada fixo ativo vira um lançamento por mês, sozinho.
// O lançamento tem id fixo (fixo_<id>_<AAAA-MM>), então nunca duplica; se você apagar um deles,
// ele não volta (o mês fica registrado em config/fixosGerados).
import { arrayUnion, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { hoje, paleta, slug } from "./util.js";

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const mesAtual = () => hoje().slice(0, 7);

// dia válido para o mês (31 em fevereiro vira 28/29)
export const diaDoMes = (mes, dia) => {
  const ultimo = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  return String(Math.min(Math.max(Math.floor(Number(dia)) || 1, 1), ultimo)).padStart(2, "0");
};

const mesesEntre = (de, ate) => {
  const r = [];
  let [y, m] = de.split("-").map(Number);
  const [y2, m2] = ate.split("-").map(Number);
  while ((y < y2 || (y === y2 && m <= m2)) && r.length < 36) {
    r.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return r;
};

const padrao = (f) => (f.tipo === "entrada" ? "Entradas Fixas" : "Gastos Fixos");

async function rodar(uid, lista) {
  const ativos = lista.filter((f) => f.ativo !== false && f.nome && Number(f.valor) > 0);
  if (!ativos.length) return;
  const agora = mesAtual();
  const ref = doc(db, "users", uid, "config", "fixosGerados");
  const ja = new Set((await getDoc(ref)).data()?.chaves || []);
  const novos = [];
  for (const f of ativos) for (const mes of mesesEntre(f.inicio || agora, agora)) if (!ja.has(`${f.id}|${mes}`)) novos.push({ f, mes, k: `${f.id}|${mes}` });
  if (!novos.length) return;

  const cats = (await getDocs(collection(db, "users", uid, "categorias"))).docs.map((d) => d.data());
  const lote = writeBatch(db);
  const criadas = new Set();
  for (const { f, mes } of novos.slice(0, 400)) {
    const nomeCat = String(f.categoria || "").trim() || padrao(f);
    const chave = norm(nomeCat);
    if (!cats.some((c) => norm(c.nome) === chave) && !criadas.has(chave)) {
      criadas.add(chave);
      lote.set(doc(db, "users", uid, "categorias", slug(nomeCat)), { nome: nomeCat, grupo: f.tipo === "entrada" ? "entrada" : "gasto", pai: "", cor: paleta[(cats.length + criadas.size) % paleta.length] });
    }
    lote.set(doc(db, "users", uid, "lancamentos", `fixo_${f.id}_${mes}`), {
      tipo: f.tipo === "entrada" ? "entrada" : "saida", valor: Number(f.valor), data: `${mes}-${diaDoMes(mes, f.dia)}`,
      categoria: nomeCat, descricao: f.nome, pagamento: f.tipo === "entrada" ? "" : f.pagamento || "", fixo: true, fixoId: f.id, criadoEm: serverTimestamp(),
    });
  }
  lote.set(ref, { chaves: arrayUnion(...novos.slice(0, 400).map((n) => n.k)) }, { merge: true });
  await lote.commit();
}

// Uma geração por vez, para não duplicar trabalho quando o app abre em dois lugares
let fila = Promise.resolve();
export const gerarFixos = (uid, lista) => (fila = fila.then(() => rodar(uid, lista)).catch(console.error));

// Mudou o valor/dia/categoria de um fixo: atualiza também o lançamento deste mês (os meses passados ficam como estão)
export async function atualizarMes(uid, f) {
  if (f.ativo === false) return;
  const mes = mesAtual();
  try {
    await updateDoc(doc(db, "users", uid, "lancamentos", `fixo_${f.id}_${mes}`), {
      valor: Number(f.valor) || 0, descricao: f.nome, categoria: String(f.categoria || "").trim() || padrao(f),
      pagamento: f.tipo === "entrada" ? "" : f.pagamento || "", data: `${mes}-${diaDoMes(mes, f.dia)}`,
    });
  } catch { /* ainda não existe neste mês ou foi apagado: tudo bem */ }
}
