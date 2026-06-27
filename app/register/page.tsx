import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <header className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">註冊</h1>
        <p className="text-sm text-muted-foreground">
          此組帳號僅供儲存課表用，我們不會使用任何資料。
        </p>
      </header>

      <RegisterForm />

      <p className="text-center text-sm text-muted-foreground">
        已經有帳號了？{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          登入
        </Link>
      </p>
    </div>
  );
}
