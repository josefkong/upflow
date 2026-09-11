// Department color palette. Keep in sync with the VALID_COLORS set on the
// API side (src/app/api/workspaces/[id]/departments/route.ts).

export const DEPARTMENT_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "violet",
  "pink",
] as const;

export type DepartmentColor = (typeof DEPARTMENT_COLORS)[number];

// Server-side validation also imports this. Keep the palette as a single
// source of truth so the client picker and the API stay in sync.
export const DEPARTMENT_COLOR_SET: ReadonlySet<string> = new Set(
  DEPARTMENT_COLORS,
);

export function isValidDepartmentColor(c: unknown): c is DepartmentColor {
  return typeof c === "string" && DEPARTMENT_COLOR_SET.has(c);
}

// Tailwind classes for the small color dot rendered next to each group
// header. Mapped explicitly so Tailwind's JIT picks them up at build time.
const DOT_CLASS: Record<string, string> = {
  slate: "bg-slate-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
};

export function colorDotClass(color: string | null | undefined): string {
  if (!color) return DOT_CLASS.slate;
  return DOT_CLASS[color] ?? DOT_CLASS.slate;
}

export type DepartmentColorSource = {
  id: string;
  name?: string | null;
  color?: string | null;
  sort_order?: number | null;
};

// The persisted color remains the preferred choice, but older workspaces may
// contain duplicate department colors. Resolve those collisions in a stable
// order so Calendar, Team, and any other departmental view use the same visual
// identity without mutating workspace data behind an administrator's back.
const DISTINCT_COLOR_ORDER: readonly DepartmentColor[] = [
  "blue",
  "violet",
  "amber",
  "green",
  "pink",
  "teal",
  "orange",
  "indigo",
  "red",
  "slate",
];

function normalizedDepartmentName(name: string | null | undefined) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();
}

// Canonical UP Flow palette. These names are the visual source of truth shown
// in the Calendar legend and must remain identical in Team department cards.
export function departmentColorForName(
  name: string | null | undefined,
): DepartmentColor | null {
  const normalized = normalizedDepartmentName(name);
  if (normalized === "finance" || normalized === "financeiro") return "blue";
  if (normalized === "comercial" || normalized === "commercial") return "violet";
  if (normalized === "ceo" || normalized.includes("chief executive")) return "amber";
  if (normalized.includes("marketing b2b")) return "green";
  if (normalized.includes("marketing b2c")) return "teal";
  if (normalized.includes("suporte") || normalized.includes("support")) return "pink";
  if (normalized.includes("general admin") || normalized.includes("administracao geral")) return "orange";
  if (normalized.includes("creative") || normalized.includes("criativ") || normalized.includes("design")) return "indigo";
  return null;
}

export function resolveUniqueDepartmentColors(
  departments: readonly DepartmentColorSource[],
): Map<string, DepartmentColor> {
  const ordered = [...departments].sort((left, right) => {
    const sortOrder = (left.sort_order ?? Number.MAX_SAFE_INTEGER)
      - (right.sort_order ?? Number.MAX_SAFE_INTEGER);
    if (sortOrder !== 0) return sortOrder;
    const nameOrder = (left.name ?? "").localeCompare(right.name ?? "");
    if (nameOrder !== 0) return nameOrder;
    return left.id.localeCompare(right.id);
  });
  const resolved = new Map<string, DepartmentColor>();
  const used = new Set<DepartmentColor>();

  // Reserve the canonical colors first so an unrecognised department cannot
  // claim (for example) Finance's blue before Finance is processed.
  ordered.forEach((department) => {
    const canonical = departmentColorForName(department.name);
    if (!canonical) return;
    resolved.set(department.id, canonical);
    used.add(canonical);
  });

  ordered.forEach((department, index) => {
    if (resolved.has(department.id)) return;
    const preferred = isValidDepartmentColor(department.color)
      ? department.color
      : null;
    const fallback = DISTINCT_COLOR_ORDER.find((color) => !used.has(color))
      ?? DISTINCT_COLOR_ORDER[index % DISTINCT_COLOR_ORDER.length];
    const color = preferred && !used.has(preferred) ? preferred : fallback;
    resolved.set(department.id, color);
    used.add(color);
  });

  return resolved;
}

export type DepartmentColorTone = {
  rgb: string;
  dot: string;
  event: string;
  icon: string;
  badge: string;
  bar: string;
  cardBorder: string;
};

