import type {
  ActivityEvent,
  CalendarEvent,
  Folder,
  Project,
  Space,
  Task,
  TeamMember,
  TimeEntry,
} from "@/lib/types";
import type { DepartmentSpacePreset } from "@/lib/department-spaces";

export type ContainerList = Pick<Project, "id" | "name">;
export type SpaceTab = "dashboard" | "browse" | "docs";

export interface SpaceContainerData {
  space: Space;
  folders: Folder[];
  projects: ContainerList[];
}

export interface SpaceCommandCenterPayload {
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
  quick_create: { items: string[] };
}

export interface SpaceDashboardData {
  space: Space;
  department_preset: DepartmentSpacePreset | null;
  access: {
    can_operate_space: boolean;
    is_department_member: boolean;
    viewer_department_name: string | null;
  };
  tasks: { items: Task[]; nextCursor?: string | null };
  projects: { items: Project[] };
  users: { items: TeamMember[] };
  calendar_events: { items: CalendarEvent[] };
  activity: { items: ActivityEvent[] };
  time: {
    running: TimeEntry | null;
    week_entries: TimeEntry[];
  };
  command_center: SpaceCommandCenterPayload;
}
