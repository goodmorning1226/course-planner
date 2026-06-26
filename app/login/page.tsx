import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = {
  title: "登入｜暫排課（非官方）",
};

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">登入</h1>
        <p className="text-sm text-muted-foreground">
          登入後可將課表同步到雲端、跨裝置使用。
        </p>
      </header>

      <LoginForm />

      <p className="text-sm text-muted-foreground">
        還沒有帳號？{" "}
        <Link href="/register" className="font-medium text-foreground underline">
          註冊
        </Link>
      </p>
    </div>
  );
}
