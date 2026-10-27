// Triagem de ações no método ARCA: filtros padrão, avaliação de cada ação e fonte de dados.

// Filtros iniciais (a pessoa pode alterar qualquer valor na tela). null = filtro desligado.
export const FILTROS_PADRAO = {
  roeMin: 15,          // ROE mínimo (%) em todos os anos analisados
  anosRoe: 5,          // quantos anos de ROE olhar (5 a 10)
  lucroPositivo: true, // lucro positivo em todos os anos
  lucroCagrMin: 0,     // crescimento anual composto mínimo do lucro (%)
  anosListagemMin: 10, // tempo mínimo de listagem na bolsa
  dividaEbitdaMax: 3,  // Dívida líquida / EBITDA máxima (x)
  dyMin: 4,            // dividend yield mínimo (%)
  plMax: null,         // P/L máximo (pilar preço, opcional)
  governanca: "qualquer", // "qualquer" | "nivel2" (Nível 2 ou Novo Mercado) | "novo" (só Novo Mercado)
};

const NIVEL = { "Novo Mercado": 2, "Nível 2": 1, Tradicional: 0 };

const cagr = (arr) => {
  const a = arr[0], b = arr[arr.length - 1];
  if (arr.length < 2 || a <= 0 || b <= 0) return null;
  return (Math.pow(b / a, 1 / (arr.length - 1)) - 1) * 100;
};

// Cada critério devolve { chave, pilar, ok: true | false | null (sem dado), txt }
export function avaliar(a, f) {
  const c = [];
  const n = Number(f.anosRoe) || 5;
  const roe = (a.roe || []).slice(-n);
  if (f.roeMin != null) c.push({ chave: "roe", pilar: "Lucratividade", ok: roe.length < n ? null : roe.every((v) => v >= f.roeMin), txt: roe.length ? `ROE mín. ${Math.min(...roe).toFixed(0)}% em ${roe.length} anos` : "ROE sem dado" });
  const lucro = (a.lucro || []).slice(-n);
  if (f.lucroPositivo) c.push({ chave: "lucro", pilar: "Crescimento", ok: lucro.length < 2 ? null : lucro.every((v) => v > 0), txt: lucro.length ? (lucro.every((v) => v > 0) ? "Lucro positivo todos os anos" : "Teve ano de prejuízo") : "Lucro sem dado" });
  if (f.lucroCagrMin != null) { const g = cagr(lucro); c.push({ chave: "cagr", pilar: "Crescimento", ok: g == null ? null : g >= f.lucroCagrMin, txt: g == null ? "Crescimento sem dado" : `Lucro cresce ${g.toFixed(1)}% ao ano` }); }
  if (f.anosListagemMin != null) c.push({ chave: "listagem", pilar: "Governança", ok: a.listagemAnos == null ? null : a.listagemAnos >= f.anosListagemMin, txt: a.listagemAnos == null ? "Listagem sem dado" : `${a.listagemAnos} anos na bolsa` });
  if (f.dividaEbitdaMax != null) c.push({ chave: "divida", pilar: "Saúde financeira", ok: a.dividaEbitda == null ? null : a.dividaEbitda <= f.dividaEbitdaMax, txt: a.dividaEbitda == null ? "Dívida sem dado" : `Dív. líq./EBITDA ${a.dividaEbitda.toFixed(1)}x` });
  if (f.dyMin != null) c.push({ chave: "dy", pilar: "Preço", ok: a.dy == null ? null : a.dy >= f.dyMin, txt: a.dy == null ? "Dividendos sem dado" : `Dividend yield ${a.dy.toFixed(1)}%` });
  if (f.plMax != null) c.push({ chave: "pl", pilar: "Preço", ok: a.pl == null ? null : a.pl > 0 && a.pl <= f.plMax, txt: a.pl == null ? "P/L sem dado" : `P/L ${a.pl.toFixed(1)}` });
  if (f.governanca !== "qualquer") { const minimo = f.governanca === "novo" ? 2 : 1; c.push({ chave: "gov", pilar: "Governança", ok: a.governanca ? (NIVEL[a.governanca] ?? 0) >= minimo : null, txt: a.governanca || "Governança sem dado" }); }
  const passou = c.filter((x) => x.ok === true).length;
  return { criterios: c, passou, total: c.length, tudo: c.length > 0 && c.every((x) => x.ok === true) };
}

