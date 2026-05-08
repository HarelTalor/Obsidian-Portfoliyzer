"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("[AuthContext] Initializing, current URL:", typeof window !== "undefined" ? window.location.href : "SSR");
    
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      console.log("[AuthContext] getSession resolved:", s ? "Session found" : "No session");
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    }).catch((err) => {
      console.error("[AuthContext] Error getting session:", err);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("[AuthContext] onAuthStateChange event:", event, "Session:", s ? "Exists" : "Null");
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);

      if (s && typeof window !== "undefined" && window.location.hash.includes("access_token")) {
        console.log("[AuthContext] Clearing access_token from URL hash");
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
