import { useState } from "react";

// Campo de senha com botão para mostrar/ocultar
export default function CampoSenha({ className = "", ...props }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={ver ? "text" : "password"} className={`${className} pr-24`} />
      <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-3 px-1 text-sm font-bold text-suave">
        {ver ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
