"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Building2,
  Calendar,
  CheckSquare,
  Clock,
  FileText,
  Folder,
  Hash,
  Inbox,
  LayoutDashboard,
  Loader2,
  Plus,
  Users,
} from "lucide-react";
import NewProjectDialog from "@/components/projects/new-project-dialog";
import CreateCompanyDialog from "@/components/dashboard/create-company-dialog";
import { useAppUser } from "@/components/user-provider";
import { useLanguage } from "@/components/language-provider";


type ProjectKind = "client" | "internal" | "operational_queue" | "onboarding";

interface ProjectContext {
  id: string;
  name: string;
  kind: ProjectKind;
  company?: { id: string; name: string } | null;
  space?: { id: string; name: string; icon?: string | null } | null;
  folder?: { id: string; name: string; icon?: string | null } | null;
}

interface PaletteProject extends ProjectContext {
  description?: string | null;
  status: string;
}

interface PaletteSpace {
  id: string;
  name: string;
  icon?: string | null;
}

interface PaletteTask {
  id: string;
  title: string;
  description?: string | null;
  project?: ProjectContext | null;
}

interface PaletteDoc {
  id: string;
  title: string;
  project?: ProjectContext | null;
}

interface SearchResponse {
  q: string;
  spaces: PaletteSpace[];
  projects: PaletteProject[];
  tasks: PaletteTask[];
  docs: PaletteDoc[];
}

const EMPTY_RESULTS: SearchResponse = {
  q: "",
  spaces: [],
  projects: [],
  tasks: [],
  docs: [],
};

function projectContext(project: ProjectContext | null | undefined) {
  if (!project) return "";
  return [project.company?.name, project.space?.name, project.folder?.name]
    .filter(Boolean)
    .join(" › ");
}

