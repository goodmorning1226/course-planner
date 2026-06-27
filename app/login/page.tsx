import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <header className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">登入</h1>
        <p className="text-sm text-muted-foreground">
          登入後可將課表同步到雲端、跨裝置使用。
        </p>
      </header>

      <LoginForm />

      <p className="text-center text-sm text-muted-foreground">
        還沒有帳號？{" "}
        <Link href="/register" className="font-medium text-foreground underline">
          註冊
        </Link>
      </p>
    </div>
  );
}
