import type { Language } from "@/lib/i18n/translations";

type ProjectNameTranslation = Record<Language, string>;

const SPACE_NAME_TRANSLATIONS: ProjectNameTranslation[] = [
  { en: "Finance", "pt-BR": "Financeiro" },
  { en: "Production", "pt-BR": "Produção" },
  { en: "General Admin", "pt-BR": "Administração Geral" },
  { en: "Technical Support", "pt-BR": "Suporte Técnico" },
  { en: "Creative & Design", "pt-BR": "Criativo e Design" },
];

const FOLLOW_UP_PROJECT_NAME_TRANSLATION: ProjectNameTranslation = {
  en: "Follow Up",
  "pt-BR": "Follow Up",
};

const PROJECT_NAME_TRANSLATIONS: ProjectNameTranslation[] = [
  FOLLOW_UP_PROJECT_NAME_TRANSLATION,
  { en: "Contracts & Handoffs", "pt-BR": "Contratos e Handoffs" },
  { en: "Proposals", "pt-BR": "Propostas" },
  { en: "Contracts", "pt-BR": "Contratos" },
  { en: "Clients", "pt-BR": "Clientes" },
  { en: "Customer Service", "pt-BR": "Atendimento ao Cliente" },
  { en: "Equipment Control", "pt-BR": "Controle de Equipamentos" },
  { en: "Campaigns", "pt-BR": "Campanhas" },
  { en: "Reports", "pt-BR": "Relatórios" },
  { en: "Content Calendar", "pt-BR": "Calendário de Conteúdo" },
  { en: "Promotions", "pt-BR": "Promoções" },
  { en: "Design Queue", "pt-BR": "Fila de Design" },
  { en: "Creative Reviews", "pt-BR": "Revisões Criativas" },
  { en: "Brand Assets", "pt-BR": "Ativos da Marca" },
  { en: "Approvals", "pt-BR": "Aprovações" },
  { en: "Client Channels", "pt-BR": "Canais de Clientes" },
  { en: "Service Onboarding", "pt-BR": "Onboarding de Serviços" },
  { en: "Onboarding Triage", "pt-BR": "Triagem de Onboarding" },
  { en: "Client Onboarding", "pt-BR": "Onboarding de Clientes" },
  { en: "Finance Onboarding", "pt-BR": "Onboarding Financeiro" },
  { en: "Creative Onboarding", "pt-BR": "Onboarding Criativo" },
  { en: "Invoices", "pt-BR": "Faturas" },
  { en: "Payments", "pt-BR": "Pagamentos" },
  { en: "Commissions", "pt-BR": "Comissões" },
  { en: "Expenses", "pt-BR": "Despesas" },
  { en: "Shoots", "pt-BR": "Gravações" },
  { en: "Editing", "pt-BR": "Edição" },
  { en: "Publishing", "pt-BR": "Publicação" },
  { en: "Deliverables", "pt-BR": "Entregas" },
  { en: "Support Tickets", "pt-BR": "Tickets de Suporte" },
  { en: "Bug Reports", "pt-BR": "Relatórios de Bugs" },
  { en: "Access Issues", "pt-BR": "Problemas de Acesso" },
  { en: "Client Requests", "pt-BR": "Solicitações de Clientes" },
  { en: "Resolved", "pt-BR": "Resolvidos" },
  { en: "Internal Requests", "pt-BR": "Solicitações Internas" },
  { en: "Access & Accounts", "pt-BR": "Acessos e Contas" },
  { en: "Documents", "pt-BR": "Documentos" },
  { en: "Vendors", "pt-BR": "Fornecedores" },
  { en: "New Client Onboarding", "pt-BR": "Onboarding de Novo Cliente" },
  { en: "Commercial pipeline", "pt-BR": "Pipeline Comercial" },
  { en: "Campaign Launch", "pt-BR": "Lançamento de Campanha" },
  { en: "Content production", "pt-BR": "Produção de Conteúdo" },
  {
    en: "Creative Production Request",
    "pt-BR": "Solicitação de Produção Criativa",
  },
  { en: "Email Marketing Campaign", "pt-BR": "Campanha de E-mail Marketing" },
  { en: "Finance routine", "pt-BR": "Rotina Financeira" },
  {
    en: "Google Ads Campaign Launch",
    "pt-BR": "Lançamento de Campanha no Google Ads",
  },
  { en: "Influencer Campaign", "pt-BR": "Campanha com Influenciadores" },
  { en: "Landing Page Build", "pt-BR": "Criação de Landing Page" },
  {
    en: "Meta Ads Campaign Launch",
    "pt-BR": "Lançamento de Campanha no Meta Ads",
  },
  {
    en: "Performance Report Delivery",
    "pt-BR": "Entrega de Relatório de Performance",
  },
  {
    en: "Social Media Monthly Content Plan",
    "pt-BR": "Planejamento Mensal de Conteúdo para Social Media",
  },
  {
    en: "Website Maintenance Request",
    "pt-BR": "Solicitação de Manutenção de Site",
  },
  { en: "Client Monthly Review", "pt-BR": "Revisão Mensal do Cliente" },
];

