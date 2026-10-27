import { useState } from "react";
import { collection, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { brl } from "./util.js";

const soma = (l) => l.reduce((s, x) => s + (Number(x.valor) || 0), 0);

function baixar(nome, obj) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Deixa os investimentos "como novos": apaga aportes, resgates e rendimentos e zera o valor inicial de cada item da carteira.
// Entradas, saídas, categorias e metas não são tocadas. Os tipos e cofrinhos continuam cadastrados, só com saldo zero.
export default function ZerarInvestimentos({ uid, painel }) {
  const [dados, setDados] = useState(null);
  const [comRend, setComRend] = useState(true);
  const [backup, setBackup] = useState(false);
  const [txt, setTxt] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function conferir() {
    setMsg(""); setBackup(false); setTxt(""); setOcupado(true);
    try {
      const [c, s] = await Promise.all([
        getDoc(doc(db, "users", uid, "config", "carteira")),
        getDocs(query(collection(db, "users", uid, "lancamentos"), where("tipo", "==", "investimento"))),
      ]);
      setDados({ carteira: c.data() || {}, lanc: s.docs.map((d) => ({ docId: d.id, ...d.data() })) });
    } catch (e) { console.error(e); setMsg("Não consegui ler os dados. Verifique a internet e tente de novo."); } finally { setOcupado(false); }
  }

  async function zerar() {
    setOcupado(true); setMsg("");
    try {
      const apagar = dados.lanc.filter((l) => comRend || !l.rendimento);
      for (let k = 0; k < apagar.length; k += 400) {
        const lote = writeBatch(db);
        apagar.slice(k, k + 400).forEach((l) => lote.delete(doc(db, "users", uid, "lancamentos", l.docId)));
        await lote.commit();
      }
      const grupos = (dados.carteira.grupos || []).map((g) => ({ ...g, itens: (g.itens || []).map(({ valor, ...i }) => ({ ...i, inicial: 0 })) }));
      await setDoc(doc(db, "users", uid, "config", "carteira"), { grupos }, { merge: true });
      setDados(null);
      setMsg(`Pronto: ${apagar.length} lançamento${apagar.length === 1 ? "" : "s"} de investimento apagado${apagar.length === 1 ? "" : "s"} e o valor inicial de todos os cofrinhos zerado. Recarregue a página para ver os saldos em R$ 0,00.`);
    } catch (e) {
      console.error(e);
      setMsg("Não consegui terminar. Pode ter ficado pela metade: recarregue, toque em Conferir de novo e repita. O arquivo de backup baixado guarda tudo.");
    } finally { setOcupado(false); }
  }

  const itens = dados ? (dados.carteira.grupos || []).flatMap((g) => g.itens || []) : [];
  const inicial = soma(itens.map((i) => ({ valor: i.inicial ?? i.valor })));
  const aportes = dados ? dados.lanc.filter((l) => !l.rendimento) : [];
  const rends = dados ? dados.lanc.filter((l) => l.rendimento) : [];
  const pronto = backup && txt.trim().toUpperCase() === "ZERAR" && !ocupado;

  return (
    <section className={painel}>
      <h2 className="font-bold">Zerar investimentos</h2>
      <p className="text-sm text-suave">Apaga todos os aportes, resgates e rendimentos e zera o valor inicial de cada cofrinho, como se você nunca tivesse investido. Entradas, saídas, categorias e metas não mudam. Seus tipos e cofrinhos continuam cadastrados, com saldo R$ 0,00.</p>
      {!dados ? (
        <button type="button" onClick={conferir} disabled={ocupado} className="btn-vidro text-sm">{ocupado ? "Lendo…" : "Conferir o que será zerado"}</button>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-1 text-sm tabular-nums">
            <li>Valor inicial nos cofrinhos: <b>{brl(inicial)}</b> ({itens.length} cofrinho{itens.length === 1 ? "" : "s"})</li>
            <li>Aportes e resgates: <b>{aportes.length}</b> lançamento{aportes.length === 1 ? "" : "s"}, soma <b>{brl(soma(aportes))}</b></li>
            <li>Rendimentos: <b>{rends.length}</b> lançamento{rends.length === 1 ? "" : "s"}, soma <b>{brl(soma(rends))}</b></li>
          </ul>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={comRend} onChange={(e) => setComRend(e.target.checked)} className="mt-1" />
            <span>Apagar também os rendimentos. Sem isso, os saldos ficam iguais à soma dos rendimentos que sobrarem, e não R$ 0,00.</span>
          </label>
          <div className="space-y-2 rounded-xl bg-[#1A1A1A] p-3">
            <p className="text-sm font-bold">1. Baixe o backup</p>
            <button type="button" onClick={() => { baixar(`backup-investimentos-${new Date().toISOString().slice(0, 10)}.json`, { carteira: dados.carteira, lancamentos: dados.lanc }); setBackup(true); }} className="btn-vidro text-sm">{backup ? "Backup baixado ✓ (baixar de novo)" : "Baixar backup (JSON)"}</button>
            <p className="text-sm font-bold">2. Digite ZERAR para confirmar</p>
            <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="ZERAR" autoCapitalize="characters" className="w-full rounded-xl border border-borda bg-[#141414] px-4 py-3 text-tinta" aria-label="Digite ZERAR" />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={zerar} disabled={!pronto} className="rounded-xl bg-neon px-5 py-2.5 font-bold text-white disabled:opacity-40">{ocupado ? "Zerando…" : "Zerar investimentos"}</button>
            <button type="button" onClick={() => setDados(null)} disabled={ocupado} className="text-sm text-suave underline">Cancelar</button>
          </div>
          <p className="text-xs text-suave">Depois de zerar não dá para desfazer pelo app. Só o arquivo de backup guarda os valores antigos.</p>
        </div>
      )}
      {msg && <p role="status" className="text-sm text-suave">{msg}</p>}
    </section>
  );
}
