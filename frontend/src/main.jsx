import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { RatesProvider } from './contexts/RatesContext';
import { ToastProvider } from './contexts/ToastContext';
import App from './App.jsx';
import './index.css';
import './styles/theme.css';
import { queryClient } from './queryClient.js';
import './i18n';


// Mount the root React component into the div#root defined in index.html
ReactDOM.createRoot(document.getElementById('root')).render(
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