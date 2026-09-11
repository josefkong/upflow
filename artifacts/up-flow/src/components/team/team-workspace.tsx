"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleEllipsis,
  ExternalLink,
  Grid2X2,
  Handshake,
  Headphones,
  Lightbulb,
  List,
  ListChecks,
  Mail,
  Megaphone,
  MoreHorizontal,
  Palette,
  PencilLine,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  UsersRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import {
  colorDotClass,
  departmentColorTone,
  resolveUniqueDepartmentColors,
} from "@/lib/department-colors";
import type { Department, TeamMember } from "@/lib/types";
import type { PendingInvite } from "@/components/team/team-page-types";
import ServiceLeaderMappingPanel from "@/components/team/service-leader-mapping-panel";

type Translate = (key: string, vars?: Record<string, string | number>) => string;
type ActiveView = "departments" | "teams" | "people";
type LayoutMode = "grid" | "list";
type SortMode = "name" | "members" | "tasks";

interface TeamWorkspaceProps {
  users: TeamMember[];
  departments: Department[];
  pending: PendingInvite[];
  loading: boolean;
  query: string;
  showEmpty: boolean;
  isAdmin: boolean;
  language: "en" | "pt-BR";
  t: Translate;
  collapsed: Set<string>;
  resending: string | null;
  cancelingInvite: string | null;
  onShowEmptyChange: (value: boolean) => void;
  onToggleCollapsed: (key: string) => void;
  onUpdateMember: (
    userId: string,
    patch: {
      role?: "owner" | "admin" | "member" | "guest";
      status?: "active" | "inactive";
      department_id?: string | null;
    },
  ) => void;
  onUpdateDepartmentLeader: (
    departmentId: string,
    leaderId: string | null,
  ) => Promise<boolean>;
  onRemoveMember: (user: TeamMember) => void;
  onResendInvite: (invite: PendingInvite) => void;
  onCancelInvite: (invite: PendingInvite) => void;
  onOpenManage: () => void;
  roleOptions: ReactNode;
}

interface TeamCardData {
  key: string;
  id: string | null;
  name: string;
  color: string;
  members: TeamMember[];
  leader: Department["leader"] | null;
  leaderCandidates: TeamMember[];
}

const DEFAULT_CARD_COPY = {
  en: {
    title: "Teams",
    subtitle: "Organize departments, teams, and people to move work forward.",
    departments: "Departments",
    teams: "Teams",
    people: "People",
    allDepartments: "All departments",
    sort: "Sort: A–Z",
    sortByMembers: "Sort: members",
    sortByTasks: "Sort: tasks",
    totalMembers: "Total Members",
    pendingInvites: "Pending Invites",
    activeTeams: "Active Teams",
    active: "active",
    awaitingAcceptance: "Awaiting acceptance",
    workload: "Team insights",
    workloadSubtitle: "Task distribution by team",
    load: "load",
    viewReport: "View Full Report",
    noWorkload: "No assigned work yet",
    resend: "Resend",
    cancel: "Cancel invite",
    recentActivity: "Recent activity",
    viewAll: "View All",
    addedTo: "joined",
    team: "team",
    noActivity: "Team updates will appear here.",
    viewMembers: "View Members",
    manageTeam: "Manage Team",
    moreActions: "More Team Actions",
    projects: "projects",
    tasks: "assigned tasks",
    leader: "Leader",
    noLeader: "No leader assigned",
    editLeader: "Edit Leader",
    chooseLeader: "Choose a Leader",
    memberControls: "Member Controls",
    memberControlsDescription: "Manage roles, account status, and department assignments.",
    noMembers: "No members in this team yet.",
    showingAll: "Showing all teams",
    showingDepartment: "Showing",
    departmentDetails: "Department details",
    chooseTeam: "Choose a team to view its people.",
    roster: "Member roster",
  },
  "pt-BR": {
    title: "Equipes",
    subtitle: "Organize departamentos, equipes e pessoas para impulsionar resultados.",
    departments: "Departamentos",
    teams: "Equipes",
    people: "Pessoas",
    allDepartments: "Todos os departamentos",
    sort: "Ordenar: A–Z",
    sortByMembers: "Ordenar: membros",
    sortByTasks: "Ordenar: tarefas",
    totalMembers: "Total de Membros",
    pendingInvites: "Convites Pendentes",
    activeTeams: "Equipes Ativas",
    active: "ativas",
    awaitingAcceptance: "Aguardando aceite",
    workload: "Insights das equipes",
    workloadSubtitle: "Distribuição de tarefas por equipe",
    load: "de carga",
    viewReport: "Ver Relatório Completo",
    noWorkload: "Nenhuma tarefa atribuída ainda",
    resend: "Reenviar",
    cancel: "Cancelar convite",
    recentActivity: "Atividade recente",
    viewAll: "Ver Tudo",
    addedTo: "entrou na equipe",
    team: "",
    noActivity: "As atualizações da equipe aparecerão aqui.",
    viewMembers: "Ver Pessoas",
    manageTeam: "Gerenciar Equipe",
    moreActions: "Mais Ações da Equipe",
    projects: "projetos",
    tasks: "tarefas atribuídas",
    leader: "Líder",
    noLeader: "Nenhum líder definido",
    editLeader: "Editar Líder",
    chooseLeader: "Escolha um Líder",
    memberControls: "Controles de Membros",
    memberControlsDescription: "Gerencie papéis, status da conta e atribuições de departamento.",
    noMembers: "Nenhum membro nesta equipe ainda.",
    showingAll: "Exibindo todas as equipes",
    showingDepartment: "Exibindo",
    departmentDetails: "Detalhes do departamento",
    chooseTeam: "Escolha uma equipe para ver as pessoas.",
    roster: "Lista de membros",
  },
} as const;

