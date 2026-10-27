import { deleteField, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

// Histórico próprio de preços: a cada dia útil o app guarda o preço das ações que viu, e os gráficos se formam com o tempo.
const ref = (uid) => doc(db, "users", uid, "config", "historicoPrecos");
const DIAS_GUARDADOS = 45;
export const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ultimo = {}; // por origem, evita gravar mais de uma vez a cada 30 minutos

export async function registrarPrecos(uid, lista, origem) {
  const d = new Date();
  if (!uid || d.getDay() === 0 || d.getDay() === 6) return; // fim de semana a bolsa fechada: o preço é o de sexta
  if (Date.now() - (ultimo[origem] || 0) < 30 * 60 * 1000) return;
  ultimo[origem] = Date.now();
  const precos = {};
  for (const a of lista || []) if (Number.isFinite(a.preco)) precos[a.ticker] = a.preco;
  try { await setDoc(ref(uid), { dias: { [hoje()]: precos } }, { merge: true }); } catch { ultimo[origem] = 0; }
}

// Devolve os dias guardados em ordem [{ dia, precos }] e apaga os mais antigos
export async function lerHistorico(uid) {
  const dias = (await getDoc(ref(uid))).data()?.dias || {};
  const chaves = Object.keys(dias).sort();
  const velhas = chaves.slice(0, -DIAS_GUARDADOS);
  if (velhas.length) updateDoc(ref(uid), Object.fromEntries(velhas.map((k) => [`dias.${k}`, deleteField()]))).catch(() => {});
  return chaves.slice(-DIAS_GUARDADOS).map((k) => ({ dia: k, precos: dias[k] }));
}

// Série de um papel: dias anteriores a hoje + o preço atual
export function serieDe(hist, ticker, precoAtual) {
  const s = (hist || []).filter((h) => h.dia !== hoje()).map((h) => h.precos[ticker]).filter(Number.isFinite);
  return Number.isFinite(precoAtual) ? [...s, precoAtual] : s;
}
