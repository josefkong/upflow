"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Globe2,
  ImageIcon,
  Info,
  Layers3,
  Lightbulb,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Send,
  Sparkles,
  Upload,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import BrazilianDateInput from "@/components/ui/brazilian-date-input";
import {
  addBusinessDaysToIsoDate,
  buildCreativeBriefingDescription,
  buildCreativeBriefingTitle,
  filterCreativeBriefingDesigners,
  formatCreativeBriefingDimensions,
  type CreativeBriefingDimensionUnit,
  type CreativeBriefingPriority,
} from "@/lib/creative-briefing";
import { cn } from "@/lib/utils";
import type { AppUser, Task, TaskAssignee } from "@/lib/types";

interface CreativeBriefingFormProps {
  projectId: string;
  workspaceId: string;
  users: TaskAssignee[];
  me: AppUser | null;
  onCreated: (task: Task) => void | Promise<void>;
  onDesignerRosterConfigured: () => void | Promise<void>;
}

interface CompanyOption {
  id: string;
  name: string;
}

type DeadlinePreset = "standard" | "rush" | "extended" | "custom";

interface DraftState {
  designerIds: string[];
  companyId: string;
  videoSizes: string[];
  formats: string[];
  manualVideoInput: boolean;
  manualVideoWidth: string;
  manualVideoHeight: string;
  manualVideoUnit: CreativeBriefingDimensionUnit;
  manualFormatInput: boolean;
  manualFormatName: string;
  manualFormatDescription: string;
  brandRules: string;
  description: string;
  driveUrl: string;
  visualReferenceUrl: string;
  priority: CreativeBriefingPriority;
  deadlinePreset: DeadlinePreset;
  customDueDate: string;
}

type StoredDraftState = Partial<DraftState> & {
  designerId?: string;
  videoSize?: string;
  format?: string;
};

const DRAFT_PREFIX = "upflow.creative-briefing";
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const MAX_DRIVE_FILES = 5;

const VIDEO_SIZES = [
  "1:1 - 1080 x 1080",
  "4:5 - 1080 x 1350",
  "9:16 - 1080 x 1920",
  "16:9 - 1920 x 1080",
];
const MANUAL_VIDEO_SIZE = "manual_video_size";
const MANUAL_FORMAT = "manual_format";
const DIMENSION_UNITS: CreativeBriefingDimensionUnit[] = ["px", "cm", "mm"];

const FORMAT_VALUES = [
  { value: "carousel", hours: 2, icon: Layers3 },
  { value: "banner", hours: 1, icon: FileText },
  { value: "single_image", hours: 1, icon: ImageIcon },
  { value: "video_edit", hours: 1, icon: Video },
] as const;

