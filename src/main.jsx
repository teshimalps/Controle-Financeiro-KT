import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// Instalação como app: guarda o convite do navegador (Android/Chrome) e registra o service worker
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__instalar = e;
  window.dispatchEvent(new Event("instalar-disponivel"));
});
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(console.error));
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
