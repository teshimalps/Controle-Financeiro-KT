import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { auth, db, modelos } from "./firebase";
import { brl, corTexto, hoje, nomeTipo, paleta, saldoItem, slug } from "./util.js";
import { lerLocal } from "./lerLocal.js";
import { atualizarMes } from "./fixos.js";

// Tenta os modelos em sequência, mas sem esperar parado: se um demorar 7 s, o próximo já começa
// junto, e vale o primeiro que responder. Lembra qual funcionou por último.
let preferido = 0;
function gerar(prompt) {
  return new Promise((ok, no) => {
    const ordem = modelos.map((_, k) => (preferido + k) % modelos.length);
    let proximo = 0, falhas = 0, fim = false, espera, geral;
    const parar = () => { fim = true; clearTimeout(espera); clearTimeout(geral); };
    geral = setTimeout(() => { if (!fim) { parar(); no(new Error("tempo esgotado")); } }, 35000);
    const iniciar = () => {
      clearTimeout(espera);
      if (fim || proximo >= ordem.length) return;
      const i = ordem[proximo++];
      modelos[i].generateContent(prompt)
        .then((r) => { if (!fim) { parar(); preferido = i; ok(r.response.text()); } })
        .catch((e) => {
          console.warn(`[Ora] modelo ${i} falhou:`, e.message);
          if (fim) return;
          if (++falhas >= ordem.length) { parar(); no(e); } else iniciar();
        });
      espera = setTimeout(iniciar, 7000);
    };
    iniciar();
  });
}

const RE_REND = /\b(rendimentos?|rend|rendeu|rendi|juros|lucro)\b/;
const RE_RESG = /\b(resgatei|resgate|resgatado|retirei|retirada|tirei|saquei|saque)\b/;
const RE_INV = /\b(investi|investid[oa]s?|investimentos?|guardei|aportei|aportes?|apliquei|aplicad[oa]s?)\b/;
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
// Acha uma categoria/forma de pagamento da lista (sem ligar para acento ou maiúscula)
function acharCat(lista, nome, grupos, exato) {
  const n = norm(nome);
  if (!n) return null;
  const pool = lista.filter((c) => grupos.includes(c.grupo));
  return pool.find((c) => norm(c.nome) === n) || (exato ? null : pool.find((c) => norm(c.nome).includes(n) || n.includes(norm(c.nome)))) || null;
}

const proximoMes = (d) => {
  let [y, m] = d.split("-").map(Number);
  if (++m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, "0")}-01`;
};

const montar = (texto, cats, hist, metas = [], fixos = [], carteira = []) => `Você é a Ora, assistente financeira simpática de um app de controle financeiro. Você conversa de forma natural e curta, em português do Brasil, e registra lançamentos quando a pessoa os descreve.
Hoje é ${hoje()} (${new Date().toLocaleDateString("pt-BR", { weekday: "long" })}).
Categorias e formas de pagamento cadastradas:
${cats.length ? cats.map((c) => `- ${c.nome} (${c.grupo}${c.pai ? ", " + c.pai : ""})`).join("\n") : "(nenhuma)"}

{"acao":"responder","texto":texto}
{"acao":"fixo_criar","tipo":"entrada"|"saida","nome":texto,"valor":numero,"categoria":texto,"pagamento":texto,"dia":numero}
{"acao":"fixo_alterar","nome":texto,"novoNome":texto,"valor":numero,"categoria":texto,"pagamento":texto,"dia":numero}
{"acao":"fixo_desativar","nome":texto}
{"acao":"fixo_ativar","nome":texto}

A mensagem pode ter VÁRIOS itens (separados por vírgula, "e", ponto ou linha). Responda SOMENTE um array JSON de ações:
{"acao":"lancar","tipo":"entrada"|"saida"|"investimento"|"rendimento","valor":número,"data":"AAAA-MM-DD","categoria":texto,"descricao":texto,"pagamento":texto,"mesCitado":true|false,"meta":texto}
{"acao":"criar_categoria","nome":texto,"grupo":"gasto"|"entrada"|"investimento"|"pagamento","pai":"Débito"|"Crédito"|""}

