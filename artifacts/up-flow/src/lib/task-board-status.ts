import { CLICKUP_STATUS_FIELD_NAME } from "@/lib/clickup-status";
import { RH_BOARD_FIELD_NAME } from "@/lib/rh-board";
import { SPACE_TASK_STATUS_FIELD_NAME } from "@/lib/space-task-status";
import { COMMERCIAL_LEAD_STAGE_FIELD_NAME } from "@/lib/commercial-lead-stages";
import { COMMERCIAL_FOLLOW_UP_FIELD_NAME } from "@/lib/commercial-follow-up";
import { COMMERCIAL_CONTRACT_STAGE_FIELD_NAME } from "@/lib/commercial-contract-stages";
import { ONBOARDING_STAGE_FIELD_NAME } from "@/lib/onboarding-shared-flow";
import type { CustomFieldDefinition, Task, WorkflowStatus } from "@/lib/types";

export type TaskBoardStatusKind =
  | "space"
  | "commercial"
  | "commercial_follow_up"
  | "commercial_contract"
  | "onboarding"
  | "rh"
  | "clickup";

export type TaskBoardStatusOption = {
  value: string;
  color: string | null;
  terminal: boolean;
  /**
   * The generic task enum remains useful for global views and automation.
   * RH board columns are organizational buckets rather than task lifecycle
   * stages, so changing one must not change the generic task status.
   */
  taskStatus: Task["status"] | null;
};

export type TaskBoardStatus = {
  field: CustomFieldDefinition;
  kind: TaskBoardStatusKind;
  options: TaskBoardStatusOption[];
};

type ResolveTaskBoardStatusInput = {
  customFields: CustomFieldDefinition[];
  workflowStatuses?: WorkflowStatus[];
  projectId: string;
  spaceId?: string | null;
};

function isDropdownWithOptions(field: CustomFieldDefinition, name: string) {
  return (
    field.name === name &&
    field.type === "dropdown" &&
    (field.options?.length ?? 0) > 0
  );
}

/**
 * Finds the custom field that drives Kanban columns. Keep the Space field
 * first so a configured Space workflow always takes precedence over imported
 * or department-specific fields, matching the board itself.
 */
export function resolveTaskBoardStatus({
  customFields,
  workflowStatuses = [],
  projectId,
  spaceId,
}: ResolveTaskBoardStatusInput): TaskBoardStatus | null {
  const field =
    customFields.find((candidate) =>
      isDropdownWithOptions(candidate, COMMERCIAL_CONTRACT_STAGE_FIELD_NAME),
    ) ??
    customFields.find((candidate) =>
      isDropdownWithOptions(candidate, COMMERCIAL_FOLLOW_UP_FIELD_NAME),
    ) ??
    customFields.find((candidate) =>
      isDropdownWithOptions(candidate, COMMERCIAL_LEAD_STAGE_FIELD_NAME),
    ) ??
    customFields.find((candidate) =>
      isDropdownWithOptions(candidate, ONBOARDING_STAGE_FIELD_NAME),
    ) ??
    customFields.find((candidate) =>
      isDropdownWithOptions(candidate, SPACE_TASK_STATUS_FIELD_NAME),
    ) ??
    customFields.find(
      (candidate) =>
        isDropdownWithOptions(candidate, RH_BOARD_FIELD_NAME) ||
        isDropdownWithOptions(candidate, CLICKUP_STATUS_FIELD_NAME),
    );

  if (!field?.options?.length) return null;

  const kind: TaskBoardStatusKind =
    field.name === COMMERCIAL_CONTRACT_STAGE_FIELD_NAME
      ? "commercial_contract"
      : field.name === COMMERCIAL_FOLLOW_UP_FIELD_NAME
        ? "commercial_follow_up"
        : field.name === COMMERCIAL_LEAD_STAGE_FIELD_NAME
          ? "commercial"
          : field.name === ONBOARDING_STAGE_FIELD_NAME
            ? "onboarding"
            : field.name === SPACE_TASK_STATUS_FIELD_NAME
              ? "space"
              : field.name === RH_BOARD_FIELD_NAME
                ? "rh"
                : "clickup";
  const statusesByName = new Map(
    workflowStatuses
      .filter(
        (workflowStatus) =>
          workflowStatus.category === "task" &&
          workflowStatus.active &&
          (kind === "space"
            ? workflowStatus.space_id === spaceId
            : workflowStatus.project_id === projectId),
      )
      .map((workflowStatus) => [workflowStatus.name, workflowStatus]),
  );

  return {
    field,
    kind,
    options: field.options.map((value, index) => {
      const workflowStatus = statusesByName.get(value);
      const terminal = workflowStatus?.terminal ?? false;
      return {
        value,
        color: workflowStatus?.color ?? null,
        terminal,
        taskStatus:
          kind === "rh"
            ? null
            : terminal
              ? "done"
              : index === 0
                ? "todo"
                : "in_progress",
      };
    }),
  };
}

export function taskStatusForTaskBoardOption(
  boardStatus: TaskBoardStatus | null | undefined,
  value: string,
): Task["status"] | null {
  return (
    boardStatus?.options.find((option) => option.value === value)?.taskStatus ??
    null
  );
}

export function defaultTaskBoardStatusValue(
  boardStatus: TaskBoardStatus,
  fallbackStatus: Task["status"],
): string {
  if (boardStatus.kind === "rh") {
    return boardStatus.options[0]?.value ?? "";
  }
  if (fallbackStatus === "done") {
    return (
      boardStatus.options.find((option) => option.taskStatus === "done")
        ?.value ??
      boardStatus.options.find((option) => option.terminal)?.value ??
      boardStatus.options.at(-1)?.value ??
      ""
    );
  }
  if (fallbackStatus === "in_progress") {
    return (
      boardStatus.options.find((option) => option.taskStatus === "in_progress")
        ?.value ??
      boardStatus.options.find((option) => !option.terminal)?.value ??
      boardStatus.options[0]?.value ??
      ""
    );
  }
  return (
    boardStatus.options.find((option) => option.taskStatus === "todo")?.value ??
    boardStatus.options[0]?.value ??
    ""
  );
}

/**
 * Returns an existing valid custom-field value or a deterministic fallback
 * that represents the task's current generic status.
 */
export function taskBoardStatusValue(
  boardStatus: TaskBoardStatus,
  storedValue: unknown,
  fallbackStatus: Task["status"],
): string {
  return typeof storedValue === "string" &&
    boardStatus.options.some((option) => option.value === storedValue)
    ? storedValue
    : defaultTaskBoardStatusValue(boardStatus, fallbackStatus);
}
