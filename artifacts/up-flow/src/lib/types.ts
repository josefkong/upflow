export interface AppUser {
  id: string;
  name: string | null;
  email: string | null;
  image?: string | null;
  role: "admin" | "member";
  currentWorkspaceId?: string;
  currentRole?: "owner" | "admin" | "member" | "guest" | null;
  currentDepartmentName?: string | null;
  isSuperAdmin?: boolean;
}

export interface ProjectOwner {
  id: string;
  name: string;
  email: string;
}

export type ProjectKind =
  | "client"
  | "internal"
  | "operational_queue"
  | "onboarding";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  kind?: ProjectKind;
  workspace_id: string;
  owner_id: string;
  space_id?: string | null;
  folder_id?: string | null;
  company_id?: string | null;
  onboarding_enabled?: boolean;
  sidebar_hidden?: boolean;
  closing_date?: string | null;
  onboarding_start_date?: string | null;
  responsible_salesperson_id?: string | null;
  initial_notes?: string | null;
  due_date: string | null;
  position?: number;
  created_at: string;
  owner: ProjectOwner;
  space?: { id: string; name: string; icon: string | null } | null;
  folder?: { id: string; name: string; icon: string | null } | null;
  company?: {
    id: string;
    name: string;
    contract_value: number | null;
    commission: number | null;
    plan_name: string | null;
    service_type: string | null;
  } | null;
  _count: { tasks: number };
  pending_todo_count?: number;
  flow_task_count?: number;
  capabilities?: {
    canContribute: boolean;
    canManageMembers: boolean;
  };
}

export interface Space {
  id: string;
  name: string;
  icon: string | null;
  workspace_id: string;
  owner_id: string;
  position: number;
  created_at: string;
  workspace?: { id: string; name: string } | null;
  _count?: { projects: number };
  pending_todo_count?: number;
  flow_task_count?: number;
}

export interface Folder {
  id: string;
  name: string;
  icon: string | null;
  space_id: string;
  owner_id: string;
  parent_id?: string | null;
  position: number;
  sidebar_hidden?: boolean;
  created_at: string;
  _count?: { projects: number };
  children?: Folder[];
}

export interface TaskAssignee {
  id: string;
  name: string;
  email: string;
  department_id?: string | null;
  department_name?: string | null;
}

export interface TaskFollower {
  id: string;
  task_id: string;
  user_id: string;
  created_at: string;
  user: TaskAssignee;
}

export interface TaskProject {
  id: string;
  name: string;
  workspace_id?: string;
  space?: { id: string; name: string } | null;
}

export interface Subtask {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  assignee: TaskAssignee | null;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  project_id: string;
  assignee_id: string | null;
  parent_id: string | null;
  company_id?: string | null;
  social_media_plan_id?: string | null;
  cover_image_url?: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
  assignee: TaskAssignee | null;
  followers?: TaskFollower[];
  project: TaskProject | null;
  subtasks?: Subtask[];
  onboarding_link?: TaskOnboardingLink | null;
  marketing_b2b_onboarding_form?: MarketingB2BOnboardingFormSummary | null;
  marketing_b2c_onboarding_form?: MarketingB2COnboardingFormSummary | null;
  commercial_lead?: CommercialLead | null;
  commercial_follow_up?: CommercialLead | null;
  commercial_contract_handoff?: CommercialLead | null;
  commercial_finance_contract?: CommercialLead | null;
  custom_field_values?: TaskCustomFieldValue[];
  _count?: { comments: number; subtasks: number };
}

