import {
  onboardingDepartmentOwnerForKey,
  ownerKeyForDepartmentLabel,
  type OnboardingDepartmentOwnerKey,
} from "@/lib/onboarding-department-owners";

type SectorFolderChecklistItem = {
  id: string;
  department: string;
  status: string;
  required: boolean;
  completed_at: Date | string | null;
  task: {
    id: string;
    project_id: string;
    project: {
      id: string;
      name: string;
      space: { id: string; name: string } | null;
    };
  } | null;
};

export type ClientOnboardingSectorFolder = {
  key: OnboardingDepartmentOwnerKey;
  name: string;
  project_id: string | null;
  project_name: string | null;
  task_count: number;
  completed_at: string | null;
};

function sectorKey(item: SectorFolderChecklistItem) {
  return (
    ownerKeyForDepartmentLabel(item.department) ??
    ownerKeyForDepartmentLabel(item.task?.project.space?.name)
  );
}

export function buildClientOnboardingSectorFolders(
  items: SectorFolderChecklistItem[],
): ClientOnboardingSectorFolder[] {
  const grouped = new Map<
    OnboardingDepartmentOwnerKey,
    SectorFolderChecklistItem[]
  >();
  for (const item of items) {
    const key = sectorKey(item);
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  return Array.from(grouped.entries()).flatMap(([key, sectorItems]) => {
    const requiredItems = sectorItems.filter((item) => item.required);
    if (
      requiredItems.length === 0 ||
      requiredItems.some((item) => item.status !== "complete")
    ) {
      return [];
    }

    const linkedTaskItems = sectorItems.filter((item) => item.task);
    const preferredItem =
      linkedTaskItems.find(
        (item) =>
          ownerKeyForDepartmentLabel(item.task?.project.space?.name) === key,
      ) ?? linkedTaskItems[0];
    const completedAt = requiredItems
      .map((item) => item.completed_at)
      .filter((value): value is Date | string => Boolean(value))
      .map((value) => new Date(value))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const owner = onboardingDepartmentOwnerForKey(key);

    return [
      {
        key,
        name: owner?.label ?? key,
        project_id: preferredItem?.task?.project_id ?? null,
        project_name: preferredItem?.task?.project.name ?? null,
        task_count: new Set(
          linkedTaskItems.map((item) => item.task?.id).filter(Boolean),
        ).size,
        completed_at: completedAt?.toISOString() ?? null,
      },
    ];
  });
}
