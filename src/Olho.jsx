// Botão do olho: fechado = valores escondidos (padrão ao abrir o app), aberto = valores visíveis
export default function Olho({ oculto, onClick, className = "" }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={oculto} aria-label={oculto ? "Mostrar valores" : "Esconder valores"} title={oculto ? "Mostrar valores" : "Esconder valores"}
      className={`grid place-content-center rounded-xl text-suave hover:text-tinta ${oculto ? "" : "text-[#4D8DFF]"} ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {oculto ? (
          <>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <path d="M1 1l22 22" />
          </>
        ) : (
          <>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}
