"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { signInWithGoogle, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  const handleGoogle = async () => {
    setLoading(true); setError(null);
    const { error: err } = await signInWithGoogle();
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 40 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--accent-green-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <TrendingUp size={22} style={{ color: "var(--accent-green)" }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 22, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Obsidian <span style={{ color: "var(--accent-green)" }}>Portfoliyzer</span>
          </span>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 32 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4, textAlign: "center" }}>
            Welcome
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", marginBottom: 28 }}>
            Sign in to manage your portfolio
          </p>

          {error && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "var(--accent-rose-dim)", borderRadius: 8, color: "var(--accent-rose)", fontSize: 12, marginBottom: 16 }}><AlertCircle size={14} />{error}</div>}

          {/* Google Auth */}
          <button onClick={handleGoogle} disabled={loading} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "13px 16px", borderRadius: 10, border: "1px solid var(--border-default)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.2s" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "var(--bg-secondary)"}>
            {loading ? <Loader2 size={18} style={{ animation: "spin 0.6s linear infinite" }} /> : (
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            )}
            Continue with Google
          </button>

          <p style={{ textAlign: "center", marginTop: 24, color: "var(--text-muted)", fontSize: 11 }}>
            By signing in, you agree to our Terms of Service
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
