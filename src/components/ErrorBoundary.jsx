import React from 'react';

/** 
 * Global React Error Boundary — вместо чёрного экрана показывает ошибку 
 */
export class ErrorBoundary extends React.Component {
  constructor(props) { 
    super(props); 
    this.state = { error: null, info: null }; 
  }
  
  componentDidCatch(error, info) { 
    this.setState({ error, info }); 
    console.error('[Application Error]', error, info);
  }
  
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'monospace' }}>
          <div style={{ maxWidth: 700, width: '100%', background: '#0d0d0d', border: '1px solid rgba(255,0,0,0.3)', borderRadius: 16, padding: '2rem', boxShadow: '0 0 40px rgba(255,0,0,0.1)' }}>
            <h1 style={{ color: '#ff4444', fontSize: 16, fontWeight: 900, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.2em' }}>⚠ Ошибка Приложения</h1>
            <p style={{ color: '#ff6666', fontSize: 13, marginBottom: 16, wordBreak: 'break-word' }}>{String(this.state.error)}</p>
            <pre style={{ background: '#000', color: '#888', fontSize: 10, padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.info?.componentStack}</pre>
            <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 24px', background: '#00f0ff', color: '#000', border: 'none', borderRadius: 8, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Перезагрузить</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
