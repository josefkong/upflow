"use client";

import Header from "@/components/layout/header";
import PersonalWorkspaceBoard from "@/components/projects/personal-workspace-board";
import { useLanguage } from "@/components/language-provider";

export default function ProjectsPage() {
  const { t } = useLanguage();
  return (
    <>
      <Header title={t("projects.title")} />
      <PersonalWorkspaceBoard />
    </>
  );
}
