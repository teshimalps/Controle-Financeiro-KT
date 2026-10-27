import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { brlOc, brlReal, hoje, mesmoItem, saldoItem } from "./util.js";
import Olho, { useOlho } from "./Olho.jsx";
import { vincularOrfaos } from "./carteira.js";

const campo = "w-full rounded-xl border border-borda bg-[#141414] px-3 py-2.5 text-tinta";
const brl = (v) => brlOc(v, "carteira"); // saldos dos cofrinhos seguem o olho da Carteira
const sinal = (v) => `${v > 0 ? "+" : ""}${brl(v)}`;
const ROT = { aporte: "Aportar no investimento", resgate: "Resgatar do investimento", rendimento: "Registrar rendimento" };

// Aportar, resgatar ou registrar rendimento direto num investimento da carteira, em qualquer data
function Movimento({ it, tipo, uid, cats, metas, saldo, fechar, avisar }) {
  const [f, setF] = useState({ valor: "", data: hoje(), pagamento: "", metaId: "", descricao: "" });
  const [erro, setErro] = useState("");
  const pags = cats.filter((x) => x.grupo === "pagamento").map((x) => x.nome);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function salvar(e) {
    e.preventDefault();
    const v = Number(String(f.valor).replace(",", "."));
    if (tipo === "rendimento" ? !v : !(v > 0) || !f.data) { setErro("Informe um valor e a data."); return; }
    if (!f.data) { setErro("Informe um valor e a data."); return; }
    if (tipo === "resgate" && v > saldo + 0.005) { setErro(`Você só tem ${brlReal(Math.max(saldo, 0))} neste investimento.`); return; }
    try {
      const gravar = addDoc(collection(db, "users", uid, "lancamentos"), {
        tipo: "investimento", valor: tipo === "resgate" ? -v : v, data: f.data, categoria: it.nome, investId: it.id, descricao: f.descricao.trim(),
        pagamento: f.pagamento, ...(tipo === "rendimento" ? { rendimento: true } : {}), ...(f.metaId && tipo !== "rendimento" ? { metaId: f.metaId } : {}), criadoEm: serverTimestamp(),
      });
      await Promise.race([gravar, new Promise((ok) => setTimeout(ok, 4000))]); // sem internet, grava quando a conexão voltar
      avisar(`${tipo === "resgate" ? "Resgate" : tipo === "rendimento" ? "Rendimento" : "Aporte"} de ${brlReal(Math.abs(v))} registrado em ${it.nome}.`);
      fechar();
    } catch { setErro("Não consegui salvar. Verifique a internet e tente de novo."); }
  }

  return (
    <form onSubmit={salvar} className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#1A1A1A] p-3">
      <p className="col-span-2 font-bold">{ROT[tipo]}</p>
      <label className="text-sm text-suave">Valor (R$)
        <input className={`${campo} mt-1`} type="number" inputMode="decimal" step="0.01" min={tipo === "rendimento" ? undefined : "0"} value={f.valor} onChange={set("valor")} autoFocus />
      </label>
      <label className="text-sm text-suave">Data
        <input className={`${campo} mt-1`} type="date" value={f.data} onChange={set("data")} />
      </label>
      {tipo !== "rendimento" && (
        <label className="col-span-2 text-sm text-suave">Forma de pagamento (opcional)
          <select className={`${campo} mt-1`} value={f.pagamento} onChange={set("pagamento")}>
            <option value="">Sem forma de pagamento</option>
            {pags.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      )}
      {tipo !== "rendimento" && metas.length > 0 && (
        <label className="col-span-2 text-sm text-suave">Meta por valor (opcional)
          <select className={`${campo} mt-1`} value={f.metaId} onChange={set("metaId")}>
            <option value="">Sem meta por valor</option>
            {metas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </label>
      )}
      <input className={`${campo} col-span-2`} placeholder="Descrição (opcional)" value={f.descricao} onChange={set("descricao")} />
      {tipo === "rendimento" && <p className="col-span-2 text-xs text-suave">Rendimento soma no saldo do investimento. Se foi prejuízo, use valor negativo.</p>}
      {erro && <p role="alert" className="col-span-2 text-sm font-medium text-saida">{erro}</p>}
      <div className="col-span-2 flex gap-3">
        <button className="rounded-xl bg-neon px-5 py-2.5 font-bold text-white">Registrar</button>
        <button type="button" onClick={fechar} className="text-sm text-suave underline">Cancelar</button>
      </div>
    </form>
  );
}

// Seção do Resumo: cada investimento da aba Investimentos com saldo, movimento do mês e botões de aportar/resgatar/render
export default function Cofrinhos({ uid, itens, cats, metas }) {
  const [oculto, alternar] = useOlho("carteira");
  const [inv, setInv] = useState(null);
  const [cart, setCart] = useState(null);
  const [aberto, setAberto] = useState(null); // { id, tipo }
  const [msg, setMsg] = useState("");
  useEffect(() => onSnapshot(query(collection(db, "users", uid, "lancamentos"), where("tipo", "==", "investimento")), (s) => setInv(s.docs.map((d) => ({ ...d.data(), docId: d.id })))), [uid]);
  useEffect(() => onSnapshot(doc(db, "users", uid, "config", "carteira"), (s) => setCart(s.data() || {})), [uid]);

  if (!inv || !cart) return null; // espera carregar a carteira e os lançamentos antes de decidir o que mostrar
  const grupos = cart.grupos || [];
  const todos = grupos.flatMap((g) => (g.itens || []).map((i) => ({ ...i, tipoNome: g.nome, cor: g.cor })));
  const donoRend = Object.fromEntries(cats.filter((c) => c.pai === "Rendimentos").map((c) => [c.nome, c.aporte]));
  const sem = inv.filter((l) => !todos.some((it) => mesmoItem(l, it, donoRend)));
  if (!todos.length && !sem.length) return null;
  const doMes = itens.filter((i) => i.tipo === "investimento");
  // liga um lançamento solto ao cofrinho escolhido: o valor não muda, só passa a contar no saldo dele
  async function ligar(l, investId) {
    if (!investId) return;
    setMsg("");
    try {
      await updateDoc(doc(db, "users", uid, "lancamentos", l.docId), { investId });
      setMsg(`Lançamento de ${brlReal(Math.abs(l.valor))} ligado a ${todos.find((it) => it.id === investId)?.nome}.`);
    } catch (e) { console.error(e); setMsg("Não consegui ligar. Verifique a internet e tente de novo."); }
  }
  async function vincular() {
    setMsg("");
    try {
      const n = await vincularOrfaos(uid, cart, sem, cats);
      setMsg(`${n} lançamento${n === 1 ? "" : "s"} ligado${n === 1 ? "" : "s"} à carteira.`);
    } catch (e) { console.error(e); setMsg("Não consegui ligar à carteira. Verifique a internet e tente de novo."); }
  }

  return (
    <section className="painel3d rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">Investimentos</h2>
        <Olho oculto={oculto} onClick={alternar} className="h-9 w-9" />
      </div>
      <p className="mb-3 text-sm text-suave">Saldo de cada investimento da sua carteira: o que você aportou, menos o que resgatou, mais o rendimento.</p>
      {msg && <p role="status" className="mb-3 text-sm font-medium text-[#34D399]">{msg}</p>}
      {!todos.length && <p className="mb-3 text-sm text-suave">Crie seus investimentos na aba Investimentos para aportar e resgatar por aqui.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {todos.map((it) => {
          const saldo = saldoItem(it, inv, donoRend);
          const mes = doMes.filter((l) => mesmoItem(l, it, donoRend));
          const mesAp = mes.filter((l) => !l.rendimento).reduce((s, l) => s + l.valor, 0), mesRe = mes.filter((l) => l.rendimento).reduce((s, l) => s + l.valor, 0);
          const rend = inv.filter((l) => l.rendimento && mesmoItem(l, it, donoRend)).reduce((s, l) => s + l.valor, 0);
          const cor = it.cor || "#8B5CF6", ab = aberto?.id === it.id;
          return (
            <div key={it.id} className="rounded-2xl bg-[#141414] p-4" style={{ boxShadow: `0 0 14px ${cor}22` }}>
              <p className="text-xs text-suave">{it.tipoNome}</p>
              <b style={{ color: cor }}>{it.nome}</b>
              <p className="text-2xl font-extrabold tabular-nums">{brl(saldo)}</p>
              <p className="text-xs tabular-nums text-suave">Neste mês: <b style={{ color: mesAp < 0 ? "#F87171" : cor }}>{sinal(mesAp)}</b>{mesRe !== 0 && ` · rendimento ${sinal(mesRe)}`}</p>
              {rend !== 0 && <p className="text-xs tabular-nums text-suave">Rendimentos acumulados: {brl(rend)}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {[["aporte", "+ Aportar"], ["resgate", "− Resgatar"], ["rendimento", "+ Rendimento"]].map(([t, r]) => (
                  <button key={t} type="button" onClick={() => { setMsg(""); setAberto(ab && aberto.tipo === t ? null : { id: it.id, tipo: t }); }}
                    className="rounded-xl border border-borda px-3 py-2 text-sm font-bold" style={ab && aberto.tipo === t ? { background: cor, color: "#fff", borderColor: cor } : {}}>{r}</button>
                ))}
              </div>
              {ab && <Movimento it={it} tipo={aberto.tipo} uid={uid} cats={cats} metas={metas} saldo={saldo} fechar={() => setAberto(null)} avisar={setMsg} />}
            </div>
          );
        })}
        {sem.length > 0 && (
          <div className="rounded-2xl bg-[#141414] p-4 md:col-span-2">
            <b>{sem.length} lançamento{sem.length > 1 && "s"} sem cofrinho na carteira</b>
            <p className="mt-1 text-xs text-suave">Eles não entram em nenhum saldo acima. Escolha em qual cofrinho cada um entra: o valor não muda, só passa a contar no saldo dele.</p>
            <ul className="mt-3 space-y-2">
              {sem.map((l) => (
                <li key={l.docId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-suave">{String(l.data || "").split("-").reverse().slice(0, 2).join("/")} · {l.rendimento ? "Rendimento" : l.valor < 0 ? "Resgate" : "Aporte"} · {l.categoria || "Outros"}{l.descricao && ` · ${l.descricao}`}</span>
                  <span className="flex items-center gap-2">
                    <b className="tabular-nums">{brlReal(l.valor)}</b>
                    <select value="" onChange={(e) => ligar(l, e.target.value)} aria-label="Ligar a um cofrinho" className="rounded-lg border border-borda bg-[#141414] px-2 py-1.5 text-sm text-tinta">
                      <option value="">Ligar a…</option>
                      {todos.map((it) => <option key={it.id} value={it.id}>{it.nome}</option>)}
                    </select>
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={vincular} className="mt-3 text-xs text-suave underline">Prefiro cadastrar tudo automaticamente pelo nome da categoria</button>
          </div>
        )}
      </div>
    </section>
  );
}
