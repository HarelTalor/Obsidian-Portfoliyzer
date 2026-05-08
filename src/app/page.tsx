"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, Crosshair, BookOpen, BarChart3, LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import StrategyTab from "@/components/tabs/StrategyTab";
import LedgerTab from "@/components/tabs/LedgerTab";
import AnalyticsTab from "@/components/tabs/AnalyticsTab";

const TABS = [
  { id: "strategy", label: "The Strategy", icon: Crosshair },
  { id: "ledger", label: "Ledger & Action Center", icon: BookOpen },
  { id: "analytics", label: "Analytics & Stats", icon: BarChart3 },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("strategy");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)" }}>
      <Loader2 size={32} style={{ color: "var(--accent-green)", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const userId = user.id;
  const userEmail = user.email || "";
  const initials = userEmail.charAt(0).toUpperCase();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-primary)" }}>
      <header className="glass" style={{ position: "sticky", top: 0, zIndex: 50, borderTop: "none", borderLeft: "none", borderRight: "none", borderRadius: 0, borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px", display: "flex", justifyContent: "space-between", alignItems: "center", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--accent-green-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TrendingUp size={18} style={{ color: "var(--accent-green)" }} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 18, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              Obsidian <span style={{ color: "var(--accent-green)" }}>Portfoliyzer</span>
            </span>
          </div>
          <nav style={{ display: "flex", gap: 4, background: "var(--bg-secondary)", padding: 4, borderRadius: 12, border: "1px solid var(--border-subtle)" }}>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: isActive ? 600 : 500, fontFamily: "var(--font-sans)", transition: "all 0.2s ease", background: isActive ? "var(--bg-card)" : "transparent", color: isActive ? "var(--text-primary)" : "var(--text-muted)", boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.3)" : "none" }}
                  onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "var(--bg-hover)"; } }}
                  onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; } }}>
                  <Icon size={15} />{tab.label}
                </button>
              );
            })}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{userEmail}</span>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--bg-elevated)", border: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{initials}</span>
            </div>
            <button onClick={signOut} title="Sign out" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
              onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent-rose)"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      <main style={{ flex: 1, maxWidth: 1400, width: "100%", margin: "0 auto", padding: "32px 24px 64px" }}>
        {activeTab === "strategy" && <StrategyTab userId={userId} />}
        {activeTab === "ledger" && <LedgerTab userId={userId} userEmail={userEmail} />}
        {activeTab === "analytics" && <AnalyticsTab userId={userId} />}
      </main>
    </div>
  );
}