type ProjectDescriptionTranslation = {
  projectNames: string[];
  descriptions: ProjectNameTranslation;
};

const PROJECT_DESCRIPTION_TRANSLATIONS: ProjectDescriptionTranslation[] = [
  {
    projectNames: ["Contracts & Handoffs", "Contratos e Handoffs"],
    descriptions: {
      en: "Reusable queue for client contracts, handoffs, and onboarding commercial checks.",
      "pt-BR":
        "Fila reutilizável para contratos de clientes, handoffs e verificações do onboarding comercial.",
    },
  },
  {
    projectNames: ["Proposals", "Propostas"],
    descriptions: {
      en: "Private archive of every commercial proposal uploaded for a Lead.",
      "pt-BR":
        "Arquivo privado de todas as propostas comerciais enviadas para Leads.",
    },
  },
  {
    projectNames: ["Contracts", "Contratos"],
    descriptions: {
      en: "Automatic registry of active and inactive clients and their contract history.",
      "pt-BR":
        "Registro automático de clientes ativos e inativos e do histórico de seus contratos.",
    },
  },
  {
    projectNames: ["Customer Service", "Atendimento ao Cliente"],
    descriptions: {
      en: "Commercial customer service workspace for client requests and relationship follow-up.",
      "pt-BR":
        "Área de atendimento comercial para solicitações de clientes e acompanhamento do relacionamento.",
    },
  },
  {
    projectNames: ["Clients", "Clientes"],
    descriptions: {
      en: "Shared client directory. Each card opens the client folder mirrored in this Space.",
      "pt-BR":
        "Diretório compartilhado de clientes. Cada cartão abre a pasta do cliente espelhada neste Espaço.",
    },
  },
  {
    projectNames: ["Equipment Control", "Controle de Equipamentos"],
    descriptions: {
      en: "Agency equipment checkout, custody, returns, condition inspections, and possession history.",
      "pt-BR":
        "Controle de retirada, posse, devolução, inspeção e histórico dos equipamentos da agência.",
    },
  },
];

function normalizeProjectName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

const projectNameByAlias = new Map<string, ProjectNameTranslation>();
const spaceNameByAlias = new Map<string, ProjectNameTranslation>();
const projectDescriptionByName = new Map<
  string,
  ProjectDescriptionTranslation
>();

for (const translation of PROJECT_NAME_TRANSLATIONS) {
  for (const alias of Object.values(translation)) {
    projectNameByAlias.set(normalizeProjectName(alias), translation);
  }
}

for (const translation of SPACE_NAME_TRANSLATIONS) {
  for (const alias of Object.values(translation)) {
    spaceNameByAlias.set(normalizeProjectName(alias), translation);
  }
}

spaceNameByAlias.set(
  normalizeProjectName("Criativos & Design"),
  SPACE_NAME_TRANSLATIONS.find(
    (translation) => translation.en === "Creative & Design",
  )!,
);

for (const alias of ["Follow-up", "Follow-ups"]) {
  projectNameByAlias.set(
    normalizeProjectName(alias),
    FOLLOW_UP_PROJECT_NAME_TRANSLATION,
  );
}

for (const translation of PROJECT_DESCRIPTION_TRANSLATIONS) {
  for (const projectName of translation.projectNames) {
    projectDescriptionByName.set(
      normalizeProjectName(projectName),
      translation,
    );
  }
}

/**
 * Localizes known system project names without changing the persisted name
 * used by routing, automations, and workflow resolution.
 */
export function localizeProjectName(name: string, language: Language) {
  return projectNameByAlias.get(normalizeProjectName(name))?.[language] ?? name;
}

/**
 * Localizes canonical department Space names without changing their persisted
 * identifiers, which remain stable for routing and workflow automation.
 */
export function localizeSpaceName(name: string, language: Language) {
  return spaceNameByAlias.get(normalizeProjectName(name))?.[language] ?? name;
}

/**
 * Localizes known system descriptions while preserving descriptions that a
 * user customized in the project settings.
 */
export function localizeProjectDescription(
  projectName: string,
  description: string | null,
  language: Language,
) {
  if (!description) return description;
  const translation = projectDescriptionByName.get(
    normalizeProjectName(projectName),
  );
  if (!translation) return description;

  const isKnownDescription = Object.values(translation.descriptions).some(
    (knownDescription) =>
      normalizeProjectName(knownDescription) ===
      normalizeProjectName(description),
  );

  return isKnownDescription ? translation.descriptions[language] : description;
}
