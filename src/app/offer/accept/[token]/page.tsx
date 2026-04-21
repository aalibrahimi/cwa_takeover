/**
 * Public /offer/accept/[token] — multi-step candidate onboarding.
 *
 * Flow:
 *   Step 1: Offer letter — accept / decline (typed-name signature)
 *   Step 2+: Each pending hire_document (ICA, NDA, IP, 1099, …) in
 *            its configured sign_order. Same typed-signature gate.
 *   Done:   Welcome screen.
 *
 * The page reads the offer by unguessable token (RLS-gated).
 * Related hire_documents are loaded in one query. As the candidate
 * signs each, the page advances. Refresh-safe — the current step
 * is derived from the DB state (which docs are already signed).
 *
 * Design:
 *   · Progress stepper pinned top — shows N of M, with brand accent
 *   · Two-column layout desktop: document content left, sticky
 *     signature panel right. Collapses to single column on mobile.
 *   · Document body rendered as real prose with paragraph spacing,
 *     headings extracted from the generated text if present.
 *   · Motion transitions between steps (subtle, 200ms).
 *
 * Legal note: typed-name signatures are valid under the ESIGN Act
 * in the US for employment/contractor onboarding. For higher-stakes
 * signing (real estate, financial instruments), upgrade to DocuSign.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle, CheckCircle2, Loader2, XCircle, FileText,
  Shield, Lock, FileCheck2, Receipt, ChevronRight, Download, Printer,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────

type Brand = "codeWithAli" | "simplicity" | "simplicityFunds";
type DocType = "ica" | "employment" | "nda" | "ip" | "1099";

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
  brand?: Brand;
  candidate_signature_name?: string | null;
  candidate_signature_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
}

interface HireDoc {
  id: string;
  offer_letter_id: string;
  doc_type: DocType;
  body: string | null;
  status: "draft" | "pending_signature" | "signed" | "waived";
  signed_name: string | null;
  signed_at: string | null;
  sign_order: number;
}

// ── Brand + doc-type presentation ─────────────────────────────

const BRAND = {
  codeWithAli: {
    label: "CodeWithAli",
    accent: "#dc2626",     // red-600
    accentLight: "#ef4444",// red-500
    accentDim: "rgba(220,38,38,0.12)",
    ring: "focus:ring-red-500/40",
    glow: "rgba(220,38,38,0.3)",
  },
  simplicity: {
    label: "Simplicity",
    accent: "#059669",     // emerald-600
    accentLight: "#10b981",// emerald-500
    accentDim: "rgba(5,150,105,0.12)",
    ring: "focus:ring-emerald-500/40",
    glow: "rgba(5,150,105,0.3)",
  },
  simplicityFunds: {
    label: "Simplicity Funds",
    accent: "#059669",
    accentLight: "#10b981",
    accentDim: "rgba(5,150,105,0.12)",
    ring: "focus:ring-emerald-500/40",
    glow: "rgba(5,150,105,0.3)",
  },
} as const;

interface DocMeta {
  title: string;
  short: string;
  Icon: typeof FileText;
  blurb: string;
}

const DOC_META_MAP: Partial<Record<string, DocMeta>> = {
  ica: {
    title: "Independent Contractor Agreement",
    short: "ICA",
    Icon: FileCheck2,
    blurb: "Defines the scope of work, payment terms, and independent-contractor relationship.",
  },
  employment: {
    title: "Employment Agreement",
    short: "Employment",
    Icon: FileCheck2,
    blurb: "Your terms of employment, benefits, and company policies.",
  },
  nda: {
    title: "Non-Disclosure Agreement",
    short: "NDA",
    Icon: Shield,
    blurb: "Keeps confidential information confidential — both during and after the engagement.",
  },
  ip: {
    title: "IP Assignment Agreement",
    short: "IP",
    Icon: Lock,
    blurb: "Clarifies ownership of any intellectual property created in the course of the work.",
  },
  "1099": {
    title: "1099 Contractor Terms",
    short: "1099",
    Icon: Receipt,
    blurb: "Tax classification as a US independent contractor. You'll receive a 1099-NEC at year end.",
  },
};

/** Defensive meta lookup — falls back to a generic doc label when
 *  the doc_type isn't one of the known keys (schema drift, new
 *  types added in Takeover we don't know about yet). */
function docMetaFor(docType: string | undefined | null): DocMeta {
  const key = (docType ?? "").toLowerCase().trim();
  const hit = DOC_META_MAP[key];
  if (hit) return hit;
  const pretty = key
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    || "Document";
  return {
    title: pretty,
    short: pretty.slice(0, 20),
    Icon: FileText,
    blurb: "Please review and sign.",
  };
}

