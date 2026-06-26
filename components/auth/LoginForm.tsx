"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { credentialsSchema } from "@/lib/validations";
import { createClient } from "@/lib/supabase/client";

// Email/password sign-in via Supabase Auth.
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "輸入有誤");
      return;
    }
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (signInError) {
      setLoading(false);
      // Avoid leaking which part was wrong.
      setError(
        signInError.message.toLowerCase().includes("invalid")
          ? "email 或密碼錯誤。"
          : "登入失敗，請稍後再試。"
      );
      return;
    }

    // Navigate first, THEN refresh — so the refresh re-renders the destination
    // route *and the shared layout* (Navbar) with the new session. Doing it the
    // other way round refreshes /login and the push lands without updating the
    // layout, leaving the navbar stale.
    router.push("/timetable");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          密碼
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-[hsl(var(--warning))]">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "登入中…" : "登入"}
      </Button>
    </form>
  );
}
