import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { RatesProvider } from "./contexts/RatesContext";
import { ToastProvider } from "./contexts/ToastContext";
import App from "./App.jsx";
import "./index.css";
import "./styles/theme.css";
import { queryClient } from "./queryClient.js";
import "./i18n";

// Render's free tier spins the backend down after 15 min idle and can take
// up to ~100s to wake back up. Firing a fire-and-forget ping the moment the
// bundle loads — rather than waiting for the first authenticated data
// fetch — starts that wake-up clock as early as possible, in parallel with
// auth resolving, so by the time Dashboard actually asks for data the
// backend has a head start (or is already warm).
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";
fetch(`${API_BASE_URL}/`).catch(() => {});

// Mount the root React component into the div#root defined in index.html
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <RatesProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </RatesProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
