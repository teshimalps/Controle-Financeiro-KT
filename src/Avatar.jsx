export default function Avatar({ foto, nome, tam = 36 }) {
  const est = { width: tam, height: tam };
  return foto ? (
    <img src={foto} alt="" style={est} className="shrink-0 rounded-full object-cover ring-1 ring-neon/60" />
  ) : (
    <span style={est} className="grid shrink-0 place-items-center rounded-full bg-neon/20 font-bold ring-1 ring-neon/60">
      {(nome || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}
