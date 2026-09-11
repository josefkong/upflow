"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  RefreshCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/layout/header";
import { useLanguage } from "@/components/language-provider";
import {
  formatBrazilianMobilePhone,
  formatPersonName,
  isValidBrazilianMobilePhone,
} from "@/lib/user-profile";

const settingsCards = [
  {
    icon: SlidersHorizontal,
    titleKey: "settings.workspaceTitle",
    descriptionKey: "settings.workspaceDescription",
    href: "/team",
    actionKey: "settings.openTeam",
  },
  {
    icon: ShieldCheck,
    titleKey: "settings.healthTitle",
    descriptionKey: "settings.healthDescription",
    href: "/admin/health",
    actionKey: "settings.openHealth",
  },
  {
    icon: KeyRound,
    titleKey: "settings.permissionsTitle",
    descriptionKey: "settings.permissionsDescription",
    href: "/settings/permissions",
    actionKey: "settings.openPermissions",
  },
  {
    icon: RefreshCcw,
    titleKey: "settings.qaResetTitle",
    descriptionKey: "settings.qaResetDescription",
    href: "/settings/qa-reset",
    actionKey: "settings.openQaReset",
  },
];

type ProfileState = {
  name: string;
  email: string;
  phone: string;
};

const emptyProfile: ProfileState = {
  name: "",
  email: "",
  phone: "",
};

export default function SettingsPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileState>(emptyProfile);
  const [initialEmail, setInitialEmail] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || t("settings.couldNotLoadProfile"));
        }
        if (!active) return;
        const nextProfile = {
          name: formatPersonName(data.name ?? ""),
          email: data.email ?? "",
          phone: formatBrazilianMobilePhone(data.phone ?? ""),
        };
        setProfile(nextProfile);
        setInitialEmail(nextProfile.email);
        setProfileError(null);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : t("settings.couldNotLoadProfile");
        setProfileError(message);
      } finally {
        if (active) setLoadingProfile(false);
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [t]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedProfile = {
      name: formatPersonName(profile.name.trim()),
      email: profile.email.trim(),
      phone: formatBrazilianMobilePhone(profile.phone),
    };
    if (!isValidBrazilianMobilePhone(normalizedProfile.phone)) {
      const message = t("settings.phoneFormatError");
      setProfileError(message);
      toast.error(message);
      return;
    }

    setProfile(normalizedProfile);
    setSavingProfile(true);
    setProfileError(null);

    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedProfile),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || t("settings.couldNotUpdateProfile"));
      }

      const nextProfile = {
        name: formatPersonName(data.name ?? ""),
        email: data.email ?? "",
        phone: formatBrazilianMobilePhone(data.phone ?? ""),
      };
      setProfile(nextProfile);
      setInitialEmail(nextProfile.email);
      toast.success(
        initialEmail && initialEmail !== nextProfile.email
          ? t("settings.profileUpdatedWithEmail")
          : t("settings.profileUpdated"),
      );
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("settings.couldNotUpdateProfile");
      setProfileError(message);
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  }

  const inputClassName =
    "h-11 w-full rounded-xl border border-border bg-background/70 px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <>
      <Header title={t("settings.title")} />
      <main className="mx-auto w-full max-w-5xl space-y-5 overflow-x-hidden p-4 sm:p-6">
        <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-lg dark:border-blue-300/[0.15] dark:bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(124,58,237,0.14),rgba(15,23,42,0.92))] dark:shadow-[0_0_40px_rgba(37,99,235,0.12)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(139,92,246,0.25),transparent_36%),radial-gradient(circle_at_0%_100%,rgba(14,165,233,0.16),transparent_34%)]" />
          <div className="relative">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/[0.15] text-blue-700 ring-1 ring-blue-400/30 dark:text-blue-100 dark:ring-blue-300/20">
              <Activity className="h-5 w-5" />
            </div>
            <h1 className="mt-5 text-3xl font-bold text-foreground">{t("settings.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("settings.subtitle")}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                <UserRound className="h-4 w-4" />
                {t("settings.account")}
              </div>
              <h2 className="mt-2 text-xl font-semibold text-foreground">{t("settings.profileSettings")}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t("settings.profileDescription")}
              </p>
            </div>
          </div>

          <form onSubmit={handleProfileSubmit} className="mt-5 space-y-5">
            {profileError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {profileError}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  {t("settings.name")}
                  <span className="text-destructive" aria-hidden="true">*</span>
                </span>
                <input
                  value={profile.name}
                  onChange={(event) => setProfile((current) => ({
                    ...current,
                    name: formatPersonName(event.target.value),
                  }))}
                  className={inputClassName}
                  disabled={loadingProfile || savingProfile}
                  placeholder={t("settings.yourName")}
                  autoComplete="name"
                  required
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-foreground">
                <span className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {t("settings.email")}
                  <span className="text-destructive" aria-hidden="true">*</span>
                </span>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))}
                  className={inputClassName}
                  disabled={loadingProfile || savingProfile}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2">
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {t("settings.phone")}
                  <span className="text-destructive" aria-hidden="true">*</span>
                </span>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(event) => setProfile((current) => ({
                    ...current,
                    phone: formatBrazilianMobilePhone(event.target.value),
                  }))}
                  className={inputClassName}
                  disabled={loadingProfile || savingProfile}
                  placeholder={t("settings.phonePlaceholder")}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={15}
                  pattern="\(\d{2}\) \d{5}-\d{4}"
                  title={t("settings.phoneFormatError")}
                  required
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">
                {t("settings.emailLoginHint")}
              </p>
              <button
                type="submit"
                disabled={loadingProfile || savingProfile}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("settings.saveProfile")}
              </button>
            </div>
          </form>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {settingsCards.map((card) => {
            const Icon = card.icon;
            const content = (
              <div className="group h-full rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-400/[0.35] hover:shadow-[0_0_30px_rgba(37,99,235,0.12)] dark:border-white/10 dark:bg-card/70 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:border-blue-300/25">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/[0.15] text-primary ring-1 ring-primary/20">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-base font-semibold text-foreground">{t(card.titleKey)}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t(card.descriptionKey)}
                </p>
                <p className="mt-4 text-xs font-semibold text-primary group-hover:text-blue-700 dark:group-hover:text-blue-200">
                  {t(card.actionKey)}
                </p>
              </div>
            );

            return (
              <Link key={card.titleKey} href={card.href}>
                {content}
              </Link>
            );
          })}
        </section>
      </main>
    </>
  );
}
