import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "super_admin" | "company_admin" | "operator";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  companyId: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const loadProfile = async (uid: string) => {
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("company_id").eq("id", uid).maybeSingle(),
    ]);
    setRoles(rolesRes.data?.map((r) => r.role as AppRole) ?? []);
    setCompanyId(profileRes.data?.company_id ?? null);
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // Defer to next tick: chamar supabase.from(...) síncrono dentro de
        // onAuthStateChange causa deadlock no client (issue conhecido).
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setRoles([]);
        setCompanyId(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadProfile(s.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp: AuthContextValue["signUp"] = async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName },
      },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refresh = async () => {
    if (user) await loadProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, roles, companyId, signIn, signUp, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
