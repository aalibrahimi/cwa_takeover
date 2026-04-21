/**
 * Public /offer/accept/[token] — unauthenticated landing page for
 * candidates who click the accept link in an offer-letter email.
 *
 * Fetches the offer row via Supabase (RLS permits select + update
 * when acceptance_token matches). Shows the letter body, asks the
 * candidate to type their legal name to sign, flips the row's
 * status to "accepted" or "declined".
 *
 * Entirely client-side — no Next.js server component, no session,
 * no cookies. The unguessable UUID token in the URL is the security
 * boundary.
 */

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import {
  AlertTriangle, CheckCircle2, Loader2, XCircle, FileText,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

interface OfferRow {
  id: string;
  candidate_name: string;
  position_title: string;
  employer_legal_name: string;
  employer_signer_name: string | null;
  employer_signer_title: string | null;
  generated_body: string | null;
  status: string;
  offer_expires_at: string | null;
  start_date: string | null;
  brand?: "codeWithAli" | "simplicity" | "simplicityFunds";
}

const BRAND_TOKENS = {
  codeWithAli: {
    name: "CodeWithAli",
    accent: "bg-red-600",
    accentText: "text-red-400",
    border: "border-red-500/40",
    softBg: "from-red-500/15 to-red-500/5",
  },
  simplicity: {
    name: "Simplicity",
    accent: "bg-emerald-600",
    accentText: "text-emerald-400",
    border: "border-emerald-500/40",
    softBg: "from-emerald-500/15 to-emerald-500/5",
  },
  // Alias — server sometimes writes "simplicityFunds" from form state.
  simplicityFunds: {
    name: "Simplicity Funds",
    accent: "bg-emerald-600",
    accentText: "text-emerald-400",
    border: "border-emerald-500/40",
    softBg: "from-emerald-500/15 to-emerald-500/5",
  },
} as const;

export default function AcceptOfferPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [offer, setOffer] = useState<OfferRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await getSupabase()
          .from("offer_letters")
          .select(
            "id, candidate_name, position_title, employer_legal_name, employer_signer_name, employer_signer_title, generated_body, status, offer_expires_at, start_date, brand",
          )
          .eq("acceptance_token", token)
          .limit(1);
        if (cancelled) return;
        if (error || !data || data.length === 0) {
          setNotFound(true);
        } else {
          setOffer(data[0] as OfferRow);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setNotFound(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const expired =
    offer?.offer_expires_at &&
    new Date(offer.offer_expires_at).getTime() < Date.now();

  const alreadyResponded =
    offer && ["accepted", "declined", "withdrawn"].includes(offer.status);

  const brandKey = (offer?.brand ?? "codeWithAli") as keyof typeof BRAND_TOKENS;
  const tokens = BRAND_TOKENS[brandKey] ?? BRAND_TOKENS.codeWithAli;

  const submitAccept = async () => {
    if (!offer) return;
    const typed = signatureName.trim().toLowerCase();
    const expected = offer.candidate_name.trim().toLowerCase();
    if (typed !== expected) {
      setError("Typed name doesn't match the candidate name on the offer.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await getSupabase()
      .from("offer_letters")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        candidate_signature_name: signatureName.trim(),
        candidate_signature_at: new Date().toISOString(),
      })
      .eq("acceptance_token", token);
    setSubmitting(false);
    if (error) {
      setError(`Could not record acceptance: ${error.message}`);
      return;
    }
    setDone("accepted");
  };

  const submitDecline = async () => {
    if (!offer) return;
    setSubmitting(true);
    setError(null);
    const { error } = await getSupabase()
      .from("offer_letters")
      .update({
        status: "declined",
        declined_at: new Date().toISOString(),
      })
      .eq("acceptance_token", token);
    setSubmitting(false);
    if (error) {
      setError(`Could not record decline: ${error.message}`);
      return;
    }
    setDone("declined");
  };

  // ── Render states ────────────────────────────────────────────────

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[13px]">Loading your offer…</span>
        </div>
      </Shell>
    );
  }

  if (notFound || !offer) {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center">
          <XCircle className="mx-auto h-10 w-10 text-red-400 mb-3" />
          <h1 className="text-[18px] font-semibold mb-1 text-zinc-100">
            Offer not found
          </h1>
          <p className="text-[12.5px] text-zinc-400">
            The link may have expired, or the offer was withdrawn. Reach
            out to the sender if you believe this is a mistake.
          </p>
        </div>
      </Shell>
    );
  }

  if (done === "accepted") {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center">
          <div className={`mx-auto h-14 w-14 rounded-full ${tokens.accent} flex items-center justify-center mb-4`}>
            <CheckCircle2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-[20px] font-semibold mb-1 text-zinc-100">
            Welcome aboard, {offer.candidate_name.split(" ")[0]}.
          </h1>
          <p className="text-[13px] text-zinc-400 mb-4">
            Your acceptance of the <b>{offer.position_title}</b> role at{" "}
            <b>{offer.employer_legal_name}</b> has been recorded.
          </p>
          <p className="text-[11.5px] text-zinc-500">
            Next steps: {offer.employer_signer_name ?? "the team"} will be
            in touch with onboarding paperwork, tooling access, and a
            start-date confirmation.
          </p>
        </div>
      </Shell>
    );
  }

  if (done === "declined") {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center">
          <XCircle className="mx-auto h-10 w-10 text-zinc-400 mb-3" />
          <h1 className="text-[18px] font-semibold mb-1 text-zinc-100">
            Response recorded
          </h1>
          <p className="text-[12.5px] text-zinc-400">
            You've declined this offer. Thank you for letting us know —
            we wish you the best wherever you land.
          </p>
        </div>
      </Shell>
    );
  }

  if (alreadyResponded || expired) {
    const reason = expired ? "expired" : offer.status;
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-400 mb-3" />
          <h1 className="text-[18px] font-semibold mb-1 text-zinc-100">
            This offer is no longer open
          </h1>
          <p className="text-[12.5px] text-zinc-400">
            Current status: <b className="text-zinc-100">{reason}</b>. Reach out
            to the sender if you think this is a mistake.
          </p>
        </div>
      </Shell>
    );
  }

  // ── Main accept flow ───────────────────────────────────────────
  const body = offer.generated_body || "";
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <Shell>
      <div className="mx-auto w-full max-w-[860px] py-8 px-4">
        <motion.article
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative rounded-lg overflow-hidden shadow-2xl border border-zinc-800 bg-zinc-950"
        >
          {/* Brand strip */}
          <div className={`h-1.5 ${tokens.accent}`} />

          {/* Letterhead */}
          <div className={`bg-gradient-to-br ${tokens.softBg} px-10 pt-8 pb-5 border-b border-zinc-800`}>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-md bg-black/30 border border-white/10 flex items-center justify-center overflow-hidden">
                <FileText className={`h-6 w-6 ${tokens.accentText}`} />
              </div>
              <div>
                <div className={`text-[20px] font-bold tracking-tight ${tokens.accentText}`}>
                  {offer.employer_legal_name}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  Employment offer — for {offer.candidate_name}
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-10 py-8 text-zinc-200">
            <p className="text-[14px] mb-4">
              Dear <b>{offer.candidate_name}</b>,
            </p>

            {paragraphs.length > 0 ? (
              paragraphs.map((p, i) => (
                <p key={i} className="text-[13.5px] leading-relaxed mb-3">
                  {p}
                </p>
              ))
            ) : (
              <p className="text-[12.5px] italic text-zinc-500">
                (The full terms are in the PDF attached to your email.)
              </p>
            )}

            <div className="mt-6 pt-6 border-t border-zinc-800">
              <p className="text-[12px] text-zinc-500">
                Signed,
                <br />
                <b className="text-zinc-300">
                  {offer.employer_signer_name ?? offer.employer_legal_name}
                </b>
                {offer.employer_signer_title && (
                  <>
                    <br />
                    <span className="text-[11px]">{offer.employer_signer_title}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Signature gate */}
          <div className="px-10 py-6 bg-zinc-900/50 border-t border-zinc-800">
            <h2 className="text-[14px] font-semibold text-zinc-100 mb-3">
              Your response
            </h2>
            <p className="text-[12.5px] text-zinc-400 mb-4">
              Type your legal name below exactly as it appears on the offer
              (<b className="text-zinc-200">{offer.candidate_name}</b>) to
              sign and accept.
            </p>

            <input
              type="text"
              placeholder={offer.candidate_name}
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              className={`w-full mb-3 rounded-md border ${tokens.border} bg-zinc-950 px-3 py-2 text-[13px] text-zinc-100 placeholder-zinc-600 outline-none focus:ring-2 focus:ring-offset-0 focus:ring-offset-zinc-950`}
              autoComplete="off"
            />

            <label className="flex items-start gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-[11.5px] text-zinc-400">
                I have read and agree to the terms of this offer letter. My
                typed name above is my electronic signature.
              </span>
            </label>

            {error && (
              <p className="text-[12px] text-red-400 mb-3">{error}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={submitAccept}
                disabled={submitting || !confirmed || signatureName.trim() === ""}
                className={`inline-flex items-center gap-2 rounded-md ${tokens.accent} px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity`}
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Accept offer
              </button>
              <button
                type="button"
                onClick={submitDecline}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-[12.5px] font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                <XCircle className="h-3.5 w-3.5" />
                Decline
              </button>
            </div>
          </div>
        </motion.article>

        <p className="text-center mt-6 text-[10.5px] text-zinc-600">
          This link is unique to you. Don't forward it.
        </p>
      </div>
    </Shell>
  );
}

// ── Shell — full-page dark layout ──
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center py-12 px-4">
      {children}
    </main>
  );
}
