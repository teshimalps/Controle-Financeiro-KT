// Modo privacidade: com o olho fechado, todo valor em dinheiro aparece como "R$ •••••".
// O App liga/desliga isso (começa sempre fechado) e re-renderiza as telas.
let oculto = true;
export const setOculto = (v) => { oculto = !!v; };
export const estaOculto = () => oculto;
export const MASCARA = "R$ •••••";
// brl: para mostrar na tela (respeita o olho). brlReal: valor de verdade, para texto que será salvo.
export const brlReal = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (v) => (oculto ? MASCARA : brlReal(v));
// Esconde valores "R$ 1.234,56" dentro de um texto já pronto (ex.: mensagens antigas do chat)
export const mascarar = (t) => (oculto ? String(t ?? "").replace(/R\$[\s ]*-?[\d.]+,\d{2}/g, MASCARA) : t);
// Números soltos de eixos de gráfico (sem "R$")
export const eixoValor = (v) => (oculto ? "•••" : v);
// Cores dos gráficos: entrada = azul escuro, saída = azul claro
export const cor = { entrada: "#1E3A8A", saida: "#0057FF", investimento: "#8B5CF6" };
// Versões mais claras, só para textos (leem melhor no fundo escuro)
export const corTexto = { entrada: "#7C9DFF", saida: "#4D8DFF", investimento: "#B99BFF" };
export const paleta = ["#0057FF", "#00C2FF", "#8B5CF6", "#22D3EE", "#F472B6", "#FBBF24", "#34D399", "#FB7185"];
export const nomeTipo = { entrada: "Entrada", saida: "Saída", investimento: "Investimento" };
export const hoje = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso local
export const slug = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Escurece uma cor #rrggbb (f = 0.5 deixa na metade do brilho)
export const escurecer = (hex, f = 0.5) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(v * f);
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
};

const normU = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Quanto já foi guardado numa meta por valor: valor inicial + o que foi adicionado na meta
// (+ investimentos antigos marcados com a meta). Adicionar na meta NÃO vira lançamento.
export const guardadoDe = (m, inv = []) =>
  (Number(m.inicial) || 0) + (m.aportes || []).reduce((x, a) => x + (Number(a.valor) || 0), 0) + inv.filter((i) => i.metaId === m.id).reduce((x, i) => x + i.valor, 0);

// O lançamento de investimento pertence a este item da carteira? (pelo id, ou pelo nome em lançamentos antigos)
export const mesmoItem = (l, item, donoRend = {}) =>
  l.investId ? l.investId === item.id : normU(l.categoria) === normU(item.nome) || (!!l.rendimento && normU(donoRend[l.categoria]) === normU(item.nome));

// Saldo de um item da carteira = valor inicial + aportes − resgates + rendimentos
export const saldoItem = (item, movs, donoRend = {}) =>
  (Number(item.inicial ?? item.valor) || 0) + movs.filter((l) => mesmoItem(l, item, donoRend)).reduce((x, l) => x + l.valor, 0);

// Texto do prazo de uma meta: "Faltam 5 meses · ≈ R$ 1.200,00 por mês"
export const restante = (data, falta) => {
  if (!data || falta <= 0) return "";
  const d = Math.round((new Date(`${data}T00:00:00`) - new Date(`${hoje()}T00:00:00`)) / 864e5);
  if (d < 0) return "Prazo vencido";
  if (d === 0) return "O prazo é hoje";
  const meses = d / 30.44;
  const tempo = d < 60 ? `${d} dia${d > 1 ? "s" : ""}` : meses < 24 ? `${Math.round(meses)} meses` : `${(meses / 12).toFixed(1).replace(".", ",")} anos`;
  return `Faltam ${tempo}${meses >= 1 ? ` · ≈ ${brl(falta / meses)} por mês` : ""}`;
};