// ── Page component ────────────────────────────────────────────

export default function AcceptOfferPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [offer, setOffer] = useState<OfferRow | null>(null);
  const [docs, setDocs]   = useState<HireDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // Per-step signing state. Reset when we advance.
  const [signatureName, setSignatureName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  // ── Fetch offer + hire_documents ──────────────────────────
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabase();

        // Offer — two-pass with brand fallback.
        // Signature fields (candidate_signature_name, _at, accepted_at,
        // declined_at) are fetched so the print bundle and signed
        // badge can render a real audit trail.
        const baseCols =
          "id, candidate_name, position_title, employer_legal_name, employer_signer_name, employer_signer_title, generated_body, status, offer_expires_at, start_date, candidate_signature_name, candidate_signature_at, accepted_at, declined_at";
        let offerData: any = null;
        const withBrand = await sb
          .from("offer_letters")
          .select(`${baseCols}, brand`)
          .eq("acceptance_token", token)
          .limit(1);
        if (withBrand.error) {
          const fallback = await sb
            .from("offer_letters")
            .select(baseCols)
            .eq("acceptance_token", token)
            .limit(1);
          offerData = fallback.data?.[0];
          if (fallback.error) setDbError(fallback.error.message);
        } else {
          offerData = withBrand.data?.[0];
        }

        if (cancelled) return;
        if (!offerData) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setOffer(offerData as OfferRow);

        // Hire documents tied to this offer. Best-effort — if the
        // table doesn't have the signature columns yet, fall back
        // to the base columns.
        let docsData: any[] = [];
        const withSig = await sb
          .from("hire_documents")
          .select("id, offer_letter_id, doc_type, body, status, signed_name, signed_at, sign_order")
          .eq("offer_letter_id", offerData.id)
          .order("sign_order", { ascending: true });
        if (withSig.error) {
          const basic = await sb
            .from("hire_documents")
            .select("id, offer_letter_id, doc_type, body")
            .eq("offer_letter_id", offerData.id);
          docsData = (basic.data ?? []).map((d: any, i: number) => ({
            ...d,
            status: "pending_signature",
            signed_name: null,
            signed_at: null,
            sign_order: i + 1,
          }));
        } else {
          docsData = withSig.data ?? [];
        }

        if (!cancelled) setDocs(docsData as HireDoc[]);
      } catch (e) {
        if (!cancelled) {
          setDbError(e instanceof Error ? e.message : String(e));
          setNotFound(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // ── Derived state ─────────────────────────────────────────
  const brandKey = (offer?.brand ?? "codeWithAli") as keyof typeof BRAND;
  const brand = BRAND[brandKey] ?? BRAND.codeWithAli;

  const expired = offer?.offer_expires_at
    && new Date(offer.offer_expires_at).getTime() < Date.now();

  const offerStatus = offer?.status ?? "draft";
  const offerAccepted = offerStatus === "accepted" || offerStatus === "sent"
    ? offerStatus === "accepted"
    : false;
  const offerDeclined = offerStatus === "declined" || offerStatus === "withdrawn";

  // All docs (including signed) in sign_order. We show every doc as
  // a step so the candidate sees their full progress — signed docs
  // appear with a checkmark, pending ones highlight the current step.
  // Waived docs are hidden entirely since there's nothing to do.
  const orderedDocs = useMemo(
    () =>
      docs
        .filter((d) => d.status !== "waived")
        .slice()
        .sort((a, b) => (a.sign_order ?? 0) - (b.sign_order ?? 0)),
    [docs],
  );

  // The "steps": offer + every doc (signed or not) + welcome. Offer
  // always first, done always last.
  const steps = useMemo(() => {
    const arr: Array<
      | { kind: "offer" }
      | { kind: "doc"; doc: HireDoc }
      | { kind: "done" }
    > = [{ kind: "offer" }];
    for (const d of orderedDocs) arr.push({ kind: "doc", doc: d });
    arr.push({ kind: "done" });
    return arr;
  }, [orderedDocs]);

  // Compute current step from DB state so refresh preserves progress.
  // Walk in order: offer first, then the first unsigned doc, else done.
  const currentStepIdx = useMemo(() => {
    if (!offerAccepted) return 0;
    for (let i = 1; i < steps.length - 1; i++) {
      const s = steps[i];
      if (s.kind === "doc" && s.doc.status !== "signed") return i;
    }
    return steps.length - 1; // all signed → done
  }, [offerAccepted, steps]);

  const current = steps[currentStepIdx];

  // Reset per-step input when step changes.
  useEffect(() => {
    setSignatureName("");
    setConfirmed(false);
    setStepError(null);
  }, [currentStepIdx]);

  // ── Actions ─────────────────────────────────────────────────

  const signOffer = async (outcome: "accepted" | "declined") => {
    if (!offer) return;
    if (outcome === "accepted") {
      const typed = signatureName.trim().toLowerCase();
      const expected = offer.candidate_name.trim().toLowerCase();
      if (typed !== expected) {
        setStepError("Typed name doesn't match your name on the offer.");
        return;
      }
    }
    setSubmitting(true);
    setStepError(null);
    const patch: Record<string, unknown> =
      outcome === "accepted"
        ? {
            status: "accepted",
            accepted_at: new Date().toISOString(),
            candidate_signature_name: signatureName.trim(),
            candidate_signature_at: new Date().toISOString(),
          }
        : {
            status: "declined",
            declined_at: new Date().toISOString(),
          };
    const { error } = await getSupabase()
      .from("offer_letters")
      .update(patch)
      .eq("acceptance_token", token);
    setSubmitting(false);
    if (error) {
      setStepError(`Could not record ${outcome}: ${error.message}`);
      return;
    }
    setOffer({ ...offer, status: outcome });
  };

  const signDoc = async (doc: HireDoc) => {
    if (!offer) return;
    const typed = signatureName.trim().toLowerCase();
    const expected = offer.candidate_name.trim().toLowerCase();
    if (typed !== expected) {
      setStepError("Typed name doesn't match your name on the offer.");
      return;
    }
    setSubmitting(true);
    setStepError(null);
    const now = new Date().toISOString();
    const { error } = await getSupabase()
      .from("hire_documents")
      .update({
        status: "signed",
        signed_name: signatureName.trim(),
        signed_at: now,
      })
      .eq("id", doc.id);
    setSubmitting(false);
    if (error) {
      setStepError(`Could not record signature: ${error.message}`);
      return;
    }
    setDocs((prev) =>
      prev.map((d) =>
        d.id === doc.id
          ? { ...d, status: "signed", signed_name: signatureName.trim(), signed_at: now }
          : d,
      ),
    );
  };

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <Shell brand={brand}>
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[13px]">Loading your offer…</span>
        </div>
      </Shell>
    );
  }

  if (notFound || !offer) {
    return (
      <Shell brand={brand}>
        <div className="max-w-md mx-auto text-center">
          <XCircle className="mx-auto h-10 w-10 text-red-400 mb-3" />
          <h1 className="text-[18px] font-semibold mb-1 text-zinc-100">Offer not found</h1>
          <p className="text-[12.5px] text-zinc-400">
            The link may have expired, or the offer was withdrawn. Reach out to the sender if you believe this is a mistake.
          </p>
          {dbError && (
            <p className="mt-4 text-[11px] text-zinc-600 font-mono">(debug: {dbError})</p>
          )}
        </div>
      </Shell>
    );
  }

  if (offerDeclined) {
    return (
      <Shell brand={brand}>
        <DeclinedScreen offer={offer} />
      </Shell>
    );
  }

  if (expired) {
    return (
      <Shell brand={brand}>
        <div className="max-w-md mx-auto text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-400 mb-3" />
          <h1 className="text-[18px] font-semibold mb-1 text-zinc-100">This offer has expired</h1>
          <p className="text-[12.5px] text-zinc-400">
            Reach out to the sender to see if it can be extended.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell brand={brand}>
      <PrintStyles />
      <PrintBundle offer={offer} docs={docs} brand={brand} />
      <div data-screen-only className="mx-auto w-full max-w-[1100px] px-4 py-10">
        {/* Top banner — employer + candidate + save-pdf action */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-8 flex items-start justify-between gap-4"
        >
          <div>
            <p className="text-[10.5px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
              Employment offer · for {offer.candidate_name}
            </p>
            <h1
              className="text-[28px] md:text-[32px] font-bold tracking-tight"
              style={{ color: brand.accentLight }}
            >
              {offer.employer_legal_name}
            </h1>
          </div>
          <SavePdfButton brand={brand} />
        </motion.header>

        {/* Progress stepper — hidden when printing to PDF */}
        <div data-no-print>
          <Stepper
            steps={steps}
            currentIdx={currentStepIdx}
            brand={brand}
            offerAccepted={offerAccepted}
          />
        </div>

        {/* Active step content — animated transitions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStepIdx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            {current.kind === "offer" && (
              <OfferStep
                offer={offer}
                brand={brand}
                signatureName={signatureName}
                setSignatureName={setSignatureName}
                confirmed={confirmed}
                setConfirmed={setConfirmed}
                submitting={submitting}
                error={stepError}
                onAccept={() => signOffer("accepted")}
                onDecline={() => signOffer("declined")}
              />
            )}
            {current.kind === "doc" && (
              <DocStep
                offer={offer}
                doc={current.doc}
                brand={brand}
                signatureName={signatureName}
                setSignatureName={setSignatureName}
                confirmed={confirmed}
                setConfirmed={setConfirmed}
                submitting={submitting}
                error={stepError}
                onSign={() => signDoc(current.doc)}
              />
            )}
            {current.kind === "done" && (
              <DoneStep offer={offer} brand={brand} docs={docs} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Shell>
  );
}

// ── Layout shell ──────────────────────────────────────────────

function Shell({
  brand, children,
}: {
  brand: (typeof BRAND)[keyof typeof BRAND];
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden">
      {/* Soft brand glow background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(circle at 20% -10%, ${brand.glow} 0%, transparent 45%), radial-gradient(circle at 90% 110%, ${brand.glow} 0%, transparent 40%)`,
        }}
      />
      <div className="relative z-10 flex min-h-screen items-center justify-center py-8 px-4">
        {children}
      </div>
    </main>
  );
}

// ── Progress stepper ──────────────────────────────────────────

function Stepper({
  steps, currentIdx, brand, offerAccepted,
}: {
  steps: Array<{ kind: "offer" } | { kind: "doc"; doc: HireDoc } | { kind: "done" }>;
  currentIdx: number;
  brand: (typeof BRAND)[keyof typeof BRAND];
  offerAccepted: boolean;
}) {
  return (
    <div className="mb-8 flex items-center flex-wrap gap-2">
      {steps.map((s, i) => {
        const isCurrent = i === currentIdx;
        const isDone = i < currentIdx || (s.kind === "offer" && offerAccepted);
        const label = s.kind === "offer"
          ? "Offer"
          : s.kind === "done"
            ? "Welcome"
            : docMetaFor(s.doc.doc_type).short;
        return (
          <div key={i} className="flex items-center gap-2">
            <div
              className={[
                "flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all duration-300",
                isCurrent
                  ? "border-transparent text-white shadow-lg"
                  : isDone
                    ? "border-zinc-700 bg-zinc-900 text-zinc-400"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-600",
              ].join(" ")}
              style={
                isCurrent
                  ? { background: brand.accent, boxShadow: `0 4px 14px -2px ${brand.glow}` }
                  : undefined
              }
            >
              <span className={[
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                isCurrent ? "bg-white/20" : isDone ? "bg-zinc-800" : "bg-zinc-900",
              ].join(" ")}>
                {isDone ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </span>
              <span className="text-[11.5px] font-medium whitespace-nowrap">{label}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="h-3 w-3 text-zinc-700" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step: Offer letter ───────────────────────────────────────

function OfferStep({
  offer, brand, signatureName, setSignatureName, confirmed, setConfirmed,
  submitting, error, onAccept, onDecline,
}: {
  offer: OfferRow;
  brand: (typeof BRAND)[keyof typeof BRAND];
  signatureName: string;
  setSignatureName: (v: string) => void;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
  submitting: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const body = offer.generated_body || "";
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const signed = offer.status === "accepted";
  const signedName = (offer as any).candidate_signature_name as string | undefined;
  const signedAt = (offer as any).candidate_signature_at as string | undefined;

  return (
    <TwoColumn
      brand={brand}
      left={
        <DocumentBody
          title={`Offer: ${offer.position_title}`}
          subtitle={`at ${offer.employer_legal_name}`}
          paragraphs={paragraphs.length > 0 ? paragraphs : [
            "The full terms of this offer are in the PDF attached to your email.",
            "When you're ready, type your legal name on the right to sign.",
          ]}
          signoff={{
            name: offer.employer_signer_name ?? offer.employer_legal_name,
            title: offer.employer_signer_title,
          }}
          signature={signed ? {
            name: signedName ?? offer.candidate_name,
            at: signedAt ?? null,
          } : null}
        />
      }
      right={
        <SignPanel
          brand={brand}
          heading="Accept or decline"
          description={`Type your legal name exactly as it appears on the offer (${offer.candidate_name}) to sign and accept.`}
          expectedName={offer.candidate_name}
          signatureName={signatureName}
          setSignatureName={setSignatureName}
          confirmed={confirmed}
          setConfirmed={setConfirmed}
          consentText="I have read and agree to the terms of this offer letter. My typed name above is my electronic signature."
          submitting={submitting}
          error={error}
          primary={{ label: "Accept offer", onClick: onAccept, Icon: CheckCircle2 }}
          secondary={{ label: "Decline", onClick: onDecline, Icon: XCircle }}
        />
      }
    />
  );
}

// ── Step: Hire document ──────────────────────────────────────

function DocStep({
  offer, doc, brand, signatureName, setSignatureName, confirmed, setConfirmed,
  submitting, error, onSign,
}: {
  offer: OfferRow;
  doc: HireDoc;
  brand: (typeof BRAND)[keyof typeof BRAND];
  signatureName: string;
  setSignatureName: (v: string) => void;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
  submitting: boolean;
  error: string | null;
  onSign: () => void;
}) {
  const meta = docMetaFor(doc.doc_type);
  const body = doc.body || "";
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <TwoColumn
      brand={brand}
      left={
        <DocumentBody
          title={meta.title}
          subtitle={meta.blurb}
          paragraphs={paragraphs.length > 0 ? paragraphs : [
            "This document is still being prepared. If you're reading this, something's off — please reach out to the sender.",
          ]}
          titleIcon={meta.Icon}
          signature={doc.status === "signed" ? {
            name: doc.signed_name ?? offer.candidate_name,
            at: doc.signed_at,
          } : null}
        />
      }
      right={
        <SignPanel
          brand={brand}
          heading={`Sign the ${meta.short}`}
          description={`Type your legal name exactly (${offer.candidate_name}) to sign this document.`}
          expectedName={offer.candidate_name}
          signatureName={signatureName}
          setSignatureName={setSignatureName}
          confirmed={confirmed}
          setConfirmed={setConfirmed}
          consentText={`I have read and agree to the terms of this ${meta.title}. My typed name above is my electronic signature.`}
          submitting={submitting}
          error={error}
          primary={{ label: `Sign ${meta.short}`, onClick: onSign, Icon: CheckCircle2 }}
        />
      }
    />
  );
}

// ── Step: Done ──────────────────────────────────────────────

function DoneStep({
  offer, brand, docs,
}: {
  offer: OfferRow;
  brand: (typeof BRAND)[keyof typeof BRAND];
  docs: HireDoc[];
}) {
  const signedDocs = docs.filter((d) => d.status === "signed");
  return (
    <div className="mx-auto max-w-2xl text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, type: "spring", stiffness: 200 }}
        className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: brand.accent, boxShadow: `0 8px 24px -4px ${brand.glow}` }}
      >
        <CheckCircle2 className="h-8 w-8 text-white" />
      </motion.div>

      <h1 className="text-[24px] md:text-[28px] font-bold tracking-tight text-zinc-100 mb-2">
        Welcome aboard, {offer.candidate_name.split(" ")[0]}.
      </h1>
      <p className="text-[14px] text-zinc-400 mb-8">
        Your acceptance of the <b className="text-zinc-200">{offer.position_title}</b> role at{" "}
        <b className="text-zinc-200">{offer.employer_legal_name}</b> has been recorded.
      </p>

      {signedDocs.length > 0 && (
        <div className="mx-auto max-w-md rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 mb-6 text-left">
          <p className="text-[10.5px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
            Signed
          </p>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-[12.5px]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: brand.accentLight }} />
              Offer letter
            </li>
            {signedDocs.map((d) => {
              const meta = docMetaFor(d.doc_type);
              return (
                <li key={d.id} className="flex items-center gap-2 text-[12.5px]">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: brand.accentLight }} />
                  {meta.title}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-[12px] text-zinc-500">
        Next steps: the <b className="text-zinc-300">{offer.employer_legal_name}</b> hiring team
        will be in touch soon with onboarding details, tooling access, and your start date.
      </p>
    </div>
  );
}

// ── Shared: Declined ────────────────────────────────────────

function DeclinedScreen({ offer }: { offer: OfferRow }) {
  return (
    <div className="mx-auto max-w-md text-center">
      <XCircle className="mx-auto h-10 w-10 text-zinc-400 mb-3" />
      <h1 className="text-[18px] font-semibold mb-1 text-zinc-100">Response recorded</h1>
      <p className="text-[12.5px] text-zinc-400">
        You've declined the offer from <b>{offer.employer_legal_name}</b>. Thank you for letting us know — we wish you the best wherever you land.
      </p>
    </div>
  );
}

// ── Shared: Two-column layout ────────────────────────────────

function TwoColumn({
  brand, left, right,
}: {
  brand: (typeof BRAND)[keyof typeof BRAND];
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] items-start">
      {/* Left: document content */}
      <article className="rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
        <div className="h-1" style={{ background: brand.accent }} />
        <div className="p-7 md:p-9">
          {left}
        </div>
      </article>

      {/* Right: sticky signature panel — hidden when printing to PDF */}
      <aside className="lg:sticky lg:top-6" data-no-print>
        {right}
      </aside>
    </div>
  );
}

// ── Shared: Document body renderer ───────────────────────────

function DocumentBody({
  title, subtitle, paragraphs, signoff, titleIcon: TitleIcon, signature,
}: {
  title: string;
  subtitle?: string | null;
  paragraphs: string[];
  signoff?: { name: string; title: string | null };
  titleIcon?: typeof FileText;
  /** If provided, renders a signed-by block. Appears in the PDF
   *  print too — that's the whole point, the candidate's copy
   *  should show their typed signature + timestamp. */
  signature?: { name: string; at: string | null } | null;
}) {
  return (
    <div className="prose-invert max-w-none">
      <div className="mb-6">
        {TitleIcon && (
          <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-md bg-zinc-800 text-zinc-400">
            <TitleIcon className="h-4 w-4" />
          </div>
        )}
        <h2 className="text-[18px] md:text-[20px] font-bold tracking-tight text-zinc-100 mb-1">
          {title}
        </h2>
        {subtitle && (
          <p className="text-[12.5px] text-zinc-500">{subtitle}</p>
        )}
      </div>

      <div className="space-y-3 text-[13.5px] leading-relaxed text-zinc-300">
        {paragraphs.map((p, i) => {
          // Treat UPPERCASE-looking lines as section headings for a
          // nicer typographic rhythm in long docs.
          const isHeading = p === p.toUpperCase() && p.length < 80 && /[A-Z]/.test(p);
          return isHeading ? (
            <h3 key={i} className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
              {p}
            </h3>
          ) : (
            <p key={i}>{p}</p>
          );
        })}
      </div>

      {signoff && (
        <div className="mt-8 pt-6 border-t border-zinc-800">
          <p className="text-[12px] text-zinc-500">
            Signed,<br />
            <b className="text-zinc-300">{signoff.name}</b>
            {signoff.title && (
              <>
                <br />
                <span className="text-[11px]">{signoff.title}</span>
              </>
            )}
          </p>
        </div>
      )}

      {signature && (
        <div className="mt-6 rounded-md border border-dashed border-zinc-700 bg-zinc-950/40 p-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
            Electronically signed
          </p>
          <p className="text-[13px] text-zinc-200" style={{ fontFamily: "ui-serif, Georgia, 'Times New Roman', serif", fontStyle: "italic" }}>
            /s/ {signature.name}
          </p>
          {signature.at && (
            <p className="mt-1 text-[11px] text-zinc-500">
              {new Date(signature.at).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared: Sign panel ───────────────────────────────────────

function SignPanel({
  brand, heading, description, expectedName, signatureName, setSignatureName,
  confirmed, setConfirmed, consentText, submitting, error, primary, secondary,
}: {
  brand: (typeof BRAND)[keyof typeof BRAND];
  heading: string;
  description: string;
  expectedName: string;
  signatureName: string;
  setSignatureName: (v: string) => void;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
  consentText: string;
  submitting: boolean;
  error: string | null;
  primary: { label: string; onClick: () => void; Icon: typeof CheckCircle2 };
  secondary?: { label: string; onClick: () => void; Icon: typeof XCircle };
}) {
  const { Icon: PrimaryIcon } = primary;
  const SecondaryIcon = secondary?.Icon;
  const canSubmit = !submitting && confirmed && signatureName.trim().length > 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-sm p-6 shadow-xl">
      <h3 className="text-[14px] font-semibold text-zinc-100 mb-1">{heading}</h3>
      <p className="text-[11.5px] text-zinc-500 leading-relaxed mb-4">{description}</p>

      <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5">
        Signature
      </label>
      <input
        type="text"
        value={signatureName}
        onChange={(e) => setSignatureName(e.target.value)}
        placeholder={expectedName}
        autoComplete="off"
        className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-[14px] text-zinc-100 placeholder-zinc-600 outline-none focus:ring-2 focus:ring-offset-0 focus:border-transparent transition-shadow"
        style={{
          // brand accent on focus without needing Tailwind arbitrary values
          boxShadow: signatureName.length > 0 ? `0 0 0 2px ${brand.accentDim}` : undefined,
        }}
      />

      <label className="mt-4 flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 accent-current"
          style={{ accentColor: brand.accent }}
        />
        <span className="text-[11.5px] leading-relaxed text-zinc-400">{consentText}</span>
      </label>

      {error && (
        <p className="mt-3 text-[11.5px] text-red-400">{error}</p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={primary.onClick}
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[12.5px] font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          style={{
            background: brand.accent,
            boxShadow: canSubmit ? `0 4px 14px -2px ${brand.glow}` : undefined,
          }}
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PrimaryIcon className="h-3.5 w-3.5" />}
          {primary.label}
        </button>
        {secondary && SecondaryIcon && (
          <button
            type="button"
            onClick={secondary.onClick}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-[12px] font-medium text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <SecondaryIcon className="h-3.5 w-3.5" />
            {secondary.label}
          </button>
        )}
      </div>

      <p className="mt-5 text-[10px] text-zinc-600 leading-snug">
        This link is unique to you — please don't forward it. Your signature is legally binding under the ESIGN Act.
      </p>
    </div>
  );
}

// ── Save-as-PDF button ──────────────────────────────────────────
// The PDF of the offer itself is attached to the email the
// candidate received. But once they're on this page they often
// want a copy of what they actually signed (typed signature,
// timestamps, related docs if any). We hand that off to the
// browser's built-in "Save as PDF" via window.print(). The
// PrintStyles component below rewrites the layout for print so
// the PDF is clean — just the document content, no chrome, no
// signature panel UI.

function SavePdfButton({
  brand,
}: {
  brand: (typeof BRAND)[keyof typeof BRAND];
}) {
  const handleClick = () => {
    // Small defer so Safari doesn't lock up on a synchronous print.
    setTimeout(() => {
      try {
        window.print();
      } catch {
        /* no-op — most browsers support this; we don't surface a modal */
      }
    }, 50);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      data-no-print
      className="inline-flex shrink-0 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-[11.5px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors shadow-sm"
      style={{ boxShadow: `0 0 0 1px ${brand.accentDim}` }}
      title="Save a copy of this page as a PDF"
    >
      <Download className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Save a copy (PDF)</span>
      <span className="sm:hidden">
        <Printer className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

// ── Print stylesheet ───────────────────────────────────────────
// Injected inline so we don't have to touch the global CSS chain
// (this route is the only one that needs print styles right now).
// Strategy:
//   · Hide everything marked data-no-print (buttons, signature
//     panel, stepper).
//   · Drop the zinc-950 dark theme to a white page.
//   · Expand the document article so it flows full width.
//   · Keep signatures / typed names visible (they're in the main
//     content area, which we do print).

function PrintStyles() {
  return (
    <style jsx global>{`
      /* Hide the print bundle on screen; it's only for the PDF. */
      [data-print-only] { display: none; }

      @media print {
        @page {
          margin: 0.75in;
        }
        html, body {
          background: #ffffff !important;
          color: #111111 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        /* Remove ambient glow / gradient backgrounds. */
        main > div[aria-hidden], main > div.pointer-events-none {
          display: none !important;
        }
        /* Hide the screen-only UI (stepper, signature panel, header
           chrome) — the print bundle has its own clean layout. */
        [data-screen-only],
        [data-no-print],
        nav {
          display: none !important;
        }
        /* Show the print bundle. */
        [data-print-only] {
          display: block !important;
        }
        /* Each document starts on its own page. */
        [data-print-doc] {
          page-break-before: always;
        }
        [data-print-doc]:first-child {
          page-break-before: auto;
        }
        /* Text is light on dark in-app — force readable print colors. */
        h1, h2, h3, h4, p, li, span, b, strong, em {
          color: #111111 !important;
        }
        .text-zinc-100, .text-zinc-200, .text-zinc-300, .text-zinc-400,
        .text-zinc-500, .text-zinc-600 {
          color: #333333 !important;
        }
        /* Preserve page-break-friendly prose. */
        p { orphans: 3; widows: 3; page-break-inside: avoid; }
        h2, h3 { page-break-after: avoid; }
      }
    `}</style>
  );
}

// ── Print bundle — hidden on screen, printed to PDF ─────────────
// When the candidate hits "Save a copy (PDF)", window.print() fires
// and the print stylesheet above hides the screen UI and exposes
// this bundle. It renders the offer letter AND every signed hire
// document in sign_order, each on its own page, with the typed
// signature + timestamp preserved. This is the proper audit-quality
// copy — not just a screenshot of whatever step they're on.

function PrintBundle({
  offer, docs, brand,
}: {
  offer: OfferRow;
  docs: HireDoc[];
  brand: (typeof BRAND)[keyof typeof BRAND];
}) {
  const orderedDocs = docs
    .filter((d) => d.status !== "waived")
    .slice()
    .sort((a, b) => (a.sign_order ?? 0) - (b.sign_order ?? 0));

  const offerParagraphs = (offer.generated_body || "")
    .split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const offerSigned = offer.status === "accepted";

  return (
    <div data-print-only style={{ background: "#fff", color: "#111" }}>
      {/* Cover header on first page */}
      <div style={{ padding: "0 0 16px 0", borderBottom: "2px solid #ddd", marginBottom: "24px" }}>
        <p style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#666", margin: 0 }}>
          Signed document package · {offer.candidate_name}
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 0 0", color: brand.accent }}>
          {offer.employer_legal_name}
        </h1>
        <p style={{ fontSize: 11, color: "#666", margin: "4px 0 0 0" }}>
          Generated {new Date().toLocaleString()}
        </p>
      </div>

      {/* Offer letter */}
      <div data-print-doc style={{ padding: "8px 0" }}>
        <PrintableDocument
          title={`Offer: ${offer.position_title}`}
          subtitle={`at ${offer.employer_legal_name}`}
          paragraphs={offerParagraphs.length > 0 ? offerParagraphs : [
            "The full terms of this offer are in the PDF that was attached to the hiring email.",
          ]}
          signoff={{
            name: offer.employer_signer_name ?? offer.employer_legal_name,
            title: offer.employer_signer_title,
          }}
          signature={offerSigned ? {
            name: offer.candidate_signature_name ?? offer.candidate_name,
            at: offer.candidate_signature_at ?? offer.accepted_at ?? null,
          } : null}
        />
      </div>

      {/* Each hire document */}
      {orderedDocs.map((d) => {
        const meta = docMetaFor(d.doc_type);
        const paragraphs = (d.body || "")
          .split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
        return (
          <div key={d.id} data-print-doc style={{ padding: "8px 0" }}>
            <PrintableDocument
              title={meta.title}
              subtitle={meta.blurb}
              paragraphs={paragraphs.length > 0 ? paragraphs : [
                "(No document body was stored for this agreement.)",
              ]}
              signature={d.status === "signed" ? {
                name: d.signed_name ?? offer.candidate_name,
                at: d.signed_at,
              } : null}
              pendingNote={d.status !== "signed"
                ? `Status: ${d.status.replace(/_/g, " ")}`
                : null}
            />
          </div>
        );
      })}
    </div>
  );
}

// Plain-HTML print-safe document renderer. Doesn't rely on Tailwind
// classes since the print stylesheet already whitewashes colors —
// inline styles keep this self-contained and predictable.
function PrintableDocument({
  title, subtitle, paragraphs, signoff, signature, pendingNote,
}: {
  title: string;
  subtitle?: string | null;
  paragraphs: string[];
  signoff?: { name: string; title: string | null };
  signature?: { name: string; at: string | null } | null;
  pendingNote?: string | null;
}) {
  return (
    <article>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px 0", color: "#111" }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: 11, color: "#666", margin: "0 0 20px 0" }}>
          {subtitle}
        </p>
      )}

      {paragraphs.map((p, i) => {
        const isHeading = p === p.toUpperCase() && p.length < 80 && /[A-Z]/.test(p);
        return isHeading ? (
          <h3
            key={i}
            style={{
              fontSize: 11, fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.08em", color: "#333",
              margin: "24px 0 8px 0",
            }}
          >
            {p}
          </h3>
        ) : (
          <p key={i} style={{ fontSize: 12, lineHeight: 1.55, color: "#111", margin: "0 0 10px 0" }}>
            {p}
          </p>
        );
      })}

      {signoff && (
        <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid #ddd" }}>
          <p style={{ fontSize: 12, color: "#111", margin: 0 }}>
            Signed,<br />
            <strong>{signoff.name}</strong>
            {signoff.title && (
              <>
                <br />
                <span style={{ fontSize: 11, color: "#555" }}>{signoff.title}</span>
              </>
            )}
          </p>
        </div>
      )}

      {signature && (
        <div
          style={{
            marginTop: 24,
            padding: 14,
            border: "1px dashed #bbb",
            background: "#fafafa",
          }}
        >
          <p style={{
            fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
            color: "#666", margin: "0 0 6px 0",
          }}>
            Electronically signed
          </p>
          <p style={{
            fontSize: 14, fontStyle: "italic",
            fontFamily: "'Georgia', 'Times New Roman', serif",
            color: "#111", margin: 0,
          }}>
            /s/ {signature.name}
          </p>
          {signature.at && (
            <p style={{ fontSize: 11, color: "#666", margin: "4px 0 0 0" }}>
              {new Date(signature.at).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {pendingNote && (
        <p style={{
          marginTop: 24, fontSize: 11, color: "#a16207",
          fontStyle: "italic",
        }}>
          {pendingNote}
        </p>
      )}
    </article>
  );
}
