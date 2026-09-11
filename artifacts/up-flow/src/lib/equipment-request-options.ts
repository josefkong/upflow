export const EQUIPMENT_TERMS_VERSION = "2026-09-03";

export const EQUIPMENT_PURPOSES = [
  "shooting",
  "presentation",
  "recording",
  "home_office",
] as const;

export type EquipmentPurpose = (typeof EQUIPMENT_PURPOSES)[number];

export const EQUIPMENT_PURPOSE_LABELS: Record<
  EquipmentPurpose,
  { pt: string; en: string }
> = {
  shooting: { pt: "Shooting", en: "Shooting" },
  presentation: { pt: "Apresentação", en: "Presentation" },
  recording: { pt: "Gravação", en: "Recording" },
  home_office: { pt: "Home Office", en: "Home Office" },
};

export const EQUIPMENT_CANCELLATION_REASONS = [
  "requester_cancelled",
  "administration_cancelled",
  "schedule_conflict",
  "request_invalid",
] as const;

export const EQUIPMENT_DAMAGE_TYPES = [
  "impact",
  "scratch",
  "liquid",
  "missing_part",
  "electrical",
  "other",
] as const;

export const MINIMUM_EQUIPMENT_USE_MS = 60 * 60 * 1000;
export const MINIMUM_HANDOVER_PHOTOS = 4;
export const MAX_EQUIPMENT_EVIDENCE_PHOTOS = 8;
