// Leitor local de lançamentos simples: entende valor, tipo, categoria, forma de pagamento e meta em
// QUALQUER ordem, sem chamar a IA (resposta instantânea). Se tiver qualquer dúvida, devolve null
// e o chat usa a IA.
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const palavras = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
const GEN = new Set(["cartao", "credito", "debito", "no", "na", "nos", "nas", "em", "de", "do", "da", "dos", "das", "para", "pra", "com", "pelo", "pela", "via", "um", "uma", "o", "a", "e", "cofrinho", "invest", "investimento"]);
const KW = {
  rendimento: ["rendimento", "rendimentos", "rend", "rendeu", "rendi", "juros", "lucro"],
  resgate: ["resgatei", "resgate", "retirei", "retirada", "tirei", "saquei", "saque"],
  investimento: ["investi", "investido", "investimentos", "aportei", "aporte", "guardei", "apliquei", "aplicado"],
  saida: ["gastei", "paguei", "comprei", "gasto", "saiu", "pago", "gastou"],
  entrada: ["recebi", "ganhei", "entrou", "recebido", "recebimento"],
};
const CONVERSA = new Set(["oi", "ola", "opa", "bom", "boa", "tudo", "ora", "obrigado", "obrigada", "valeu", "quanto", "como", "qual", "quais", "me", "pode", "crie", "criar", "cria", "quero", "preciso", "ajuda", "help"]);
const REJEITA = new Set(["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez", "anteontem", "semana", "mes", "ano", "dia", "categoria", "categorias", "forma", "pagamento", "fixo", "fixa", "fixos", "fixas", "altera", "alterar", "altere", "muda", "mudar", "mude", "desativa", "desativar", "desative", "ativa", "ativar", "reativa"]);
const RE_NUM = /^([+-]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2}))?([+-]?)$/;

