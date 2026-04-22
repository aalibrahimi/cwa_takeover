/**
 * Public /offer/receipt/[token] — Acceptance Receipt.
 *
 * A polished, brand-aware, print-friendly view of a completed
 * offer-signing event. Serves two audiences:
 *
 *   · The candidate  — can bookmark this URL as proof of their
 *                       accepted offer (for future employers,
 *                       accountants, personal records).
 *   · The CEO        — links to this same page from Takeover's
 *                       HiringActions via "View receipt" so they
 *                       can show an accountant, a lawyer, or share
 *                       as a hire confirmation.
 *
 * Security: same anon-by-token model as the accept page. The RLS
 * policy on offer_letters + hire_documents only matches rows whose
 * acceptance_token matches the URL token. No auth required; the
 * URL itself is the credential.
 *
 * This page is intentionally minimal in behavior — it's a READ-ONLY
 * receipt. No buttons that mutate state, no interactive stepper.
 * Just the facts of what was signed, when, and by whom.
 *
 * Print: Ctrl+P / Cmd+P renders a clean paged PDF. Chrome (stepper,
 * save button, etc.) is hidden in print mode; the receipt body is
 * white-background with dark text.
 */

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2, Loader2, XCircle, FileText, Printer, Download,
  ShieldCheck, Clock, Briefcase, Building2, User,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────

type Brand = "codeWithAli" | "simplicity" | "simplicityFunds";
type DocType = "ica" | "employment" | "nda" | "ip" | "1099";

interface OfferRow {
  id: string;
  candidate_name: string;
  candidate_email: string | null;
  position_title: string;
  employer_legal_name: string;
  employer_signer_name: string | null;
  employer_signer_title: string | null;
  employer_address: string | null;
  generated_body: string | null;
  status: string;
  start_date: string | null;
  brand?: Brand;
  candidate_signature_name?: string | null;
  candidate_signature_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  employer_signature_name?: string | null;
  employer_signature_at?: string | null;
  acceptance_token: string;
  created_at?: string;
  emailed_at?: string | null;
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
  employer_signature_name?: string | null;
  employer_signature_at?: string | null;
}

// ── Brand styling ──────────────────────────────────────────────

const BRAND = {
  codeWithAli: {
    label: "CodeWithAli",
    accent: "#dc2626",
    accentLight: "#ef4444",
    glow: "rgba(220,38,38,0.25)",
  },
  simplicity: {
    label: "Simplicity",
    accent: "#059669",
    accentLight: "#10b981",
    glow: "rgba(5,150,105,0.25)",
  },
  simplicityFunds: {
    label: "Simplicity Funds",
    accent: "#059669",
    accentLight: "#10b981",
    glow: "rgba(5,150,105,0.25)",
  },
} as const;

// ── Doc meta ────────────────────────────────────────────────────

const DOC_META_MAP: Partial<Record<string, { title: string; short: string }>> = {
  ica: { title: "Independent Contractor Agreement", short: "ICA" },
  employment: { title: "Employment Agreement", short: "Employment" },
  nda: { title: "Non-Disclosure Agreement", short: "NDA" },
  ip: { title: "IP Assignment Agreement", short: "IP" },
  "1099": { title: "1099 Contractor Terms", short: "1099" },
};

function docMetaFor(docType: string | undefined | null): { title: string; short: string } {
  const key = (docType ?? "").toLowerCase().trim();
  const hit = DOC_META_MAP[key];
  if (hit) return hit;
  const pretty = key
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    || "Document";
  return { title: pretty, short: pretty.slice(0, 20) };
}

// ── Page ────────────────────────────────────────────────────────

