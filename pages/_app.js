import React from 'react';
import '../styles/globals.css';
import { Toaster } from 'react-hot-toast';

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'rgba(22, 22, 26, 0.92)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            color: '#f0f0f0',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '100px',
            fontWeight: 600,
            fontSize: '13px',
            fontFamily: "'DM Sans', sans-serif",
            boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5)',
            padding: '12px 24px',
          },
          success: {
            iconTheme: { primary: '#6ee7b7', secondary: '#111' },
          },
          error: {
            iconTheme: { primary: '#f87171', secondary: '#111' },
            style: {
              background: 'rgba(248, 113, 113, 0.12)',
              borderColor: 'rgba(248, 113, 113, 0.15)',
              color: '#f87171',
            },
          },
        }}
      />
    </>
  );
}
