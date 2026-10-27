import { useEffect, useMemo, useState } from "react";
import { FILTROS_PADRAO, FONTE_DE_EXEMPLO, avaliar, buscarAcoes, lerFiltros, salvarFiltros } from "./triagem.js";

const campo = "w-full rounded-xl border border-borda bg-[#141414] px-3 py-2 text-tinta";
const num = (v) => (v === "" || v == null ? null : Number(v));

function Num({ rotulo, dica, valor, onChange, passo = 1, sufixo }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-suave">{rotulo}</span>
      <div className="flex items-center gap-2">
        <input className={campo} type="number" inputMode="decimal" step={passo} min="0" value={valor ?? ""} placeholder="desligado" onChange={(e) => onChange(num(e.target.value))} aria-label={rotulo} />
        {sufixo && <span className="text-sm text-suave">{sufixo}</span>}
      </div>
      {dica && <span className="block text-[11px] leading-tight text-suave">{dica}</span>}
    </label>
  );
}

// Busca avançada de ações: lista as ações da fonte e filtra pelos critérios do método ARCA.
export default function BuscaAcoes({ jaTem, onAdd }) {
  const [filtros, setFiltros] = useState(lerFiltros);
  const [acoes, setAcoes] = useState(null);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [soPassam, setSoPassam] = useState(true);
  const [abrirFiltros, setAbrirFiltros] = useState(false);

  useEffect(() => { buscarAcoes().then(setAcoes).catch(() => setErro("Não consegui carregar as ações. Tente de novo mais tarde.")); }, []);
  useEffect(() => { salvarFiltros(filtros); }, [filtros]);

  const mudar = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));
  const resultado = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return (acoes || [])
      .filter((a) => !q || a.ticker.toLowerCase().includes(q) || a.nome.toLowerCase().includes(q) || (a.setor || "").toLowerCase().includes(q))
      .map((a) => ({ a, av: avaliar(a, filtros) }))
      .sort((x, y) => Number(y.av.tudo) - Number(x.av.tudo) || y.av.passou - x.av.passou);
  }, [acoes, filtros, texto]);
  const visiveis = soPassam ? resultado.filter((r) => r.av.tudo) : resultado;
  const nPassam = resultado.filter((r) => r.av.tudo).length;
  const tem = (t) => (jaTem || []).some((n) => n.trim().toLowerCase() === t.toLowerCase());

  return (
    <div className="space-y-3">
      <p className="font-bold">Buscar ações</p>
      {FONTE_DE_EXEMPLO && <p role="note" className="rounded-xl bg-[#FBBF24]/10 p-2 text-xs text-[#FBBF24]">Dados de exemplo: empresas fictícias, só para testar a tela. Os números não são cotações reais.</p>}
      <input className={campo} placeholder="Buscar por código, nome ou setor" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar ações" />

      <div className="rounded-xl bg-[#141414] p-3">
        <button type="button" onClick={() => setAbrirFiltros(!abrirFiltros)} aria-expanded={abrirFiltros} className="flex w-full items-center justify-between text-left text-sm font-bold">
          <span>Filtros do método ARCA</span><span className="text-suave">{abrirFiltros ? "Fechar" : "Alterar"}</span>
        </button>
        {abrirFiltros && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Num rotulo="ROE mínimo" sufixo="%" valor={filtros.roeMin} onChange={(v) => mudar("roeMin", v)} dica="Qualidade: o ideal é 15% a 20% ou mais." />
              <Num rotulo="Anos de ROE" sufixo="anos" valor={filtros.anosRoe} onChange={(v) => mudar("anosRoe", Math.min(10, Math.max(1, v ?? 5)))} dica="De 5 a 10 anos de histórico." />
              <Num rotulo="Crescimento do lucro" sufixo="% ao ano" valor={filtros.lucroCagrMin} passo={0.5} onChange={(v) => mudar("lucroCagrMin", v)} dica="Mínimo anual composto. 0 = estável ou crescente." />
              <Num rotulo="Tempo na bolsa" sufixo="anos" valor={filtros.anosListagemMin} onChange={(v) => mudar("anosListagemMin", v)} dica="Já passou por crises e juros altos." />
              <Num rotulo="Dívida líq. / EBITDA" sufixo="x máx." valor={filtros.dividaEbitdaMax} passo={0.1} onChange={(v) => mudar("dividaEbitdaMax", v)} dica="Menor que 3x indica dívida sob controle." />
              <Num rotulo="Dividend yield" sufixo="% mín." valor={filtros.dyMin} passo={0.5} onChange={(v) => mudar("dyMin", v)} dica="Foco em empresas que pagam dividendos." />
              <Num rotulo="P/L máximo" valor={filtros.plMax} passo={0.5} onChange={(v) => mudar("plMax", v)} dica="Opcional: pilar preço." />
              <label className="block space-y-1">
                <span className="text-xs text-suave">Governança</span>
                <select className={campo} value={filtros.governanca} onChange={(e) => mudar("governanca", e.target.value)} aria-label="Governança">
                  <option value="qualquer">Qualquer</option>
                  <option value="nivel2">Nível 2 ou Novo Mercado</option>
                  <option value="novo">Só Novo Mercado</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filtros.lucroPositivo} onChange={(e) => mudar("lucroPositivo", e.target.checked)} />Lucro positivo em todos os anos</label>
            <button type="button" onClick={() => setFiltros({ ...FILTROS_PADRAO })} className="text-sm text-suave underline">Voltar aos valores padrão</button>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soPassam} onChange={(e) => setSoPassam(e.target.checked)} />Mostrar só as que passam em todos os filtros ({nPassam} de {resultado.length})</label>

      {erro && <p role="alert" className="text-sm text-[#F87171]">{erro}</p>}
      {!acoes && !erro && <p className="text-sm text-suave">Carregando…</p>}
      {acoes && !visiveis.length && <p className="text-sm text-suave">Nenhuma ação passa nesses filtros. Afrouxe algum valor ou desmarque a opção acima.</p>}
      <ul className="space-y-2">
        {visiveis.map(({ a, av }) => (
          <li key={a.ticker} className="space-y-2 rounded-xl bg-[#141414] p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <b>{a.ticker}</b> <span className="text-xs text-suave">{a.setor}</span>
                <p className="truncate text-xs text-suave">{a.nome}</p>
              </div>
              <span className="text-xs tabular-nums text-suave">{av.passou}/{av.total}</span>
              <button type="button" disabled={tem(a.ticker)} onClick={() => onAdd(a.ticker)} className="btn-vidro px-3 py-1.5 text-sm disabled:opacity-40">{tem(a.ticker) ? "Na carteira" : "+ Carteira"}</button>
            </div>
            <ul className="grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-2">
              {av.criterios.map((c) => (
                <li key={c.chave} className={c.ok === true ? "text-[#34D399]" : c.ok === false ? "text-[#F87171]" : "text-suave"}>
                  {c.ok === true ? "✓" : c.ok === false ? "✗" : "–"} {c.txt}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-tight text-suave">Ferramenta educacional de triagem. Não é recomendação de investimento: confira os números e o negócio antes de comprar.</p>
    </div>
  );
}
