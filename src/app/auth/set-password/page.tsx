/**
 * /auth/set-password — landing page for both flows:
 *
 *   · INVITE: new hire opens their invite email, link brings them
 *     here with a recovery-style code. They set their initial
 *     password and are signed in. Next step: go open Takeover.
 *   · RESET:  existing user clicks "Forgot password?" in Takeover,
 *     receives the reset email, clicks through here. Same UI,
 *     same flow — just chooses a new password.
 *
 * Supabase invite + reset emails both land with a `code=` or
 * recovery-token fragment. @supabase/supabase-js exchanges those
 * for a session via `exchangeCodeForSession` (code) or the URL
 * fragment is parsed automatically for recovery links.
 *
 * After setting the password, we don't redirect back into Takeover
 * (desktop — no URL) — we just show a "Now open the Takeover app
 * and sign in with your new password" instruction. Keeps the flow
 * simple across desktop/web boundary.
 *
 * Structure: the default export is a tiny server component that
 * wraps the actual client form in a <Suspense> boundary. Next.js
 * 15+ requires this because the form uses useSearchParams() —
 * calling it directly in a top-level client page bails out the
 * entire static-prerender pass and fails the build with
 * "useSearchParams() should be wrapped in a suspense boundary."
 */

import { Suspense } from "react";
import SetPasswordForm from "./SetPasswordForm";
import { Loader2 } from "lucide-react";

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex items-center justify-center">
          <div className="flex items-center gap-2 text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[13px]">Loading…</span>
          </div>
        </main>
      }
    >
      <SetPasswordForm />
    </Suspense>
  );
}