export interface CommercialLead {
  id: string;
  task_id: string;
  brand_name: string;
  owner_name: string;
  owner_email: string;
  instagram: string;
  monthly_revenue: string | number;
  whatsapp: string;
  notes: string;
  presentation_starts_at: string | null;
  presentation_ends_at: string | null;
  presentation_event_id: string | null;
  assignee_id: string;
  company_type: "B2B" | "B2C" | "Ambos";
  observations: string | null;
  stage: string;
  presentation_confirmation_requested_at: string | null;
  presentation_confirmed_at: string | null;
  qualified_at: string | null;
  archived_at: string | null;
  archive_reason: "not_qualified" | "not_closed" | null;
  group_up_plan: "starter" | "growth" | "none" | null;
  group_up_monthly_fee: string | number | null;
  up_zero_plan: "essential" | "elite" | "pro" | "none" | null;
  up_zero_monthly_fee: string | number | null;
  up_zero_implementation_fee: string | number | null;
  negotiated_scope: string[] | null;
  negotiation_checklist_completed_at: string | null;
  proposal_file_name: string | null;
  proposal_uploaded_at: string | null;
  next_follow_up_at: string | null;
  follow_up_count: number;
  follow_up_task_id: string | null;
  follow_up_task?: {
    id: string;
    project_id: string;
    created_at?: string;
  } | null;
  follow_up_checkpoints?: Array<{
    id: string;
    stage: "first_contact" | "second_contact" | "final_contact";
    completed_at: string;
    completed_by: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
  follow_up_stage:
    | "first_contact"
    | "second_contact"
    | "final_contact"
    | "awaiting_decision"
    | "completed"
    | "withdrawn"
    | null;
  follow_up_notification_sent_at: string | null;
  contract_handoff_task_id: string | null;
  contract_handoff_task?: {
    id: string;
    project_id: string;
    status: string;
    project: { id: string; name: string };
  } | null;
  finance_contract_task_id: string | null;
  finance_contract_task?: {
    id: string;
    project_id: string;
    status: string;
    assignee: { id: string; name: string; email: string } | null;
    project: { id: string; name: string };
  } | null;
  contract_cnpj: string | null;
  contract_legal_name: string | null;
  contract_plan: string | null;
  contract_services: string[] | null;
  contract_monthly_fee: string | number | null;
  contract_confirmed_at: string | null;
  can_advance_contract?: boolean;
  presentation_integration: {
    event_id: string;
    status:
      | "not_configured"
      | "not_connected"
      | "pending"
      | "syncing"
      | "failed"
      | "ready";
    starts_at: string;
    ends_at: string | null;
    meeting_url: string | null;
    google_event_url: string | null;
    calendar_label: string | null;
    participants: Array<{
      id: string;
      name: string;
      email: string;
      kind: "lead" | "team";
    }>;
    last_synced_at: string | null;
    last_error: string | null;
  } | null;
}

export type TaskOnboardingFormKind =
  | "marketing_b2b"
  | "marketing_b2c"
  | "finance"
  | "support";

export type TaskOnboardingAction =
  | {
      kind: "form";
      form_kind: TaskOnboardingFormKind;
      label: string;
    }
  | {
      kind: "calendar";
      label: string;
    };

export interface MarketingB2BOnboardingFormSummary {
  id: string;
  status: string;
  completed_at: string | null;
  updated_at?: string | null;
  values?: Record<string, string> | null;
  task_id?: string;
  checklist_item_id?: string;
  task?: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    project_id?: string | null;
    assignee?: { id: string; name: string; email: string } | null;
  } | null;
}

export interface MarketingB2COnboardingFormSummary {
  id: string;
  status: string;
  completed_at: string | null;
  updated_at?: string | null;
  values?: Record<string, string> | null;
  task_id?: string;
  checklist_item_id?: string;
  task?: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    project_id?: string | null;
    assignee?: { id: string; name: string; email: string } | null;
  } | null;
}

export interface TaskOnboardingLink {
  id: string;
  onboarding_id: string;
  company_id: string;
  company_name: string;
  department: string;
  title: string;
  automation_key: string | null;
  status: string;
  progress: number;
  href: string;
  action?: TaskOnboardingAction | null;
  scheduling?: Array<{
    id: string;
    title: string;
    scheduled: boolean;
    scheduled_at: string | null;
  }>;
}

export type CustomFieldType =
  | "text"
  | "number"
  | "dropdown"
  | "date"
  | "checkbox"
  | "people";

export interface CustomFieldDefinition {
  id: string;
  project_id: string;
  name: string;
  type: CustomFieldType;
  options: string[] | null;
  position: number;
  created_at: string;
}

export interface TaskCustomFieldValue {
  definition_id: string;
  value: unknown;
}

export interface CommentAuthor {
  id: string;
  name: string;
  email?: string;
}

export interface Comment {
  id: string;
  body: string;
  task_id: string;
  author_id: string;
  parent_id: string | null;
  created_at: string;
  author: CommentAuthor;
  replies?: Comment[];
}

export interface Doc {
  id: string;
  title: string;
  content: unknown;
  project_id: string;
  author_id: string;
  updated_at: string;
  project: { id: string; name: string } | null;
  author: { id: string; name: string };
}

// List views never need the potentially large Tiptap document payload. Keep
// the full Doc type for editors and use this compact shape for indexes.
export type DocSummary = Omit<Doc, "content">;

