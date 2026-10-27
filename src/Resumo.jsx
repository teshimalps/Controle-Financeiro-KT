import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { auth, db } from "./firebase";
import { brl, cor, corTexto, eixoValor, hoje, paleta } from "./util.js";
import MetasResumo from "./MetasResumo.jsx";
import { diaDoMes } from "./fixos.js";
import Cofrinhos from "./Cofrinhos.jsx";
import Filtro, { filtrar, filtroVazio } from "./Filtro.jsx";

const dica = { contentStyle: { background: "#1A1A1A", border: "1px solid #333", borderRadius: 12 }, formatter: (v) => brl(v) };
const eixo = { tick: { fill: "#9A9A9A", fontSize: 12 }, axisLine: false, tickLine: false };
const painel = "painel3d rounded-2xl p-4";
const campo = "rounded-lg border border-borda bg-[#141414] px-2 py-1.5 text-sm text-tinta";
const grupoDe = { entrada: "entrada", saida: "gasto", investimento: "investimento" };

function Linha({ i, uid, cats, metas }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(i);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const nomes = (g) => cats.filter((c) => c.grupo === g).map((c) => c.nome);
  const opcoes = (lista, atual) => [...new Set([...lista, atual])];
  const tipoDe = (x) => (x.rendimento ? "rendimento" : x.tipo);
  const rotuloTipo = { entrada: "Entrada", saida: "Saída", investimento: "Investimento", rendimento: "Rendimento" };
  const catsDoTipo = (t) => t === "entrada" ? ["Outros", ...nomes("entrada")] : t === "saida" ? ["Despesa Eventual", ...nomes("gasto")]
    : t === "investimento" ? ["Outros", ...cats.filter((c) => c.grupo === "investimento" && c.pai !== "Rendimentos").map((c) => c.nome)]
    : cats.filter((c) => c.pai === "Rendimentos").map((c) => c.nome);
  const trocarTipo = (e) => { const t = e.target.value, l = catsDoTipo(t); setF({ ...f, tipoUI: t, categoria: l[0] || f.categoria }); };

  async function salvar() {
    const v0 = Number(String(f.valor).replace(",", ".")), neg = f.tipoUI === "investimento" || f.tipoUI === "rendimento";
    const v = neg ? v0 : Math.abs(v0); // só investimento/rendimento pode ser negativo (resgate)
    if (!v || !f.data) return;
    await updateDoc(doc(db, "users", uid, "lancamentos", i.id), { descricao: f.descricao, categoria: f.categoria, tipo: f.tipoUI === "rendimento" ? "investimento" : f.tipoUI, rendimento: f.tipoUI === "rendimento", metaId: f.tipoUI === "investimento" ? f.metaId || "" : "", valor: v, pagamento: f.pagamento, data: f.data, ...(neg && f.categoria !== i.categoria ? { investId: "" } : {}) }); // trocou o investimento: religa pelo nome
    setEdit(false);
  }

  if (!edit) return (
    <li className="flex flex-wrap items-center justify-between gap-2 p-3">
      <span className="text-sm text-suave">
        {i.data.split("-").reverse().slice(0, 2).join("/")}{tipoDe(i) !== "entrada" && tipoDe(i) !== "saida" && ` · ${tipoDe(i) === "investimento" && i.valor < 0 ? "Resgate" : rotuloTipo[tipoDe(i)]}`} · {i.categoria}{i.descricao && ` · ${i.descricao}`}{i.pagamento && ` · ${i.pagamento}`}{metas.find((m) => m.id === i.metaId) && ` · meta: ${metas.find((m) => m.id === i.metaId).nome}`}{i.fixo && " · fixo"}{i.dataCompra && i.dataCompra !== i.data && ` · compra em ${i.dataCompra.split("-").reverse().slice(0, 2).join("/")}`}
      </span>
      <span className="flex items-center gap-3">
        <b className="tabular-nums" style={{ color: corTexto[i.tipo] }}>{brl(i.valor)}</b>
        <button onClick={() => { setF({ ...i, tipoUI: tipoDe(i) }); setEdit(true); }} className="text-sm text-suave underline">Editar</button>
        <button onClick={() => deleteDoc(doc(db, "users", uid, "lancamentos", i.id))} className="text-sm text-suave underline">Apagar</button>
      </span>
    </li>
  );
  return (
    <li className="grid gap-2 p-3 sm:grid-cols-3">
      <input className={`${campo} sm:col-span-3`} value={f.descricao} onChange={set("descricao")} placeholder="Nome / descrição" aria-label="Descrição" />
      <select className={campo} value={f.tipoUI} onChange={trocarTipo} aria-label="Tipo do lançamento">
        {Object.entries(rotuloTipo).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
      <select className={campo} value={f.categoria} onChange={set("categoria")} aria-label="Categoria">
        {opcoes(catsDoTipo(f.tipoUI), f.categoria).map((n) => <option key={n}>{n}</option>)}
      </select>
      {f.tipoUI === "investimento" && metas.length > 0 && (
        <select className={campo} value={f.metaId || ""} onChange={set("metaId")} aria-label="Meta por valor">
          <option value="">Sem meta por valor</option>
          {metas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      )}
      <input className={campo} type="number" step="0.01" value={f.valor} onChange={set("valor")} aria-label="Valor" />
      <select className={campo} value={f.pagamento} onChange={set("pagamento")} aria-label="Forma de pagamento">
        {opcoes(["", ...nomes("pagamento")], f.pagamento).map((n) => <option key={n} value={n}>{n || "Sem forma de pagamento"}</option>)}
      </select>
      <input className={campo} type="date" value={f.data} onChange={set("data")} aria-label="Data" />
      <div className="flex gap-2 sm:col-span-3">
        <button onClick={salvar} className="rounded-lg bg-neon px-4 py-1.5 text-sm font-bold text-white">Salvar</button>
        <button onClick={() => setEdit(false)} className="text-sm text-suave underline">Cancelar</button>
      </div>
    </li>
  );
}

function LinhaPrevista({ i }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 p-3 opacity-80">
      <span className="text-sm text-suave">{i.data.split("-").reverse().slice(0, 2).join("/")} · {i.categoria} · {i.descricao}{i.pagamento && ` · ${i.pagamento}`} · <i>previsto (fixo)</i></span>
      <b className="tabular-nums" style={{ color: corTexto[i.tipo] }}>{brl(i.valor)}</b>
    </li>
  );
}

export default function Resumo({ onNova, onMetas, onValor }) {
  const uid = auth.currentUser.uid;
  const [mes, setMes] = useState(hoje().slice(0, 7));
  const [itensBase, setItens] = useState([]);
  const [filtro, setFiltro] = useState(filtroVazio);
  const [cats, setCats] = useState([]);
  const [valor, setValor] = useState([]);
  const [fixosLista, setFixosLista] = useState([]);
  const [vista, setVista] = useState("acum");
  const [a, m] = mes.split("-").map(Number);
  const rotulo = new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const mover = (n) => { const d = new Date(a, m - 1 + n, 1); setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };

  useEffect(() => {
    const q = query(collection(db, "users", uid, "lancamentos"),
      where("data", ">=", `${mes}-01`), where("data", "<=", `${mes}-31`), orderBy("data", "desc"));
    return onSnapshot(q, (s) => setItens(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [mes, uid]);
  useEffect(() => onSnapshot(collection(db, "users", uid, "categorias"), (s) => setCats(s.docs.map((d) => d.data()))), [uid]);
  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "metasValor"), (s) => setValor(s.data()?.lista || [])), [uid]);
  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "fixos"), (s) => setFixosLista(s.data()?.lista || [])), [uid]);

  // Mês futuro: mostra os gastos e entradas fixos como previsão (viram lançamentos de verdade quando o mês chegar)
  const atual = hoje().slice(0, 7);
  const previstos = mes > atual
    ? fixosLista
      .filter((f) => f.ativo !== false && f.nome && Number(f.valor) > 0 && (f.inicio || atual) <= mes && !itensBase.some((i) => i.fixoId === f.id))
      .map((f) => ({
        id: `previsto_${f.id}_${mes}`, previsto: true, fixo: true, fixoId: f.id, tipo: f.tipo === "entrada" ? "entrada" : "saida", valor: Number(f.valor),
        data: `${mes}-${diaDoMes(mes, f.dia)}`, categoria: f.categoria || (f.tipo === "entrada" ? "Entradas Fixas" : "Gastos Fixos"),
        descricao: f.nome, pagamento: f.tipo === "entrada" ? "" : f.pagamento || "",
      }))
    : [];
  const itens = previstos.length ? [...itensBase, ...previstos].sort((a, b) => b.data.localeCompare(a.data)) : itensBase;
  const soma = (t) => itens.filter((i) => i.tipo === t).reduce((x, i) => x + i.valor, 0);
  const entrou = soma("entrada"), saiu = soma("saida"), investiu = itens.filter((i) => i.tipo === "investimento" && !i.rendimento).reduce((x, i) => x + i.valor, 0), rendeu = itens.filter((i) => i.rendimento).reduce((x, i) => x + i.valor, 0);
  // quanto do mês foi aportado para cada meta por valor
  const porMeta = valor.map((v) => ({ ...v, mes: itens.filter((i) => i.metaId === v.id).reduce((x, i) => x + i.valor, 0) })).filter((v) => v.mes !== 0);
  const filtrados = filtrar(itens, filtro);
  const pct = entrou > 0 ? Math.round((saiu / entrou) * 100) : 0;
  const base = Math.min(pct, 100), extra = Math.min(Math.max(pct - 100, 0), 100);

  const dias = Array.from({ length: new Date(a, m, 0).getDate() }, (_, k) => ({ dia: String(k + 1), entrada: 0, saida: 0 }));
  itens.forEach((i) => { const d = dias[Number(i.data.slice(8)) - 1]; if (d && i.tipo !== "investimento") d[i.tipo] += i.valor; });
  // Acumulado: soma dia a dia; nos dias sem movimento a linha fica reta (para de crescer)
  const limite = mes === hoje().slice(0, 7) ? Number(hoje().slice(8)) : dias.length;
  let ae = 0, as = 0;
  const acum = dias.map((d) => { ae += d.entrada; as += d.saida; return Number(d.dia) <= limite ? { dia: d.dia, entrada: ae, saida: as } : { dia: d.dia, entrada: null, saida: null }; });

  const corDe = Object.fromEntries(cats.filter((c) => c.cor).map((c) => [c.nome, c.cor]));
  const porCat = {};
  itens.filter((i) => i.tipo === "saida").forEach((i) => { porCat[i.categoria] = (porCat[i.categoria] || 0) + i.valor; });
  const lista = Object.entries(porCat).map(([name, value]) => ({ name, value })).sort((x, y) => y.value - x.value)
    .map((c, k) => ({ ...c, cor: corDe[c.name] || (c.name === "Outros" ? "#8A8A8A" : paleta[k % paleta.length]) }));

  const Numero = ({ rotulo, valor, c, extra }) => (
    <div className={painel} style={{ borderTop: `2px solid ${c}`, boxShadow: `0 -6px 24px -10px ${c}` }}>
      <p className="text-sm text-suave">{rotulo}</p>
      <p className="text-2xl font-extrabold tabular-nums" style={{ color: c }}>{brl(valor)}</p>
      {extra && <div className="mt-1 flex flex-wrap gap-x-2 text-xs font-bold">{extra}</div>}
    </div>
  );
  const Grad = ({ id, c }) => (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={c} stopOpacity={0.7} /><stop offset="100%" stopColor={c} stopOpacity={0} />
    </linearGradient>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8">
      <div className="flex items-center gap-2">
        <button onClick={() => mover(-1)} aria-label="Mês anterior" className="btn-vidro">‹</button>
        <span className="min-w-44 text-center text-lg font-extrabold capitalize">{rotulo}</span>
        <button onClick={() => mover(1)} aria-label="Próximo mês" className="btn-vidro">›</button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Entrou" valor={entrou} c={corTexto.entrada} />
        <Numero rotulo="Saiu" valor={saiu} c={corTexto.saida} />
        <Numero rotulo="Investido" valor={investiu} c={corTexto.investimento} extra={(porMeta.length > 0 || rendeu !== 0) && (<>{porMeta.map((v) => <span key={v.id} style={{ color: v.cor }}>({brl(v.mes)} {v.nome})</span>)}{rendeu !== 0 && <span className="w-full text-suave">Rendimentos do mês: <b style={{ color: corTexto.investimento }}>{rendeu > 0 ? "+" : ""}{brl(rendeu)}</b></span>}</>)} />
        <Numero rotulo="Saldo do mês" valor={entrou - saiu} c="#F2F2F2" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className={`${painel} h-80 lg:col-span-2`}>
          <div className="mb-1 flex items-center justify-between">
            <div>
              <p className="font-bold">{vista === "acum" ? "Acumulado do mês" : "Movimento por dia"}</p>
              <p className="text-sm text-suave"><b style={{ color: corTexto.entrada }}>●</b> Entrada &nbsp;<b style={{ color: cor.saida }}>●</b> Saída</p>
            </div>
            <button onClick={() => setVista(vista === "acum" ? "dia" : "acum")} className="btn-vidro text-sm">
              {vista === "acum" ? "Por dia ›" : "‹ Acumulado"}
            </button>
          </div>
          <ResponsiveContainer height="82%">
            <AreaChart data={vista === "acum" ? acum : dias} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs><Grad id="gE" c={cor.entrada} /><Grad id="gS" c={cor.saida} /></defs>
              <CartesianGrid stroke="#333" strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="dia" {...eixo} /><YAxis width={48} {...eixo} tickFormatter={(v) => eixoValor(v >= 1000 ? `${v / 1000}k` : v)} />
              <Tooltip {...dica} />
              <Area className="linha-entrada" type="monotone" dataKey="entrada" name="Entrada" stroke={cor.entrada} strokeWidth={3.5} fill="url(#gE)" />
              <Area className="linha-saida" type="monotone" dataKey="saida" name="Saída" stroke={cor.saida} strokeWidth={3.5} fill="url(#gS)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className={`${painel} medidor relative h-80`}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={[{ v: base }, { v: 100 - base }]} dataKey="v" startAngle={90} endAngle={-270} innerRadius="72%" outerRadius="88%" stroke="none" isAnimationActive={false}>
                <Cell fill={cor.saida} /><Cell fill="#0F0F0F" stroke="#2A2A2A" />
              </Pie>
              {extra > 0 && (
                <Pie data={[{ v: extra }, { v: 100 - extra }]} dataKey="v" startAngle={90} endAngle={-270} innerRadius="72%" outerRadius="88%" stroke="none" isAnimationActive={false}>
                  <Cell fill={cor.entrada} stroke="rgba(255,255,255,.4)" /><Cell fill="transparent" />
                </Pie>
              )}
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 grid place-content-center text-center">
            <p className="text-4xl font-extrabold tabular-nums">{pct}%</p>
            <p className="text-sm text-suave">{pct > 100 ? <>acima<br />da entrada</> : <>da entrada<br />já saiu</>}</p>
          </div>
        </div>
      </div>
      <MetasResumo uid={uid} itens={itens} entrou={entrou} valor={valor} cats={cats} onAbrir={onMetas} onAbrirValor={onValor} />
      <Cofrinhos uid={uid} itens={itens} cats={cats} metas={valor} />
      <div className={painel}>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-bold">Gastos por categoria</p>
          <button onClick={onNova} className="btn-vidro text-sm">+ Nova categoria</button>
        </div>
        {lista.length ? (
          <div className="grid items-center gap-6 md:grid-cols-[240px_1fr]">
            <div className="rosca relative h-60">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={[{ v: 1 }]} dataKey="v" innerRadius="66%" outerRadius="90%" fill="#0F0F0F" stroke="#2A2A2A" isAnimationActive={false} />
                  <Pie data={lista} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="90%" paddingAngle={4} cornerRadius={8} stroke="none">
                    {lista.map((c) => <Cell key={c.name} fill={c.cor} />)}
                  </Pie>
                  <Tooltip {...dica} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
                <p className="text-sm text-suave">Total gasto</p>
                <p className="text-xl font-extrabold tabular-nums">{brl(saiu)}</p>
              </div>
            </div>
            <ul className="space-y-4">
              {lista.map((c) => {
                const p = saiu > 0 ? Math.round((c.value / saiu) * 100) : 0;
                return (
                  <li key={c.name}>
                    <div className="flex justify-between text-sm">
                      <span><b style={{ color: c.cor, textShadow: `0 0 8px ${c.cor}` }}>●</b> {c.name}</span>
                      <span><b className="tabular-nums">{brl(c.value)}</b> <i className="text-suave">{p}%</i></span>
                    </div>
                    <div className="mt-1.5 h-2.5 rounded-full bg-[#0F0F0F] shadow-[inset_0_1px_3px_rgba(0,0,0,.8)]">
                      <div className="h-full rounded-full" style={{ width: `${p}%`, background: `linear-gradient(90deg, ${c.cor}66, ${c.cor})`, boxShadow: `0 0 12px ${c.cor}` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : <p className="text-sm text-suave">Nenhuma saída neste mês.</p>}
      </div>
      {previstos.length > 0 && <p className="text-sm text-suave">Mês futuro: os gastos e entradas fixos aparecem como previsão e viram lançamentos quando o mês chegar.</p>}
      <Filtro itens={itens} lista={filtrados} cats={cats} f={filtro} setF={setFiltro} />
      <ul className="painel3d divide-y divide-borda rounded-2xl">
        {itens.length === 0 && <li className="p-4 text-suave">Nenhum lançamento neste mês. Registre pelo Chat.</li>}
        {itens.length > 0 && filtrados.length === 0 && <li className="p-4 text-suave">Nenhum lançamento com esses filtros neste mês.</li>}
        {filtrados.map((i) => i.previsto ? <LinhaPrevista key={i.id} i={i} /> : <Linha key={i.id} i={i} uid={uid} cats={cats} metas={valor} />)}
      </ul>
    </div>
  );
}