export default function CommandPalette() {
  const router = useRouter();
  const user = useAppUser();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showClientOnboarding, setShowClientOnboarding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const canCreateProject =
    user?.isSuperAdmin ||
    user?.currentRole === "owner" ||
    user?.currentRole === "admin";
  const canCreateClient = canCreateProject || user?.currentRole === "member";
  const copy = {
    input: t("command.placeholder"),
    empty: t("command.noResults"),
    actions: t("command.actions"),
    newProject: t("header.newProject"),
    newClient: t("command.newClientOnboarding"),
    navigate: t("command.navigate"),
    dashboard: t("nav.dashboard"),
    inbox: t("nav.inbox"),
    projects: t("search.projects"),
    calendar: t("nav.calendar"),
    docs: t("search.docs"),
    team: t("nav.team"),
    time: t("nav.timeTracking"),
    spaces: t("search.spaces"),
    tasks: t("search.tasks"),
    searching: t("common.loading"),
    noMatches: t("command.noResults"),
    onboarding: t("search.onboarding"),
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        const editable =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target?.isContentEditable;
        if (editable && !target?.classList.contains("upflow-shell-search")) return;
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    const openPalette = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("upflow:command-palette-open", openPalette);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("upflow:command-palette-open", openPalette);
    };
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!open || !normalizedQuery) {
      setLoading(false);
      setResults(EMPTY_RESULTS);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setResults(EMPTY_RESULTS);
      fetch(`/api/search?q=${encodeURIComponent(normalizedQuery)}`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error(`Search failed: ${response.status}`);
          return response.json() as Promise<SearchResponse>;
        })
        .then((data) => setResults(data))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResults(EMPTY_RESULTS);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const resultCount =
    results.spaces.length + results.projects.length + results.tasks.length + results.docs.length;

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput value={query} onValueChange={setQuery} placeholder={copy.input} />
        <CommandList>
          <CommandEmpty>{copy.empty}</CommandEmpty>

          {(canCreateProject || canCreateClient) && (
            <CommandGroup heading={copy.actions}>
              {canCreateProject ? (
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setShowNewProject(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  <span>{copy.newProject}</span>
                </CommandItem>
              ) : null}
              {canCreateClient ? (
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setShowClientOnboarding(true);
                  }}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  <span>{copy.newClient}</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          )}

          <CommandSeparator />

          <CommandGroup heading={copy.navigate}>
            <CommandItem onSelect={() => go("/dashboard")}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>{copy.dashboard}</span>
            </CommandItem>
            <CommandItem onSelect={() => go("/inbox")}>
              <Inbox className="mr-2 h-4 w-4" />
              <span>{copy.inbox}</span>
            </CommandItem>
            <CommandItem onSelect={() => go("/projects")}>
              <Folder className="mr-2 h-4 w-4" />
              <span>{copy.projects}</span>
            </CommandItem>
            <CommandItem onSelect={() => go("/calendar")}>
              <Calendar className="mr-2 h-4 w-4" />
              <span>{copy.calendar}</span>
            </CommandItem>
            <CommandItem onSelect={() => go("/docs")}>
              <FileText className="mr-2 h-4 w-4" />
              <span>{copy.docs}</span>
            </CommandItem>
            <CommandItem onSelect={() => go("/team")}>
              <Users className="mr-2 h-4 w-4" />
              <span>{copy.team}</span>
            </CommandItem>
            <CommandItem onSelect={() => go("/time")}>
              <Clock className="mr-2 h-4 w-4" />
              <span>{copy.time}</span>
            </CommandItem>
          </CommandGroup>

          {loading && (
            <>
              <CommandSeparator />
              <CommandGroup heading={copy.searching}>
                <CommandItem disabled value={query}>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>{copy.searching}</span>
                </CommandItem>
              </CommandGroup>
            </>
          )}

          {!loading && query.trim() && resultCount === 0 && (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem disabled value={query}>{copy.noMatches}</CommandItem>
              </CommandGroup>
            </>
          )}

          {results.spaces.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={copy.spaces}>
                {results.spaces.map((space) => (
                  <CommandItem
                    key={space.id}
                    value={`space:${space.name}`}
                    onSelect={() => go(`/spaces/${space.id}`)}
                  >
                    <Hash className="mr-2 h-4 w-4" />
                    <span className="truncate">{space.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {results.projects.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={copy.projects}>
                {results.projects.map((project) => {
                  const context = projectContext(project);
                  return (
                    <CommandItem
                      key={project.id}
                      value={`project:${project.name}:${context}:${project.description ?? ""}:${project.kind}`}
                      onSelect={() => go(`/projects/${project.id}`)}
                    >
                      <Folder className="mr-2 h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      {project.kind === "onboarding" && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {copy.onboarding}
                        </span>
                      )}
                      {context && (
                        <span className="max-w-[42%] truncate text-xs text-muted-foreground">
                          {context}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}

          {results.tasks.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={copy.tasks}>
                {results.tasks.map((task) => {
                  const context = projectContext(task.project);
                  return (
                    <CommandItem
                      key={task.id}
                      value={`task:${task.title}:${task.description ?? ""}:${task.project?.name ?? ""}:${context}`}
                      onSelect={() =>
                        go(
                          task.project
                            ? `/projects/${task.project.id}?task=${task.id}`
                            : "/projects",
                        )
                      }
                    >
                      <CheckSquare className="mr-2 h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      {context && (
                        <span className="max-w-[42%] truncate text-xs text-muted-foreground">
                          {context}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}

          {results.docs.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={copy.docs}>
                {results.docs.map((doc) => {
                  const context = projectContext(doc.project);
                  return (
                    <CommandItem
                      key={doc.id}
                      value={`doc:${doc.title}:${doc.project?.name ?? ""}:${context}`}
                      onSelect={() => go(`/docs/${doc.id}`)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                      {context && (
                        <span className="max-w-[42%] truncate text-xs text-muted-foreground">
                          {context}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>

      {canCreateProject ? (
          <NewProjectDialog
            open={showNewProject}
            onClose={() => setShowNewProject(false)}
            onCreated={(project) => {
              setShowNewProject(false);
              router.push(`/projects/${project.id}`);
            }}
          />
      ) : null}
      {canCreateClient ? (
          <CreateCompanyDialog
            open={showClientOnboarding}
            mode="onboarding"
            onClose={() => setShowClientOnboarding(false)}
            onCreated={(company) => {
              setShowClientOnboarding(false);
              router.push(`/clients/${company.id}`);
            }}
          />
      ) : null}
    </>
  );
}
