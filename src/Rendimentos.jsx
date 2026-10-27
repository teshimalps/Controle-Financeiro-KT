import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { auth, db } from "./firebase";
import { brl, eixoValor, hoje, paleta } from "./util.js";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const NOMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const compacto = (v) => eixoValor(new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v));
const dois = (n) => String(n).padStart(2, "0");

// Balão do gráfico: mostra de onde veio cada parte do rendimento
function Dica({ active, payload, label, origens, cores, titulo }) {
  if (!active || !payload?.length) return null;
  const linha = payload[0].payload;
  return (
    <div className="rounded-xl border border-borda bg-[#1A1A1A] p-3 text-sm shadow-xl">
      <p className="mb-1 font-bold">{titulo(label)}</p>
      {origens.map((o, i) => (linha[`o${i}`] ? (
        <p key={o} className="flex items-center gap-2 tabular-nums">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: cores[i] }} />
          <span className="flex-1 text-suave">{o}</span>
          <b>{brl(linha[`o${i}`])}</b>
        </p>
      ) : null))}
      <p className="mt-1 border-t border-borda pt-1 font-extrabold tabular-nums">Total {brl(linha.total)}</p>
    </div>
  );
}

export default function Rendimentos() {
  const uid = auth.currentUser.uid;
  const [lanc, setLanc] = useState([]);
  const [cats, setCats] = useState([]);
  const [modo, setModo] = useState("mes"); // dia | mes | ano
  const [ano, setAno] = useState(Number(hoje().slice(0, 4)));
  const [mesN, setMesN] = useState(Number(hoje().slice(5, 7)));

  useEffect(() => onSnapshot(query(collection(db, "users", uid, "lancamentos"), where("tipo", "==", "investimento")), (s) => setLanc(s.docs.map((d) => d.data()))), [uid]);
  useEffect(() => onSnapshot(collection(db, "users", uid, "categorias"), (s) => setCats(s.docs.map((d) => d.data()))), [uid]);

  // de onde veio o rendimento: o investimento (cofrinho) dono da categoria "Rendimento ..."
  const donoRend = Object.fromEntries(cats.filter((c) => c.pai === "Rendimentos").map((c) => [c.nome, c.aporte]));
  const origemDe = (l) => donoRend[l.categoria] || String(l.categoria || "").replace(/^Rendimentos?\s*/i, "").trim() || "Outros";
  const rends = lanc.filter((l) => l.rendimento && l.data);

  // colunas do gráfico, de acordo com o período
  let buckets;
  if (modo === "dia") {
    const n = new Date(ano, mesN, 0).getDate();
    buckets = Array.from({ length: n }, (_, k) => ({ rot: String(k + 1), casa: (d) => d === `${ano}-${dois(mesN)}-${dois(k + 1)}` }));
  } else if (modo === "mes") {
    buckets = MESES.map((r, k) => ({ rot: r, casa: (d) => d.startsWith(`${ano}-${dois(k + 1)}`) }));
  } else {
    const anos = rends.map((l) => Number(l.data.slice(0, 4)));
    const de = Math.max(Math.min(...anos, Number(hoje().slice(0, 4))), Number(hoje().slice(0, 4)) - 14), ate = Math.max(...anos, Number(hoje().slice(0, 4)));
    buckets = Array.from({ length: ate - de + 1 }, (_, k) => ({ rot: String(de + k), casa: (d) => d.startsWith(`${de + k}-`) }));
  }
  const noPeriodo = rends.filter((l) => buckets.some((b) => b.casa(l.data)));
  const porOrigem = {};
  noPeriodo.forEach((l) => { const o = origemDe(l); porOrigem[o] = (porOrigem[o] || 0) + l.valor; });
  const origens = Object.keys(porOrigem).sort((a, b) => Math.abs(porOrigem[b]) - Math.abs(porOrigem[a]));
  const cores = origens.map((o, i) => cats.find((c) => c.nome === o && c.grupo === "investimento")?.cor || paleta[i % paleta.length]);
  const dados = buckets.map((b) => {
    const row = { rot: b.rot, total: 0 };
    origens.forEach((_, i) => { row[`o${i}`] = 0; });
    noPeriodo.filter((l) => b.casa(l.data)).forEach((l) => { const i = origens.indexOf(origemDe(l)); row[`o${i}`] += l.valor; row.total += l.valor; });
    return row;
  });
  const total = origens.reduce((s, o) => s + porOrigem[o], 0);
  const melhor = dados.reduce((m, d) => (d.total > (m?.total ?? 0) ? d : m), null);

  const titulo = (rot) => (modo === "dia" ? `Dia ${rot} de ${NOMES[mesN - 1]}` : modo === "mes" ? `${NOMES[MESES.indexOf(rot)]} de ${ano}` : `Ano ${rot}`);
  const periodo = modo === "dia" ? `${NOMES[mesN - 1]} de ${ano}` : modo === "mes" ? String(ano) : "Todos os anos";
  const mover = (d) => {
    if (modo === "dia") { let m = mesN + d, a = ano; if (m < 1) { m = 12; a--; } if (m > 12) { m = 1; a++; } setMesN(m); setAno(a); } else setAno(ano + d);
  };
  const unidade = modo === "dia" ? "dia" : modo === "mes" ? "mês" : "ano";

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-extrabold">Rendimentos</h1>
        <p className="text-sm text-suave">Veja quanto seus investimentos renderam, dia a dia, mês a mês ou ano a ano. Cada coluna mostra de onde veio o rendimento.</p>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#141414] p-1">
        {[["dia", "Dia a dia"], ["mes", "Mês a mês"], ["ano", "Ano a ano"]].map(([v, r]) => (
          <button key={v} onClick={() => setModo(v)} aria-pressed={modo === v}
            className={`rounded-xl py-2.5 text-sm font-bold ${modo === v ? "bg-neon text-white shadow-[0_0_16px_rgba(0,87,255,.5)]" : "text-suave"}`}>{r}</button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        {modo !== "ano" ? (
          <button onClick={() => mover(-1)} aria-label="Período anterior" className="h-10 w-10 rounded-full border border-borda text-xl">‹</button>
        ) : <span className="h-10 w-10" />}
        <p className="text-lg font-bold">{periodo}</p>
        {modo !== "ano" ? (
          <button onClick={() => mover(1)} aria-label="Próximo período" className="h-10 w-10 rounded-full border border-borda text-xl">›</button>
        ) : <span className="h-10 w-10" />}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="painel3d rounded-2xl p-4" style={{ borderTop: "2px solid #8B5CF6" }}>
          <p className="text-sm text-suave">Total no período</p>
          <p className="text-2xl font-extrabold tabular-nums" style={{ color: "#8B5CF6" }}>{brl(total)}</p>
        </div>
        <div className="painel3d rounded-2xl p-4">
          <p className="text-sm text-suave">Melhor {unidade}</p>
          <p className="text-2xl font-extrabold tabular-nums">{melhor ? brl(melhor.total) : brl(0)}</p>
          {melhor && <p className="text-xs text-suave">{titulo(melhor.rot)}</p>}
        </div>
      </div>

      <section className="painel3d rounded-2xl p-3 md:p-4">
        {origens.length === 0 ? (
          <p className="p-4 text-sm text-suave">Nenhum rendimento neste período. Registre pelo chat, por exemplo "rendeu 10 mp", ou em Resumo → Cofrinhos → Rendimento.</p>
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#2A2A2A" vertical={false} />
                  <XAxis dataKey="rot" stroke="#9A9A9A" tickLine={false} axisLine={false} fontSize={12} interval={modo === "dia" ? 1 : 0} />
                  <YAxis stroke="#9A9A9A" tickLine={false} axisLine={false} width={48} fontSize={12} tickFormatter={compacto} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,.06)" }} content={(p) => <Dica {...p} origens={origens} cores={cores} titulo={titulo} />} />
                  {origens.map((o, i) => (
                    <Bar key={o} dataKey={`o${i}`} stackId="r" fill={cores[i]} isAnimationActive={false} radius={i === origens.length - 1 ? [6, 6, 0, 0] : 0} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 space-y-2">
              {origens.map((o, i) => (
                <li key={o} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: cores[i], boxShadow: `0 0 8px ${cores[i]}` }} />
                  <span className="min-w-0 flex-1 truncate font-bold">{o}</span>
                  <span className="tabular-nums text-suave">{total ? Math.round((porOrigem[o] / total) * 100) : 0}%</span>
                  <span className="w-28 text-right font-bold tabular-nums">{brl(porOrigem[o])}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
