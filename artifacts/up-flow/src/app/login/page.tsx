"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Layers3,
  Loader2,
  MonitorCheck,
  Moon,
  Sun,
  Users,
} from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { useTheme } from "@/components/theme-provider";

const logoSrc = "/assets/UP_LOGO_1778594851568.png";

type LoginCopy = {
  themeLight: string;
  themeDark: string;
  brandEyebrow: string;
  brandTitleLine1: string;
  brandTitleLine2: string;
  brandTitleAccent: string;
  brandDescription: string;
  allInOneTitle: string;
  allInOneDescription: string;
  teamsTitle: string;
  teamsDescription: string;
  dataTitle: string;
  dataDescription: string;
  welcomeTitle: string;
  googleSignIn: string;
  signingIn: string;
  googleOnly: string;
  needAccess: string;
  authError: string;
  calendarError: string;
  localReview: string;
  localReviewLoading: string;
  localReviewHelp: string;
  localReviewError: string;
};

const loginCopy: Record<"en" | "pt-BR", LoginCopy> = {
  en: {
    themeLight: "Switch to light mode",
    themeDark: "Switch to dark mode",
    brandEyebrow: "One platform. All your work.",
    brandTitleLine1: "Manage projects.",
    brandTitleLine2: "Deliver",
    brandTitleAccent: "results.",
    brandDescription: "Plan, track, and collaborate with your team from start to finish.",
    allInOneTitle: "All in one",
    allInOneDescription: "Projects, tasks, docs and more.",
    teamsTitle: "Built for teams",
    teamsDescription: "Collaborate and get things done.",
    dataTitle: "Data-driven",
    dataDescription: "Insights that help you make better decisions.",
    welcomeTitle: "Welcome back! Please sign in to continue.",
    googleSignIn: "Continue with Google",
    signingIn: "Opening Google...",
    googleOnly: "Your Google account is also connected to Calendar so meetings use the responsible person's agenda.",
    needAccess: "Need access? Ask your workspace admin to invite you.",
    authError: "Google sign-in could not be completed. Please try again.",
    calendarError: "You signed in, but Calendar could not be connected. Reconnect it from Calendar.",
    localReview: "Open local review environment",
    localReviewLoading: "Opening review environment...",
    localReviewHelp: "Localhost only · temporary administrator session",
    localReviewError: "The local review session could not be started.",
  },
  "pt-BR": {
    themeLight: "Alternar para modo claro",
    themeDark: "Alternar para modo escuro",
    brandEyebrow: "Uma plataforma. Todo o seu trabalho.",
    brandTitleLine1: "Gerencie projetos.",
    brandTitleLine2: "Entregue",
    brandTitleAccent: "resultados.",
    brandDescription: "Planeje, acompanhe e colabore com sua equipe do início ao fim.",
    allInOneTitle: "Tudo em um",
    allInOneDescription: "Projetos, tarefas, documentos e mais.",
    teamsTitle: "Feito para equipes",
    teamsDescription: "Colabore e conclua o trabalho.",
    dataTitle: "Orientado por dados",
    dataDescription: "Insights para tomar melhores decisões.",
    welcomeTitle: "Bem-vindo de volta! Entre para continuar.",
    googleSignIn: "Continuar com Google",
    signingIn: "Abrindo o Google...",
    googleOnly: "Sua conta Google também será conectada ao Agenda para que as reuniões usem a agenda do responsável.",
    needAccess: "Precisa de acesso? Peça para o administrador do workspace convidar você.",
    authError: "Não foi possível concluir o acesso com Google. Tente novamente.",
    calendarError: "Você entrou, mas o Agenda não foi conectado. Reconecte pela página Calendário.",
    localReview: "Acessar ambiente de verificação",
    localReviewLoading: "Abrindo ambiente de verificação...",
    localReviewHelp: "Somente no localhost · sessão temporária de administrador",
    localReviewError: "Não foi possível iniciar a sessão local de verificação.",
  },
};

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="min-w-0 border-slate-200 last:border-0 sm:border-r sm:pr-6 dark:border-white/10">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600 shadow-[0_12px_34px_rgba(37,99,235,0.14)] dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200 dark:shadow-[0_0_28px_rgba(59,130,246,0.28)]">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-950 dark:text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>
    </div>
  );
}