type TeamCopy =
  | typeof DEFAULT_CARD_COPY.en
  | typeof DEFAULT_CARD_COPY["pt-BR"];

const TEAM_STYLES = [
  {
    icon: Handshake,
    iconClass: "from-violet-500/90 via-purple-500 to-fuchsia-600/80 text-white shadow-[0_0_24px_rgba(168,85,247,0.34)]",
    badgeClass: "border-blue-400/20 bg-blue-500/15 text-blue-200",
    barClass: "bg-gradient-to-r from-blue-500 to-blue-400",
  },
  {
    icon: ListChecks,
    iconClass: "from-blue-500 via-blue-600 to-indigo-600 text-white shadow-[0_0_24px_rgba(59,130,246,0.34)]",
    badgeClass: "border-sky-400/20 bg-sky-500/15 text-sky-200",
    barClass: "bg-gradient-to-r from-sky-500 to-blue-400",
  },
  {
    icon: Megaphone,
    iconClass: "from-amber-500 via-orange-500 to-yellow-600 text-white shadow-[0_0_24px_rgba(245,158,11,0.32)]",
    badgeClass: "border-violet-400/20 bg-violet-500/15 text-violet-200",
    barClass: "bg-gradient-to-r from-violet-500 to-purple-400",
  },
  {
    icon: UsersRound,
    iconClass: "from-rose-500 via-pink-600 to-fuchsia-600 text-white shadow-[0_0_24px_rgba(236,72,153,0.32)]",
    badgeClass: "border-fuchsia-400/20 bg-fuchsia-500/15 text-fuchsia-200",
    barClass: "bg-gradient-to-r from-fuchsia-500 to-violet-400",
  },
  {
    icon: Headphones,
    iconClass: "from-emerald-500 via-green-600 to-teal-600 text-white shadow-[0_0_24px_rgba(16,185,129,0.32)]",
    badgeClass: "border-emerald-400/20 bg-emerald-500/15 text-emerald-200",
    barClass: "bg-gradient-to-r from-emerald-500 to-green-400",
  },
  {
    icon: ShieldCheck,
    iconClass: "from-violet-600 via-indigo-600 to-blue-600 text-white shadow-[0_0_24px_rgba(99,102,241,0.34)]",
    badgeClass: "border-blue-400/20 bg-blue-500/15 text-blue-200",
    barClass: "bg-gradient-to-r from-cyan-500 to-blue-400",
  },
  {
    icon: Palette,
    iconClass: "from-indigo-500 via-violet-600 to-purple-600 text-white shadow-[0_0_24px_rgba(139,92,246,0.34)]",
    badgeClass: "border-violet-400/20 bg-violet-500/15 text-violet-200",
    barClass: "bg-gradient-to-r from-violet-500 to-indigo-400",
  },
  {
    icon: Lightbulb,
    iconClass: "from-cyan-500 via-sky-600 to-blue-600 text-white shadow-[0_0_24px_rgba(6,182,212,0.32)]",
    badgeClass: "border-sky-400/20 bg-sky-500/15 text-sky-200",
    barClass: "bg-gradient-to-r from-cyan-400 to-sky-400",
  },
] as const satisfies ReadonlyArray<{
  icon: LucideIcon;
  iconClass: string;
  badgeClass: string;
  barClass: string;
}>;

function normalizedName(name: string) {
  return name.trim().toLocaleLowerCase();
}

function teamStyleFor(name: string, index: number) {
  const normalized = normalizedName(name);
  if (normalized.includes("finance") || normalized.includes("financeiro")) return TEAM_STYLES[5];
  if (normalized.includes("creative") || normalized.includes("criativ")) return TEAM_STYLES[7];
  if (normalized.includes("design")) return TEAM_STYLES[6];
  if (normalized.includes("suporte") || normalized.includes("support")) return TEAM_STYLES[4];
  if (normalized.includes("b2c")) return TEAM_STYLES[3];
  if (normalized.includes("b2b") || normalized.includes("marketing")) return TEAM_STYLES[2];
  if (normalized.includes("sdr") || normalized.includes("sales")) return TEAM_STYLES[1];
  if (normalized.includes("comercial") || normalized.includes("commercial")) return TEAM_STYLES[0];
  return TEAM_STYLES[index % TEAM_STYLES.length];
}

function descriptionFor(name: string, language: "en" | "pt-BR") {
  const normalized = normalizedName(name);
  const portuguese = language === "pt-BR";
  if (normalized.includes("finance") || normalized.includes("financeiro")) {
    return portuguese
      ? "Gestão financeira, controle orçamentário e relatórios estratégicos."
      : "Financial management, budget control, and strategic reporting.";
  }
  if (normalized.includes("creative") || normalized.includes("criativ")) {
    return portuguese
      ? "Conceitos criativos e campanhas que conectam e inspiram."
      : "Creative concepts and campaigns that connect and inspire.";
  }
  if (normalized.includes("design")) {
    return portuguese
      ? "Criação de identidades visuais, designs e assets para as marcas."
      : "Visual identities, designs, and brand assets.";
  }
  if (normalized.includes("suporte") || normalized.includes("support")) {
    return portuguese
      ? "Atendimento e suporte a clientes para garantir satisfação e sucesso."
      : "Client support that protects satisfaction and success.";
  }
  if (normalized.includes("b2c")) {
    return portuguese
      ? "Campanhas e conteúdos focados no público final e engajamento."
      : "Campaigns and content focused on audience engagement.";
  }
  if (normalized.includes("b2b") || normalized.includes("marketing")) {
    return portuguese
      ? "Estratégias e campanhas focadas em empresas e geração de demanda."
      : "Strategies and campaigns focused on demand generation.";
  }
  if (normalized.includes("sdr") || normalized.includes("sales")) {
    return portuguese
      ? "Prospecção ativa e qualificação de leads para o funil de vendas."
      : "Active prospecting and lead qualification for the sales funnel.";
  }
  if (normalized.includes("comercial") || normalized.includes("commercial")) {
    return portuguese
      ? "Responsável por gerar receita e fortalecer relações com clientes."
      : "Responsible for revenue and stronger client relationships.";
  }
  return portuguese
    ? "Equipe colaborativa conectada aos resultados do workspace."
    : "A collaborative team connected to workspace outcomes.";
}