export interface NotificationTask {
  id: string;
  title: string;
  project: { id: string; name: string } | null;
}

export interface NotificationWorkspace {
  id: string;
  name: string;
  slug: string;
}

export interface MemberJoinedData {
  new_member_id?: string;
  new_member_email?: string;
  new_member_name?: string;
  role?: "admin" | "member" | "guest";
}

export interface StatusChangedData {
  old_status?: "todo" | "in_progress" | "done";
  new_status?: "todo" | "in_progress" | "done";
  task_title?: string;
  actor_id?: string;
  actor_name?: string;
}

export interface MentionedData {
  comment_id?: string;
  comment_excerpt?: string;
  actor_id?: string;
  actor_name?: string;
  task_title?: string;
}

export interface DueSoonData {
  due_date?: string;
  task_title?: string;
}

export type NotificationKind =
  | "assigned"
  | "commented"
  | "due_soon"
  | "member_joined"
  | "status_changed"
  | "mentioned";

export interface Notification {
  id: string;
  type: NotificationKind;
  read: boolean;
  created_at: string;
  task: NotificationTask | null;
  workspace: NotificationWorkspace | null;
  /** Type-specific payload. */
  data:
    | MemberJoinedData
    | StatusChangedData
    | MentionedData
    | DueSoonData
    | Record<string, unknown>
    | null;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member" | "guest";
  avatar_url: string | null;
  created_at: string;
  workspace_role?: "owner" | "admin" | "member" | "guest" | null;
  workspace_status?: "active" | "inactive" | null;
  department_id?: string | null;
  _count: { tasks: number; projects: number };
}

export interface Department {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  leader_id?: string | null;
  leader?: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  } | null;
  created_at: string;
  _count: { members: number };
}

export type CalendarEventType =
  | "meeting"
  | "client_call"
  | "internal_meeting"
  | "task"
  | "reminder"
  | "deadline";

export type CalendarEventPriority = "low" | "medium" | "high";
export type CalendarEventStatus = "scheduled" | "cancelled";

export interface CalendarEventAttendee {
  id: string;
  user_id: string;
  created_at?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string | null;
  };
}

export interface CalendarEventReminder {
  id: string;
  event_id: string;
  minutes_before: number;
  enabled: boolean;
  created_at: string;
}

export interface CalendarEventAttachment {
  id: string;
  event_id: string;
  kind: "file" | "link" | "document";
  name: string;
  url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  document_id: string | null;
  created_by: string | null;
  created_at: string;
  document?: { id: string; title: string; project_id: string } | null;
  download_url?: string | null;
}

export interface CalendarEvent {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  type: CalendarEventType;
  status: CalendarEventStatus;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  created_by: string;
  project_id: string | null;
  task_id: string | null;
  company_id: string | null;
  space_id: string | null;
  responsible_user_id: string | null;
  priority: CalendarEventPriority;
  cancelled_at: string | null;
  cancelled_by: string | null;
  location: string | null;
  meeting_url: string | null;
  google_meet_requested?: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
  creator?: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string | null;
  } | null;
  project?: { id: string; name: string } | null;
  task?: {
    id: string;
    title: string;
    assignee?: { id: string; name: string; email: string } | null;
    followers?: Array<{
      user: { id: string; name: string; email: string };
    }>;
  } | null;
  company?: { id: string; name: string } | null;
  space?: { id: string; name: string; icon?: string | null } | null;
  responsible?: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string | null;
  } | null;
  commercial_lead_presentation?: {
    id: string;
    brand_name: string;
    owner_name: string;
    owner_email: string;
    instagram: string;
    monthly_revenue: string | number;
    whatsapp: string;
    company_type: string;
    observations: string | null;
    assignee: { id: string; name: string; email: string };
  } | null;
  cancelled_by_user?: { id: string; name: string; email: string } | null;
  attendees?: CalendarEventAttendee[];
  reminders?: CalendarEventReminder[];
  attachments?: CalendarEventAttachment[];
}

export interface TimeEntry {
  id: string;
  workspace_id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  company_id?: string | null;
  description: string | null;
  started_at: string;
  active_started_at: string | null;
  paused_at: string | null;
  stopped_at: string | null;
  duration_seconds: number;
  status: "running" | "paused" | "stopped";
  created_at: string;
  updated_at: string;
  project?: { id: string; name: string } | null;
  task?: { id: string; title: string } | null;
}