function LoginControlBar() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const isDark = theme !== "light";
  const copy = loginCopy[language];

  return (
    <div className="absolute right-4 top-4 z-20 flex items-center gap-3 sm:right-8 sm:top-8">
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? copy.themeLight : copy.themeDark}
        className="inline-flex h-11 items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-slate-600 shadow-[0_12px_34px_rgba(15,23,42,0.08)] backdrop-blur transition hover:border-blue-400/40 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.15] dark:text-slate-300 dark:shadow-[0_0_26px_rgba(15,23,42,0.5)] dark:hover:text-white"
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
            !isDark ? "bg-slate-950 text-white" : "text-slate-400"
          }`}
        >
          <Sun className="h-4 w-4" />
        </span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
            isDark ? "bg-white text-slate-950" : "text-slate-500"
          }`}
        >
          <Moon className="h-4 w-4" />
        </span>
      </button>
      <div className="inline-flex h-11 items-center rounded-full border border-slate-200 bg-white p-1 text-sm font-semibold text-slate-600 shadow-[0_12px_34px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.15] dark:text-slate-300">
        <button
          type="button"
          onClick={() => setLanguage("en")}
          aria-pressed={language === "en"}
          className={`h-8 rounded-full px-3 transition ${
            language === "en"
              ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
              : "hover:text-slate-950 dark:hover:text-white"
          }`}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLanguage("pt-BR")}
          aria-pressed={language === "pt-BR"}
          className={`h-8 rounded-full px-3 transition ${
            language === "pt-BR"
              ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
              : "hover:text-slate-950 dark:hover:text-white"
          }`}
        >
          PT
        </button>
      </div>
    </div>
  );
}

function BrandPanel({ copy }: { copy: LoginCopy }) {
  return (
    <section className="relative hidden min-h-dvh overflow-hidden border-r border-slate-200 bg-white p-10 lg:flex lg:flex-col lg:justify-between xl:p-14 dark:border-white/10 dark:bg-[#050916]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(59,130,246,0.18),transparent_34%),radial-gradient(circle_at_55%_34%,rgba(37,99,235,0.10),transparent_30%),linear-gradient(140deg,rgba(248,250,252,0.72),rgba(226,232,240,0.64))] dark:bg-[radial-gradient(circle_at_12%_0%,rgba(59,130,246,0.42),transparent_34%),radial-gradient(circle_at_55%_34%,rgba(37,99,235,0.18),transparent_30%),linear-gradient(140deg,rgba(15,23,42,0.25),rgba(2,6,23,0.94))]" />
      <div className="pointer-events-none absolute -left-24 top-12 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl dark:bg-blue-600/20" />
      <div className="relative z-10">
        <Image
          src={logoSrc}
          alt="Up Flow"
          width={72}
          height={72}
          priority
          className="h-16 w-16 object-contain"
        />
      </div>

      <div className="relative z-10 flex justify-center">
        <div className="relative h-[360px] w-[420px] max-w-full">
          <div className="absolute left-[40%] top-20 h-56 w-44 rotate-[8deg] rounded-[2rem] border border-blue-300/40 bg-blue-100/60 shadow-[0_0_60px_rgba(59,130,246,0.18)] backdrop-blur-xl dark:border-blue-300/20 dark:bg-blue-500/[0.15]" />
          <div className="absolute left-[28%] top-10 h-64 w-52 rotate-[5deg] rounded-[2rem] border border-blue-300/50 bg-blue-100/70 shadow-[0_0_70px_rgba(37,99,235,0.22)] backdrop-blur-xl dark:border-blue-300/30 dark:bg-blue-500/[0.15]" />
          <div className="absolute left-10 top-0 flex h-72 w-60 -rotate-[4deg] items-center justify-center rounded-[2rem] border border-blue-300/70 bg-gradient-to-br from-blue-100 via-white to-slate-100 shadow-[0_30px_90px_rgba(37,99,235,0.24),0_0_0_1px_rgba(255,255,255,0.45)_inset] backdrop-blur-xl dark:border-blue-300/50 dark:bg-gradient-to-br dark:from-blue-500/20 dark:via-blue-500/10 dark:to-slate-950/80 dark:shadow-[0_30px_90px_rgba(37,99,235,0.35),0_0_0_1px_rgba(255,255,255,0.08)_inset]">
            <Image
              src={logoSrc}
              alt=""
              width={118}
              height={118}
              className="h-28 w-28 object-contain drop-shadow-[0_0_38px_rgba(59,130,246,0.9)]"
            />
          </div>
          <div className="absolute bottom-8 left-14 h-2 w-52 rounded-full bg-blue-500/30 blur-xl" />
        </div>
      </div>

      <div className="relative z-10 max-w-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-300">
          {copy.brandEyebrow}
        </p>
        <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight text-slate-950 xl:text-6xl dark:text-white">
          {copy.brandTitleLine1}
          <br />
          {copy.brandTitleLine2}{" "}
          <span className="bg-gradient-to-r from-blue-300 via-blue-500 to-violet-400 bg-clip-text text-transparent">
            {copy.brandTitleAccent}
          </span>
        </h1>
        <p className="mt-6 max-w-md text-lg leading-8 text-slate-600 dark:text-slate-300">
          {copy.brandDescription}
        </p>
      </div>

      <div className="relative z-10 grid gap-6 sm:grid-cols-3">
        <FeatureItem
          icon={<Layers3 className="h-5 w-5" />}
          title={copy.allInOneTitle}
          description={copy.allInOneDescription}
        />
        <FeatureItem
          icon={<Users className="h-5 w-5" />}
          title={copy.teamsTitle}
          description={copy.teamsDescription}
        />
        <FeatureItem
          icon={<BarChart3 className="h-5 w-5" />}
          title={copy.dataTitle}
          description={copy.dataDescription}
        />
      </div>
    </section>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 shrink-0">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.23-.2-1.77H12v3.4h5.52a4.7 4.7 0 0 1-2.05 3.08l-.02.11 2.98 2.31.21.02c1.94-1.79 2.96-4.42 2.96-7.15Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.89 6.64-2.62l-3.17-2.44c-.85.57-1.99.97-3.47.97a6.03 6.03 0 0 1-5.7-4.17l-.1.01-3.1 2.4-.04.1A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.3 13.74A6.2 6.2 0 0 1 5.97 12c0-.61.11-1.2.32-1.75v-.12L3.16 7.7l-.1.05A10 10 0 0 0 2 12c0 1.53.35 2.97 1.06 4.25l3.24-2.51Z" />
      <path fill="#EA4335" d="M12 6.09c1.88 0 3.14.81 3.86 1.48l2.84-2.76A9.57 9.57 0 0 0 12 2a10 10 0 0 0-8.94 5.75l3.23 2.5A6.06 6.06 0 0 1 12 6.09Z" />
    </svg>
  );
}

