
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';
import AuthPage from './AuthPage';
import App from './App';
import './styles.css';

function WeatherPulse() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    }).catch(() => setChecking(false));

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, currentSession) => {
        setSession(currentSession);
        setChecking(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  if (checking) {
    return <div className="auth-page">Loading WeatherPulse...</div>;
  }

  if (!session) {
    return <AuthPage />;
  }

  return (
    <>
      <div style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 1000
      }}>
        <button
          onClick={() => void supabase.auth.signOut()}
          style={{
            padding: '12px 20px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </div>
      <App />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WeatherPulse />
  </React.StrictMode>
);
