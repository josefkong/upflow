"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useLanguage } from "@/components/language-provider";

interface InviteInfo {
  email_hint: string;
  role: "owner" | "admin" | "member" | "guest";
  tester_invite?: boolean;
  invite_mode?: "personal_workspace" | "workspace_access";
  expires_at?: string;
  workspace: { name: string };
  inviter: { name: string } | null;
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.23-.2-1.77H12v3.4h5.52a4.7 4.7 0 0 1-2.05 3.08l-.02.11 2.98 2.31.21.02c1.94-1.79 2.96-4.42 2.96-7.15Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.89 6.64-2.62l-3.17-2.44c-.85.57-1.99.97-3.47.97a6.03 6.03 0 0 1-5.7-4.17l-.1.01-3.1 2.4-.04.1A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.3 13.74A6.2 6.2 0 0 1 5.97 12c0-.61.11-1.2.32-1.75v-.12L3.16 7.7l-.1.05A10 10 0 0 0 2 12c0 1.53.35 2.97 1.06 4.25l3.24-2.51Z" />
      <path fill="#EA4335" d="M12 6.09c1.88 0 3.14.81 3.86 1.48l2.84-2.76A9.57 9.57 0 0 0 12 2a10 10 0 0 0-8.94 5.75l3.23 2.5A6.06 6.06 0 0 1 12 6.09Z" />
    </svg>
  );
}

export default function AcceptInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attemptedAutomaticAccept = useRef(false);
  const portuguese = language === "pt-BR";

  useEffect(() => {
    fetch(`/api/invites/accept?token=${encodeURIComponent(params.token)}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setError(body.error || t("invite.notFound"));
          return;
        }
        setInfo((await response.json()) as InviteInfo);
      })
      .catch(() => setError(t("invite.loadFailed")));
  }, [params.token, t]);

  useEffect(() => {
    if (!info || attemptedAutomaticAccept.current) return;
    attemptedAutomaticAccept.current = true;

    const acceptIfAuthenticated = async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" }).catch(() => null);
      if (!me?.ok) return;

      setBusy(true);
      const response = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || t("invite.acceptFailed"));
        setBusy(false);
        return;
      }
      router.push("/");
      router.refresh();
    };

    void acceptIfAuthenticated();
  }, [info, params.token, router, t]);

  function continueWithGoogle() {
    if (busy) return;
    setBusy(true);
    const next = `/invite/${params.token}`;
    window.location.assign(`/api/auth/google?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center overflow-x-hidden bg-background px-4 py-6">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 backdrop-blur">
        <h1 className="mb-2 text-xl font-semibold text-foreground">{t("invite.pageTitle")}</h1>
        {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
        {!error && !info ? (
          <p className="text-sm text-muted-foreground">{t("invite.loading")}</p>
        ) : null}

        {info ? (
          <>
            {info.tester_invite || info.invite_mode === "workspace_access" ? (
              <p className="mb-3 inline-flex rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {info.tester_invite ? t("invite.testerBadge") : t("invite.workspaceAccessBadge")}
              </p>
            ) : null}
            <p className="mb-1 text-sm text-muted-foreground">
              {t("invite.invitedBy", { name: info.inviter?.name || t("invite.someone") })}
            </p>
            <p className="mb-4 text-lg font-medium text-foreground">
              {info.invite_mode === "workspace_access" || info.tester_invite
                ? info.workspace.name
                : t("invite.productName")}
            </p>
            <p className="mb-6 text-xs text-muted-foreground">
              {t("invite.inviteFor")} {" "}
              <span className="text-foreground">{info.email_hint}</span>
            </p>
            <p className="mb-6 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {info.tester_invite
                ? t("invite.testerExplanation")
                : info.invite_mode === "workspace_access"
                  ? t("invite.workspaceAccessExplanation", { workspace: info.workspace.name })
                  : t("invite.personalWorkspaceExplanation", { workspace: info.workspace.name })}
            </p>

            <button
              type="button"
              onClick={continueWithGoogle}
              disabled={busy}
              className="flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleLogo />}
              {busy
                ? portuguese
                  ? "Validando convite..."
                  : "Validating invite..."
                : portuguese
                  ? "Continuar com Google"
                  : "Continue with Google"}
            </button>
            <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
              {portuguese
                ? "Use exatamente a conta Google correspondente ao email convidado. Não é necessário criar senha."
                : "Use the Google account that matches the invited email. No password is required."}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
