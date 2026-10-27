import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyCNhjZh5TVBnmrMYKfr4-v2szRbxhnkXRg",
  authDomain: "controle-financeiro-kt.firebaseapp.com",
  projectId: "controle-financeiro-kt",
  storageBucket: "controle-financeiro-kt.firebasestorage.app",
  messagingSenderId: "306660371954",
  appId: "1:306660371954:web:aa4a3089ce3d6e70284f6b",
};

const app = initializeApp(firebaseConfig);

// App Check: em desenvolvimento usa um "token de depuração" (aparece no console do navegador).
// Em produção, usa reCAPTCHA Enterprise (chave vem de VITE_RECAPTCHA_KEY, configuramos depois).
if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_KEY || "sem-chave"),
  isTokenAutoRefreshEnabled: true,
});

export const auth = getAuth(app);
export const db = getFirestore(app);

// Dois modelos: se o primeiro estiver sobrecarregado (erro 500), o chat tenta o segundo.
// Se algum der "modelo não encontrado", troque o nome em firebase.google.com/docs/ai-logic/models
const ai = getAI(app, { backend: new GoogleAIBackend() });
// A 1ª opção pede pouco "raciocínio" ao modelo (bem mais rápido). Se o modelo recusar esse ajuste,
// o chat passa sozinho para a 2ª (sem o ajuste) e depois para o modelo reserva.
const base = { responseMimeType: "application/json", temperature: 0 };
export const modelos = [
  getGenerativeModel(ai, { model: "gemini-3.6-flash", generationConfig: { ...base, thinkingConfig: { thinkingLevel: "minimal" } } }),
  getGenerativeModel(ai, { model: "gemini-3.6-flash", generationConfig: { ...base, thinkingConfig: { thinkingBudget: 0 } } }),
  getGenerativeModel(ai, { model: "gemini-3.6-flash", generationConfig: base }),
  getGenerativeModel(ai, { model: "gemini-3.5-flash-lite", generationConfig: base }),
];