export interface ActivityEvent {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  type: string;
  entity_type: string;
  entity_id: string | null;
  project_id: string | null;
  task_id: string | null;
  company_id?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor?: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string | null;
  } | null;
  company?: { id: string; name: string } | null;
}

export interface CompanyContact {
  id: string;
  workspace_id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyNote {
  id: string;
  workspace_id: string;
  company_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: { id: string; name: string; email: string } | null;
}

export type SalesChannel = "WHOLESALE" | "RETAIL" | "BOTH";

export interface ClientCreativeWorkItem {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  stage: string;
  priority: "low" | "medium" | "high";
  kind: "video" | "static" | "creative";
  formats: string | null;
  requester: string | null;
  due_date: string | null;
  created_at: string;
  last_updated_at: string;
  assignee: { id: string; name: string; email: string } | null;
  project: {
    id: string;
    name: string;
    space: { id: string; name: string } | null;
  };
}

export interface ClientCreativeWork {
  items: ClientCreativeWorkItem[];
  summary: {
    total: number;
    open: number;
    in_progress: number;
    completed: number;
    overdue: number;
  };
}

export interface Company {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  website: string | null;
  status: string;
  commercial_status: string | null;
  contract_value: number | null;
  commission: number | null;
  industry: string | null;
  sales_channel: SalesChannel | null;
  service_type: string | null;
  plan_name: string | null;
  billing_cycle: string | null;
  included_services: string[] | null;
  plan_notes: string | null;
  notes: string | null;
  legal_name: string | null;
  cnpj: string | null;
  billing_email: string | null;
  main_contact_email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  billing_notes: string | null;
  payment_terms: string | null;
  contract_start_date: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  owner?: { id: string; name: string; email: string } | null;
  summary?: {
    project_count: number;
    active_project_count?: number;
    open_task_count: number;
    overdue_task_count: number;
    meeting_count: number;
    contact_count: number;
    tracked_seconds: number;
    risk_reasons: string[];
    health_status?: "healthy" | "attention" | "risk" | "not_enough_data";
    profitability_ratio: number | null;
    contract_value_per_tracked_hour: number | null;
    commission_per_tracked_hour: number | null;
    next_deadline: string | null;
    latest_activity?: {
      type: string;
      created_at: string;
      actor?: { id: string; name: string; email: string } | null;
    } | null;
    assigned_members?: Array<{ id: string; name: string; email: string }>;
  };
  contacts?: CompanyContact[];
  notes_log?: CompanyNote[];
  projects?: Pick<Project, "id" | "name" | "status" | "due_date">[];
  tasks?: Pick<Task, "id" | "title" | "status" | "priority" | "due_date">[];
  creative_tracking_visible?: boolean;
  creative_work?: ClientCreativeWork;
  calendar_events?: CalendarEvent[];
  activity_events?: ActivityEvent[];
  client_onboardings?: ClientOnboarding[];
}

export interface SidebarHiddenSpace {
  id: string;
  name: string;
  icon: string | null;
}

export interface SidebarPinnedClient {
  id: string;
  company_id: string;
  position: number;
  company: {
    id: string;
    name: string;
    status: string;
    commercial_status: string | null;
    plan_name: string | null;
  };
}

export interface OnboardingCapabilities {
  can_manage: boolean;
  can_update_finance: boolean;
  can_update_support: boolean;
  can_upload_contract: boolean;
  editable_checklist_item_ids: string[];
}

export interface ClientOnboarding {
  id: string;
  workspace_id: string;
  company_id: string;
  project_id: string | null;
  status: string;
  sequence_status: string;
  progress: number;
  closing_date: string | null;
  expected_start_date: string | null;
  responsible_salesperson_id: string | null;
  initial_notes: string | null;
  contracted_services: string[] | null;
  commercial_completed_at: string | null;
  technical_support_started_at: string | null;
  up_zero_configuration_completed_at: string | null;
  marketing_b2b_released_at: string | null;
  marketing_b2b_dependency_override_reason: string | null;
  marketing_b2b_dependency_overridden_by: string | null;
  marketing_b2b_dependency_overridden_at: string | null;
  completed_at: string | null;
  completion_override_reason: string | null;
  completion_overridden_by: string | null;
  completion_overridden_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  company?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  salesperson?: { id: string; name: string; email: string } | null;
  checklist_items?: OnboardingChecklistItem[];
  service_assignments?: OnboardingServiceAssignment[];
  meetings?: OnboardingMeeting[];
  contracts?: ClientContract[];
  support_group?: SupportGroup | null;
  marketing_b2b_forms?: MarketingB2BOnboardingFormSummary[];
  marketing_b2c_forms?: MarketingB2COnboardingFormSummary[];
  capabilities?: OnboardingCapabilities;
}

export interface OnboardingChecklistItem {
  id: string;
  onboarding_id: string;
  workspace_id: string;
  task_id: string | null;
  automation_key: string | null;
  department: string;
  title: string;
  status: "pending" | "in_progress" | "complete" | string;
  required: boolean;
  owner_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  sort_order: number;
  owner?: { id: string; name: string; email: string } | null;
  completer?: { id: string; name: string; email: string } | null;
  task?: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    project_id?: string | null;
    assignee?: { id: string; name: string; email: string } | null;
  } | null;
  marketing_b2b_form?: MarketingB2BOnboardingFormSummary | null;
  marketing_b2c_form?: MarketingB2COnboardingFormSummary | null;
}

