"use client";

import { useState } from "react";
import { TrendingUp, Crosshair, BookOpen, BarChart3 } from "lucide-react";
import StrategyTab from "@/components/tabs/StrategyTab";
import LedgerTab from "@/components/tabs/LedgerTab";
import AnalyticsTab from "@/components/tabs/AnalyticsTab";

// ============================================
// Tab Definitions
// ============================================
const TABS = [
  { id: "strategy", label: "The Strategy", icon: Crosshair },
  { id: "ledger", label: "Ledger & Action Center", icon: BookOpen },
  { id: "analytics", label: "Analytics & Stats", icon: BarChart3 },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ============================================
// App Shell
// ============================================
export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("strategy");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
      }}
    >
      {/* ========== TOP NAV BAR ========== */}
      <header
        className="glass"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          borderTop: "none",
          borderLeft: "none",
          borderRight: "none",
          borderRadius: 0,
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            padding: "0 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: 64,
          }}
        >
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "var(--accent-green-dim)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TrendingUp size={18} style={{ color: "var(--accent-green)" }} />
            </div>
            <span
              style={{
                fontWeight: 700,
                fontSize: 18,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              Obsidian
              <span style={{ color: "var(--accent-green)", marginLeft: 4 }}>
                Portfoliyzer
              </span>
            </span>
          </div>

          {/* Tab Navigation */}
          <nav
            style={{
              display: "flex",
              gap: 4,
              background: "var(--bg-secondary)",
              padding: 4,
              borderRadius: 12,
              border: "1px solid var(--border-subtle)",
            }}
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    fontFamily: "var(--font-sans)",
                    transition: "all 0.2s ease",
                    background: isActive ? "var(--bg-card)" : "transparent",
                    color: isActive
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    boxShadow: isActive
                      ? "0 2px 8px rgba(0,0,0,0.3)"
                      : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = "var(--text-secondary)";
                      e.currentTarget.style.background = "var(--bg-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = "var(--text-muted)";
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* User Avatar */}
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              U
            </span>
          </div>
        </div>
      </header>

      {/* ========== MAIN CONTENT ========== */}
      <main
        style={{
          flex: 1,
          maxWidth: 1400,
          width: "100%",
          margin: "0 auto",
          padding: "32px 24px 64px",
        }}
      >
        {/* Tab 1: The Strategy */}
        {activeTab === "strategy" && <StrategyTab />}

        {/* Tab 2: Ledger & Action Center */}
        {activeTab === "ledger" && <LedgerTab />}

        {/* Tab 3: Analytics & Stats */}
        {activeTab === "analytics" && <AnalyticsTab />}
      </main>
    </div>
  );
}
