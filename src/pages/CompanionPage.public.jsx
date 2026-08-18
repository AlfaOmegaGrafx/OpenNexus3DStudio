import React from 'react';
import { Link } from 'react-router-dom';

/** Public /companion placeholder. Local Studio loads the gitignored moat page via Vite alias. */
export default function CompanionPage() {
  return (
    <div style={{ padding: '2rem', color: '#e8edf5', background: '#0e1117', minHeight: '100vh' }}>
      <Link to="/" style={{ color: '#8ec5ff' }}>← Viewport</Link>
      <h1 style={{ marginTop: '1rem' }}>Companion</h1>
      <p style={{ maxWidth: '36rem', color: '#8b97ab' }}>
        Voice companion for your VRM is part of the local Studio build. The public demo does not
        embed a live chat runtime.
      </p>
    </div>
  );
}
