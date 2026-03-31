"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send both username and password
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        window.location.href = '/'; 
      } else {
        setError("Invalid username or password.");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        :root {
          --bg0: #050608; --bg1: #0b0d10; --bg2: #111318;
          --border: #1e2230; --border2: #252a38;
          --amber: #f5a623; --red: #e84040;
          --text-dim: #4a5270; --text-bright: #e8eaf2;
          --font-mono: 'IBM Plex Mono', monospace;
        }
        body { background:var(--bg0); color:var(--text-bright); font-family:var(--font-mono); margin: 0; }
        .login-shell { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; width:100vw; background:var(--bg0); }
        .login-card { background:var(--bg1); border:1px solid var(--border); border-radius:4px; width: 100%; max-width: 380px; box-shadow: 0 24px 64px rgba(0,0,0,0.8); overflow: hidden; }
        .login-header { display:flex; align-items:center; justify-content:center; gap:8px; padding: 24px; border-bottom:1px solid var(--border); background: var(--bg2); }
        .logo-dot { width:8px; height:8px; border-radius:50%; background:var(--amber); box-shadow:0 0 8px var(--amber); animation:pulse 2s ease-in-out infinite; }
        .login-title { font-size:16px; font-weight:600; letter-spacing:0.08em; color:var(--amber); text-transform:uppercase; }
        .login-body { padding: 32px 24px; }
        .login-input { width:100%; background:var(--bg0); border:1px solid var(--border2); color:var(--text-bright); padding:10px 12px; border-radius:3px; font-family:var(--font-mono); font-size:14px; outline:none; transition: border-color 0.2s; box-sizing: border-box; margin-bottom: 16px; }
        .login-input:focus { border-color:var(--amber); }
        .login-btn { width: 100%; padding:10px; border-radius:3px; font-family:var(--font-mono); font-size:12px; font-weight:600; letter-spacing:0.08em; cursor:pointer; border:none; text-transform:uppercase; background:var(--amber); color:#000; transition:all 0.15s ease; margin-top: 8px; }
        .login-btn:hover:not(:disabled) { box-shadow:0 0 12px rgba(245,166,35,0.4); }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .error-msg { color: var(--red); font-size: 11px; margin-bottom: 16px; text-align: center; }
        .input-label { font-size: 11px; color: var(--text-dim); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.1em; display: block; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      <div className="login-shell">
        <div className="login-card fadein">
          <div className="login-header">
            <div className="logo-dot" />
            <span className="login-title">Kalshicast</span>
          </div>
          <div className="login-body">
            <form onSubmit={handleLogin}>
              
              <label className="input-label">System Username</label>
              <input
                type="text"
                className="login-input"
                placeholder="Enter username..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />

              <label className="input-label">System Password</label>
              <input
                type="password"
                className="login-input"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />

              {error && <div className="error-msg">{error}</div>}
              
              <button type="submit" className="login-btn" disabled={loading || !password || !username}>
                {loading ? "Authenticating..." : "Access Dashboard"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}