function isSupportedCreativeFile(file: File) {
  const acceptedTypes = ["image/png", "image/jpeg", "application/pdf"];
  if (acceptedTypes.includes(file.type)) return true;
  return /\.(png|jpe?g|pdf)$/i.test(file.name);
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function CreativeBriefingForm({
  projectId,
  workspaceId,
  users,
  me,
  onCreated,
  onDesignerRosterConfigured,
}: CreativeBriefingFormProps) {
  const { language, t } = useLanguage();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [designerSearch, setDesignerSearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [designerIds, setDesignerIds] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [videoSizes, setVideoSizes] = useState<string[]>([VIDEO_SIZES[2]]);
  const [formats, setFormats] = useState<string[]>(["carousel"]);
  const [manualVideoInput, setManualVideoInput] = useState(false);
  const [manualVideoWidth, setManualVideoWidth] = useState("");
  const [manualVideoHeight, setManualVideoHeight] = useState("");
  const [manualVideoUnit, setManualVideoUnit] =
    useState<CreativeBriefingDimensionUnit>("px");
  const [manualFormatInput, setManualFormatInput] = useState(false);
  const [manualFormatName, setManualFormatName] = useState("");
  const [manualFormatDescription, setManualFormatDescription] = useState("");
  const [brandRules, setBrandRules] = useState("");
  const [briefDescription, setBriefDescription] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [driveFiles, setDriveFiles] = useState<File[]>([]);
  const [visualReferenceUrl, setVisualReferenceUrl] = useState("");
  const [priority, setPriority] = useState<CreativeBriefingPriority>("medium");
  const [deadlinePreset, setDeadlinePreset] =
    useState<DeadlinePreset>("standard");
  const [customDueDate, setCustomDueDate] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<
    string | null
  >(null);
  const [referenceUrlPreviewFailed, setReferenceUrlPreviewFailed] =
    useState(false);
  const [draggingDriveFiles, setDraggingDriveFiles] = useState(false);
  const [draggingReference, setDraggingReference] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [designerSetupOpen, setDesignerSetupOpen] = useState(false);
  const [designerSetupIds, setDesignerSetupIds] = useState<string[]>([]);
  const [savingDesignerRoster, setSavingDesignerRoster] = useState(false);
  const [designerRosterPermission, setDesignerRosterPermission] = useState<
    boolean | null
  >(null);
  const driveFileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatOptions = useMemo(
    () =>
      FORMAT_VALUES.map((option) => ({
        ...option,
        label: t(`creativeBrief.format.${option.value}`),
      })),
    [t],
  );
  const designerUsers = useMemo(
    () => filterCreativeBriefingDesigners(users),
    [users],
  );
  const filteredDesignerUsers = useMemo(() => {
    const query = designerSearch.trim().toLocaleLowerCase();
    if (!query) return designerUsers;
    return designerUsers.filter((designer) =>
      [designer.name, designer.email]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [designerSearch, designerUsers]);
  const filteredCompanies = useMemo(() => {
    const query = brandSearch.trim().toLocaleLowerCase();
    if (!query) return companies;
    return companies.filter((company) =>
      company.name.toLocaleLowerCase().includes(query),
    );
  }, [brandSearch, companies]);
  const recentCompanies = useMemo(() => companies.slice(0, 3), [companies]);
  const designerIdSet = useMemo(
    () => new Set(designerUsers.map((designer) => designer.id)),
    [designerUsers],
  );
  const requesterName =
    me?.name?.trim() || me?.email || t("creativeBrief.requesterUnknown");
  const localDesignerRosterAdmin =
    me?.isSuperAdmin ||
    me?.role === "admin" ||
    me?.currentRole === "owner" ||
    me?.currentRole === "admin";
  const canConfigureDesignerRoster =
    designerRosterPermission ?? localDesignerRosterAdmin;
  const selectedDesigners = designerIds.flatMap((designerId) => {
    const designer = designerUsers.find((user) => user.id === designerId);
    return designer ? [designer] : [];
  });
  const primaryDesigner = selectedDesigners[0] ?? null;
  const selectedFormats = formatOptions.filter((option) =>
    formats.includes(option.value),
  );
  const manualVideoResult = manualVideoInput
    ? formatCreativeBriefingDimensions(
        manualVideoWidth,
        manualVideoHeight,
        manualVideoUnit,
      )
    : null;
  const resolvedVideoSizes = manualVideoInput
    ? manualVideoResult
      ? [manualVideoResult]
      : []
    : videoSizes;
  const trimmedManualFormatName = manualFormatName.trim();
  const resolvedFormats = manualFormatInput
    ? trimmedManualFormatName
      ? [trimmedManualFormatName]
      : []
    : selectedFormats.map((option) => option.label);
  const selectedCompany =
    companies.find((company) => company.id === companyId) ?? null;
  const selectCompany = (company: CompanyOption) => {
    setCompanyId(company.id);
    setBrandSearch(company.name);
    setBrandPickerOpen(false);
  };
  const estimatedHours = manualFormatInput
    ? 0
    : selectedFormats.reduce((total, option) => total + option.hours, 0);

  const dueDate = useMemo(() => {
    if (deadlinePreset === "custom") return customDueDate;
    const days =
      deadlinePreset === "rush" ? 1 : deadlinePreset === "extended" ? 3 : 2;
    return addBusinessDaysToIsoDate(new Date(), days);
  }, [customDueDate, deadlinePreset]);

  const dueDateLabel = useMemo(() => {
    if (deadlinePreset === "custom") {
      return customDueDate
        ? t("creativeBrief.deadlineCustomSet")
        : t("creativeBrief.deadlineChooseDate");
    }
    const days =
      deadlinePreset === "rush" ? 1 : deadlinePreset === "extended" ? 3 : 2;
    return t("creativeBrief.deadlineBusinessDays", { count: days });
  }, [customDueDate, deadlinePreset, t]);

  const referenceUrlPreview =
    visualReferenceUrl.trim() &&
    isHttpUrl(visualReferenceUrl.trim()) &&
    !referenceUrlPreviewFailed
      ? visualReferenceUrl.trim()
      : null;
  const referencePreviewSource = referenceImagePreview ?? referenceUrlPreview;

  useEffect(() => {
    const controller = new AbortController();
    setCompaniesLoading(true);
    fetch(
      `/api/companies?limit=100&include_summary=false&workspace_id=${encodeURIComponent(workspaceId)}`,
      {
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { items?: CompanyOption[] };
      })
      .then((data) => setCompanies(data.items ?? []))
      .catch(() => {
        if (!controller.signal.aborted)
          toast.error(t("creativeBrief.loadBrandsFailed"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setCompaniesLoading(false);
      });
    return () => controller.abort();
  }, [t, workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    setDesignerRosterPermission(null);

    fetch("/api/workspaces/" + workspaceId + "/creative-designers", {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { can_manage?: boolean };
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setDesignerRosterPermission(Boolean(data.can_manage));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setDesignerRosterPermission(null);
      });

    return () => controller.abort();
  }, [workspaceId]);

  useEffect(() => {
    if (!draftLoaded) return;
    setDesignerIds((current) => {
      const next = current.filter((designerId) =>
        designerIdSet.has(designerId),
      );
      return next.length === current.length ? current : next;
    });
  }, [designerIdSet, draftLoaded]);

  useEffect(() => {
    setReferenceUrlPreviewFailed(false);
  }, [visualReferenceUrl]);

  useEffect(() => {
    if (selectedCompany && !brandPickerOpen) {
      setBrandSearch(selectedCompany.name);
    }
  }, [brandPickerOpen, selectedCompany]);

  useEffect(() => {
    if (!referenceFile || !/^image\/(png|jpeg)$/.test(referenceFile.type)) {
      setReferenceImagePreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(referenceFile);
    setReferenceImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [referenceFile]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`${DRAFT_PREFIX}.${projectId}`);
      if (!stored) return;
      const draft = JSON.parse(stored) as StoredDraftState;
      if (Array.isArray(draft.designerIds)) {
        setDesignerIds(
          draft.designerIds.filter(
            (id): id is string => typeof id === "string",
          ),
        );
      } else if (typeof draft.designerId === "string") {
        setDesignerIds([draft.designerId]);
      }
      if (typeof draft.companyId === "string") setCompanyId(draft.companyId);
      if (Array.isArray(draft.videoSizes)) {
        setVideoSizes(
          draft.videoSizes.filter(
            (value): value is string =>
              typeof value === "string" && VIDEO_SIZES.includes(value),
          ),
        );
      } else if (typeof draft.videoSize === "string") {
        setVideoSizes([draft.videoSize]);
      }
      if (Array.isArray(draft.formats)) {
        setFormats(
          draft.formats.filter(
            (value): value is string =>
              typeof value === "string" &&
              FORMAT_VALUES.some((item) => item.value === value),
          ),
        );
      } else if (
        draft.format &&
        FORMAT_VALUES.some((item) => item.value === draft.format)
      ) {
        setFormats([draft.format]);
      }
      if (typeof draft.manualVideoInput === "boolean")
        setManualVideoInput(draft.manualVideoInput);
      if (typeof draft.manualVideoWidth === "string")
        setManualVideoWidth(draft.manualVideoWidth);
      if (typeof draft.manualVideoHeight === "string")
        setManualVideoHeight(draft.manualVideoHeight);
      if (
        draft.manualVideoUnit === "px" ||
        draft.manualVideoUnit === "cm" ||
        draft.manualVideoUnit === "mm"
      ) {
        setManualVideoUnit(draft.manualVideoUnit);
      }
      if (typeof draft.manualFormatInput === "boolean")
        setManualFormatInput(draft.manualFormatInput);
      if (typeof draft.manualFormatName === "string")
        setManualFormatName(draft.manualFormatName);
      if (typeof draft.manualFormatDescription === "string") {
        setManualFormatDescription(draft.manualFormatDescription);
      }
      if (typeof draft.brandRules === "string") setBrandRules(draft.brandRules);
      if (typeof draft.description === "string")
        setBriefDescription(draft.description);
      if (typeof draft.driveUrl === "string") setDriveUrl(draft.driveUrl);
      if (typeof draft.visualReferenceUrl === "string")
        setVisualReferenceUrl(draft.visualReferenceUrl);
      if (
        draft.priority === "low" ||
        draft.priority === "medium" ||
        draft.priority === "high"
      ) {
        setPriority(draft.priority);
      }
      if (
        ["standard", "rush", "extended", "custom"].includes(
          draft.deadlinePreset ?? "",
        )
      ) {
        setDeadlinePreset(draft.deadlinePreset as DeadlinePreset);
      }
      if (typeof draft.customDueDate === "string")
        setCustomDueDate(draft.customDueDate);
      toast.success(t("creativeBrief.draftRestored"));
    } catch {
      localStorage.removeItem(`${DRAFT_PREFIX}.${projectId}`);
    } finally {
      setDraftLoaded(true);
    }
  }, [projectId, t]);

  const formDraft = (): DraftState => ({
    designerIds,
    companyId,
    videoSizes,
    formats,
    manualVideoInput,
    manualVideoWidth,
    manualVideoHeight,
    manualVideoUnit,
    manualFormatInput,
    manualFormatName,
    manualFormatDescription,
    brandRules,
    description: briefDescription,
    driveUrl,
    visualReferenceUrl,
    priority,
    deadlinePreset,
    customDueDate,
  });

  const saveDraft = () => {
    try {
      localStorage.setItem(
        `${DRAFT_PREFIX}.${projectId}`,
        JSON.stringify(formDraft()),
      );
      toast.success(
        referenceFile || driveFiles.length > 0
          ? t("creativeBrief.draftSavedWithFileNote")
          : t("creativeBrief.draftSaved"),
      );
    } catch {
      toast.error(t("creativeBrief.draftSaveFailed"));
    }
  };

  const saveDesignerRoster = async () => {
    if (designerSetupIds.length === 0) {
      toast.error(t("creativeBrief.setupDesignersRequired"));
      return;
    }

    setSavingDesignerRoster(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/creative-designers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_ids: designerSetupIds }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error || t("creativeBrief.setupDesignersFailed"),
        );
      }

      await onDesignerRosterConfigured();
      setDesignerIds(designerSetupIds);
      setDesignerSetupOpen(false);
      toast.success(t("creativeBrief.setupDesignersSaved"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("creativeBrief.setupDesignersFailed"),
      );
    } finally {
      setSavingDesignerRoster(false);
    }
  };

  const handleVideoSizeSelection = (nextValues: string[]) => {
    const selectedPresets = nextValues.filter((value) =>
      VIDEO_SIZES.includes(value),
    );
    const selectedManual = nextValues.includes(MANUAL_VIDEO_SIZE);

    if (selectedManual && !manualVideoInput) {
      setManualVideoInput(true);
      setVideoSizes([]);
      return;
    }
    if (selectedPresets.length > 0) {
      setManualVideoInput(false);
      setVideoSizes(selectedPresets);
      return;
    }

    setManualVideoInput(false);
    setVideoSizes([]);
  };

  const handleFormatSelection = (nextValues: string[]) => {
    const selectedPresets = nextValues.filter((value) =>
      FORMAT_VALUES.some((option) => option.value === value),
    );
    const selectedManual = nextValues.includes(MANUAL_FORMAT);

    if (selectedManual && !manualFormatInput) {
      setManualFormatInput(true);
      setFormats([]);
      return;
    }
    if (selectedPresets.length > 0) {
      setManualFormatInput(false);
      setFormats(selectedPresets);
      return;
    }

    setManualFormatInput(false);
    setFormats([]);
  };

  const isValidCreativeFile = (file: File) => {
    if (!isSupportedCreativeFile(file)) {
      toast.error(t("creativeBrief.fileTypeError"));
      return false;
    }
    if (file.size === 0 || file.size > MAX_REFERENCE_BYTES) {
      toast.error(t("creativeBrief.fileSizeError"));
      return false;
    }
    return true;
  };

  const chooseReferenceFile = (file: File | undefined) => {
    if (!file || !isValidCreativeFile(file)) return;
    setReferenceFile(file);
  };

  const addDriveFiles = (files: FileList | File[]) => {
    const candidates = Array.from(files).filter((file) =>
      isValidCreativeFile(file),
    );
    const seen = new Set(driveFiles.map(fileKey));
    const additions = candidates.filter((file) => {
      const key = fileKey(file);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const remaining = Math.max(0, MAX_DRIVE_FILES - driveFiles.length);
    if (additions.length > remaining) {
      toast.error(
        t("creativeBrief.driveFileLimit", { count: MAX_DRIVE_FILES }),
      );
    }
    if (remaining > 0 && additions.length > 0) {
      setDriveFiles((current) => [
        ...current,
        ...additions.slice(0, remaining),
      ]);
    }
  };

  const onDriveFilesInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addDriveFiles(event.target.files);
    event.target.value = "";
  };

  const onDriveFilesDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDraggingDriveFiles(false);
    addDriveFiles(event.dataTransfer.files);
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    chooseReferenceFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const onReferenceDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDraggingReference(false);
    chooseReferenceFile(event.dataTransfer.files?.[0]);
  };

  const uploadCreativeAsset = async (
    taskId: string,
    file: File,
    assetRole: "reference" | "drive_file",
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("asset_role", assetRole);
    const uploadResponse = await fetch(
      `/api/tasks/${taskId}/creative-reference`,
      {
        method: "POST",
        body: formData,
      },
    );
    const uploaded = (await uploadResponse.json().catch(() => ({}))) as {
      reference?: string;
      file_name?: string;
      error?: string;
    };
    if (!uploadResponse.ok || !uploaded.reference) {
      throw new Error(
        uploaded.error || t("creativeBrief.attachmentUploadFailed"),
      );
    }
    return {
      fileName: uploaded.file_name ?? file.name,
      reference: uploaded.reference,
    };
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!primaryDesigner) {
      toast.error(t("creativeBrief.designerRequired"));
      return;
    }
    if (manualVideoInput && !manualVideoResult) {
      toast.error(t("creativeBrief.manualVideoRequired"));
      return;
    }
    if (!manualVideoInput && videoSizes.length === 0) {
      toast.error(t("creativeBrief.videoSizeRequired"));
      return;
    }
    if (
      manualFormatInput &&
      (!trimmedManualFormatName || !manualFormatDescription.trim())
    ) {
      toast.error(t("creativeBrief.manualFormatRequired"));
      return;
    }
    if (!manualFormatInput && selectedFormats.length === 0) {
      toast.error(t("creativeBrief.formatRequired"));
      return;
    }
    if (!dueDate) {
      toast.error(t("creativeBrief.deadlineRequired"));
      return;
    }
    if (driveUrl.trim() && !isHttpUrl(driveUrl.trim())) {
      toast.error(t("creativeBrief.invalidDriveUrl"));
      return;
    }
    if (visualReferenceUrl.trim() && !isHttpUrl(visualReferenceUrl.trim())) {
      toast.error(t("creativeBrief.invalidReferenceUrl"));
      return;
    }

    setSubmitting(true);
    try {
      const descriptionInput = {
        designerNames: selectedDesigners.map((designer) => designer.name),
        requesterName,
        brandName: selectedCompany?.name ?? "",
        videoSizes: resolvedVideoSizes,
        formats: resolvedFormats,
        formatDescription: manualFormatInput
          ? manualFormatDescription.trim()
          : undefined,
        brandRules,
        description: briefDescription,
        driveUrl,
        visualReferenceUrl,
        priority,
        dueDate,
        estimatedHours,
      };
      const description = buildCreativeBriefingDescription(
        {
          ...descriptionInput,
          driveFiles: driveFiles.map((file) => ({ name: file.name })),
          referenceFileName: referenceFile?.name,
        },
        language,
      );
      const createResponse = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: buildCreativeBriefingTitle(
            selectedCompany?.name ?? "",
            resolvedFormats.join(", "),
            language,
          ),
          description,
          status: "todo",
          priority,
          project_id: projectId,
          company_id: selectedCompany?.id ?? null,
          assignee_id: primaryDesigner.id,
          due_date: dueDate,
        }),
      });
      const created = (await createResponse
        .json()
        .catch(() => ({}))) as Task & { error?: string };
      if (!createResponse.ok || !created.id) {
        throw new Error(created.error || t("creativeBrief.submitFailed"));
      }

      let attachmentsUploadFailed = false;
      const uploadedDriveFiles = await Promise.all(
        driveFiles.map(async (file) => {
          try {
            return await uploadCreativeAsset(created.id, file, "drive_file");
          } catch {
            attachmentsUploadFailed = true;
            return null;
          }
        }),
      );
      let uploadedReference: { fileName: string; reference: string } | null =
        null;
      if (referenceFile) {
        try {
          uploadedReference = await uploadCreativeAsset(
            created.id,
            referenceFile,
            "reference",
          );
        } catch {
          attachmentsUploadFailed = true;
        }
      }

      if (
        uploadedReference ||
        uploadedDriveFiles.some((file) => file !== null)
      ) {
        try {
          const updatedDescription = buildCreativeBriefingDescription(
            {
              ...descriptionInput,
              driveFiles: driveFiles.map((file, index) => ({
                name: uploadedDriveFiles[index]?.fileName ?? file.name,
                url: uploadedDriveFiles[index]?.reference,
              })),
              referenceFileName:
                uploadedReference?.fileName ?? referenceFile?.name,
              referenceFileUrl: uploadedReference?.reference,
            },
            language,
          );
          const patchResponse = await fetch(`/api/tasks/${created.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: updatedDescription }),
          });
          if (!patchResponse.ok)
            throw new Error(t("creativeBrief.attachmentUploadFailed"));
        } catch {
          attachmentsUploadFailed = true;
        }
      }

      localStorage.removeItem(`${DRAFT_PREFIX}.${projectId}`);
      setCompanyId("");
      setVideoSizes([VIDEO_SIZES[2]]);
      setFormats(["carousel"]);
      setManualVideoInput(false);
      setManualVideoWidth("");
      setManualVideoHeight("");
      setManualVideoUnit("px");
      setManualFormatInput(false);
      setManualFormatName("");
      setManualFormatDescription("");
      setBrandRules("");
      setBriefDescription("");
      setDriveUrl("");
      setDriveFiles([]);
      setVisualReferenceUrl("");
      setPriority("medium");
      setDeadlinePreset("standard");
      setCustomDueDate("");
      setReferenceFile(null);
      await onCreated(created);
      toast.success(t("creativeBrief.submitted"));
      if (attachmentsUploadFailed)
        toast.error(t("creativeBrief.submittedAttachmentsFailed"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("creativeBrief.submitFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#0d4b8f] bg-[#010814] p-2 text-slate-100 shadow-[0_20px_65px_rgba(0,8,28,0.55)] sm:p-3">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(51,128,255,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(51,128,255,0.09) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 top-20 h-56 w-56 rounded-full border border-blue-400/20"
      />
      <form
        onSubmit={submit}
        className="relative mx-auto max-w-[1200px] overflow-hidden rounded-xl border border-[#123f78] bg-[linear-gradient(145deg,rgba(3,14,33,0.98),rgba(2,10,24,0.98))] shadow-[0_0_52px_rgba(18,96,214,0.16)]"
      >
        <header className="grid gap-6 border-b border-[#163d70] px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_264px] lg:items-center lg:px-10 lg:py-6">
          <div className="flex min-w-0 items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#1780ff] bg-[#06265a] shadow-[0_0_28px_rgba(36,132,255,0.38)]">
              <FileText className="h-8 w-8 text-[#39a0ff]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-normal text-white sm:text-[32px]">
                {t("creativeBrief.title")}
              </h1>
              <p className="mt-1 text-base text-[#d7e5fb]">
                {t("creativeBrief.subtitle")}
              </p>
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#356eff] font-semibold text-white">
                  {getInitials(requesterName)}
                </span>
                <span className="text-[#76b2ff]">
                  {t("creativeBrief.requester")}:
                </span>
                <span className="font-semibold text-white">{requesterName}</span>
              </div>
            </div>
          </div>
          <aside className="rounded-xl border border-[#214b80] bg-[#07152a]/80 px-5 py-4 shadow-[inset_0_1px_0_rgba(143,199,255,0.06)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#58a6ff]">
              <Sparkles className="h-4 w-4" />
              {t("creativeBrief.tips")}
            </div>
            <p className="mt-2 text-sm leading-6 text-[#e1ebfb]">
              {t("creativeBrief.tipsCopy")}
            </p>
          </aside>
        </header>

        <div className="grid gap-3 p-3 sm:p-5 lg:grid-cols-2">
          <section className="rounded-xl border border-[#183a66] bg-[linear-gradient(145deg,rgba(8,22,45,0.92),rgba(5,16,33,0.92))] p-4 sm:p-5">
            <BriefingSectionHeading
              step="1"
              title={t("creativeBrief.designer")}
              description={t("creativeBrief.chooseDesigners")}
            />
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ca5ca]" />
              <input
                type="search"
                value={designerSearch}
                onChange={(event) => setDesignerSearch(event.target.value)}
                disabled={submitting || designerUsers.length === 0}
                placeholder={t("creativeBrief.searchDesigners")}
                className="h-10 w-full rounded-lg border border-[#2a5f9f] bg-[#09192f] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-[#7588a6] focus:border-[#3692ff] focus:ring-2 focus:ring-[#1879ff]/25 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            {designerUsers.length > 0 ? (
              <div className="mt-3 grid gap-2 rounded-xl border border-[#1b3e6b] bg-[#07162a]/80 p-3 sm:grid-cols-2">
                {filteredDesignerUsers.map((designer) => {
                  const selected = designerIds.includes(designer.id);
                  const isOwner = selected && primaryDesigner?.id === designer.id;
                  return (
                    <label
                      key={designer.id}
                      className={cn(
                        "group flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm transition",
                        selected
                          ? "bg-[#0b2e66] text-white"
                          : "text-[#e1ecff] hover:bg-[#10284a]",
                        submitting && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selected}
                        disabled={submitting}
                        onChange={() =>
                          setDesignerIds((current) =>
                            toggleMultiSelectValue(current, designer.id),
                          )
                        }
                      />
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition",
                          selected
                            ? "border-[#55a9ff] bg-[#247bfd] text-white shadow-[0_0_12px_rgba(40,129,255,0.55)]"
                            : "border-[#526c91] bg-[#0b192b] text-transparent group-hover:border-[#78aaff]",
                        )}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#586276] bg-[#1e2430] text-[10px] font-semibold text-white">
                        {getInitials(designer.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {designer.name}
                      </span>
                      {isOwner ? (
                        <span className="rounded-full border border-[#177fff] bg-[#0b2e66] px-2 py-0.5 text-[11px] font-semibold text-[#74bbff]">
                          {t("creativeBrief.owner")}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
                {filteredDesignerUsers.length === 0 ? (
                  <p className="col-span-full px-2 py-3 text-sm text-[#9bb2d6]">
                    {t("creativeBrief.noDesignerMatches")}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-amber-400/35 bg-amber-400/5 p-4">
                <p className="text-sm text-amber-200">
                  {canConfigureDesignerRoster
                    ? t("creativeBrief.noDesignersAdmin")
                    : t("creativeBrief.noDesigners")}
                </p>
                {canConfigureDesignerRoster ? (
                  <div className="mt-3">
                    {!designerSetupOpen ? (
                      <button
                        type="button"
                        onClick={() => setDesignerSetupOpen(true)}
                        disabled={submitting}
                        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#5ca4ff] bg-[#0b2d61] px-3 text-xs font-semibold text-white transition hover:bg-[#123d7d] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <UsersRound className="h-4 w-4" />
                        {t("creativeBrief.setupDesigners")}
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-[#c3d3ef]">
                          {t("creativeBrief.setupDesignersDescription")}
                        </p>
                        <MultiSelectField
                          values={designerSetupIds}
                          onChange={setDesignerSetupIds}
                          disabled={savingDesignerRoster}
                          options={users.map((user) => ({
                            value: user.id,
                            label: user.name,
                          }))}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setDesignerSetupOpen(false)}
                            disabled={savingDesignerRoster}
                            className="min-h-9 rounded-md border border-[#486b9f] px-3 text-xs font-semibold text-[#d7e5ff] transition hover:bg-[#10284c] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {t("common.cancel")}
                          </button>
                          <button
                            type="button"
                            onClick={saveDesignerRoster}
                            disabled={
                              savingDesignerRoster ||
                              designerSetupIds.length === 0
                            }
                            className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[#1767e8] px-3 text-xs font-semibold text-white transition hover:bg-[#2b7df4] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingDesignerRoster ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UsersRound className="h-3.5 w-3.5" />
                            )}
                            {t("creativeBrief.setupDesignersSave")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#b8c9e5]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#4c9cff]" />
              {t("creativeBrief.designerHint")}
            </p>
          </section>
          <section className="rounded-xl border border-[#183a66] bg-[linear-gradient(145deg,rgba(8,22,45,0.92),rgba(5,16,33,0.92))] p-4 sm:p-5">
            <BriefingSectionHeading
              step="2"
              title={t("creativeBrief.brand")}
              description={t("creativeBrief.brandHelp")}
            />
            <div className="relative mt-4">
              <Building2 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#91a9cc]" />
              <input
                type="search"
                value={brandSearch}
                onFocus={() => setBrandPickerOpen(true)}
                onChange={(event) => {
                  setBrandSearch(event.target.value);
                  setBrandPickerOpen(true);
                  if (selectedCompany?.name !== event.target.value) {
                    setCompanyId("");
                  }
                }}
                disabled={submitting || companiesLoading}
                placeholder={
                  companiesLoading
                    ? t("common.loading")
                    : t("creativeBrief.searchBrand")
                }
                className="h-10 w-full rounded-lg border border-[#2a5f9f] bg-[#09192f] pl-11 pr-11 text-sm text-white outline-none transition placeholder:text-[#7588a6] focus:border-[#3692ff] focus:ring-2 focus:ring-[#1879ff]/25 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <ChevronDown className="upflow-select-chevron pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-[#aac1e1]" />
              {brandPickerOpen && !companiesLoading ? (
                <div className="absolute z-20 mt-2 max-h-48 w-full overflow-y-auto rounded-lg border border-[#2c5d98] bg-[#07162c] p-1 shadow-[0_14px_30px_rgba(0,0,0,0.34)]">
                  {filteredCompanies.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => selectCompany(company)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-[#123260]",
                        company.id === companyId
                          ? "bg-[#123260] text-white"
                          : "text-[#c9d9f0]",
                      )}
                    >
                      <Building2 className="h-4 w-4 shrink-0 text-[#5ba8ff]" />
                      <span className="truncate">{company.name}</span>
                      {company.id === companyId ? (
                        <CheckCircle2 className="ml-auto h-4 w-4 text-[#50a8ff]" />
                      ) : null}
                    </button>
                  ))}
                  {filteredCompanies.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-[#9ab0cf]">
                      {t("creativeBrief.noBrands")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {!companiesLoading && recentCompanies.length > 0 ? (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a4b8d8]">
                  {t("creativeBrief.recentBrands")}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {recentCompanies.map((company) => {
                    const selected = company.id === companyId;
                    return (
                      <button
                        key={company.id}
                        type="button"
                        onClick={() => selectCompany(company)}
                        className={cn(
                          "flex min-h-16 items-center gap-2 rounded-lg border px-2.5 text-left transition",
                          selected
                            ? "border-[#2c87ff] bg-[#0d3065] shadow-[0_0_16px_rgba(32,124,255,0.22)]"
                            : "border-[#1c3e68] bg-[#0a192e] hover:border-[#3974ba] hover:bg-[#0e2547]",
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#121d30] text-[#74b9ff]">
                          <Building2 className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-white">
                            {company.name}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[#a3b8d8]">
                            {t("creativeBrief.brandCardLabel")}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setBrandPickerOpen((current) => !current)}
                    className="flex min-h-16 items-center justify-center gap-2 rounded-lg border border-[#1c3e68] bg-[#0a192e] text-xs font-semibold text-[#a8d0ff] transition hover:border-[#3974ba] hover:bg-[#0e2547]"
                  >
                    <Plus className="h-4 w-4" />
                    {t("creativeBrief.viewAll")}
                  </button>
                </div>
              </div>
            ) : null}

            <Link
              href="/clients"
              className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-[#237eea] bg-[#08204a]/45 px-4 text-sm font-semibold text-[#54a9ff] transition hover:bg-[#0b2e63]"
            >
              <Plus className="h-4 w-4" />
              {t("creativeBrief.createBrand")}
            </Link>
            <div className="mt-3 flex gap-3 rounded-xl border border-[#1c3e68] bg-[#0a192e] px-4 py-3">
              <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-[#f6ba35]" />
              <div>
                <p className="text-sm font-semibold text-white">
                  {t("creativeBrief.reminder")}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-[#b7c9e4]">
                  {t("creativeBrief.createBrandHint")}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[#183a66] bg-[linear-gradient(145deg,rgba(8,22,45,0.92),rgba(5,16,33,0.92))] p-4 sm:p-5">
            <BriefingSectionHeading
              step="3"
              title={t("creativeBrief.videoSize")}
              description={t("creativeBrief.videoSizeHelp")}
            />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {VIDEO_SIZES.map((size) => {
                const [ratio, dimensions] = size.split(" - ");
                const selected = !manualVideoInput && videoSizes.includes(size);
                return (
                  <button
                    key={size}
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      handleVideoSizeSelection(
                        selected
                          ? videoSizes.filter((value) => value !== size)
                          : [...videoSizes, size],
                      )
                    }
                    aria-pressed={selected}
                    className={cn(
                      "relative flex min-h-28 flex-col items-center justify-center rounded-xl border px-2 py-3 text-center transition",
                      selected
                        ? "border-[#2688ff] bg-[#0b2e66] shadow-[0_0_22px_rgba(30,125,255,0.25)]"
                        : "border-[#1f426e] bg-[#0a192e] hover:border-[#3c76bc] hover:bg-[#102747]",
                      submitting && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-3 top-3 flex h-5 w-5 items-center justify-center rounded border",
                        selected
                          ? "border-[#5db0ff] bg-[#2277f7] text-white"
                          : "border-[#526d91] bg-[#0b192b] text-transparent",
                      )}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <ImageIcon className="h-7 w-7 text-[#82b9ff]" />
                    <span className="mt-2 text-base font-bold text-white">{ratio}</span>
                    <span className="mt-1 text-xs text-[#c4d5ed]">{dimensions}</span>
                  </button>
                );
              })}
            </div>

            <div
              className={cn(
                "mt-3 rounded-xl border p-3 transition",
                manualVideoInput
                  ? "border-[#2589ff] bg-[#0b2e66]/70"
                  : "border-[#1f426e] bg-[#0a192e]",
              )}
            >
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  handleVideoSizeSelection(
                    manualVideoInput ? [] : [MANUAL_VIDEO_SIZE],
                  )
                }
                aria-pressed={manualVideoInput}
                className="flex w-full items-center gap-3 text-left"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                    manualVideoInput
                      ? "border-[#5db0ff] bg-[#2277f7] text-white"
                      : "border-[#526d91] bg-[#0b192b] text-transparent",
                  )}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">
                    {t("creativeBrief.manualInput")}
                  </span>
                  <span className="mt-0.5 block text-xs text-[#b7c9e4]">
                    {t("creativeBrief.manualVideoInstruction")}
                  </span>
                </span>
              </button>
              {manualVideoInput ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr_1fr] sm:items-end">
                  <label className="block text-xs font-medium text-[#b7c9e4]">
                    {t("creativeBrief.width")}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={manualVideoWidth}
                      onChange={(event) => setManualVideoWidth(event.target.value)}
                      disabled={submitting}
                      placeholder="1080"
                      className="mt-1.5 h-11 w-full rounded-lg border border-[#355d94] bg-[#0b1a30] px-3 text-sm text-white outline-none transition placeholder:text-[#7c91af] focus:border-[#4f9aff] focus:ring-2 focus:ring-[#2679ff]/25"
                    />
                  </label>
                  <span className="hidden pb-3 text-[#9db7dc] sm:block">x</span>
                  <label className="block text-xs font-medium text-[#b7c9e4]">
                    {t("creativeBrief.height")}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={manualVideoHeight}
                      onChange={(event) => setManualVideoHeight(event.target.value)}
                      disabled={submitting}
                      placeholder="1920"
                      className="mt-1.5 h-11 w-full rounded-lg border border-[#355d94] bg-[#0b1a30] px-3 text-sm text-white outline-none transition placeholder:text-[#7c91af] focus:border-[#4f9aff] focus:ring-2 focus:ring-[#2679ff]/25"
                    />
                  </label>
                  <label className="block text-xs font-medium text-[#b7c9e4]">
                    {t("creativeBrief.unit")}
                    <select
                      value={manualVideoUnit}
                      onChange={(event) =>
                        setManualVideoUnit(
                          event.target.value as CreativeBriefingDimensionUnit,
                        )
                      }
                      disabled={submitting}
                      className="mt-1.5 h-11 w-full rounded-lg border border-[#355d94] bg-[#0b1a30] px-3 text-sm text-white outline-none transition focus:border-[#4f9aff] focus:ring-2 focus:ring-[#2679ff]/25"
                    >
                      {DIMENSION_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="sm:col-span-4 text-xs text-[#a7bddc]" aria-live="polite">
                    {manualVideoResult
                      ? t("creativeBrief.manualDimensionResult") + ": " + manualVideoResult
                      : t("creativeBrief.manualUnitHint")}
                  </p>
                </div>
              ) : null}
            </div>
          </section>
          <section className="rounded-xl border border-[#183a66] bg-[linear-gradient(145deg,rgba(8,22,45,0.92),rgba(5,16,33,0.92))] p-4 sm:p-5">
            <BriefingSectionHeading
              step="4"
              title={t("creativeBrief.format")}
              description={t("creativeBrief.formatHelp")}
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {formatOptions.map((option) => {
                const Icon = option.icon;
                const selected = !manualFormatInput && formats.includes(option.value);
                const descriptionKey =
                  option.value === "carousel"
                    ? "creativeBrief.formatCarouselDescription"
                    : option.value === "banner"
                      ? "creativeBrief.formatBannerDescription"
                      : option.value === "single_image"
                        ? "creativeBrief.formatSingleImageDescription"
                        : "creativeBrief.formatVideoEditDescription";
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      handleFormatSelection(
                        selected
                          ? formats.filter((value) => value !== option.value)
                          : [...formats, option.value],
                      )
                    }
                    aria-pressed={selected}
                    className={cn(
                      "relative flex min-h-[94px] items-center gap-3 rounded-xl border p-3 text-left transition",
                      selected
                        ? "border-[#2688ff] bg-[#0b2e66] shadow-[0_0_22px_rgba(30,125,255,0.22)]"
                        : "border-[#1f426e] bg-[#0a192e] hover:border-[#3c76bc] hover:bg-[#102747]",
                      submitting && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-3 top-3 flex h-5 w-5 items-center justify-center rounded border",
                        selected
                          ? "border-[#5db0ff] bg-[#2277f7] text-white"
                          : "border-[#526d91] bg-[#0b192b] text-transparent",
                      )}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <Icon className="ml-7 h-8 w-8 shrink-0 text-[#8fc4ff]" />
                    <span>
                      <span className="block text-sm font-semibold text-white">
                        {option.label}
                      </span>
                      <span className="mt-1 block max-w-[19ch] text-xs leading-4 text-[#c5d6ed]">
                        {t(descriptionKey)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              className={cn(
                "mt-2 rounded-xl border p-3 transition",
                manualFormatInput
                  ? "border-[#2589ff] bg-[#0b2e66]/70"
                  : "border-[#1f426e] bg-[#0a192e]",
              )}
            >
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  handleFormatSelection(
                    manualFormatInput ? [] : [MANUAL_FORMAT],
                  )
                }
                aria-pressed={manualFormatInput}
                className="flex w-full items-center gap-3 text-left"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                    manualFormatInput
                      ? "border-[#5db0ff] bg-[#2277f7] text-white"
                      : "border-[#526d91] bg-[#0b192b] text-transparent",
                  )}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">
                    {t("creativeBrief.manualInput")}
                  </span>
                  <span className="mt-0.5 block text-xs text-[#b7c9e4]">
                    {t("creativeBrief.manualFormatInstruction")}
                  </span>
                </span>
              </button>
              {manualFormatInput ? (
                <div className="mt-3 grid gap-2">
                  <input
                    type="text"
                    value={manualFormatName}
                    onChange={(event) => setManualFormatName(event.target.value)}
                    disabled={submitting}
                    maxLength={120}
                    placeholder={t("creativeBrief.manualFormatNamePlaceholder")}
                    className="h-10 w-full rounded-lg border border-[#355d94] bg-[#0b1a30] px-3 text-sm text-white outline-none transition placeholder:text-[#7c91af] focus:border-[#4f9aff] focus:ring-2 focus:ring-[#2679ff]/25"
                  />
                  <textarea
                    value={manualFormatDescription}
                    onChange={(event) =>
                      setManualFormatDescription(event.target.value)
                    }
                    disabled={submitting}
                    maxLength={600}
                    placeholder={t(
                      "creativeBrief.manualFormatDescriptionPlaceholder",
                    )}
                    className="min-h-16 w-full resize-y rounded-lg border border-[#355d94] bg-[#0b1a30] px-3 py-2 text-sm text-white outline-none transition placeholder:text-[#7c91af] focus:border-[#4f9aff] focus:ring-2 focus:ring-[#2679ff]/25"
                  />
                </div>
              ) : null}
            </div>
          </section>

          <section className="lg:col-span-2 rounded-xl border border-[#183a66] bg-[linear-gradient(145deg,rgba(8,22,45,0.92),rgba(5,16,33,0.92))] p-4 sm:p-5">
            <BriefingSectionHeading
              step="5"
              title={t("creativeBrief.brandRules")}
              description={t("creativeBrief.brandRulesHelp")}
            />
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              <div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={() => setDraggingReference(true)}
                  onDragLeave={() => setDraggingReference(false)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={onReferenceDrop}
                  className={cn(
                    "flex min-h-36 w-full flex-col items-center justify-center rounded-lg border border-dashed px-5 py-5 text-center transition",
                    draggingReference
                      ? "border-[#4b9bff] bg-[#0d326c]"
                      : "border-[#237eea] bg-[#06182f] hover:border-[#63afff] hover:bg-[#0a2347]",
                    submitting && "cursor-not-allowed opacity-60",
                  )}
                >
                  <Upload className="h-9 w-9 text-[#368cff]" />
                  <span className="mt-3 text-sm font-semibold text-white">
                    {t("creativeBrief.uploadDropTitle")}
                  </span>
                  <span className="mt-1 text-xs text-[#7fc0ff]">
                    {t("creativeBrief.uploadDropOr")}
                  </span>
                  <span className="mt-2 text-xs text-[#b9cae3]">
                    {t("creativeBrief.uploadDropTypes")}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  className="hidden"
                  onChange={onFileInput}
                />
                {referenceFile ? (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#315c94] bg-[#081a34] px-3 py-2 text-sm text-[#d7e5ff]">
                    <Paperclip className="h-4 w-4 shrink-0 text-[#75adff]" />
                    <span className="min-w-0 flex-1 truncate">
                      {referenceFile.name}
                    </span>
                    <span className="shrink-0 text-xs text-[#9eb7dd]">
                      {Math.ceil(referenceFile.size / 1024)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => setReferenceFile(null)}
                      className="rounded p-1 text-[#b4c9e9] transition hover:bg-white/10 hover:text-white"
                      aria-label={t("creativeBrief.removeFile")}
                      title={t("creativeBrief.removeFile")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-semibold text-white">
                  {t("creativeBrief.quickNotes")}
                </label>
                <p className="mt-1 text-xs leading-5 text-[#b9cae3]">
                  {t("creativeBrief.quickNotesHelp")}
                </p>
                <textarea
                  value={brandRules}
                  onChange={(event) => setBrandRules(event.target.value)}
                  disabled={submitting}
                  placeholder={t("creativeBrief.brandRulesPlaceholder")}
                  className="mt-3 min-h-36 w-full resize-y rounded-lg border border-[#355d94] bg-[#0b1a30] px-3 py-3 text-sm text-white outline-none transition placeholder:text-[#7c91af] focus:border-[#4f9aff] focus:ring-2 focus:ring-[#2679ff]/25"
                />
              </div>
            </div>
            {referencePreviewSource ? (
              <figure className="mt-4 overflow-hidden rounded-lg border border-[#315c94] bg-[#06162d]">
                <div className="flex items-center justify-between gap-3 border-b border-[#2d568c] px-3 py-2">
                  <figcaption className="text-xs font-semibold text-[#d7e5ff]">
                    {t("creativeBrief.visualPreview")}
                  </figcaption>
                  {referenceImagePreview ? (
                    <span className="text-xs text-[#9eb7dd]">
                      {referenceFile?.name}
                    </span>
                  ) : null}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={referencePreviewSource}
                  alt={t("creativeBrief.visualPreview")}
                  onError={() => {
                    if (!referenceImagePreview) setReferenceUrlPreviewFailed(true);
                  }}
                  className="max-h-72 w-full bg-[#020a1b] object-contain"
                />
              </figure>
            ) : null}
          </section>
          <details className="lg:col-span-2 rounded-xl border border-[#183a66] bg-[#06152b]/75">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#cfe3ff] [&::-webkit-details-marker]:hidden">
              <span>{t("creativeBrief.additionalDetails")}</span>
              <ArrowRight className="h-4 w-4 text-[#61aaff]" />
            </summary>
            <div className="grid gap-4 border-t border-[#183a66] p-4 lg:grid-cols-2">
              <label className="block text-sm font-semibold text-white">
                {t("creativeBrief.description")}
                <textarea
                  value={briefDescription}
                  onChange={(event) => setBriefDescription(event.target.value)}
                  disabled={submitting}
                  placeholder={t("creativeBrief.descriptionPlaceholder")}
                  className="mt-2 min-h-28 w-full resize-y rounded-lg border border-[#355d94] bg-[#0b1a30] px-3 py-3 text-sm text-white outline-none transition placeholder:text-[#7c91af] focus:border-[#4f9aff] focus:ring-2 focus:ring-[#2679ff]/25"
                />
              </label>
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-white">
                  {t("creativeBrief.driveUrl")}
                  <span className="relative mt-2 block">
                    <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#96b7e8]" />
                    <input
                      type="url"
                      value={driveUrl}
                      onChange={(event) => setDriveUrl(event.target.value)}
                      disabled={submitting}
                      placeholder="https://"
                      className="h-10 w-full rounded-lg border border-[#355d94] bg-[#0b1a30] pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-[#7c91af] focus:border-[#4f9aff] focus:ring-2 focus:ring-[#2679ff]/25"
                    />
                  </span>
                </label>
                <div>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => driveFileInputRef.current?.click()}
                    onDragEnter={() => setDraggingDriveFiles(true)}
                    onDragLeave={() => setDraggingDriveFiles(false)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={onDriveFilesDrop}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-sm font-semibold transition",
                      draggingDriveFiles
                        ? "border-[#5ca0ff] bg-[#10366b]/70"
                        : "border-[#3b679e] bg-[#06162d] text-[#d9e8ff] hover:border-[#5ca0ff] hover:bg-[#0b2144]",
                      submitting && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Upload className="h-4 w-4 text-[#89b4f5]" />
                    {t("creativeBrief.driveUpload")}
                  </button>
                  <input
                    ref={driveFileInputRef}
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,application/pdf"
                    className="hidden"
                    onChange={onDriveFilesInput}
                  />
                  {driveFiles.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {driveFiles.map((file) => (
                        <li
                          key={fileKey(file)}
                          className="flex items-center gap-2 rounded-lg border border-[#315c94] bg-[#081a34] px-3 py-2 text-sm text-[#d7e5ff]"
                        >
                          <Paperclip className="h-4 w-4 shrink-0 text-[#75adff]" />
                          <span className="min-w-0 flex-1 truncate">
                            {file.name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setDriveFiles((current) =>
                                current.filter(
                                  (candidate) =>
                                    fileKey(candidate) !== fileKey(file),
                                ),
                              )
                            }
                            className="rounded p-1 text-[#b4c9e9] transition hover:bg-white/10 hover:text-white"
                            aria-label={t("creativeBrief.removeFile")}
                            title={t("creativeBrief.removeFile")}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
              <label className="block text-sm font-semibold text-white">
                {t("creativeBrief.visualReference")}
                <span className="relative mt-2 block">
                  <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#96b7e8]" />
                  <input
                    type="url"
                    value={visualReferenceUrl}
                    onChange={(event) => setVisualReferenceUrl(event.target.value)}
                    disabled={submitting}
                    placeholder="https://"
                    className="h-10 w-full rounded-lg border border-[#355d94] bg-[#0b1a30] pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-[#7c91af] focus:border-[#4f9aff] focus:ring-2 focus:ring-[#2679ff]/25"
                  />
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {t("creativeBrief.priority")}
                  </p>
                  <div className="mt-2 grid grid-cols-3 rounded-lg border border-[#355d94] bg-[#0b1a30] p-1">
                    {(["low", "medium", "high"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        disabled={submitting}
                        onClick={() => setPriority(option)}
                        className={cn(
                          "min-h-9 rounded-md px-2 text-xs font-semibold transition",
                          priority === option
                            ? "bg-[#1767e8] text-white"
                            : "text-[#a9bade] hover:bg-[#11284b] hover:text-white",
                        )}
                      >
                        {t("creativeBrief.priority." + option)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {t("creativeBrief.deadline")}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {(["standard", "rush", "extended", "custom"] as const).map(
                      (preset) => (
                        <button
                          key={preset}
                          type="button"
                          disabled={submitting}
                          onClick={() => setDeadlinePreset(preset)}
                          className={cn(
                            "min-h-9 rounded-md border px-2 text-left text-[11px] font-semibold transition",
                            deadlinePreset === preset
                              ? "border-[#4c9cff] bg-[#0b2d61] text-white"
                              : "border-[#385b91] bg-[#07162e] text-[#b8cae8] hover:border-[#5a8ed4]",
                          )}
                        >
                          {t("creativeBrief.deadline." + preset)}
                        </button>
                      ),
                    )}
                  </div>
                  {deadlinePreset === "custom" ? (
                    <BrazilianDateInput
                      value={customDueDate}
                      onChange={setCustomDueDate}
                      disabled={submitting}
                      className="mt-2 h-10 w-full rounded-lg border border-[#355d94] bg-[#0b1a30] px-3 text-sm text-white outline-none transition focus:border-[#4f9aff] focus:ring-2 focus:ring-[#2679ff]/25"
                    />
                  ) : (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-[#9cb4d6]">
                      <Clock3 className="h-3.5 w-3.5" />
                      {dueDateLabel}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </details>
        </div>
        <footer className="sticky bottom-0 flex flex-col gap-3 border-t border-[#163d70] bg-[#041126]/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <button
            type="button"
            onClick={saveDraft}
            disabled={submitting || !draftLoaded}
            className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-[#314d77] bg-[#07162c] px-4 text-sm font-semibold text-white transition hover:border-[#6295d2] hover:bg-[#0c284f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Bookmark className="h-4 w-4 text-[#a8c6f0]" />
            {t("creativeBrief.saveDraft")}
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => window.history.back()}
              disabled={submitting}
              className="min-h-10 rounded-lg border border-[#314d77] bg-[#07162c] px-5 text-sm font-semibold text-[#e5efff] transition hover:border-[#6295d2] hover:bg-[#0c284f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                companiesLoading ||
                designerUsers.length === 0
              }
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#65afff] bg-[#1d72f0] px-5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(37,122,255,0.45)] transition hover:bg-[#3184fb] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t("creativeBrief.reviewAndSend")}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function BriefingSectionHeading({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#287bf5] text-sm font-bold text-white shadow-[0_0_16px_rgba(39,126,255,0.45)]">
          {step}
        </span>
        <h2 className="text-base font-bold text-white">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-[#b8c9e5]">{description}</p>
    </div>
  );
}

function getInitials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();
}

function toggleMultiSelectValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((selectedValue) => selectedValue !== value)
    : [...values, value];
}

function MultiSelectField({
  values,
  onChange,
  options,
  disabled,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="max-h-48 overflow-y-auto rounded-lg border border-[#385b91] bg-[#07162e] p-2">
      <div className="grid gap-1 sm:grid-cols-2">
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                selected
                  ? "bg-[#0b2d61] text-white"
                  : "text-[#c6d6ee] hover:bg-[#10284c]",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="checkbox"
                checked={selected}
                disabled={disabled}
                onChange={() =>
                  onChange(toggleMultiSelectValue(values, option.value))
                }
                className="h-4 w-4 shrink-0 rounded border-[#5b7faf] bg-[#041126] text-[#3e88ff] focus:ring-2 focus:ring-[#2679ff]/45"
              />
              <span className="min-w-0 break-words font-medium">
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  placeholder,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-[52px] w-full appearance-none rounded-lg border border-[#385b91] bg-[#07162e] px-4 pr-11 text-base text-white outline-none transition focus:border-[#4f95ff] focus:ring-2 focus:ring-[#2679ff]/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="upflow-select-chevron pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 text-[#a8bee3]" />
    </div>
  );
}
