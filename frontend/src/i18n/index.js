import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import hi from "./locales/hi.json";

const STORAGE_KEY = "language";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी (Hindi)" },
];

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: localStorage.getItem(STORAGE_KEY) || "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLanguage(code) {
  i18n.changeLanguage(code);
  localStorage.setItem(STORAGE_KEY, code);
}

export default i18n;
