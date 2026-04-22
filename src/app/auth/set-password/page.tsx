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
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2, Eye, EyeOff, Lock, CheckCircle2, AlertCircle, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

type Stage = "verifying" | "ready" | "submitting" | "done" | "error";

// ── Password strength — tiny client-side helper ────────────────

interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  hint: string;
}

function scorePassword(pw: string): Strength {
  if (!pw) return { score: 0, label: "", hint: "" };
  let score: Strength["score"] = 0;
  if (pw.length >= 8) score = 1;
  if (pw.length >= 12 && /[a-z]/.test(pw) && /[A-Z]/.test(pw)) score = 2;
  if (score >= 2 && /\d/.test(pw)) score = 3;
  if (score >= 3 && /[^A-Za-z0-9]/.test(pw)) score = 4;
  const labels = ["Too short", "Weak", "Okay", "Strong", "Very strong"] as const;
  const hints = [
    "At least 8 characters.",
    "Add uppercase + numbers for a stronger password.",
    "Add a digit for a stronger password.",
    "Add a symbol for maximum strength.",
    "Looks good.",
  ];
  return { score, label: labels[score]!, hint: hints[score]! };
}

// ── Page ───────────────────────────────────────────────────────

export default function SetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stage, setStage] = useState<Stage>("verifying");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);

  const strength = useMemo(() => scorePassword(password), [password]);
  const match = password.length > 0 && password === confirm;
  const passesLength = password.length >= 8;
  const busy: boolean = stage === "submitting" || stage === "verifying";
  const canSubmit: boolean = passesLength && match && !busy;

  // ── Step 1: exchange the recovery code / token for a session ──
  // Supabase puts the recovery identifier in a few different places
  // depending on the flow version. We try each:
  //   1. ?code=… query param (newer PKCE flow)
  //   2. #access_token=…&refresh_token=… fragment (legacy)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const sb = getSupabase();

      // If the URL has a `code` query param, trade it for a session.
      const code = searchParams?.get("code");
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setStage("error");
          setErrorMsg(
            "This link has expired or already been used. Ask your hiring contact to send a fresh invite.",
          );
          return;
        }
        setStage("ready");
        return;
      }

      // Fragment-based tokens (legacy recovery links).
      if (typeof window !== "undefined" && window.location.hash) {
        const frag = new URLSearchParams(window.location.hash.slice(1));
        const access = frag.get("access_token");
        const refresh = frag.get("refresh_token");
        if (access && refresh) {
          const { error } = await sb.auth.setSession({
            access_token: access,
            refresh_token: refresh,
          });
          if (cancelled) return;
          if (error) {
            setStage("error");
            setErrorMsg(
              "This link is invalid or expired. Request a new password reset from the Takeover app.",
            );
            return;
          }
          // Wipe the fragment so it doesn't leak via history.
          window.history.replaceState(null, "", window.location.pathname);
          setStage("ready");
          return;
        }
      }

      // Fallback: maybe a session already exists (user re-loaded
      // the page after a successful code exchange). Check.
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setStage("ready");
        return;
      }

      setStage("error");
      setErrorMsg(
        "No recovery link detected. Use the link from your email — don't navigate to this page directly.",
      );
    })();

    return () => { cancelled = true; };
  }, [searchParams]);

  const submit = async () => {
    if (!canSubmit) return;
    setStage("submitting");
    setErrorMsg(null);
    const sb = getSupabase();
    const { error } = await sb.auth.updateUser({ password });
    if (error) {
      setStage("ready");
      setErrorMsg(
        error.message.toLowerCase().includes("same")
          ? "New password can't be the same as your current one."
          : error.message,
      );
      return;
    }
    // Sign out after password set so the Takeover desktop app sees
    // a clean slate and prompts a real sign-in.
    await sb.auth.signOut().catch(() => {});
    setStage("done");
  };

  return (
    <main className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex">
      <BrandPanel />

      <section className="flex flex-1 items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-[400px]">
          {stage === "verifying" && (
            <div className="flex items-center gap-2 text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[13px]">Verifying your link…</span>
            </div>
          )}

          {stage === "error" && (
            <div>
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10">
                <AlertCircle className="h-4 w-4 text-red-400" />
              </div>
              <h1 className="text-[22px] font-bold tracking-tight text-zinc-100">
                Can't use this link
              </h1>
              <p className="mt-2 text-[13px] text-zinc-400">{errorMsg}</p>
              <button
                type="button"
                onClick={() => router.replace("/")}
                className="mt-6 text-[12px] text-zinc-500 hover:text-zinc-200 underline underline-offset-2"
              >
                Back to home
              </button>
            </div>
          )}

          {stage === "done" && (
            <div>
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <h1 className="text-[22px] font-bold tracking-tight text-zinc-100">
                Password set
              </h1>
              <p className="mt-2 text-[13px] text-zinc-400 leading-relaxed">
                Open the <b className="text-zinc-200">Takeover</b> desktop app
                and sign in with your email + the password you just set.
              </p>
              <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
                  Next
                </p>
                <ol className="space-y-1.5 text-[12px] text-zinc-300 list-decimal list-inside">
                  <li>Open Takeover on your computer</li>
                  <li>Enter the email your invite was sent to</li>
                  <li>Enter the password you just set</li>
                  <li>Work through your onboarding checklist</li>
                </ol>
              </div>
            </div>
          )}

          {(stage === "ready" || stage === "submitting") && (
            <>
              <div className="mb-6">
                <h1 className="text-[24px] font-bold tracking-tight text-zinc-100">
                  Set your password
                </h1>
                <p className="mt-1.5 text-[13px] text-zinc-400 leading-relaxed">
                  Pick a password at least 8 characters long. You'll use this
                  + your email to sign into Takeover.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">
                    New password
                  </label>
                  <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 focus-within:border-zinc-500 focus-within:bg-zinc-900 transition-colors">
                    <Lock className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    <input
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="flex-1 bg-transparent text-[14px] text-zinc-100 placeholder:text-zinc-600 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="text-zinc-500 hover:text-zinc-200 transition-colors"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <StrengthBar strength={strength} />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">
                    Confirm password
                  </label>
                  <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 focus-within:border-zinc-500 focus-within:bg-zinc-900 transition-colors">
                    <Lock className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    <input
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-enter password"
                      className="flex-1 bg-transparent text-[14px] text-zinc-100 placeholder:text-zinc-600 outline-none"
                    />
                  </div>
                  {confirm.length > 0 && !match && (
                    <p className="mt-1.5 text-[11px] text-red-400">
                      Passwords don't match.
                    </p>
                  )}
                </div>

                {errorMsg && (
                  <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-red-400 shrink-0" />
                    <p className="text-[12px] text-red-200 leading-snug">{errorMsg}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-2.5 text-[13px] font-semibold text-zinc-950 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {busy ? "Saving…" : "Set password"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

// ── Strength bar ───────────────────────────────────────────────

function StrengthBar({ strength }: { strength: Strength }) {
  if (strength.score === 0) {
    return <p className="mt-1.5 text-[10.5px] text-zinc-600">At least 8 characters.</p>;
  }
  const colors = [
    "bg-red-500",
    "bg-amber-500",
    "bg-yellow-500",
    "bg-emerald-500",
    "bg-emerald-400",
  ];
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={`h-1 flex-1 rounded-full ${
              strength.score >= n ? colors[strength.score]! : "bg-zinc-800"
            }`}
          />
        ))}
      </div>
      <p className="text-[10.5px] text-zinc-500">
        <b className="text-zinc-300">{strength.label}</b> — {strength.hint}
      </p>
    </div>
  );
}

// ── Brand panel (mirrors login.tsx on the Takeover side) ───────

function BrandPanel() {
  return (
    <aside className="hidden lg:flex relative w-[46%] min-w-[440px] max-w-[620px] flex-col justify-between overflow-hidden border-r border-zinc-900/80 bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-900 p-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 45%),
            radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.12) 0%, transparent 40%),
            radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.08) 0%, transparent 50%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-zinc-100 to-zinc-400 flex items-center justify-center font-bold text-zinc-950 text-[15px]">
            T
          </div>
          <div>
            <p className="text-[15px] font-bold tracking-tight text-zinc-100">Takeover</p>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              Ops Platform
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-[420px]">
        <h2 className="text-[28px] font-bold tracking-tight text-zinc-100 leading-[1.15]">
          One last step — pick a password.
        </h2>
        <p className="mt-3 text-[13px] text-zinc-400 leading-relaxed">
          This password is only for signing in. You can reset it any time
          from the sign-in screen if you ever forget it.
        </p>

        <ul className="mt-8 space-y-4">
          <Feature
            icon={ShieldCheck}
            title="Stored securely"
            body="Passwords are hashed by Supabase Auth — nobody at CodeWithAli can see yours."
          />
          <Feature
            icon={Users}
            title="Only you, only Takeover"
            body="Your login works only for the Takeover app. No cross-site reuse risk."
          />
          <Feature
            icon={Sparkles}
            title="Reset any time"
            body="Click 'Forgot password?' on the sign-in screen to send a new link to your email."
          />
        </ul>
      </div>

      <div className="relative z-10 flex items-center justify-between text-[10.5px] text-zinc-600">
        <span>© {new Date().getFullYear()} CodeWithAli LLC</span>
        <span className="font-mono">v2</span>
      </div>
    </aside>
  );
}

function Feature({
  icon: Icon, title, body,
}: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/80">
        <Icon className="h-3.5 w-3.5 text-zinc-300" />
      </div>
      <div>
        <p className="text-[12.5px] font-semibold text-zinc-200">{title}</p>
        <p className="mt-0.5 text-[11.5px] text-zinc-500 leading-snug">{body}</p>
      </div>
    </li>
  );
}