// Explicit classes keep Tailwind generation reliable and give every surface a
// shared color vocabulary. Department cards need enough saturation to remain
// identifiable at a glance against the UP Flow dark glass treatment.
const COLOR_TONE: Record<DepartmentColor, DepartmentColorTone> = {
  slate: {
    rgb: "148 163 184",
    dot: "bg-slate-400",
    event: "bg-slate-400/20 text-slate-700 border-l-slate-400 dark:text-slate-100",
    icon: "border-slate-400/50 bg-slate-500/25 text-slate-200 shadow-[0_0_22px_rgba(148,163,184,0.24)]",
    badge: "border-slate-400/40 bg-slate-500/15 text-slate-200",
    bar: "bg-slate-400",
    cardBorder: "border-slate-400/35 border-l-2 border-l-slate-400/80",
  },
  red: {
    rgb: "239 68 68",
    dot: "bg-red-500",
    event: "bg-red-500/20 text-red-700 border-l-red-500 dark:text-red-100",
    icon: "border-red-400/50 bg-red-500/25 text-red-300 shadow-[0_0_22px_rgba(239,68,68,0.3)]",
    badge: "border-red-400/40 bg-red-500/15 text-red-300",
    bar: "bg-red-500",
    cardBorder: "border-red-400/35 border-l-2 border-l-red-400/80",
  },
  orange: {
    rgb: "249 115 22",
    dot: "bg-orange-500",
    event: "bg-orange-500/20 text-orange-700 border-l-orange-500 dark:text-orange-100",
    icon: "border-orange-400/50 bg-orange-500/25 text-orange-300 shadow-[0_0_22px_rgba(249,115,22,0.3)]",
    badge: "border-orange-400/40 bg-orange-500/15 text-orange-300",
    bar: "bg-orange-500",
    cardBorder: "border-orange-400/35 border-l-2 border-l-orange-400/80",
  },
  amber: {
    rgb: "245 158 11",
    dot: "bg-amber-500",
    event: "bg-amber-500/20 text-amber-700 border-l-amber-500 dark:text-amber-100",
    icon: "border-amber-400/50 bg-amber-500/25 text-amber-300 shadow-[0_0_22px_rgba(245,158,11,0.3)]",
    badge: "border-amber-400/40 bg-amber-500/15 text-amber-300",
    bar: "bg-amber-500",
    cardBorder: "border-amber-400/35 border-l-2 border-l-amber-400/80",
  },
  green: {
    rgb: "34 197 94",
    dot: "bg-green-500",
    event: "bg-green-500/20 text-green-700 border-l-green-500 dark:text-green-100",
    icon: "border-green-400/50 bg-green-500/25 text-green-300 shadow-[0_0_22px_rgba(34,197,94,0.3)]",
    badge: "border-green-400/40 bg-green-500/15 text-green-300",
    bar: "bg-green-500",
    cardBorder: "border-green-400/35 border-l-2 border-l-green-400/80",
  },
  teal: {
    rgb: "20 184 166",
    dot: "bg-teal-500",
    event: "bg-teal-500/20 text-teal-700 border-l-teal-500 dark:text-teal-100",
    icon: "border-teal-400/50 bg-teal-500/25 text-teal-300 shadow-[0_0_22px_rgba(20,184,166,0.3)]",
    badge: "border-teal-400/40 bg-teal-500/15 text-teal-300",
    bar: "bg-teal-500",
    cardBorder: "border-teal-400/35 border-l-2 border-l-teal-400/80",
  },
  blue: {
    rgb: "59 130 246",
    dot: "bg-blue-500",
    event: "bg-blue-500/20 text-blue-700 border-l-blue-500 dark:text-blue-100",
    icon: "border-blue-400/50 bg-blue-500/25 text-blue-300 shadow-[0_0_22px_rgba(59,130,246,0.3)]",
    badge: "border-blue-400/40 bg-blue-500/15 text-blue-300",
    bar: "bg-blue-500",
    cardBorder: "border-blue-400/35 border-l-2 border-l-blue-400/80",
  },
  indigo: {
    rgb: "99 102 241",
    dot: "bg-indigo-500",
    event: "bg-indigo-500/20 text-indigo-700 border-l-indigo-500 dark:text-indigo-100",
    icon: "border-indigo-400/50 bg-indigo-500/25 text-indigo-300 shadow-[0_0_22px_rgba(99,102,241,0.3)]",
    badge: "border-indigo-400/40 bg-indigo-500/15 text-indigo-300",
    bar: "bg-indigo-500",
    cardBorder: "border-indigo-400/35 border-l-2 border-l-indigo-400/80",
  },
  violet: {
    rgb: "139 92 246",
    dot: "bg-violet-500",
    event: "bg-violet-500/20 text-violet-700 border-l-violet-500 dark:text-violet-100",
    icon: "border-violet-400/50 bg-violet-500/25 text-violet-300 shadow-[0_0_22px_rgba(139,92,246,0.3)]",
    badge: "border-violet-400/40 bg-violet-500/15 text-violet-300",
    bar: "bg-violet-500",
    cardBorder: "border-violet-400/35 border-l-2 border-l-violet-400/80",
  },
  pink: {
    rgb: "236 72 153",
    dot: "bg-pink-500",
    event: "bg-pink-500/20 text-pink-700 border-l-pink-500 dark:text-pink-100",
    icon: "border-pink-400/50 bg-pink-500/25 text-pink-300 shadow-[0_0_22px_rgba(236,72,153,0.3)]",
    badge: "border-pink-400/40 bg-pink-500/15 text-pink-300",
    bar: "bg-pink-500",
    cardBorder: "border-pink-400/35 border-l-2 border-l-pink-400/80",
  },
};

export function departmentColorTone(
  color: string | null | undefined,
): DepartmentColorTone {
  return COLOR_TONE[isValidDepartmentColor(color) ? color : "slate"];
}