Palavras (ignore maiúsculas e minúsculas): saída = gastei, paguei, comprei, "-"; entrada = ganhei, recebi, entrou, "+"; investimento = investi, guardei, aportei, apliquei.
"+" ou "-" antes do valor indicam entrada ou saída, exceto com verbo de investimento ("investi +100" é investimento).
Datas: sem data = hoje. "ontem", "dia 22" (mês e ano atuais), "dia 5 de março" (ano atual). Se citar só mês e ano ("janeiro de 2026", "jan/2026"), use o dia 01 desse mês. mesCitado: true SOMENTE se a pessoa citou o NOME ou número de um mês/ano para aquele item (ex.: "em julho", "jan/2026", "dia 5 de março"). Para "hoje", "ontem", "dia 22", "esse mês" ou sem data, use false. Mês ou data citados no começo valem para os itens seguintes, salvo se tiverem data própria.
categoria: os nomes das categorias aparecem NO MEIO da frase, sem aspas e em qualquer caixa (ex.: "-50 no pix, presente para mel" = saída de 50, pagamento Pix, categoria Para Mel). Procure na frase o nome de alguma categoria da lista (ou uma parte característica, apelido, sigla ou erro de digitação: "mel" = "Para Mel", "mp" ou "mercado pago" = a que tem MP, "nu" ou "nubank" = a que tem NU) e use o NOME EXATO da lista, do grupo certo (entrada, gasto ou investimento). Nunca misture categorias que diferem por uma palavra-chave (MP não é NU). Só use "Outros" se nada combinar.
descricao: curta, sem repetir o nome da categoria nem a forma de pagamento (ex.: "presente").
pagamento: o NOME EXATO da lista de formas de pagamento (ex.: "cartão do meu pai" = "Crédito Pai") ou o que foi dito (pix, dinheiro), ou "".
Se pedir para criar categoria ou forma de pagamento, use criar_categoria.
ORDEM LIVRE (tem prioridade sobre as regras acima): os elementos da frase podem vir em QUALQUER ordem e posição (começo, meio ou fim). Para cada lançamento: 1) ache o valor: um número, com ou sem sinal, em qualquer posição ("-500", "+200", "R$ 50"); 2) ache a forma de pagamento: pix, dinheiro, débito, crédito, "cartão" (= crédito) ou nome, apelido ou sigla de uma forma de pagamento da lista (ex.: "c6" = a forma que tem C6); 3) ache a categoria: nome, parte, apelido ou sigla de uma categoria da lista, mesmo com a palavra "para" junto ("para mel" = "Para Mel"); 4) o que SOBRAR na frase é a descrição, o nome do lançamento. Exemplos, existindo Para Mel e Crédito C6: "-500 mae no pix" = saída 500, descrição "mae", pagamento Pix; "pix mae -500" = o mesmo; "-230 buque flor para mel cartao c6" = saída 230, descrição "buque flor", categoria Para Mel, pagamento Crédito C6.
CATEGORIA PADRÃO: use SOMENTE categorias que estão na lista. Se a frase não citar nenhuma categoria da lista, use a categoria "Despesa Eventual" (saída) ou "Outros" (entrada e investimento).
INVESTIMENTOS E RENDIMENTOS (prioridade sobre o que estiver acima): tipo "investimento" quando a pessoa disser investi, investido, investimento, guardei, aportei, aporte, apliquei, em qualquer posição da frase e mesmo com "+" antes do valor; nunca é entrada nem saída. A categoria é o investimento (aportado) citado da lista, aceitando apelido ou sigla ("mp" = o que tem MP, "nu" = o que tem NU); se nenhum for citado, "Outros". Tipo "rendimento" quando disser rendimento, rendimento mensal, rend men, rend, rendeu, rendi, juros ou lucro; nunca é entrada. A categoria é o investimento (aportado) citado, também por apelido ou sigla: "rendeu 10 mp" = tipo rendimento, valor 10, categoria o investimento que tem MP; se nenhum for citado, categoria "".
RESGATE (prioridade sobre o que estiver acima): quando a pessoa tirar dinheiro do investimento/cofrinho (tirei, retirei, resgatei, saquei, usei do cofrinho, "tirei do cofrinho para pagar contas"), use tipo "investimento" com valor NEGATIVO (ex.: -300) e a categoria do cofrinho citado. Só nesse caso o valor pode ser negativo, e o resgate NÃO é entrada nem saída. Nome, forma de pagamento e meta continuam iguais.
INVESTIMENTOS DA CARTEIRA (esta lista tem prioridade): para tipo investimento e rendimento, use em "categoria" só o NOME do investimento, sem o tipo entre parênteses; aceite apelidos e siglas ("mp" = o que tem MP).
${carteira.length ? carteira.map((n) => `- ${n}`).join("\n") : "(nenhum)"}
METAS POR VALOR (só para tipo investimento):
${metas.length ? metas.map((m) => `- ${m.nome}`).join("\n") : "(nenhuma)"}
Se a pessoa disser que investiu NA META (ex.: "investi 400 na meta carro"), preencha "meta" com o nome exato da meta da lista; senão deixe "meta" vazio. A meta é separada do cofrinho: "investi 400 nu na meta carro" = categoria o cofrinho NU e meta Carro.
FIXOS (gastos e entradas que se repetem todo mês). Fixos cadastrados hoje:
${fixos.length ? fixos.map((f) => `- ${f.tipo === "entrada" ? "entrada" : "saida"}: ${f.nome} R$ ${f.valor}${f.ativo === false ? " (desativado)" : ""}`).join("\n") : "(nenhum)"}
Quando a pessoa disser que algo é fixo, mensal ou "todo mês" (ex.: "meu salário de 2000 é uma entrada fixa", "aluguel 1200 gasto fixo", "netflix 40 fixo no crédito"), use fixo_criar (tipo "entrada" para salário e recebimentos, "saida" para gastos). Para mudar um fixo da lista (ex.: "altera o salário fixo para 2200", "muda o dia da netflix para 10"), use fixo_alterar com o nome do fixo da lista e SÓ os campos que mudam. Para parar de cobrar, fixo_desativar; para voltar, fixo_ativar. Fixo NÃO é lançamento comum: só use fixo_* se a pessoa disser que é fixo/mensal/todo mês ou pedir para alterar, desativar ou ativar um fixo.
CONVERSA: use "responder" quando a pessoa cumprimentar, perguntar algo ou conversar (ex.: "oi ora, tudo certo?"). Responda com no máximo 3 frases curtas e simpáticas e, quando fizer sentido, pergunte o que ela quer registrar: gastos, entradas ou investimentos. Pode explicar dúvidas gerais de finanças (o que é CDB, como montar uma reserva, etc.) de forma breve. Você não vê os totais da pessoa: para isso, mande olhar a aba Resumo. Nunca diga que registrou algo se não usou "lancar". Se o assunto for outro (política, receitas, jogos, código, etc.), recuse com gentileza em uma frase e puxe a conversa de volta para finanças. Uma mensagem pode misturar lançamentos e conversa: devolva as ações de lançamento e também um "responder".
Conversa recente (só para contexto, NÃO registre de novo o que já foi registrado):
${hist || "(início da conversa)"}
Mensagem atual: ${texto}`;

export default function Chat() {
  const uid = auth.currentUser.uid;
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const fim = useRef(null);
  const catsRef = useRef({ ok: false, lista: [] });
  const metasRef = useRef([]);
  const fixosRef = useRef([]);
  const carteiraRef = useRef([]);
  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "carteira"), (s) => { carteiraRef.current = s.data()?.grupos || []; }), [uid]);
  const invRef = useRef([]);
  useEffect(() => onSnapshot(query(collection(db, "users", uid, "lancamentos"), where("tipo", "==", "investimento")), (s) => { invRef.current = s.docs.map((d) => d.data()); }), [uid]);
  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "fixos"), (s) => { fixosRef.current = s.data()?.lista || []; }), [uid]);
  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "metasValor"), (s) => { metasRef.current = s.data()?.lista || []; }), [uid]);
  useEffect(() => onSnapshot(collection(db, "users", uid, "categorias"), (s) => { catsRef.current = { ok: true, lista: s.docs.map((d) => d.data()) }; }), [uid]);

  // Histórico salvo na nuvem (últimas 200 mensagens)
  useEffect(() => {
    const q = query(collection(db, "users", uid, "mensagens"), orderBy("ts", "desc"), limit(200));
    return onSnapshot(q, (s) => setMsgs(s.docs.map((d) => d.data()).reverse()));
  }, [uid]);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const salvar = (m) => addDoc(collection(db, "users", uid, "mensagens"), { itens: [], criadas: [], ...m, ts: Date.now() });

  async function enviar(e) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || busy) return;
    setTexto(""); setBusy(true);
    const t0 = performance.now();
    salvar({ de: "eu", texto: t }).catch(console.error); // a tela atualiza na hora, sem esperar o servidor
    try {
      const cats = catsRef.current.ok ? [...catsRef.current.lista] : (await getDocs(collection(db, "users", uid, "categorias"))).docs.map((d) => d.data());
      // investimentos da carteira (aba Investimentos): é neles que aportes, resgates e rendimentos se acumulam
      const grupos = carteiraRef.current.map((g) => ({ ...g, itens: (g.itens || []).map((i) => ({ ...i })) }));
      const carteiraItens = grupos.flatMap((g) => g.itens);
      let carteiraMudou = false;
      const acharItem = (txt) => { const n = norm(txt); return n ? carteiraItens.find((i) => norm(i.nome) === n) || carteiraItens.find((i) => norm(i.nome).includes(n) || n.includes(norm(i.nome))) || null : null; };
      const catsLocal = [...cats, ...carteiraItens.filter((i) => !cats.some((c) => norm(c.nome) === norm(i.nome))).map((i) => ({ nome: i.nome, grupo: "investimento", pai: "" }))];
      // 1º tenta entender na hora, sem IA (lançamento simples); se tiver dúvida, pergunta para a IA
      const local = lerLocal(t, catsLocal, metasRef.current, hoje());
      const via = local ? "local" : "IA";
      let lista = local ? [local] : null;
      if (!lista) {
        const hist = msgs.slice(-4).map((m) => `${m.de === "eu" ? "Pessoa" : "Ora"}: ${m.texto}`).join("\n");
        const bruto = (await gerar(montar(t, cats, hist, metasRef.current, fixosRef.current, carteiraRef.current.flatMap((g) => (g.itens || []).map((i) => `${i.nome} (tipo ${g.nome})`))))).replace(/```json|```/g, "").trim();
        lista = /^[\[{]/.test(bruto) ? JSON.parse(bruto) : [{ acao: "responder", texto: bruto }]; // a IA respondeu em texto puro
        if (!Array.isArray(lista)) lista = [lista];
      }
      const t1 = performance.now();
      const itens = [], criadas = [], respostas = [], gravar = [];
      // a carteira é a fonte única dos cofrinhos: o que ainda não está nela é cadastrado no tipo "Cofrinhos"
      const cadastrar = (nome) => {
        let g = grupos.find((x) => norm(x.nome) === "cofrinhos");
        if (!g) { g = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, nome: "Cofrinhos", cor: "#8B5CF6", meta: 0, itens: [] }; grupos.push(g); }
        const novo = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, nome, inicial: 0 };
        g.itens.push(novo);
        carteiraItens.push(novo);
        carteiraMudou = true;
        respostas.push(`Cadastrei "${nome}" na sua carteira de investimentos (tipo Cofrinhos).`);
        return novo;
      };
      const novaCat = (nome, grupo, pai = "", aporte = "") => {
        gravar.push(setDoc(doc(db, "users", uid, "categorias", slug(nome)), { nome, grupo, pai, cor: paleta[cats.length % paleta.length], ...(aporte ? { aporte } : {}) }));
        cats.push({ nome, grupo, pai, ...(aporte ? { aporte } : {}) });
      };
      const tn = norm(t);
      const fixos = fixosRef.current.map((f) => ({ ...f }));
      const alterados = [];
      let fixosMudou = false;
      const acharFixo = (nome) => { const n = norm(nome); return n ? fixos.find((f) => norm(f.nome) === n) || fixos.find((f) => norm(f.nome).includes(n) || n.includes(norm(f.nome))) || null : null; };
      const unico = lista.filter((a) => a.acao === "lancar").length === 1; // com 1 só item, as palavras da frase decidem o tipo
      for (const a of lista) {
        if (a.acao === "responder" && a.texto) {
          respostas.push(String(a.texto));
        } else if (String(a.acao || "").startsWith("fixo_")) {
          const mes = hoje().slice(0, 7);
          const tipoF = a.tipo === "entrada" ? "entrada" : "saida";
          const dia = Math.min(Math.max(Math.floor(Number(a.dia)) || 0, 0), 31);
          const catTxt = String(a.categoria || "").trim();
          const catF = (tp) => {
            const nomeC = acharCat(cats, catTxt, ["gasto", "entrada"], true)?.nome || catTxt || (tp === "entrada" ? "Entradas Fixas" : "Gastos Fixos");
            if (!acharCat(cats, nomeC, ["gasto", "entrada"], true)) novaCat(nomeC, tp === "entrada" ? "entrada" : "gasto");
            return nomeC;
          };
          const pagF = () => acharCat(cats, a.pagamento, ["pagamento"])?.nome || String(a.pagamento || "").trim();
          if (a.acao === "fixo_criar") {
            const valor = Number(a.valor), nome = String(a.nome || "").trim();
            if (!nome || !(valor > 0)) { respostas.push("Para criar um fixo preciso do nome e do valor. Exemplo: meu salário de 2000 é uma entrada fixa."); continue; }
            let f = fixos.find((x) => (x.tipo || "saida") === tipoF && norm(x.nome) === norm(nome));
            const novoF = !f;
            if (!f) { f = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, tipo: tipoF, nome, inicio: mes }; fixos.push(f); }
            Object.assign(f, { valor, categoria: catF(tipoF), pagamento: tipoF === "saida" ? pagF() : "", dia: dia || f.dia || 1, ativo: true });
            if (!novoF) alterados.push(f);
            fixosMudou = true;
            respostas.push(`${tipoF === "entrada" ? "Entrada fixa" : "Gasto fixo"} "${f.nome}" de ${brl(valor)} ${novoF ? "criado" : "atualizado"}: entra todo mês, no dia ${f.dia}. Veja e edite na aba Fixos.`);
          } else {
            const f = acharFixo(a.nome);
            if (!f) { respostas.push(`Não achei nenhum fixo chamado "${a.nome}". Veja a lista na aba Fixos.`); continue; }
            if (a.acao === "fixo_desativar") {
              Object.assign(f, { ativo: false, fim: mes });
              respostas.push(`"${f.nome}" desativado: não será mais lançado nos próximos meses. Para voltar, diga "ativa o fixo ${f.nome}".`);
            } else if (a.acao === "fixo_ativar") {
              Object.assign(f, { ativo: true, inicio: mes, fim: "" });
              respostas.push(`"${f.nome}" ativado de novo.`);
            } else if (a.acao === "fixo_alterar") {
              const feitos = [];
              if (String(a.novoNome || "").trim()) { f.nome = String(a.novoNome).trim(); feitos.push("nome"); }
              if (Number(a.valor) > 0) { f.valor = Number(a.valor); feitos.push(`valor ${brl(f.valor)}`); }
              if (catTxt) { f.categoria = catF(f.tipo === "entrada" ? "entrada" : "saida"); feitos.push(`categoria ${f.categoria}`); }
              if (a.pagamento && f.tipo !== "entrada") { f.pagamento = pagF(); feitos.push(`pagamento ${f.pagamento}`); }
              if (dia) { f.dia = dia; feitos.push(`dia ${dia}`); }
              if (!feitos.length) { respostas.push(`O que você quer mudar em "${f.nome}"? Por exemplo: o valor, o dia ou a forma de pagamento.`); continue; }
              alterados.push(f);
              respostas.push(`"${f.nome}" atualizado: ${feitos.join(", ")}. Vale a partir deste mês.`);
            } else continue;
            fixosMudou = true;
          }
        } else if (a.acao === "criar_categoria" && a.nome && ["gasto", "entrada", "investimento", "pagamento"].includes(a.grupo)) {
          novaCat(a.nome, a.grupo, a.pai || "");
          criadas.push(a.nome);
          if (a.grupo === "investimento" && a.pai !== "Rendimentos" && !acharItem(a.nome)) cadastrar(String(a.nome).trim());
        } else if ((nomeTipo[a.tipo] || a.tipo === "rendimento") && Number(a.valor) !== 0 && /^\d{4}-\d{2}-\d{2}$/.test(a.data)) {
          let tipo = a.tipo, valor = Number(a.valor);
          const temInv = !!acharCat(cats, a.categoria, ["investimento"]) || /cofrinho|investiment/.test(tn);
          if (unico) {
            if (RE_REND.test(tn)) tipo = "rendimento";
            else if (RE_RESG.test(tn) && temInv) { tipo = "investimento"; valor = -Math.abs(valor); } // resgate: investimento negativo
            else if (RE_INV.test(tn)) tipo = "investimento";
          }
          if (valor < 0 && tipo !== "investimento" && tipo !== "rendimento") valor = Math.abs(valor); // só investimento/rendimento pode ser negativo
          const aportes = cats.filter((x) => x.grupo === "investimento" && x.pai !== "Rendimentos");
          let nomeCat, rend = false, investId;
          if (tipo === "rendimento" || tipo === "investimento") {
            rend = tipo === "rendimento";
            let it = acharItem(a.categoria);
            if (!it) {
              // investimento que ainda não está na carteira: cadastra lá e lança nele (nunca fica solto)
              const dono = rend ? cats.find((x) => x.pai === "Rendimentos" && norm(x.nome) === norm(a.categoria))?.aporte : "";
              const base = dono || (rend ? String(a.categoria || "").replace(/^Rendimentos?\s*/i, "") : a.categoria);
              const nomeNovo = String(base || "").trim() || "Outros";
              it = acharItem(nomeNovo) || cadastrar(nomeNovo);
            }
            nomeCat = it.nome;
            investId = it.id;
            if (!rend && valor < 0) {
              // resgate nunca passa do que está investido: o saldo não fica negativo
              const donoRendC = Object.fromEntries(cats.filter((x) => x.pai === "Rendimentos").map((x) => [x.nome, x.aporte]));
              const saldoAtual = saldoItem(it, [...invRef.current, ...itens.filter((i) => i.tipo === "investimento")], donoRendC);
              if (-valor > saldoAtual + 0.005) { respostas.push(`Não registrei o resgate: ${it.nome} tem ${brl(Math.max(saldoAtual, 0))} e você pediu para tirar ${brl(-valor)}.`); continue; }
            }
          } else {
            // entrada/saída: só vale categoria que existe; saída sem categoria vira "Despesa Eventual"
            nomeCat = acharCat(cats, a.categoria, ["gasto", "entrada"], true)?.nome;
            if (!nomeCat) {
              if (tipo === "saida") { nomeCat = "Despesa Eventual"; if (!acharCat(cats, nomeCat, ["gasto"], true)) novaCat(nomeCat, "gasto"); }
              else nomeCat = "Outros";
            }
          }
          // Forma de pagamento: casa com a lista; "cartão"/"crédito" sem mês citado cai na fatura do mês seguinte (dia 01)
          const pagto = acharCat(cats, a.pagamento, ["pagamento"]);
          const credito = tipo === "saida" && (pagto ? pagto.pai === "Crédito" : /credito|cartao/.test(norm(a.pagamento)) && !/debito/.test(norm(a.pagamento)));
          const fatura = credito && !a.mesCitado;
          const nm = norm(a.meta);
          const meta = nm && tipo === "investimento" ? metasRef.current.find((m) => norm(m.nome) === nm) || metasRef.current.find((m) => norm(m.nome).includes(nm) || nm.includes(norm(m.nome))) : null;
          const l = { tipo: tipo === "rendimento" ? "investimento" : tipo, valor, data: fatura ? proximoMes(a.data) : a.data, categoria: nomeCat, descricao: a.descricao || "", pagamento: pagto?.nome || a.pagamento || "", ...(fatura ? { dataCompra: a.data } : {}), ...(rend ? { rendimento: true } : {}), ...(meta ? { metaId: meta.id } : {}), ...(investId ? { investId } : {}) };
          gravar.push(addDoc(collection(db, "users", uid, "lancamentos"), { ...l, criadoEm: serverTimestamp() }));
          itens.push(l);
        }
      }
      // confirma o saldo do investimento depois de aportar, resgatar ou render
      const donoRend = Object.fromEntries(cats.filter((x) => x.pai === "Rendimentos").map((x) => [x.nome, x.aporte]));
      const novosInv = itens.filter((i) => i.tipo === "investimento");
      carteiraItens.filter((it) => novosInv.some((i) => i.investId === it.id)).forEach((it) => respostas.push(`Saldo do ${it.nome}: ${brl(saldoItem(it, [...invRef.current, ...novosInv], donoRend))}`));
      if (fixosMudou) {
        fixosRef.current = fixos;
        gravar.push(setDoc(doc(db, "users", uid, "config", "fixos"), { lista: fixos }, { merge: true }));
        alterados.forEach((f) => gravar.push(atualizarMes(uid, f)));
      }
      if (carteiraMudou) {
        carteiraRef.current = grupos;
        gravar.push(setDoc(doc(db, "users", uid, "config", "carteira"), { grupos }, { merge: true }));
      }
      if (!itens.length && !criadas.length && !respostas.length) throw new Error("nada");
      gravar.push(salvar({ de: "ia", texto: respostas.join("\n\n") || "Feito:", itens, criadas }));
      // grava tudo ao mesmo tempo, sem travar o chat esperando o servidor
      Promise.all(gravar).then(() => console.log(`[Ora] ${via}: ${((t1 - t0) / 1000).toFixed(1)}s · gravação: ${((performance.now() - t1) / 1000).toFixed(1)}s`)).catch(console.error);
    } catch (err) {
      console.error(err);
      const aviso = err.message === "nada" ? "Não entendi nenhum lançamento. Exemplo: -55 mercado pix, ou recebi 12 da minha mãe."
        : !navigator.onLine ? "Você está sem internet. Conecte e tente de novo."
        : /tempo esgotado/.test(err.message) ? "A IA demorou demais para responder. Tente de novo. Lançamentos simples, como -55 mercado pix, são registrados sem depender dela."
        : /429|quota|RESOURCE_EXHAUSTED/i.test(err.message) ? "Muitas mensagens em pouco tempo (limite da IA). Espere cerca de 1 minuto e tente de novo."
        : /app.?check|403|permission/i.test(err.message) ? "A proteção do app bloqueou a IA. Recarregue a página e tente de novo."
        : "A IA está instável agora. Tente de novo em instantes. Lançamentos simples, como -55 mercado pix, funcionam sem ela.";
      salvar({ de: "ia", texto: aviso }).catch(console.error);
    } finally { setBusy(false); }
  }

  const todas = msgs.length ? msgs : [{ de: "ia", texto: "Oi! Eu sou a Ora, sua assistente financeira. Me conte o que entrou, o que saiu ou o que você investiu, pode mandar vários itens de uma vez. Exemplo: gastei 55 no mercado no pix, recebi 200 da minha mãe. Também tiro dúvidas sobre finanças." }];
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {todas.map((m, k) => (
          <div key={k} className={m.de === "eu" ? "flex justify-end" : "flex"}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.de === "eu" ? "bg-neon text-white" : "painel3d"}`}>
              <p>{m.texto}</p>
              {m.criadas?.map((c) => <p key={c} className="mt-2 text-sm font-bold text-neon">Criada: {c}</p>)}
              {m.itens?.map((i, n) => (
                <p key={n} className="mt-2 text-sm">
                  <b style={{ color: corTexto[i.tipo] }}>{i.rendimento ? "Rendimento" : i.tipo === "investimento" && i.valor < 0 ? "Resgate" : nomeTipo[i.tipo]} {brl(i.valor)}</b>
                  {" "}em {i.data.split("-").reverse().join("/")}{i.dataCompra && ` (compra em ${i.dataCompra.split("-").reverse().slice(0, 2).join("/")}, fatura do mês seguinte)`} · {i.categoria}{i.descricao && ` · ${i.descricao}`}{i.pagamento && ` · ${i.pagamento}`}
                </p>
              ))}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-suave">Registrando…</p>}
        <div ref={fim} />
      </div>
      <form onSubmit={enviar} className="flex gap-2 border-t border-borda p-3">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: investi +100 no mp, gastei 30 no pix"
          className="flex-1 rounded-xl border border-borda bg-painel px-4 py-3 text-tinta placeholder:text-suave" />
        <button disabled={busy} className="rounded-xl bg-neon px-5 font-bold text-white shadow-[0_0_20px_rgba(0,87,255,.6)] disabled:opacity-60">Enviar</button>
      </form>
    </div>
  );
}
