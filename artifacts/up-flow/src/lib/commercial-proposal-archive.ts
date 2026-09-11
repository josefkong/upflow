export function isCommercialProposalArchiveProject(input: {
  name?: string | null;
  spaceName?: string | null;
}) {
  const projectName = input.name?.trim().toLocaleLowerCase();
  const spaceName = input.spaceName?.trim().toLocaleLowerCase();
  return (
    (projectName === "propostas" || projectName === "proposals") &&
    (spaceName === "comercial" || spaceName === "commercial")
  );
}