export default function LoginPage() {
  const { language } = useLanguage();
  const copy = loginCopy[language];
  const [loading, setLoading] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [localAccessAvailable, setLocalAccessAvailable] = useState(false);
  const [nextPath, setNextPath] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setLocalAccessAvailable(
      process.env.NODE_ENV !== "production" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname),
    );
    const next = params.get("next");
    setNextPath(safeInternalPath(next));
    const authError = params.get("auth_error");
    if (authError === "calendar") toast.error(copy.calendarError);
    else if (authError) toast.error(copy.authError);
  }, [copy.authError, copy.calendarError]);

  function continueWithGoogle() {
    if (loading) return;
    setLoading(true);
    window.location.assign(`/api/auth/google?next=${encodeURIComponent(nextPath)}`);
  }

  async function continueWithLocalReview() {
    if (loading || localLoading) return;
    setLocalLoading(true);
    try {
      const response = await fetch("/api/auth/local-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Local review login failed");
      window.location.assign(nextPath);
    } catch {
      toast.error(copy.localReviewError);
      setLocalLoading(false);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-slate-50 text-slate-950 dark:bg-[#030712] dark:text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(37,99,235,0.10),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(139,92,246,0.10),transparent_34%)] dark:bg-[radial-gradient(circle_at_75%_10%,rgba(37,99,235,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(139,92,246,0.12),transparent_34%)]" />
      <LoginControlBar />

      <div className="relative z-10 grid min-h-dvh lg:grid-cols-[minmax(0,0.96fr)_minmax(480px,1fr)]">
        <BrandPanel copy={copy} />

        <section className="flex min-h-dvh items-center justify-center px-5 py-24 sm:px-8 lg:px-12">
          <div className="w-full max-w-xl">
            <div className="mb-12 text-center">
              <Image
                src={logoSrc}
                alt="Up Flow"
                width={86}
                height={86}
                priority
                className="mx-auto h-20 w-20 object-contain drop-shadow-[0_0_34px_rgba(59,130,246,0.65)]"
              />
              <h2 className="mt-6 text-4xl font-bold tracking-tight text-slate-950 dark:text-white">Up Flow</h2>
              <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">{copy.welcomeTitle}</p>
            </div>

            <div className="space-y-5">
              <button
                type="button"
                onClick={continueWithGoogle}
                disabled={loading}
                className="group flex min-h-[68px] w-full items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 text-lg font-bold text-slate-900 shadow-[0_18px_55px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_22px_70px_rgba(37,99,235,0.22)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.12] dark:text-white dark:hover:border-blue-400/50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {copy.signingIn}
                  </>
                ) : (
                  <>
                    <GoogleLogo />
                    {copy.googleSignIn}
                    <ArrowRight className="h-6 w-6 transition group-hover:translate-x-1" />
                  </>
                )}
              </button>
              <p className="px-4 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
                {copy.googleOnly}
              </p>
              {localAccessAvailable ? (
                <div className="border-t border-slate-200 pt-5 dark:border-white/10">
                  <button
                    type="button"
                    onClick={continueWithLocalReview}
                    disabled={loading || localLoading}
                    className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-blue-300/50 bg-blue-50 px-5 text-sm font-semibold text-blue-700 transition hover:border-blue-400 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-400/25 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/15"
                  >
                    {localLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <MonitorCheck className="h-5 w-5" />
                    )}
                    {localLoading ? copy.localReviewLoading : copy.localReview}
                  </button>
                  <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-500">
                    {copy.localReviewHelp}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-5 text-center text-slate-600 shadow-[0_18px_54px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.15] dark:text-slate-400">
              <div className="mb-2 flex justify-center text-emerald-500 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              {copy.needAccess}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