function roleLabel(user: TeamMember, t: Translate) {
  const role = user.workspace_role ?? user.role;
  if (role === "owner") return t("common.owner");
  if (role === "admin") return t("common.admin");
  if (role === "guest") return t("common.guest");
  return t("common.member");
}

function Avatar({
  user,
  className,
}: {
  user: Pick<TeamMember, "name" | "avatar_url">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-500/80 to-violet-600/80 text-[10px] font-bold text-white ring-2 ring-[#091325]",
        className,
      )}
      aria-label={user.name}
    >
      <span aria-hidden="true">{getInitials(user.name)}</span>
      {user.avatar_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatar_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </span>
  );
}

function MemberStack({ members }: { members: TeamMember[] }) {
  const shown = members.slice(0, 4);
  const extra = members.length - shown.length;
  return (
    <div className="flex items-center pl-1" aria-label={`${members.length} members`}>
      {shown.map((member, index) => (
        <Avatar
          key={member.id}
          user={member}
          className={cn("h-7 w-7", index > 0 && "-ml-2")}
        />
      ))}
      {extra > 0 && (
        <span className="-ml-1.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-[#1d2a41] px-1 text-[10px] font-semibold text-slate-200 ring-2 ring-[#091325]">
          +{extra}
        </span>
      )}
    </div>
  );
}