// Lê os filtros salvos neste aparelho (cai nos padrões se faltar algo).
export function lerFiltros() {
  try { return { ...FILTROS_PADRAO, ...JSON.parse(localStorage.getItem("ora-filtros-acoes") || "{}") }; } catch { return { ...FILTROS_PADRAO }; }
}
export function salvarFiltros(f) { try { localStorage.setItem("ora-filtros-acoes", JSON.stringify(f)); } catch { /* sem armazenamento: segue sem salvar */ } }

// ── FONTE DE DADOS ─────────────────────────────────────────────────────────────
// Por enquanto devolve empresas FICTÍCIAS só para testar a tela. Para ligar dados reais da B3,
// troque o corpo desta função por uma chamada à API escolhida (ex.: brapi) e devolva a mesma forma:
// { ticker, nome, setor, preco, pl, dy, dividaEbitda, listagemAnos, governanca, roe: [% por ano], lucro: [R$ mi por ano] }
export const FONTE_DE_EXEMPLO = true;
export async function buscarAcoes() {
  return EXEMPLOS;
}

const EXEMPLOS = [
  { ticker: "EXA3", nome: "Empresa Exemplo A (energia)", setor: "Energia", preco: 32.4, pl: 9.8, dy: 7.2, dividaEbitda: 1.9, listagemAnos: 22, governanca: "Novo Mercado", roe: [19, 21, 18, 20, 22, 21, 20], lucro: [800, 870, 900, 980, 1050, 1100, 1180] },
  { ticker: "EXB3", nome: "Empresa Exemplo B (bancos)", setor: "Financeiro", preco: 28.1, pl: 8.2, dy: 6.1, dividaEbitda: null, listagemAnos: 30, governanca: "Nível 2", roe: [17, 18, 17, 19, 18, 18, 19], lucro: [5200, 5400, 5900, 6100, 6600, 6900, 7300] },
  { ticker: "EXC3", nome: "Empresa Exemplo C (varejo)", setor: "Varejo", preco: 6.2, pl: 31.0, dy: 0.0, dividaEbitda: 4.6, listagemAnos: 12, governanca: "Novo Mercado", roe: [12, 9, 4, -2, 3, 5, 6], lucro: [300, 220, 90, -40, 60, 110, 140] },
  { ticker: "EXD3", nome: "Empresa Exemplo D (saneamento)", setor: "Saneamento", preco: 54.7, pl: 11.4, dy: 4.8, dividaEbitda: 2.7, listagemAnos: 14, governanca: "Novo Mercado", roe: [14, 16, 15, 17, 16, 18, 17], lucro: [1400, 1500, 1450, 1650, 1700, 1850, 1900] },
  { ticker: "EXE3", nome: "Empresa Exemplo E (tecnologia)", setor: "Tecnologia", preco: 14.9, pl: 45.3, dy: 0.0, dividaEbitda: 0.4, listagemAnos: 4, governanca: "Novo Mercado", roe: [10, 13, 16, 18], lucro: [20, 55, 90, 140] },
  { ticker: "EXF4", nome: "Empresa Exemplo F (mineração)", setor: "Mineração", preco: 61.3, pl: 6.1, dy: 11.0, dividaEbitda: 0.8, listagemAnos: 40, governanca: "Tradicional", roe: [28, 31, 22, 17, 24, 19, 21, 23], lucro: [9000, 12000, 8500, 6000, 9800, 7500, 8200, 8900] },
  { ticker: "EXG3", nome: "Empresa Exemplo G (seguros)", setor: "Financeiro", preco: 41.0, pl: 12.9, dy: 5.4, dividaEbitda: null, listagemAnos: 16, governanca: "Novo Mercado", roe: [24, 26, 25, 27, 26, 28, 27], lucro: [1900, 2100, 2300, 2500, 2800, 3100, 3300] },
  { ticker: "EXH3", nome: "Empresa Exemplo H (construção)", setor: "Construção", preco: 9.8, pl: 7.3, dy: 3.1, dividaEbitda: 3.4, listagemAnos: 19, governanca: "Novo Mercado", roe: [8, 11, 14, 12, 15, 13, 16], lucro: [210, 260, 340, 310, 400, 380, 450] },
];