export default function ReceiptPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [offer, setOffer] = useState<OfferRow | null>(null);
  const [docs, setDocs] = useState<HireDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabase();

        // Try with all cols we want; fall back if brand col missing.
        const baseCols =
          "id, candidate_name, candidate_email, position_title, employer_legal_name, employer_signer_name, employer_signer_title, employer_address, generated_body, status, start_date, acceptance_token, created_at, emailed_at, candidate_signature_name, candidate_signature_at, accepted_at, declined_at, employer_signature_name, employer_signature_at";
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

        const { data: docsData } = await sb
          .from("hire_documents")
          .select("id, offer_letter_id, doc_type, body, status, signed_name, signed_at, sign_order, employer_signature_name, employer_signature_at")
          .eq("offer_letter_id", offerData.id)
          .order("sign_order", { ascending: true });

        if (!cancelled) setDocs((docsData ?? []) as HireDoc[]);
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

  const brandKey = (offer?.brand ?? "codeWithAli") as keyof typeof BRAND;
  const brand = BRAND[brandKey] ?? BRAND.codeWithAli;

  const toggleDoc = (id: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrint = () => {
    setTimeout(() => {
      try { window.print(); } catch { /* noop */ }
    }, 50);
  };

  // ── Loading + error states ────────────────────────────────

  if (loading) {
    return (
      <Shell brand={brand}>
        <PrintStyles />
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[13px]">Loading receipt…</span>
        </div>
      </Shell>
    );
  }

  if (notFound || !offer) {
    return (
      <Shell brand={brand}>
        <PrintStyles />
        <div className="max-w-md mx-auto text-center">
          <XCircle className="mx-auto h-10 w-10 text-red-400 mb-3" />
          <h1 className="text-[18px] font-semibold mb-1 text-zinc-100">Receipt not found</h1>
          <p className="text-[12.5px] text-zinc-400">
            The link may be invalid, or the offer was withdrawn.
          </p>
          {dbError && (
            <p className="mt-4 text-[11px] text-zinc-600 font-mono">
              (debug: {dbError})
            </p>
          )}
        </div>
      </Shell>
    );
  }

  // ── Derived state ─────────────────────────────────────────

  const accepted = offer.status === "accepted";
  const declined = offer.status === "declined";
  const pending = !accepted && !declined;

  const orderedDocs = docs
    .filter((d) => d.status !== "waived")
    .slice()
    .sort((a, b) => (a.sign_order ?? 0) - (b.sign_order ?? 0));

  const signedDocs = orderedDocs.filter((d) => d.status === "signed");

  // ── Render ─────────────────────────────────────────────────

  return (
    <Shell brand={brand}>
      <PrintStyles />

      <div className="mx-auto w-full max-w-[820px] px-4 py-10 print:py-0 print:max-w-full print:px-0">
        {/* ── Top brand bar */}
        <div
          className="h-1.5 w-full rounded-t-lg print:rounded-none"
          style={{ background: brand.accent }}
        />

        {/* ── Paper card */}
        <article className="relative rounded-b-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm px-7 md:px-10 py-8 print:border-0 print:bg-white print:shadow-none print:rounded-none print:px-0 print:py-0">
          {/* Header */}
          <header className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10.5px] font-mono uppercase tracking-widest text-zinc-500 mb-1 print:text-zinc-600">
                Acceptance Receipt
              </p>
              <h1
                className="text-[22px] md:text-[26px] font-bold tracking-tight"
                style={{ color: brand.accentLight }}
              >
                {offer.employer_legal_name}
              </h1>
              <p className="text-[12px] text-zinc-400 mt-0.5 print:text-zinc-600">
                Position: <b className="text-zinc-200 print:text-zinc-900">{offer.position_title}</b>
                {offer.start_date && (
                  <>
                    {" · "}
                    Start: <b className="text-zinc-200 print:text-zinc-900">
                      {new Date(offer.start_date).toLocaleDateString()}
                    </b>
                  </>
                )}
              </p>
            </div>

            <div data-no-print className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-[11.5px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors shadow-sm"
                style={{ boxShadow: `0 0 0 1px ${brand.glow}` }}
                title="Print or save as PDF"
              >
                <Printer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Print / Save PDF</span>
                <span className="sm:hidden">PDF</span>
              </button>
            </div>
          </header>

          {/* Status ribbon */}
          <StatusRibbon
            brand={brand}
            accepted={accepted}
            declined={declined}
            pending={pending}
            offer={offer}
          />

          {/* Parties */}
          <section className="mt-8 grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-6">
            <Party
              icon={User}
              label="Candidate"
              name={offer.candidate_name}
              email={offer.candidate_email}
            />
            <Party
              icon={Building2}
              label="Employer"
              name={offer.employer_legal_name}
              subtitle={
                offer.employer_signer_name
                  ? `${offer.employer_signer_name}${offer.employer_signer_title ? `, ${offer.employer_signer_title}` : ""}`
                  : undefined
              }
              address={offer.employer_address}
            />
          </section>

          {/* Signatures */}
          {(offer.employer_signature_at || offer.candidate_signature_at) && (
            <section className="mt-8">
              <SectionHeader icon={ShieldCheck}>
                Signatures
              </SectionHeader>
              <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2">
                <SignatureCard
                  brand={brand}
                  kind="employer"
                  name={offer.employer_signature_name}
                  at={offer.employer_signature_at}
                  fallbackLabel="Not counter-signed"
                />
                <SignatureCard
                  brand={brand}
                  kind="candidate"
                  name={offer.candidate_signature_name}
                  at={offer.candidate_signature_at ?? offer.accepted_at ?? null}
                  fallbackLabel={declined ? "Declined" : "Not yet signed"}
                  declined={declined}
                />
              </div>
            </section>
          )}

          {/* Documents */}
          <section className="mt-8">
            <SectionHeader icon={FileText}>
              Documents {signedDocs.length > 0 && `· ${signedDocs.length + (accepted ? 1 : 0)} signed`}
            </SectionHeader>

            <div className="space-y-2">
              {/* Offer letter card */}
              <DocumentCard
                brand={brand}
                title="Offer letter"
                status={accepted ? "signed" : declined ? "declined" : "pending"}
                signedName={offer.candidate_signature_name}
                signedAt={offer.candidate_signature_at ?? offer.accepted_at ?? null}
                employerName={offer.employer_signature_name}
                employerAt={offer.employer_signature_at}
                body={offer.generated_body}
                isExpanded={expandedDocs.has("__offer__")}
                onToggle={() => toggleDoc("__offer__")}
              />

              {orderedDocs.map((d) => {
                const meta = docMetaFor(d.doc_type);
                return (
                  <DocumentCard
                    key={d.id}
                    brand={brand}
                    title={meta.title}
                    status={d.status === "signed" ? "signed" : "pending"}
                    signedName={d.signed_name}
                    signedAt={d.signed_at}
                    employerName={d.employer_signature_name ?? offer.employer_signature_name}
                    employerAt={d.employer_signature_at ?? offer.employer_signature_at}
                    body={d.body}
                    isExpanded={expandedDocs.has(d.id)}
                    onToggle={() => toggleDoc(d.id)}
                  />
                );
              })}
            </div>

            {orderedDocs.length === 0 && (
              <p className="text-[12px] text-zinc-500 italic">
                No companion documents attached to this offer.
              </p>
            )}
          </section>

          {/* Verification footer */}
          <section className="mt-10 pt-6 border-t border-zinc-800 print:border-zinc-300">
            <SectionHeader icon={Clock}>
              Verification
            </SectionHeader>
            <dl className="grid gap-y-1.5 gap-x-8 md:grid-cols-2 text-[11.5px] print:grid-cols-2">
              <VerificationRow
                label="Offer ID"
                value={<span className="font-mono">{offer.id}</span>}
              />
              <VerificationRow
                label="Acceptance token"
                value={<span className="font-mono truncate inline-block max-w-full">{offer.acceptance_token.slice(0, 8)}…{offer.acceptance_token.slice(-4)}</span>}
              />
              {offer.emailed_at && (
                <VerificationRow
                  label="Offer emailed"
                  value={new Date(offer.emailed_at).toLocaleString()}
                />
              )}
              {offer.accepted_at && (
                <VerificationRow
                  label="Accepted"
                  value={new Date(offer.accepted_at).toLocaleString()}
                />
              )}
              {offer.declined_at && (
                <VerificationRow
                  label="Declined"
                  value={new Date(offer.declined_at).toLocaleString()}
                />
              )}
              <VerificationRow
                label="Receipt generated"
                value={new Date().toLocaleString()}
              />
            </dl>
            <p className="mt-4 text-[10.5px] text-zinc-600 leading-snug print:text-zinc-500">
              Signatures are electronic, legally binding under the US ESIGN Act (15 U.S.C. §7001 et seq.).
              This receipt is a real-time view of Supabase records; it reflects the current state every time
              it's loaded. For a frozen copy, print to PDF or save this page.
            </p>
          </section>
        </article>
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
    <main className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden print:bg-white print:text-zinc-900 print:min-h-0">
      <div
        data-screen-only
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(circle at 20% -10%, ${brand.glow} 0%, transparent 50%), radial-gradient(circle at 90% 110%, ${brand.glow} 0%, transparent 45%)`,
        }}
      />
      <div className="relative z-10 flex min-h-screen items-start justify-center py-8 px-4 print:min-h-0 print:py-0 print:px-0 print:items-stretch">
        {children}
      </div>
    </main>
  );
}

// ── Status ribbon ────────────────────────────────────────────

function StatusRibbon({
  brand, accepted, declined, pending, offer,
}: {
  brand: (typeof BRAND)[keyof typeof BRAND];
  accepted: boolean;
  declined: boolean;
  pending: boolean;
  offer: OfferRow;
}) {
  if (declined) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 print:border-red-500 print:bg-red-50">
        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-red-200 print:text-red-900">
            Offer declined
          </p>
          {offer.declined_at && (
            <p className="text-[11px] text-red-300 print:text-red-800">
              Declined on {new Date(offer.declined_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    );
  }
  if (accepted) {
    return (
      <div
        className="flex items-center gap-3 rounded-lg px-4 py-3"
        style={{
          border: `1px solid ${brand.accent}60`,
          background: `${brand.accent}15`,
        }}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: brand.accentLight }} />
        <div className="min-w-0">
          <p
            className="text-[12.5px] font-semibold print:!text-zinc-900"
            style={{ color: brand.accentLight }}
          >
            Offer accepted
          </p>
          {offer.accepted_at && (
            <p className="text-[11px] text-zinc-300 print:text-zinc-700">
              Accepted on {new Date(offer.accepted_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    );
  }
  if (pending) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 print:border-amber-500 print:bg-amber-50">
        <Clock className="h-4 w-4 text-amber-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-amber-200 print:text-amber-900">
            Awaiting candidate response
          </p>
          {offer.emailed_at && (
            <p className="text-[11px] text-amber-300 print:text-amber-800">
              Offer emailed {new Date(offer.emailed_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
}

// ── Sub-components ────────────────────────────────────────────

function SectionHeader({
  icon: Icon, children,
}: {
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-zinc-500 print:text-zinc-600" />
      <p className="text-[10.5px] font-mono uppercase tracking-widest text-zinc-500 print:text-zinc-600">
        {children}
      </p>
    </div>
  );
}

function Party({
  icon: Icon, label, name, email, subtitle, address,
}: {
  icon: typeof User;
  label: string;
  name: string;
  email?: string | null;
  subtitle?: string;
  address?: string | null;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4 print:border-zinc-300 print:bg-transparent">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3 w-3 text-zinc-500 print:text-zinc-600" />
        <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 print:text-zinc-600">
          {label}
        </p>
      </div>
      <p className="text-[14px] font-semibold text-zinc-100 print:text-zinc-900">{name}</p>
      {subtitle && (
        <p className="text-[11.5px] text-zinc-400 mt-0.5 print:text-zinc-700">{subtitle}</p>
      )}
      {email && (
        <p className="text-[11.5px] text-zinc-500 mt-0.5 print:text-zinc-600">{email}</p>
      )}
      {address && (
        <p className="text-[11px] text-zinc-500 mt-1 print:text-zinc-600">{address}</p>
      )}
    </div>
  );
}

function SignatureCard({
  brand, kind, name, at, fallbackLabel, declined,
}: {
  brand: (typeof BRAND)[keyof typeof BRAND];
  kind: "employer" | "candidate";
  name?: string | null;
  at?: string | null;
  fallbackLabel: string;
  declined?: boolean;
}) {
  const signed = !!name && !!at;
  const label = kind === "employer" ? "Employer" : "Candidate";

  if (!signed) {
    return (
      <div
        className={[
          "rounded-md border border-dashed p-4 print:bg-transparent",
          declined
            ? "border-red-500/40 bg-red-500/5 print:border-red-500"
            : "border-zinc-700 bg-zinc-900/30 print:border-zinc-400",
        ].join(" ")}
      >
        <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2 print:text-zinc-600">
          {label}
        </p>
        <p className="text-[12px] text-zinc-500 italic print:text-zinc-600">
          {fallbackLabel}
        </p>
      </div>
    );
  }

  const bgStyle =
    kind === "employer"
      ? { border: `1px solid ${brand.accent}60`, background: `${brand.accent}12` }
      : { border: "1px solid rgb(63,63,70)", background: "rgba(24,24,27,0.6)" };

  return (
    <div
      className="rounded-md p-4 print:bg-transparent print:border-zinc-300"
      style={bgStyle}
    >
      <p
        className="text-[10px] font-mono uppercase tracking-widest mb-2 print:text-zinc-700"
        style={{ color: kind === "employer" ? brand.accentLight : "rgb(161,161,170)" }}
      >
        {label} · Counter-signed
      </p>
      <p
        className="text-[15px] text-zinc-100 print:text-zinc-900"
        style={{
          fontFamily: "ui-serif, Georgia, 'Times New Roman', serif",
          fontStyle: "italic",
        }}
      >
        /s/ {name}
      </p>
      <p className="text-[11px] text-zinc-400 mt-1 print:text-zinc-600">
        {new Date(at!).toLocaleString()}
      </p>
    </div>
  );
}

function DocumentCard({
  brand, title, status, signedName, signedAt, employerName, employerAt,
  body, isExpanded, onToggle,
}: {
  brand: (typeof BRAND)[keyof typeof BRAND];
  title: string;
  status: "signed" | "pending" | "declined";
  signedName?: string | null;
  signedAt?: string | null;
  employerName?: string | null;
  employerAt?: string | null;
  body?: string | null;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasBody = !!(body && body.trim());

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40 print:border-zinc-300 print:bg-transparent">
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="shrink-0">
          {status === "signed" ? (
            <CheckCircle2 className="h-4 w-4" style={{ color: brand.accentLight }} />
          ) : status === "declined" ? (
            <XCircle className="h-4 w-4 text-red-400" />
          ) : (
            <Clock className="h-4 w-4 text-amber-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-zinc-100 truncate print:text-zinc-900">
            {title}
          </p>
          <p className="text-[11px] text-zinc-500 truncate print:text-zinc-600">
            {status === "signed" && signedName && signedAt
              ? `Signed by ${signedName} on ${new Date(signedAt).toLocaleDateString()}`
              : status === "declined"
                ? "Declined"
                : "Awaiting candidate signature"}
          </p>
        </div>
        {hasBody && (
          <button
            type="button"
            onClick={onToggle}
            data-no-print
            className="shrink-0 text-[10.5px] text-zinc-400 hover:text-zinc-100 transition-colors underline underline-offset-2"
          >
            {isExpanded ? "Hide text" : "Show text"}
          </button>
        )}
      </div>

      {/* Body — always in DOM so print captures it; hidden on screen
          when the card is collapsed via `data-collapsed` CSS rule. */}
      {hasBody && (
        <div
          data-collapsed={!isExpanded}
          className="px-4 pb-4 pt-1 print:px-0 print:pb-0 data-[collapsed=true]:hidden data-[collapsed=true]:print:block"
        >
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-4 text-[12.5px] leading-relaxed text-zinc-300 print:border-zinc-200 print:bg-transparent print:text-zinc-800 print:p-0 print:border-0">
            {body!.split(/\n{2,}/).map((p, i) => {
              const trimmed = p.trim();
              if (!trimmed) return null;
              const isHeading =
                trimmed === trimmed.toUpperCase() &&
                trimmed.length < 80 &&
                /[A-Z]/.test(trimmed);
              return isHeading ? (
                <h4
                  key={i}
                  className="mt-4 first:mt-0 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 print:text-zinc-700"
                >
                  {trimmed}
                </h4>
              ) : (
                <p key={i} className="mt-2 first:mt-0">
                  {trimmed}
                </p>
              );
            })}
          </div>

          {/* Per-doc signature footer */}
          {(employerName || signedName) && (
            <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2 text-[11px]">
              {employerName && employerAt && (
                <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 print:border-emerald-500 print:bg-emerald-50">
                  <p className="text-[9.5px] font-mono uppercase tracking-widest text-emerald-400 print:text-emerald-900">
                    Employer counter-signed
                  </p>
                  <p
                    className="text-[12.5px] text-zinc-100 print:text-zinc-900"
                    style={{ fontFamily: "ui-serif, Georgia, serif", fontStyle: "italic" }}
                  >
                    /s/ {employerName}
                  </p>
                  <p className="text-[10px] text-zinc-500 print:text-zinc-600">
                    {new Date(employerAt).toLocaleString()}
                  </p>
                </div>
              )}
              {signedName && signedAt && (
                <div className="rounded-sm border border-zinc-700 bg-zinc-900/50 px-3 py-2 print:border-zinc-400 print:bg-zinc-50">
                  <p className="text-[9.5px] font-mono uppercase tracking-widest text-zinc-400 print:text-zinc-700">
                    Candidate signed
                  </p>
                  <p
                    className="text-[12.5px] text-zinc-100 print:text-zinc-900"
                    style={{ fontFamily: "ui-serif, Georgia, serif", fontStyle: "italic" }}
                  >
                    /s/ {signedName}
                  </p>
                  <p className="text-[10px] text-zinc-500 print:text-zinc-600">
                    {new Date(signedAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VerificationRow({
  label, value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-zinc-500 shrink-0 print:text-zinc-600">{label}:</dt>
      <dd className="text-zinc-300 truncate print:text-zinc-800">{value}</dd>
    </div>
  );
}

// ── Print styles ───────────────────────────────────────────────

function PrintStyles() {
  return (
    <style jsx global>{`
      @media print {
        @page { margin: 0.5in; }
        html, body {
          background: #ffffff !important;
          color: #111111 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        [data-no-print], [data-screen-only] { display: none !important; }
        /* Force collapsed document bodies to render in print so the
           saved PDF always has the complete agreement text, even if
           the user didn't manually expand them on screen. */
        [data-collapsed="true"] {
          display: block !important;
        }
      }
    `}</style>
  );
}