const ontem = (h) => {
  const d = new Date(`${h}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function lerLocal(texto, cats, metas, hoje) {
  if (!texto || texto.length > 90 || texto.includes("?")) return null;
  const toks = texto.trim().replace(/r\$\s*/gi, "").split(/\s+/)
    .map((b) => { const raw = b.replace(/^[,;:!()]+|[,;:!()]+$/g, ""); return { raw, n: norm(raw).replace(/[^a-z0-9]/g, "") }; })
    .filter((t) => t.n);
  if (toks.length < 2 || toks.length > 14) return null;
  const ns = toks.map((t) => t.n);
  if (CONVERSA.has(ns[0]) || ns.some((x) => REJEITA.has(x))) return null;

  // valor: exatamente um número na frase, em qualquer posição
  const nums = toks.map((t, k) => ({ k, m: RE_NUM.exec(t.raw) })).filter((x) => x.m);
  if (nums.length !== 1) return null;
  const { k: kNum, m } = nums[0];
  const sinal = m[1] || m[4];
  const num = Number(m[2].replace(/\./g, "") + (m[3] ? `.${m[3]}` : ""));
  if (!num) return null;
  const usados = new Set([kNum]);

  const tem = (l) => ns.some((x, k) => !usados.has(k) && l.includes(x));
  const marcar = (l) => ns.forEach((x, k) => { if (l.includes(x)) usados.add(k); });
  const kRend = tem(KW.rendimento), kRes = tem(KW.resgate), kInv = tem(KW.investimento), kSai = tem(KW.saida), kEnt = tem(KW.entrada);
  Object.values(KW).forEach(marcar);
  if (kRend) marcar(["men", "mensal"]);
  if (kSai && kEnt) return null;

  let tipo = kRend ? "rendimento" : kRes ? "resgate" : kInv ? "investimento" : kSai ? "saida" : kEnt ? "entrada" : sinal === "+" ? "entrada" : sinal === "-" ? "saida" : null;
  if (!tipo) return null;
  const ehInv = tipo === "rendimento" || tipo === "resgate" || tipo === "investimento";

  const aportes = cats.filter((c) => c.grupo === "investimento" && c.pai !== "Rendimentos");
  const gasto = cats.filter((c) => c.grupo === "gasto"), entrada = cats.filter((c) => c.grupo === "entrada"), pagtos = cats.filter((c) => c.grupo === "pagamento");

  // nome completo de uma categoria/forma/meta dentro da frase
  const completo = (lista) => {
    let melhor = null;
    for (const c of lista) {
      const nt = palavras(c.nome);
      if (!nt.length) continue;
      const idx = nt.map((w) => ns.findIndex((x, k) => x === w && !usados.has(k)));
      if (idx.every((k) => k >= 0) && new Set(idx).size === idx.length && (!melhor || nt.length > melhor.nt.length)) melhor = { c, idx, nt };
    }
    return melhor;
  };
  // apelido: uma palavra da frase que aparece em UMA só opção da lista ("nu" = Cofrinho Invest NU)
  const alias = (lista) => {
    for (let k = 0; k < ns.length; k++) {
      const x = ns[k];
      if (usados.has(k) || x.length < 2 || GEN.has(x) || /^\d/.test(x)) continue;
      const achados = lista.filter((c) => palavras(c.nome).includes(x));
      if (achados.length === 1) return { c: achados[0], k };
      if (achados.length > 1) return "amb";
    }
    return null;
  };

  // data
  let data = hoje;
  const kOntem = ns.findIndex((x, k) => x === "ontem" && !usados.has(k));
  if (kOntem >= 0) { data = ontem(hoje); usados.add(kOntem); }
  const kHoje = ns.findIndex((x, k) => x === "hoje" && !usados.has(k));
  if (kHoje >= 0) usados.add(kHoje);

  // forma de pagamento
  const cartao = tem(["cartao", "credito", "debito"]);
  let pagamento = "";
  const p = completo(pagtos);
  if (p) { pagamento = p.c.nome; p.idx.forEach((k) => usados.add(k)); }
  else {
    const a = alias(pagtos);
    if (a === "amb") return null;
    if (a && cartao) { pagamento = a.c.nome; usados.add(a.k); }
    else if (a) return null; // "pai" pode ser descrição ou cartão: deixa a IA decidir
    else {
      const kPix = ns.findIndex((x, k) => x === "pix" && !usados.has(k));
      const kDin = ns.findIndex((x, k) => x === "dinheiro" && !usados.has(k));
      if (kPix >= 0) { pagamento = "Pix"; usados.add(kPix); }
      else if (kDin >= 0) { pagamento = "Dinheiro"; usados.add(kDin); }
    }
  }
  if (cartao) {
    if (!pagamento) pagamento = ns.includes("credito") ? "Crédito" : ns.includes("debito") ? "Débito" : "Cartão";
    marcar(["cartao", "credito", "debito"]);
  }

  // categoria
  let categoria = "";
  const c = completo(tipo === "saida" ? gasto : tipo === "entrada" ? entrada : aportes);
  if (c) { categoria = c.c.nome; c.idx.forEach((k) => usados.add(k)); }
  else if (ehInv) {
    const a = alias(aportes);
    if (a === "amb") return null;
    if (a) { categoria = a.c.nome; usados.add(a.k); }
    else if (/cofrinho/.test(norm(texto))) { // disse "cofrinho" sem apelido: com 1 só cofrinho é ele; com vários, a IA decide
      if (aportes.length === 1) categoria = aportes[0].nome;
      else if (aportes.length > 1) return null;
    }
  }
  if (ehInv) marcar(["cofrinho", "invest", "investimento"]);
  if (tipo === "resgate" && !categoria && !/cofrinho|investiment/.test(norm(texto))) return null;

  // meta por valor ("na meta carro")
  let meta = "";
  const kMeta = ns.findIndex((x, k) => x === "meta" && !usados.has(k));
  if (kMeta >= 0) {
    if (!metas.length || tipo !== "investimento") return null;
    usados.add(kMeta);
    const mt = completo(metas);
    if (!mt) return null;
    meta = mt.c.nome;
    mt.idx.forEach((k) => usados.add(k));
  }

  // sobrou alguma palavra parecida com categoria/forma já cadastrada? deixa a IA decidir
  const conhecidas = new Set([...gasto, ...entrada, ...pagtos].flatMap((x) => palavras(x.nome)));
  if (ns.some((x, k) => !usados.has(k) && x.length >= 3 && !GEN.has(x) && conhecidas.has(x))) return null;

  // o que sobrar é a descrição
  const resto = toks.filter((_, k) => !usados.has(k));
  while (resto.length && GEN.has(resto[0].n)) resto.shift();
  while (resto.length && GEN.has(resto[resto.length - 1].n)) resto.pop();

  return {
    acao: "lancar",
    tipo: tipo === "resgate" ? "investimento" : tipo,
    valor: tipo === "resgate" ? -num : num,
    data, categoria, descricao: resto.map((t) => t.raw).join(" "), pagamento, mesCitado: false, meta,
  };
}
