import type {
  ActivityEvent,
  CalendarEvent,
  Company,
  Project,
  Task,
  TeamMember,
  TimeEntry,
} from "@/lib/types";

export type ActionFilter = "all" | "completed" | "in_progress";
export type TaskDrawerStatus = "todo" | "in_progress" | "done";
export type CommandDrawer =
  | "urgent_actions"
  | "team_workload"
  | "time_today"
  | "meetings_today"
  | "recent_activity"
  | "projects_at_risk"
  | "client_risk"
  | "client_health"
  | "delivery_overview"
  | "creative_queue"
  | "department_workload"
  | "agency_risk_signals"
  | "revenue_snapshot"
  | "quick_create";

export interface CommandCenterPayload {
  financials_visible?: boolean;
  urgent_actions: { items: Task[]; count: number };
  team_workload: {
    items: Array<{
      user: TeamMember;
      open_tasks: number;
      overdue_tasks: number;
      due_today_tasks: number;
      tracked_seconds_today: number;
      tasks: Task[];
      state: "late" | "overloaded" | "idle" | "active";
    }>;
    count: number;
  };
  time_today: {
    total_seconds: number;
    running: TimeEntry | null;
    entries: TimeEntry[];
  };
  meetings_today: { items: CalendarEvent[]; count: number };
  recent_activity: { items: ActivityEvent[]; count: number };
  projects_at_risk: {
    items: Array<{ project: Project; reasons: string[] }>;
    count: number;
    rules: string[];
  };
  client_risk: {
    items: Array<{
      company: Pick<
        Company,
        | "id"
        | "name"
        | "commercial_status"
        | "status"
        | "contract_value"
        | "commission"
      >;
      reasons: string[];
      open_tasks: number;
      overdue_tasks: number;
    }>;
    count: number;
  };
  client_health?: {
    counts: {
      healthy: number;
      attention_needed: number;
      at_risk: number;
      not_enough_data: number;
    };
    items: Array<{
      company: Pick<
        Company,
        | "id"
        | "name"
        | "commercial_status"
        | "status"
        | "contract_value"
        | "commission"
        | "plan_name"
        | "service_type"
      > & {
        owner?: { id: string; name: string; email: string } | null;
      };
      health_status:
        | "healthy"
        | "attention_needed"
        | "at_risk"
        | "not_enough_data";
      reasons: string[];
      open_tasks: number;
      overdue_tasks: number;
      active_projects: number;
      contact_count: number;
      next_deadline: string | null;
      last_activity_at: string | null;
    }>;
  };
  delivery_overview?: {
    items: Array<{
      project: Pick<Project, "id" | "name" | "status" | "due_date"> & {
        owner?: { id: string; name: string; email: string } | null;
        company?: { id: string; name: string } | null;
        space?: { id: string; name: string; icon: string | null } | null;
      };
      progress: number;
      open_tasks: number;
      overdue_tasks: number;
      next_deadline: string | null;
      state: "on_track" | "attention_needed" | "at_risk" | "not_enough_data";
    }>;
  };
  creative_queue?: {
    source_note: string;
    counts: {
      waiting_for_briefing: number;
      ready_to_start: number;
      in_production: number;
      waiting_for_approval: number;
      revision_requested: number;
    };
    items: Array<{
      task: Task;
      stage:
        | "waiting_for_briefing"
        | "ready_to_start"
        | "in_production"
        | "waiting_for_approval"
        | "revision_requested";
    }>;
  };
  department_workload?: {
    items: Array<{
      department: { id: string; name: string; color: string };
      active_tasks: number;
      overdue_tasks: number;
      upcoming_tasks: number;
      assigned_members: number;
    }>;
  };
  agency_risk_signals?: {
    items: Array<{
      key: string;
      label: string;
      count: number;
      trace: string;
      trace_values?: {
        member_name?: string;
        member_open_tasks?: number;
        total_open_tasks?: number;
      };
    }>;
  };
  revenue_snapshot: {
    active_clients: number;
    total_contract_value: number;
    total_commission: number;
    clients_without_contract_value: number;
    top_clients: Array<
      Pick<Company, "id" | "name" | "contract_value" | "commission">
    >;
  };
  quick_create: { items: string[] };
  workspace_setup?: {
    spaces: number;
    projects: number;
    clients: number;
    members: number;
    role: "owner" | "admin" | "member" | "guest" | null;
  };
}

export interface DashboardResponse {
  tasks: { items: Task[] };
  projects: { items: Project[] };
  users: { items: TeamMember[] };
  calendar_events?: { items: CalendarEvent[] };
  activity?: { items: ActivityEvent[] };
  time?: {
    running: TimeEntry | null;
    week_entries: TimeEntry[];
  };
  command_center?: CommandCenterPayload;
}