export interface OnboardingServiceAssignment {
  id: string;
  onboarding_id: string;
  workspace_id: string;
  service: string;
  leader_id: string | null;
  department_id: string | null;
  department_name: string | null;
  status: string;
  notes: string | null;
  leader?: { id: string; name: string; email: string } | null;
  department?: { id: string; name: string } | null;
}

export interface OnboardingMeeting {
  id: string;
  onboarding_id: string;
  workspace_id: string;
  service: string;
  checklist_item_id: string | null;
  scheduled: boolean;
  scheduled_at: string | null;
  meeting_url: string | null;
  leader_id: string | null;
  notes: string | null;
  leader?: { id: string; name: string; email: string } | null;
}

export interface ClientContract {
  id: string;
  onboarding_id: string;
  workspace_id: string;
  company_id: string;
  project_id: string | null;
  file_name: string;
  storage_bucket?: string;
  storage_path?: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  status: string;
  visibility: string;
  uploaded_by: string;
  uploaded_at: string;
  created_at: string;
  private?: boolean;
  uploader?: { id: string; name: string; email: string } | null;
}

export interface SupportGroup {
  id: string;
  onboarding_id: string;
  workspace_id: string;
  group_created: boolean;
  group_name: string | null;
  group_link: string | null;
  main_client_contact: string | null;
  commercial_responsible: string | null;
  account_responsible: string | null;
  group_created_at: string | null;
  created_by: string | null;
  internal_participants: string[] | null;
  client_participants: string[] | null;
  status: string;
  notes: string | null;
  creator?: { id: string; name: string; email: string } | null;
}

export interface Template {
  id: string;
  workspace_id: string;
  name: string;
  type: string;
  description: string | null;
  config: unknown;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStatus {
  id: string;
  workspace_id: string;
  project_id: string | null;
  space_id: string | null;
  key: string;
  name: string;
  category: string;
  stage_order: number;
  color: string | null;
  terminal: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRequest {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  status: string;
  stage: string;
  requested_by: string;
  approver_id: string | null;
  requested_changes: string | null;
  due_at: string | null;
  approved_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  requester?: { id: string; name: string; email: string } | null;
  approver?: { id: string; name: string; email: string } | null;
  events?: ApprovalEvent[];
}

export interface ApprovalEvent {
  id: string;
  approval_id: string;
  workspace_id: string;
  actor_id: string | null;
  from_status: string | null;
  to_status: string;
  comment: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor?: { id: string; name: string; email: string } | null;
}

export interface ClientReport {
  id: string;
  workspace_id: string;
  company_id: string;
  author_id: string;
  title: string;
  period_from: string;
  period_to: string;
  version: number;
  status: string;
  narrative: string | null;
  markdown: string | null;
  pdf_url: string | null;
  approved_at: string | null;
  approved_by: string | null;
  sent_at: string | null;
  sent_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  company?: { id: string; name: string } | null;
  author?: { id: string; name: string; email: string } | null;
  approver?: { id: string; name: string; email: string } | null;
  sender?: { id: string; name: string; email: string } | null;
}

export interface AutomationRun {
  id: string;
  workspace_id: string;
  rule_id: string | null;
  status: string;
  trigger: string;
  action_type: string;
  dry_run: boolean;
  matched: number;
  executed: number;
  skipped: number;
  failure_count: number;
  dedupe_key: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
  created_by: string | null;
}
