import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Refresh the Supabase session cookie on each request.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Everything except Next internals and static asset files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
