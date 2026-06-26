"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { credentialsSchema } from "@/lib/validations";
import { createClient } from "@/lib/supabase/client";

// Email/password sign-up via Supabase Auth. Only email + password (min 8).
// We intentionally do NOT ask for student id or real name.
export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "輸入有誤");
      return;
    }
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (signUpError) {
      setLoading(false);
      setError(
        signUpError.message.toLowerCase().includes("already")
          ? "此 email 已註冊，請改用登入。"
          : "註冊失敗，請稍後再試。"
      );
      return;
    }

    if (data.session) {
      // Email confirmation disabled → already signed in. Navigate then refresh
      // so the shared layout (Navbar) re-renders with the new session.
      router.push("/timetable");
      router.refresh();
      return;
    }

    // Email confirmation enabled → no session yet.
    setLoading(false);
    setMessage("帳號已建立。若收到確認信，請點擊確認後再登入。");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="reg-email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="reg-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="reg-password" className="text-sm font-medium">
          密碼
        </label>
        <Input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">至少 8 個字元。</p>
      </div>
      {error && <p className="text-sm text-[hsl(var(--warning))]">{error}</p>}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "處理中…" : "建立帳號"}
      </Button>
    </form>
  );
}