export default function TeamWorkspace({
  users,
  departments,
  pending,
  loading,
  query,
  showEmpty,
  isAdmin,
  language,
  t,
  collapsed,
  resending,
  cancelingInvite,
  onShowEmptyChange,
  onToggleCollapsed,
  onUpdateMember,
  onUpdateDepartmentLeader,
  onRemoveMember,
  onResendInvite,
  onCancelInvite,
  onOpenManage,
  roleOptions,
}: TeamWorkspaceProps) {
  const copy = DEFAULT_CARD_COPY[language];
  const [activeView, setActiveView] = useState<ActiveView>("teams");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [contextMenuFor, setContextMenuFor] = useState<string | null>(null);
  const [leaderEditorFor, setLeaderEditorFor] = useState<string | null>(null);

  const departmentColorById = useMemo(
    () => resolveUniqueDepartmentColors(departments),
    [departments],
  );

  const groupMembers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const lookup = new Map<string, TeamMember[]>();
    departments.forEach((department) => lookup.set(department.id, []));
    lookup.set("__unassigned__", []);
    for (const user of users) {
      if (
        needle &&
        !user.name.toLocaleLowerCase().includes(needle) &&
        !user.email.toLocaleLowerCase().includes(needle)
      ) {
        continue;
      }
      const key = user.department_id && lookup.has(user.department_id)
        ? user.department_id
        : "__unassigned__";
      lookup.get(key)?.push(user);
    }
    return lookup;
  }, [departments, query, users]);

  const allCards = useMemo<TeamCardData[]>(() => {
    const cards: TeamCardData[] = departments.map((department) => ({
      key: department.id,
      id: department.id,
      name: department.name,
      color: departmentColorById.get(department.id) ?? department.color,
      members: groupMembers.get(department.id) ?? [],
      leader: department.leader ?? null,
      leaderCandidates: users.filter(
        (user) =>
          user.department_id === department.id &&
          user.workspace_status === "active",
      ),
    }));
    const unassigned = groupMembers.get("__unassigned__") ?? [];
    if (unassigned.length > 0 || departments.length === 0) {
      cards.push({
        key: "__unassigned__",
        id: null,
        name: t("common.unassigned"),
        color: "slate",
        members: unassigned,
        leader: null,
        leaderCandidates: [],
      });
    }
    return cards;
  }, [departmentColorById, departments, groupMembers, t, users]);

  const visibleCards = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const cards = allCards
      .filter((card) => departmentFilter === "all" || card.key === departmentFilter)
      .filter((card) => {
        if (normalizedQuery) {
          return (
            card.members.length > 0 ||
            card.name.toLocaleLowerCase().includes(normalizedQuery)
          );
        }
        return showEmpty || card.members.length > 0;
      });
    return [...cards].sort((left, right) => {
      if (sortMode === "members") return right.members.length - left.members.length;
      if (sortMode === "tasks") {
        const leftTasks = left.members.reduce((sum, member) => sum + member._count.tasks, 0);
        const rightTasks = right.members.reduce((sum, member) => sum + member._count.tasks, 0);
        return rightTasks - leftTasks;
      }
      return left.name.localeCompare(right.name, language);
    });
  }, [allCards, departmentFilter, language, query, showEmpty, sortMode]);

  const activeTeamCount = allCards.filter((card) => card.members.length > 0).length;
  const totalTasks = allCards.reduce(
    (sum, card) => sum + card.members.reduce((memberSum, member) => memberSum + member._count.tasks, 0),
    0,
  );
  const activity = useMemo(
    () => [...users]
      .filter((member) => member.created_at)
      .sort((left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      )
      .slice(0, 2),
    [users],
  );

  const revealPeople = (card: TeamCardData) => {
    setDepartmentFilter(card.key);
    setActiveView("people");
    setContextMenuFor(null);
    setLeaderEditorFor(null);
    window.requestAnimationFrame(() => {
      document.getElementById("team-member-roster")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  return (
    <div className="min-h-full overflow-x-hidden bg-[radial-gradient(circle_at_48%_-8%,rgba(59,130,246,0.1),transparent_32%),linear-gradient(180deg,#050b18_0%,#07101e_100%)]">
      <div className="mx-auto w-full max-w-[1420px] px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:pt-5">
        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
          <section className="min-w-0">
            <div className="mb-3">
              <h1 className="text-[30px] font-bold tracking-[-0.045em] text-white sm:text-[32px]">
                {copy.title}
              </h1>
              <p className="mt-0.5 text-sm text-slate-400">{copy.subtitle}</p>
            </div>

            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
              <MetricCard icon={UsersRound} label={copy.totalMembers} value={users.length} accent="violet" detail={t("team.memberCountPlural", { count: users.length })} />
              <MetricCard icon={Grid2X2} label={copy.departments} value={departments.length} accent="blue" detail={copy.active} />
              <MetricCard icon={Mail} label={copy.pendingInvites} value={pending.length} accent="purple" detail={copy.awaitingAcceptance} />
              <MetricCard icon={UserRoundCog} label={copy.activeTeams} value={activeTeamCount} accent="sky" detail={copy.active} />
            </div>

            <div className="mt-5 border-b border-blue-300/10">
              <div className="flex items-end gap-6" role="tablist" aria-label={copy.title}>
                <TabButton active={activeView === "departments"} onClick={() => setActiveView("departments")}>
                  {copy.departments}
                </TabButton>
                <TabButton active={activeView === "teams"} onClick={() => setActiveView("teams")}>
                  {copy.teams}
                </TabButton>
                <TabButton active={activeView === "people"} onClick={() => setActiveView("people")}>
                  {copy.people}
                </TabButton>
              </div>
            </div>

            <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="team-department-filter">
                  {copy.allDepartments}
                </label>
                <select
                  id="team-department-filter"
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                  className="h-9 min-w-[190px] rounded-lg border border-blue-300/15 bg-[#0b1424] px-3 text-xs font-medium text-slate-200 outline-none transition hover:border-blue-300/30 focus:border-blue-400/55 focus:ring-2 focus:ring-blue-400/15"
                >
                  <option value="all">{copy.allDepartments}</option>
                  {allCards.map((card) => (
                    <option key={card.key} value={card.key}>{card.name}</option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="team-sort-order">{copy.sort}</label>
                <select
                  id="team-sort-order"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className="h-9 min-w-[142px] rounded-lg border border-blue-300/15 bg-[#0b1424] px-3 text-xs font-medium text-slate-200 outline-none transition hover:border-blue-300/30 focus:border-blue-400/55 focus:ring-2 focus:ring-blue-400/15"
                >
                  <option value="name">{copy.sort}</option>
                  <option value="members">{copy.sortByMembers}</option>
                  <option value="tasks">{copy.sortByTasks}</option>
                </select>
              </div>
              <div className="inline-flex h-9 shrink-0 overflow-hidden rounded-lg border border-blue-300/15 bg-[#091325] p-0.5">
                <button
                  type="button"
                  aria-label={t("team.gridView")}
                  aria-pressed={layoutMode === "grid"}
                  onClick={() => setLayoutMode("grid")}
                  className={cn(
                    "flex h-7 w-8 items-center justify-center rounded-md transition",
                    layoutMode === "grid" ? "bg-blue-600/35 text-blue-100 shadow-[0_0_18px_rgba(59,130,246,0.28)]" : "text-slate-500 hover:text-slate-200",
                  )}
                >
                  <Grid2X2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={t("team.listView")}
                  aria-pressed={layoutMode === "list"}
                  onClick={() => setLayoutMode("list")}
                  className={cn(
                    "flex h-7 w-8 items-center justify-center rounded-md transition",
                    layoutMode === "list" ? "bg-blue-600/35 text-blue-100 shadow-[0_0_18px_rgba(59,130,246,0.28)]" : "text-slate-500 hover:text-slate-200",
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>

            {activeView === "departments" ? (
              <DepartmentDetails
                cards={visibleCards}
                copy={copy}
                onOpenManage={onOpenManage}
                onViewPeople={revealPeople}
              />
            ) : activeView === "people" ? (
              <MemberRoster
                cards={visibleCards}
                departments={departments}
                isAdmin={isAdmin}
                showEmpty={showEmpty}
                collapsed={collapsed}
                copy={copy}
                t={t}
                onShowEmptyChange={onShowEmptyChange}
                onToggleCollapsed={onToggleCollapsed}
                onUpdateMember={onUpdateMember}
                onRemoveMember={onRemoveMember}
                roleOptions={roleOptions}
              />
            ) : loading ? (
              <LoadingCards />
            ) : visibleCards.length === 0 ? (
              <EmptyTeamState query={query} copy={copy} />
            ) : (
              <div
                data-testid="teams-grid"
                className={cn(
                  "grid gap-3",
                  layoutMode === "grid" ? "sm:grid-cols-2 2xl:grid-cols-4" : "grid-cols-1",
                )}
              >
                {visibleCards.map((card, index) => (
                  <TeamCard
                    key={card.key}
                    card={card}
                    index={index}
                    copy={copy}
                    language={language}
                    layoutMode={layoutMode}
                    isAdmin={isAdmin}
                    contextOpen={contextMenuFor === card.key}
                    onToggleContext={() => setContextMenuFor((current) => current === card.key ? null : card.key)}
                    leaderEditorOpen={leaderEditorFor === card.key}
                    onToggleLeaderEditor={() => {
                      setContextMenuFor(null);
                      setLeaderEditorFor((current) => current === card.key ? null : card.key);
                    }}
                    onUpdateLeader={async (leaderId) => {
                      if (!card.id) return false;
                      const updated = await onUpdateDepartmentLeader(card.id, leaderId);
                      if (updated) setLeaderEditorFor(null);
                      return updated;
                    }}
                    onViewPeople={() => revealPeople(card)}
                    onOpenManage={() => {
                      setContextMenuFor(null);
                      onOpenManage();
                    }}
                  />
                ))}
              </div>
            )}

            {activeView === "teams" && (
              <div className="mt-8">
                <MemberRoster
                  cards={visibleCards}
                  departments={departments}
                  isAdmin={isAdmin}
                  showEmpty={showEmpty}
                  collapsed={collapsed}
                copy={copy}
                  t={t}
                  onShowEmptyChange={onShowEmptyChange}
                  onToggleCollapsed={onToggleCollapsed}
                  onUpdateMember={onUpdateMember}
                  onRemoveMember={onRemoveMember}
                  roleOptions={roleOptions}
                  compact
                />
              </div>
            )}

            <div className="mt-8">
              <ServiceLeaderMappingPanel
                isAdmin={isAdmin}
                users={users}
                departments={departments}
              />
            </div>
          </section>

          <aside className="space-y-3 xl:sticky xl:top-5">
            <InsightsCard
              cards={allCards}
              totalTasks={totalTasks}
              copy={copy}
            />
            <PendingInvitesCard
              invites={pending}
              resending={resending}
              cancelingInvite={cancelingInvite}
              copy={copy}
              onResend={onResendInvite}
              onCancel={onCancelInvite}
            />
            <ActivityCard
              activity={activity}
              cards={allCards}
              copy={copy}
              language={language}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  detail: string;
  accent: "violet" | "blue" | "purple" | "sky";
}) {
  const accents = {
    violet: "from-violet-500/25 to-fuchsia-500/10 text-violet-300 border-violet-400/15",
    blue: "from-blue-500/25 to-indigo-500/10 text-blue-300 border-blue-400/15",
    purple: "from-purple-500/25 to-violet-500/10 text-purple-300 border-purple-400/15",
    sky: "from-sky-500/25 to-blue-500/10 text-sky-300 border-sky-400/15",
  } as const;
  return (
    <div className="command-metric-card min-h-[94px] rounded-2xl border border-blue-300/10 bg-[#0b1424]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_34px_rgba(0,0,0,0.16)]">
      <div className="flex h-full items-center justify-start gap-3.5">
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br", accents[accent])}>
          <Icon className="h-6 w-6" />
        </span>
        <div className="grid h-12 w-40 min-w-0 shrink content-center grid-rows-[1rem_1.75rem]">
          <p className="line-clamp-1 flex h-4 min-w-0 items-center text-xs font-medium leading-4 text-slate-400">{label}</p>
          <div className="flex h-7 min-w-0 items-end gap-2">
            <span className="text-[28px] font-semibold leading-none tracking-[-0.04em] text-white">{value}</span>
            <span className="line-clamp-2 min-w-0 pb-0.5 text-[10px] leading-3 text-slate-500">{detail}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative -mb-px border-b-2 px-1 pb-3 text-xs font-medium transition",
        active ? "border-blue-500 text-blue-100" : "border-transparent text-slate-400 hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

function TeamCard({
  card,
  index,
  copy,
  language,
  layoutMode,
  isAdmin,
  contextOpen,
  onToggleContext,
  leaderEditorOpen,
  onToggleLeaderEditor,
  onUpdateLeader,
  onViewPeople,
  onOpenManage,
}: {
  card: TeamCardData;
  index: number;
  copy: TeamCopy;
  language: "en" | "pt-BR";
  layoutMode: LayoutMode;
  isAdmin: boolean;
  contextOpen: boolean;
  onToggleContext: () => void;
  leaderEditorOpen: boolean;
  onToggleLeaderEditor: () => void;
  onUpdateLeader: (leaderId: string | null) => Promise<boolean>;
  onViewPeople: () => void;
  onOpenManage: () => void;
}) {
  const style = teamStyleFor(card.name, index);
  const Icon = style.icon;
  const tone = departmentColorTone(card.color);
  const [savingLeader, setSavingLeader] = useState(false);
  const leader = card.leader;
  const leaderOptions =
    leader && !card.leaderCandidates.some((member) => member.id === leader.id)
      ? [leader, ...card.leaderCandidates]
      : card.leaderCandidates;
  const canEditLeader = isAdmin && card.id !== null;
  const totalTasks = card.members.reduce((sum, member) => sum + member._count.tasks, 0);
  const totalProjects = card.members.reduce((sum, member) => sum + member._count.projects, 0);
  return (
    <section
      data-testid="department-group"
      data-department-key={card.key}
      data-department-color={card.color}
      className={cn(
        "upflow-card upflow-card-hover relative overflow-visible rounded-2xl border bg-[#0b1424]/95 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_18px_38px_rgba(0,0,0,0.2)]",
        tone.cardBorder,
        layoutMode === "list" && "sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-5",
      )}
      style={{
        borderColor: `rgb(${tone.rgb} / 0.34)`,
        borderLeftColor: `rgb(${tone.rgb} / 0.9)`,
      }}
    >
      <div className={cn("flex items-start justify-between gap-3", layoutMode === "list" && "sm:contents")}>
        <span
          className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border", tone.icon)}
          style={{
            borderColor: `rgb(${tone.rgb} / 0.55)`,
            backgroundColor: `rgb(${tone.rgb} / 0.2)`,
            color: `rgb(${tone.rgb})`,
            boxShadow: `0 0 22px rgb(${tone.rgb} / 0.24)`,
          }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className={cn("min-w-0 flex-1", layoutMode === "list" && "sm:order-2")}>
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-white">
                <span
                  aria-hidden="true"
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-full", tone.dot)}
                  style={{ backgroundColor: `rgb(${tone.rgb})` }}
                />
                <span className="truncate">{card.name}</span>
              </h2>
              <span
                className={cn("mt-1 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium", tone.badge)}
                style={{
                  borderColor: `rgb(${tone.rgb} / 0.45)`,
                  backgroundColor: `rgb(${tone.rgb} / 0.14)`,
                  color: `rgb(${tone.rgb})`,
                }}
              >
                {card.name}
              </span>
            </div>
            <div className="relative -mt-0.5 shrink-0">
              <button
                type="button"
                aria-label={copy.moreActions}
                aria-expanded={contextOpen}
                title={copy.moreActions}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleContext();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {contextOpen && (
                <div className="absolute right-0 top-8 z-30 w-44 overflow-hidden rounded-xl border border-blue-300/20 bg-[#101b30] p-1 shadow-2xl">
                  <button type="button" onClick={onViewPeople} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-white/10">
                    <UsersRound className="h-3.5 w-3.5 text-blue-300" />
                    {copy.viewMembers}
                  </button>
                  {canEditLeader && (
                    <button
                      type="button"
                      onClick={onToggleLeaderEditor}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-white/10"
                    >
                      <UserRoundCog className="h-3.5 w-3.5 text-blue-300" />
                      {copy.editLeader}
                    </button>
                  )}
                  <button type="button" onClick={onOpenManage} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-white/10">
                    <PencilLine className="h-3.5 w-3.5 text-blue-300" />
                    {copy.manageTeam}
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-[1.45] text-slate-400">
            {descriptionFor(card.name, language)}
          </p>
        </div>
      </div>

      <div className={cn("mt-3", layoutMode === "list" && "sm:order-3 sm:mt-0 sm:min-w-[210px]")}>
        <div className="flex items-center gap-2.5">
          {leader ? <Avatar user={leader} className="h-7 w-7" /> : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-slate-500"><UsersRound className="h-3.5 w-3.5" /></span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] leading-none text-slate-500">{copy.leader}</p>
              {canEditLeader && (
                <button
                  type="button"
                  aria-label={copy.editLeader}
                  title={copy.editLeader}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleLeaderEditor();
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded text-slate-500 transition hover:bg-blue-500/15 hover:text-blue-100"
                >
                  <PencilLine className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="mt-1 truncate text-xs font-medium text-slate-200">{leader?.name ?? copy.noLeader}</p>
          </div>
        </div>
        {leaderEditorOpen && canEditLeader && (
          <label className="mt-2 block">
            <span className="mb-1 block text-[10px] font-medium text-slate-400">{copy.chooseLeader}</span>
            <select
              value={leader?.id ?? ""}
              disabled={savingLeader}
              onClick={(event) => event.stopPropagation()}
              onChange={async (event) => {
                setSavingLeader(true);
                await onUpdateLeader(event.target.value || null);
                setSavingLeader(false);
              }}
              className="h-8 w-full rounded-lg border border-blue-300/20 bg-[#07101e] px-2 text-xs font-medium text-slate-100 outline-none transition hover:border-blue-300/35 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15"
            >
              <option value="">{copy.noLeader}</option>
              {leaderOptions.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className={cn("mt-3 flex items-center justify-between gap-3", layoutMode === "list" && "sm:col-start-2 sm:row-start-2 sm:mt-3")}>
        <MemberStack members={card.members} />
        <span className="sr-only">{card.members.map((member) => member.email).join(" ")}</span>
      </div>

      <div className={cn("mt-3 flex items-center justify-between border-t border-blue-300/10 pt-2.5 text-[10px] text-slate-400", layoutMode === "list" && "sm:col-start-2 sm:row-start-3 sm:mt-3")}>
        <span>{totalProjects} {copy.projects}</span>
        <span>{totalTasks} {copy.tasks}</span>
      </div>

      <div className={cn("mt-2.5 grid grid-cols-3 gap-2", layoutMode === "list" && "sm:col-start-3 sm:row-start-2 sm:mt-0 sm:min-w-[146px]")}>
        <button type="button" onClick={(event) => { event.stopPropagation(); onViewPeople(); }} aria-label={copy.viewMembers} title={copy.viewMembers} className="flex h-7 items-center justify-center rounded-lg border border-blue-300/10 bg-white/[0.03] text-slate-300 transition hover:border-blue-300/30 hover:bg-blue-500/10 hover:text-white">
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onToggleLeaderEditor(); }} aria-label={copy.editLeader} title={copy.editLeader} className="flex h-7 items-center justify-center rounded-lg border border-blue-300/10 bg-white/[0.03] text-slate-300 transition hover:border-blue-300/30 hover:bg-blue-500/10 hover:text-white">
          <UserRoundCog className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onToggleContext(); }} aria-label={copy.moreActions} title={copy.moreActions} className="flex h-7 items-center justify-center rounded-lg border border-blue-300/10 bg-white/[0.03] text-slate-300 transition hover:border-blue-300/30 hover:bg-blue-500/10 hover:text-white">
          <CircleEllipsis className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}

function LoadingCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-[270px] animate-pulse rounded-2xl border border-blue-300/10 bg-[#0b1424]/75" />
      ))}
    </div>
  );
}

function EmptyTeamState({ query, copy }: { query: string; copy: TeamCopy }) {
  return (
    <div data-testid={query.trim() ? "team-search-empty" : undefined} className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-blue-300/20 bg-[#0b1424]/55 px-5 text-center">
      <UsersRound className="h-9 w-9 text-blue-300/55" />
      <p className="mt-3 text-sm font-semibold text-slate-200">{query.trim() ? `No team matches "${query}"` : copy.noMembers}</p>
      <p className="mt-1 text-xs text-slate-500">{copy.chooseTeam}</p>
    </div>
  );
}

function DepartmentDetails({
  cards,
  copy,
  onOpenManage,
  onViewPeople,
}: {
  cards: TeamCardData[];
  copy: TeamCopy;
  onOpenManage: () => void;
  onViewPeople: (card: TeamCardData) => void;
}) {
  return (
    <div className="command-section-panel rounded-2xl border border-blue-300/15 bg-[#0b1424]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_42px_rgba(0,0,0,0.2)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">{copy.departmentDetails}</h2>
          <p className="mt-1 text-xs text-slate-400">{copy.showingAll}</p>
        </div>
        <button type="button" onClick={onOpenManage} className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-300/20 bg-blue-500/10 px-3 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/20">
          <PencilLine className="h-3.5 w-3.5" />
          {copy.manageTeam}
        </button>
      </div>
      <div className="mt-4 divide-y divide-blue-300/10 rounded-xl border border-blue-300/10 bg-[#08111f]/70">
        {cards.map((card, index) => {
          const style = teamStyleFor(card.name, index);
          const tone = departmentColorTone(card.color);
          const Icon = style.icon;
          return (
            <button key={card.key} type="button" onClick={() => onViewPeople(card)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-white/[0.04]">
              <span
                className={cn("flex h-9 w-9 items-center justify-center rounded-lg border", tone.icon)}
                style={{
                  borderColor: `rgb(${tone.rgb} / 0.55)`,
                  backgroundColor: `rgb(${tone.rgb} / 0.2)`,
                  color: `rgb(${tone.rgb})`,
                }}
              ><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-100">{card.name}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{card.members.length} {copy.people.toLocaleLowerCase()}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MemberRoster({
  cards,
  departments,
  isAdmin,
  showEmpty,
  collapsed,
  copy,
  t,
  onShowEmptyChange,
  onToggleCollapsed,
  onUpdateMember,
  onRemoveMember,
  roleOptions,
  compact = false,
}: {
  cards: TeamCardData[];
  departments: Department[];
  isAdmin: boolean;
  showEmpty: boolean;
  collapsed: Set<string>;
  copy: TeamCopy;
  t: Translate;
  onShowEmptyChange: (value: boolean) => void;
  onToggleCollapsed: (key: string) => void;
  onUpdateMember: TeamWorkspaceProps["onUpdateMember"];
  onRemoveMember: TeamWorkspaceProps["onRemoveMember"];
  roleOptions: ReactNode;
  compact?: boolean;
}) {
  return (
    <section id="team-member-roster" className="scroll-mt-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">{compact ? copy.memberControls : copy.roster}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{copy.memberControlsDescription}</p>
        </div>
        <label className="inline-flex items-center gap-2 rounded-lg border border-blue-300/10 bg-[#0b1424] px-2.5 py-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={(event) => onShowEmptyChange(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-blue-300/25 bg-[#07101e] text-blue-500 focus:ring-blue-400/30"
          />
          {t("team.showEmptyGroups")}
        </label>
      </div>
      <div className="space-y-2.5">
        {cards.map((card) => {
          const isCollapsed = collapsed.has(card.key) && card.members.length > 0;
          return (
            <section key={card.key} className="overflow-hidden rounded-xl border border-blue-300/12 bg-[#0b1424]/85">
              <button
                type="button"
                onClick={() => onToggleCollapsed(card.key)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition hover:bg-white/[0.04]"
              >
                {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                <span
                  className={cn("h-2.5 w-2.5 rounded-full", colorDotClass(card.color))}
                  style={{ backgroundColor: `rgb(${departmentColorTone(card.color).rgb})` }}
                />
                <span className="text-sm font-semibold text-slate-100">{card.name}</span>
                <span className="text-xs text-slate-500">{card.members.length} {copy.people.toLocaleLowerCase()}</span>
              </button>
              {!isCollapsed && (
                card.members.length > 0 ? (
                  <ul className="divide-y divide-blue-300/10 border-t border-blue-300/10">
                    {card.members.map((member) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        departments={departments}
                        isAdmin={isAdmin}
                        t={t}
                        onUpdateMember={onUpdateMember}
                        onRemoveMember={onRemoveMember}
                        roleOptions={roleOptions}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="border-t border-blue-300/10 px-3.5 py-4 text-xs text-slate-500">{copy.noMembers}</p>
                )
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function MemberRow({
  member,
  departments,
  isAdmin,
  t,
  onUpdateMember,
  onRemoveMember,
  roleOptions,
}: {
  member: TeamMember;
  departments: Department[];
  isAdmin: boolean;
  t: Translate;
  onUpdateMember: TeamWorkspaceProps["onUpdateMember"];
  onRemoveMember: TeamWorkspaceProps["onRemoveMember"];
  roleOptions: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center">
      <Avatar user={member} className="h-9 w-9 text-xs" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-100">{member.name}</p>
        <p className="truncate text-xs text-slate-500">{member.email}</p>
      </div>
      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t("team.roleFor", { name: member.name })}
            value={member.workspace_role ?? member.role}
            onChange={(event) => onUpdateMember(member.id, { role: event.target.value as "owner" | "admin" | "member" | "guest" })}
            className="h-8 rounded-lg border border-blue-300/15 bg-[#08111f] px-2 text-xs text-slate-200 outline-none focus:border-blue-400/55"
          >
            {roleOptions}
          </select>
          <select
            aria-label={t("team.statusFor", { name: member.name })}
            value={member.workspace_status ?? "active"}
            onChange={(event) => onUpdateMember(member.id, { status: event.target.value as "active" | "inactive" })}
            className="h-8 rounded-lg border border-blue-300/15 bg-[#08111f] px-2 text-xs text-slate-200 outline-none focus:border-blue-400/55"
          >
            <option value="active">{t("common.active")}</option>
            <option value="inactive">{t("common.inactive")}</option>
          </select>
          <select
            aria-label={t("team.departmentFor", { name: member.name })}
            value={member.department_id ?? ""}
            onChange={(event) => onUpdateMember(member.id, { department_id: event.target.value || null })}
            className="h-8 max-w-[170px] rounded-lg border border-blue-300/15 bg-[#08111f] px-2 text-xs text-slate-200 outline-none focus:border-blue-400/55"
          >
            <option value="">{t("common.unassigned")}</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
          <button type="button" onClick={() => onRemoveMember(member)} aria-label={t("team.removeMember", { name: member.name })} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-slate-400">{roleLabel(member, t)}</span>
      )}
    </li>
  );
}

function InsightsCard({ cards, totalTasks, copy }: { cards: TeamCardData[]; totalTasks: number; copy: TeamCopy }) {
  const topCards = [...cards]
    .filter((card) => card.members.length > 0)
    .sort((left, right) => {
      const leftTasks = left.members.reduce((sum, member) => sum + member._count.tasks, 0);
      const rightTasks = right.members.reduce((sum, member) => sum + member._count.tasks, 0);
      return rightTasks - leftTasks;
    })
    .slice(0, 5);
  return (
    <section className="command-section-panel rounded-2xl border border-blue-300/12 bg-[#0b1424]/95 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_42px_rgba(0,0,0,0.2)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{copy.workload}</h2>
          <p className="mt-1 text-[11px] text-slate-500">{copy.workloadSubtitle}</p>
        </div>
        <MoreHorizontal className="h-4 w-4 text-slate-400" />
      </div>
      <div className="mt-4 space-y-3">
        {topCards.length === 0 ? (
          <p className="text-xs text-slate-500">{copy.noWorkload}</p>
        ) : topCards.map((card) => {
          const amount = card.members.reduce((sum, member) => sum + member._count.tasks, 0);
          const percentage = totalTasks > 0 ? Math.max(4, Math.round((amount / totalTasks) * 100)) : 0;
          const tone = departmentColorTone(card.color);
          return (
            <div key={card.key}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px]">
                <span className="flex min-w-0 items-center gap-1.5 text-slate-400"><span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} style={{ backgroundColor: `rgb(${tone.rgb})` }} /> <span className="truncate">{card.name}</span></span>
                <span className="font-medium text-slate-300">{percentage}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${percentage}%`, backgroundColor: `rgb(${tone.rgb})` }} />
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="mt-4 w-full text-center text-[11px] font-medium text-blue-300 transition hover:text-blue-100">
        {copy.viewReport}
      </button>
    </section>
  );
}

function PendingInvitesCard({
  invites,
  resending,
  cancelingInvite,
  copy,
  onResend,
  onCancel,
}: {
  invites: PendingInvite[];
  resending: string | null;
  cancelingInvite: string | null;
  copy: TeamCopy;
  onResend: (invite: PendingInvite) => void;
  onCancel: (invite: PendingInvite) => void;
}) {
  return (
    <section className="rounded-2xl border border-blue-300/12 bg-[#0b1424]/95 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_42px_rgba(0,0,0,0.2)]">
      <h2 className="text-sm font-semibold text-white">{copy.pendingInvites}</h2>
      <p className="mt-1 text-[11px] text-slate-500">{invites.length} {copy.awaitingAcceptance.toLocaleLowerCase()}</p>
      <ul className="mt-3 space-y-3">
        {invites.slice(0, 3).map((invite) => (
          <li key={invite.id} data-testid="pending-invite" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/80 to-orange-600/80 text-[10px] font-bold text-white">{invite.email.charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-slate-200">{invite.email}</span>
              <span className="mt-0.5 block truncate text-[10px] text-slate-500">{invite.workspace?.name ?? invite.role}</span>
            </span>
            <button type="button" onClick={() => onResend(invite)} disabled={resending === invite.id} className="h-7 rounded-lg border border-blue-300/15 px-2 text-[10px] font-semibold text-slate-300 transition hover:border-blue-300/30 hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-60">
              {resending === invite.id ? "…" : copy.resend}
            </button>
            <button type="button" onClick={() => onCancel(invite)} disabled={cancelingInvite === invite.id} aria-label={copy.cancel} className="flex h-7 w-6 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-60">
              <XCircle className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {invites.length > 3 && <button type="button" className="mt-4 w-full text-center text-[11px] font-medium text-blue-300 transition hover:text-blue-100">{copy.viewAll}</button>}
    </section>
  );
}

function ActivityCard({ activity, cards, copy, language }: { activity: TeamMember[]; cards: TeamCardData[]; copy: TeamCopy; language: "en" | "pt-BR" }) {
  const departmentById = new Map(cards.filter((card) => card.id).map((card) => [card.id, card.name]));
  return (
    <section className="rounded-2xl border border-blue-300/12 bg-[#0b1424]/95 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_42px_rgba(0,0,0,0.2)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">{copy.recentActivity}</h2>
        <button type="button" className="text-[10px] font-medium text-blue-300 transition hover:text-blue-100">{copy.viewAll}</button>
      </div>
      <div className="mt-3 space-y-3">
        {activity.length === 0 ? (
          <p className="text-xs text-slate-500">{copy.noActivity}</p>
        ) : activity.map((member) => {
          const department = member.department_id ? departmentById.get(member.department_id) : undefined;
          return (
            <div key={member.id} className="flex items-start gap-2.5">
              <Avatar user={member} className="h-8 w-8" />
              <p className="min-w-0 pt-0.5 text-[11px] leading-4 text-slate-400">
                <span className="font-semibold text-slate-200">{member.name}</span> {copy.addedTo} {department ? <span className="font-medium text-slate-300">{department}</span> : copy.team}
                <span className="mt-0.5 block text-[10px] text-slate-600">{new Intl.DateTimeFormat(language, { day: "2-digit", month: "short" }).format(new Date(member.created_at))}</span>
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
