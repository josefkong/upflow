export const COMMERCIAL_LEAD_REVENUE_TIERS = [
  { value: 10_000, labelKey: "commercialLead.revenueTier.5To10" },
  { value: 20_000, labelKey: "commercialLead.revenueTier.10To20" },
  { value: 30_000, labelKey: "commercialLead.revenueTier.20To30" },
  { value: 50_000, labelKey: "commercialLead.revenueTier.30To50" },
  { value: 100_000, labelKey: "commercialLead.revenueTier.50To100" },
  { value: 250_000, labelKey: "commercialLead.revenueTier.100To250" },
  { value: 999_999_999_999.99, labelKey: "commercialLead.revenueTier.above250" },
] as const;

export const COMMERCIAL_LEAD_REVENUE_VALUES = COMMERCIAL_LEAD_REVENUE_TIERS.map(
  (tier) => tier.value,
);

export function commercialLeadRevenueTier(value: number) {
  return COMMERCIAL_LEAD_REVENUE_TIERS.find((tier) => tier.value === value) ?? null;
}
