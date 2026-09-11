import { expect, test } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { apiAs, loginAs, SEEDED, uniq } from "./helpers";

test("Marketing B2B form opens from the replacement task and persists edits", async ({
  baseURL,
  page,
}) => {
  expect(baseURL).toBeTruthy();
  const api = await apiAs(baseURL!, SEEDED.admin.email);
  const memberApi = await apiAs(baseURL!, SEEDED.member.email);

  try {
    const companyResponse = await api.post("/api/companies", {
      data: {
        name: uniq("B2B functional company"),
        start_onboarding: false,
      },
    });
    expect(
      companyResponse.ok(),
      `company creation failed: ${companyResponse.status()} ${await companyResponse.text()}`,
    ).toBeTruthy();
    const company = (await companyResponse.json()) as { id: string; name: string };

    const createProject = async (name: string) => {
      const response = await api.post("/api/projects", {
        data: { name, company_id: company.id },
      });
      expect(
        response.ok(),
        `project creation failed: ${response.status()} ${await response.text()}`,
      ).toBeTruthy();
      return (await response.json()) as { id: string; name: string };
    };

    const createTask = async (projectId: string) => {
      const response = await api.post("/api/tasks", {
        data: {
          title: "Marketing B2B onboarding form",
          description:
            "Marketing B2B queue action: complete the client onboarding form. Fields are optional and autosaved.",
          project_id: projectId,
        },
      });
      expect(
        response.ok(),
        `task creation failed: ${response.status()} ${await response.text()}`,
      ).toBeTruthy();
      return (await response.json()) as { id: string };
    };

    const firstProject = await createProject(uniq("B2B functional project A"));
    const firstTask = await createTask(firstProject.id);
    const firstFormResponse = await api.get(
      `/api/onboarding/marketing-b2b-form/${firstTask.id}`,
    );
    expect(
      firstFormResponse.ok(),
      `first form open failed: ${firstFormResponse.status()} ${await firstFormResponse.text()}`,
    ).toBeTruthy();
    const firstForm = (await firstFormResponse.json()) as {
      id: string;
      onboarding: { id: string };
      task: { id: string; project: { id: string } };
    };
    expect(firstForm.task.id).toBe(firstTask.id);
    expect(firstForm.task.project.id).toBe(firstProject.id);

    // Reproduce the production failure mode: the same company receives a
    // newer Marketing B2B form task while an onboarding form already exists.
    const replacementProject = await createProject(uniq("B2B functional project B"));
    const replacementTask = await createTask(replacementProject.id);
    const reboundFormResponse = await api.get(
      `/api/onboarding/marketing-b2b-form/${replacementTask.id}`,
    );
    expect(
      reboundFormResponse.ok(),
      `replacement form open failed: ${reboundFormResponse.status()} ${await reboundFormResponse.text()}`,
    ).toBeTruthy();
    const reboundForm = (await reboundFormResponse.json()) as {
      id: string;
      can_edit: boolean;
      onboarding: { id: string };
      task: { id: string; project: { id: string } };
    };
    expect(reboundForm.id).toBe(firstForm.id);
    expect(reboundForm.onboarding.id).toBe(firstForm.onboarding.id);
    expect(reboundForm.task.id).toBe(replacementTask.id);
    expect(reboundForm.task.project.id).toBe(replacementProject.id);
    expect(reboundForm.can_edit).toBe(true);

    const memberFormResponse = await memberApi.get(
      `/api/onboarding/marketing-b2b-form/${replacementTask.id}`,
    );
    expect(
      memberFormResponse.ok(),
      `member form open failed: ${memberFormResponse.status()} ${await memberFormResponse.text()}`,
    ).toBeTruthy();
    const memberForm = (await memberFormResponse.json()) as { can_edit: boolean };
    expect(memberForm.can_edit).toBe(true);

    const memberEditMarker = uniq("B2B member edit");
    const memberEditResponse = await memberApi.patch(
      `/api/onboarding/marketing-b2b-form/${replacementTask.id}`,
      { data: { field: "brand.notes", value: memberEditMarker } },
    );
    expect(
      memberEditResponse.ok(),
      `member form edit failed: ${memberEditResponse.status()} ${await memberEditResponse.text()}`,
    ).toBeTruthy();

    await loginAs(page.context(), SEEDED.member.email);
    await page.setViewportSize({ width: 1440, height: 900 });
    const formPath = `/api/onboarding/marketing-b2b-form/${replacementTask.id}`;
    await page.route(`**${formPath}`, async (route) => {
      if (route.request().method() === "POST") {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    const waitForForm = () =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === formPath && response.ok(),
        { timeout: 30_000 },
      );
    const formLoaded = waitForForm();
    await page.goto(
      `/projects/${replacementProject.id}?view=form&task=${replacementTask.id}`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    await formLoaded;

    const formShell = page.locator(".marketing-b2b-form-shell");
    await expect(formShell).toBeVisible();
    await expect(page.getByRole("heading", { name: "New client onboarding" })).toHaveCount(0);
    await expect(
      formShell.getByRole("heading", { name: "Marketing B2B Onboarding" }),
    ).toBeVisible();
    await expect(formShell.getByText(company.name, { exact: true })).toBeVisible();

    const progressSidebar = page.getByTestId("b2b-progress-sidebar");
    const pageScroller = page.locator("main.overflow-y-auto").first();
    await expect(progressSidebar).toBeVisible();
    await pageScroller.evaluate((element) => element.scrollTo({ top: 900, behavior: "instant" }));
    await expect.poll(async () => Math.round((await progressSidebar.boundingBox())?.y ?? -1)).toBeLessThanOrEqual(24);
    const stickyTop = Math.round((await progressSidebar.boundingBox())?.y ?? -1);
    await pageScroller.evaluate((element) => element.scrollTo({ top: 1_600, behavior: "instant" }));
    await expect.poll(async () => Math.round((await progressSidebar.boundingBox())?.y ?? -1)).toBe(stickyTop);

    const marker = uniq("B2B saved brand");
    const competitorName = uniq("B2B competitor");
    const brandSection = page.locator("#b2b-section-brand");
    await brandSection.getByRole("button", { name: /^(Edit section|Editar se..o)$/ }).click();
    const brandNameInput = brandSection.getByLabel(/^(Brand name|Nome da marca)$/);
    await expect(brandNameInput).toBeEnabled();
    await brandNameInput.fill(marker);
    await expect(
      brandSection.getByRole("button", { name: /^(Save|Salvar)$/ }),
    ).toBeVisible();

    await brandSection.getByRole("button", { name: /^(Add address|Adicionar endere\u00e7o)$/i }).click();
    await expect(brandSection.getByLabel(/^(Full address|Endere\u00e7o completo)$/)).toHaveCount(2);
    await brandSection.getByLabel(/^(Full address|Endere\u00e7o completo)$/).nth(0).fill("Rua da Loja, 100");
    await brandSection.getByLabel(/^(Full address|Endere\u00e7o completo)$/).nth(1).fill("Rua da Fábrica, 200");

    await brandSection.getByRole("button", { name: /^(Add competitor|Adicionar concorrente)$/i }).click();
    await brandSection.getByPlaceholder(/^(For example: Namine|Ex\.: Namine)$/).fill(competitorName);
    await brandSection.getByPlaceholder(/^(?:@competitor or URL|@concorrente ou URL)$/).fill("@concorrente");
    await brandSection.getByPlaceholder("https://...").fill("https://concorrente.example");
    await brandSection.getByRole("button", { name: /^(Save|Salvar)$/ }).click();
    await expect(
      brandSection.getByRole("button", { name: /^(Edit section|Editar se\u00e7ão)$/ }),
    ).toBeVisible();

    const savedResponse = await api.get(
      `/api/onboarding/marketing-b2b-form/${replacementTask.id}`,
    );
    expect(
      savedResponse.ok(),
      `saved form read failed: ${savedResponse.status()} ${await savedResponse.text()}`,
    ).toBeTruthy();
    const savedForm = (await savedResponse.json()) as {
      status: string;
      values: Record<string, unknown>;
    };
    expect(savedForm.status).toBe("in_progress");
    expect(savedForm.values["brand.name"]).toBe(marker);
    expect(savedForm.values["brand.notes"]).toBe(memberEditMarker);
    expect(savedForm.values["brand.competitors"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: competitorName,
          instagram: "@concorrente",
          website: "https://concorrente.example",
        }),
      ]),
    );

    const commercialSection = page.locator("#b2b-section-commercial");
    await commercialSection.getByRole("button", { name: /^(Edit section|Editar se..o)$/ }).click();
    const documentRule = commercialSection.getByLabel(/^(Accepted document|Documento aceito)$/);
    await expect(documentRule).toBeEnabled();
    await documentRule.selectOption("all_cnpjs");
    await expect(
      commercialSection.getByRole("button", { name: /^(Save|Salvar)$/ }),
    ).toBeVisible();
    const commercialSave = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        new URL(response.url()).pathname === `/api/onboarding/marketing-b2b-form/${replacementTask.id}` &&
        response.ok(),
    );
    await commercialSection.getByRole("button", { name: /^(Save|Salvar)$/ }).click();
    await commercialSave;

    const commercialSavedResponse = await api.get(
      `/api/onboarding/marketing-b2b-form/${replacementTask.id}`,
    );
    const commercialSavedForm = (await commercialSavedResponse.json()) as {
      values: Record<string, unknown>;
      company: { addresses: Array<{ fullAddress: string }> };
    };
    expect(commercialSavedForm.values["commercial.acceptedDocumentRule"]).toBe("all_cnpjs");
    expect(commercialSavedForm.company.addresses.map((address) => address.fullAddress)).toEqual(
      expect.arrayContaining(["Rua da Loja, 100", "Rua da Fábrica, 200"]),
    );

    const formReloaded = waitForForm();
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await formReloaded;
    await expect(page.locator(".marketing-b2b-form-shell")).toBeVisible();
    await expect(page.getByLabel(/^(Brand name|Nome da marca)$/)).toHaveValue(marker);
  } finally {
    await memberApi.dispose();
    await api.dispose();
  }
});

test("Creating a client with Vesti and UP Zero creates the complete service workflows", async ({
  baseURL,
  page,
}) => {
  expect(baseURL).toBeTruthy();
  const api = await apiAs(baseURL!, SEEDED.admin.email);
  const memberApi = await apiAs(baseURL!, SEEDED.member.email);
  let workspaceIdForCleanup: string | null = null;
  let memberUserIdForCleanup: string | null = null;
  let previousMemberDepartmentId: string | null = null;
  let memberDepartmentChanged = false;
  let createdTechnicalDepartmentId: string | null = null;
  let staleFormTaskId: string | null = null;
  let originalFormProjectId: string | null = null;

  try {
    const companyResponse = await api.post("/api/companies", {
      data: {
        name: uniq("Vesti and UP Zero workflow company"),
        included_services: ["Vesti", "UP Zero"],
        start_onboarding: true,
      },
    });
    expect(
      companyResponse.ok(),
      `company creation failed: ${companyResponse.status()} ${await companyResponse.text()}`,
    ).toBeTruthy();

    const company = (await companyResponse.json()) as {
      id: string;
      onboarding_id: string;
      created_onboarding_tasks: Array<{ id: string; title: string; project_id: string }>;
    };
    expect(company.onboarding_id).toBeTruthy();

    const createdTitles = company.created_onboarding_tasks.map((task) => task.title);
    expect(createdTitles.filter((title) => title.startsWith("Vesti: "))).toHaveLength(11);
    expect(createdTitles.filter((title) => title.startsWith("UP Zero: "))).toHaveLength(10);
    expect(createdTitles.filter((title) => title === "Configure UP Zero website")).toHaveLength(1);
    expect(createdTitles).toEqual(
      expect.arrayContaining([
        "Vesti: Criar grupo de WhatsApp e capa",
        "Vesti: Agendar apresentação e dia do onboarding",
        "Vesti: Realizar onboarding",
        "Vesti: Criar e validar o UP Dash",
        "Vesti: Iniciar Campanha",
        "UP Zero: Criar grupo de WhatsApp e capa",
        "UP Zero: Realizar configuração técnica",
        "UP Zero: Preparar briefing de criativos",
        "UP Zero: Treinar o cliente no uso do UP Dash",
        "UP Zero: Iniciar Campanha",
      ]),
    );
    const b2bFormTask = company.created_onboarding_tasks.find(
      (task) => task.title === "Marketing B2B onboarding form",
    );
    expect(b2bFormTask?.project_id).toBeTruthy();
    expect(
      company.created_onboarding_tasks
        .filter((task) => task.title.startsWith("Vesti: ") || task.title.startsWith("UP Zero: "))
        .every((task) => task.project_id === b2bFormTask?.project_id),
    ).toBe(true);
    const b2bProjectResponse = await api.get(`/api/projects/${b2bFormTask?.project_id}`);
    expect(b2bProjectResponse.ok()).toBeTruthy();
    expect(((await b2bProjectResponse.json()) as { onboarding_enabled: boolean }).onboarding_enabled).toBe(true);

    const onboardingResponse = await api.get(`/api/onboarding/${company.onboarding_id}`);
    expect(
      onboardingResponse.ok(),
      `onboarding read failed: ${onboardingResponse.status()} ${await onboardingResponse.text()}`,
    ).toBeTruthy();
    const onboarding = (await onboardingResponse.json()) as {
      sequence_status: string;
      commercial_completed_at: string | null;
      technical_support_started_at: string | null;
      up_zero_configuration_completed_at: string | null;
      marketing_b2b_released_at: string | null;
      checklist_items: Array<{
        id: string;
        title: string;
        department: string;
        automation_key: string | null;
        status: string;
        owner: { id: string; name: string } | null;
        task: { id: string; project_id: string } | null;
      }>;
      meetings: Array<{ service: string; checklist_item_id: string }>;
    };
    expect(onboarding.sequence_status).toBe("technical_support_pending");
    expect(onboarding.commercial_completed_at).toBeTruthy();
    expect(onboarding.technical_support_started_at).toBeTruthy();
    expect(onboarding.up_zero_configuration_completed_at).toBeNull();
    expect(onboarding.marketing_b2b_released_at).toBeNull();
    const technicalItem = onboarding.checklist_items.find(
      (item) => item.automation_key === "up_zero_website_configuration",
    );
    expect(technicalItem?.title).toBe("Configure UP Zero website");
    expect(technicalItem?.department).toBe("Technical Support");
    expect(technicalItem?.owner?.id).toBeTruthy();
    expect(technicalItem?.task?.id).toBeTruthy();
    const supportItem = onboarding.checklist_items.find(
      (item) => item.title === "Client communication group created",
    );
    expect(supportItem?.task?.id).toBeTruthy();

    const memberSupportResponse = await memberApi.get(
      `/api/onboarding/support-form/${supportItem?.task?.id}`,
    );
    expect(
      memberSupportResponse.ok(),
      `member support form read failed: ${memberSupportResponse.status()} ${await memberSupportResponse.text()}`,
    ).toBeTruthy();
    expect(((await memberSupportResponse.json()) as { can_edit: boolean }).can_edit).toBe(true);

    const supportGroupName = uniq("Support group");
    await loginAs(page.context(), SEEDED.member.email);
    // Execution tasks stay out of the shared Kanban, but their direct links
    // must still open the form without duplicating cards on the board.
    const boardResponse = await memberApi.get(`/api/tasks?project_id=${supportItem?.task?.project_id}`);
    expect(boardResponse.ok()).toBeTruthy();
    const board = (await boardResponse.json()) as { items: Array<{ id: string }> };
    expect(board.items.some((task) => task.id === supportItem?.task?.id)).toBe(false);
    await page.goto(
      `/projects/${supportItem?.task?.project_id}?view=form&task=${supportItem?.task?.id}`,
    );
    const groupNameInput = page.getByLabel(/Group name|Nome do grupo/i);
    await expect(groupNameInput).toBeEnabled();
    await groupNameInput.fill(supportGroupName);
    await groupNameInput.blur();
    await expect
      .poll(async () => {
        try {
          const response = await memberApi.get(
            `/api/onboarding/support-form/${supportItem?.task?.id}`,
          );
          if (!response.ok()) return null;
          return ((await response.json()) as { support_group: { group_name: string | null } })
            .support_group.group_name;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/ECONNRESET|ECONNREFUSED|EPIPE|socket hang up/i.test(message)) return null;
          throw error;
        }
      })
      .toBe(supportGroupName);

    const technicalSupportFormResponse = await api.get(
      `/api/onboarding/support-form/${technicalItem?.task?.id}`,
    );
    expect(technicalSupportFormResponse.status()).toBe(404);
    const vestiItems = onboarding.checklist_items.filter((item) => item.title.startsWith("Vesti: "));
    const upZeroItems = onboarding.checklist_items.filter((item) => item.title.startsWith("UP Zero: "));
    expect(vestiItems).toHaveLength(11);
    expect(upZeroItems).toHaveLength(10);
    expect([...vestiItems, ...upZeroItems].every((item) => Boolean(item.task?.id))).toBe(true);

    const vestiMeeting = onboarding.meetings.find((meeting) => meeting.service === "Vesti");
    const upZeroMeeting = onboarding.meetings.find((meeting) => meeting.service === "UP Zero");
    expect(vestiMeeting?.checklist_item_id).toBeTruthy();
    expect(upZeroMeeting?.checklist_item_id).toBeTruthy();
    expect(vestiItems.some((item) => item.id === vestiMeeting?.checklist_item_id)).toBe(true);
    expect(upZeroItems.some((item) => item.id === upZeroMeeting?.checklist_item_id)).toBe(true);

    const blockedFormResponse = await api.get(
      `/api/onboarding/marketing-b2b-form/${b2bFormTask?.id}`,
    );
    expect(blockedFormResponse.ok()).toBeTruthy();
    const blockedForm = (await blockedFormResponse.json()) as {
      can_edit: boolean;
      up_zero_dependency: { blocked: boolean; message: string; current_department: string };
    };
    expect(blockedForm.can_edit).toBe(false);
    expect(blockedForm.up_zero_dependency).toMatchObject({
      blocked: true,
      message: "Waiting for UP Zero website configuration by Technical Support.",
      current_department: "Technical Support",
    });

    const blockedEditResponse = await api.patch(
      `/api/onboarding/marketing-b2b-form/${b2bFormTask?.id}`,
      { data: { field: "brand.name", value: "must remain blocked" } },
    );
    expect(blockedEditResponse.status()).toBe(409);

    const repeatUpZeroSyncResponse = await api.patch(`/api/companies/${company.id}`, {
      data: { included_services: ["Vesti", "UP Zero"] },
    });
    expect(repeatUpZeroSyncResponse.ok()).toBeTruthy();
    const repeatUpZeroSync = (await repeatUpZeroSyncResponse.json()) as {
      synced_onboarding_tasks: Array<{ title: string }>;
    };
    expect(
      repeatUpZeroSync.synced_onboarding_tasks.filter(
        (task) => task.title === "Configure UP Zero website",
      ),
    ).toHaveLength(0);

    expect(technicalItem?.task?.project_id).not.toBe(b2bFormTask?.project_id);
    if (!technicalItem?.task || !b2bFormTask) throw new Error("UP Zero workflow tasks were not created");
    staleFormTaskId = b2bFormTask.id;
    originalFormProjectId = b2bFormTask.project_id;
    await prisma.marketingB2BOnboardingForm.update({
      where: { task_id: b2bFormTask.id },
      data: { project_id: technicalItem.task.project_id },
    });

    const meResponse = await api.get("/api/auth/me");
    expect(meResponse.ok()).toBeTruthy();
    const testWorkspaceId = ((await meResponse.json()) as { currentWorkspaceId: string })
      .currentWorkspaceId;
    workspaceIdForCleanup = testWorkspaceId;
    const departmentsResponse = await api.get(
      `/api/workspaces/${testWorkspaceId}/departments`,
    );
    expect(departmentsResponse.ok()).toBeTruthy();
    const departments = (await departmentsResponse.json()) as {
      items: Array<{ id: string; name: string }>;
    };
    let technicalDepartment = departments.items.find((department) => {
      const name = department.name.trim().toLowerCase();
      return name.includes("technical support") || name.includes("suporte t");
    });
    if (!technicalDepartment) {
      const createDepartmentResponse = await api.post(
        `/api/workspaces/${testWorkspaceId}/departments`,
        { data: { name: "Technical Support", color: "slate" } },
      );
      expect(createDepartmentResponse.status()).toBe(201);
      technicalDepartment = (await createDepartmentResponse.json()) as { id: string; name: string };
      createdTechnicalDepartmentId = technicalDepartment.id;
    }

    const usersResponse = await api.get(`/api/users?workspace_id=${testWorkspaceId}`);
    expect(usersResponse.ok()).toBeTruthy();
    const users = (await usersResponse.json()) as {
      items: Array<{ id: string; email: string; department_id: string | null }>;
    };
    const memberUser = users.items.find((user) => user.email === SEEDED.member.email);
    expect(memberUser?.id).toBeTruthy();
    if (!memberUser) throw new Error("Seeded Technical Support test member was not found");
    memberUserIdForCleanup = memberUser.id;
    previousMemberDepartmentId = memberUser.department_id;
    const assignDepartmentResponse = await api.put(
      `/api/workspaces/${testWorkspaceId}/members/${memberUser.id}/department`,
      { data: { department_id: technicalDepartment.id } },
    );
    expect(assignDepartmentResponse.ok()).toBeTruthy();
    memberDepartmentChanged = true;

    const startTechnicalResponse = await memberApi.patch(`/api/tasks/${technicalItem.task.id}`, {
      data: { status: "in_progress" },
    });
    expect(
      startTechnicalResponse.ok(),
      `starting UP Zero configuration failed: ${startTechnicalResponse.status()} ${await startTechnicalResponse.text()}`,
    ).toBeTruthy();
    const startedOnboardingResponse = await api.get(`/api/onboarding/${company.onboarding_id}`);
    expect(startedOnboardingResponse.ok()).toBeTruthy();
    expect(((await startedOnboardingResponse.json()) as { sequence_status: string }).sequence_status).toBe(
      "up_zero_configuration_in_progress",
    );

    const completeTechnicalResponse = await memberApi.post(
      `/api/projects/${technicalItem.task.project_id}/reorder-tasks`,
      {
        data: {
          movedTaskId: technicalItem.task.id,
          srcColumn: "in_progress",
          dstColumn: "done",
          dstIndex: 0,
        },
      },
    );
    expect(
      completeTechnicalResponse.ok(),
      `completing UP Zero configuration failed: ${completeTechnicalResponse.status()} ${await completeTechnicalResponse.text()}`,
    ).toBeTruthy();

    const releasedOnboardingResponse = await api.get(`/api/onboarding/${company.onboarding_id}`);
    expect(releasedOnboardingResponse.ok()).toBeTruthy();
    const releasedOnboarding = (await releasedOnboardingResponse.json()) as {
      sequence_status: string;
      up_zero_configuration_completed_at: string | null;
      marketing_b2b_released_at: string | null;
    };
    expect(releasedOnboarding.sequence_status).toBe("marketing_b2b_ready");
    expect(releasedOnboarding.up_zero_configuration_completed_at).toBeTruthy();
    expect(releasedOnboarding.marketing_b2b_released_at).toBeTruthy();

    const releasedFormResponse = await api.get(
      `/api/onboarding/marketing-b2b-form/${b2bFormTask?.id}`,
    );
    expect(releasedFormResponse.ok()).toBeTruthy();
    const releasedForm = (await releasedFormResponse.json()) as {
      can_edit: boolean;
      up_zero_dependency: { blocked: boolean; message: string | null };
    };
    expect(releasedForm.can_edit).toBe(true);
    expect(releasedForm.up_zero_dependency).toMatchObject({ blocked: false, message: null });

    const activityResponse = await api.get(`/api/activity?company_id=${company.id}&limit=100`);
    expect(activityResponse.ok()).toBeTruthy();
    const activity = (await activityResponse.json()) as { items: Array<{ type: string }> };
    expect(activity.items.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "up_zero_technical_support_activated",
        "up_zero_configuration_started",
        "up_zero_configuration_completed",
        "marketing_b2b_released",
      ]),
    );

    const laterCompanyResponse = await api.post("/api/companies", {
      data: {
        name: uniq("Later Vesti workflow company"),
        included_services: ["Meta Ads", "Vesti"],
        start_onboarding: true,
      },
    });
    expect(laterCompanyResponse.ok()).toBeTruthy();
    const laterCompany = (await laterCompanyResponse.json()) as {
      id: string;
      onboarding_id: string;
      created_onboarding_tasks: Array<{ id: string; title: string; project_id: string }>;
    };
    const laterB2BProjectId = laterCompany.created_onboarding_tasks.find(
      (task) => task.title === "Marketing B2B onboarding form",
    )?.project_id;
    const laterB2BTaskId = laterCompany.created_onboarding_tasks.find(
      (task) => task.title === "Marketing B2B onboarding form",
    )?.id;
    expect(laterB2BProjectId).toBeTruthy();
    const laterVestiTasks = laterCompany.created_onboarding_tasks.filter((task) =>
      task.title.startsWith("Vesti: "),
    );
    expect(laterVestiTasks).toHaveLength(11);
    expect(laterVestiTasks.every((task) => task.project_id === laterB2BProjectId)).toBe(true);

    const directOnboardingResponse = await api.get(`/api/onboarding/${laterCompany.onboarding_id}`);
    expect(directOnboardingResponse.ok()).toBeTruthy();
    const directOnboarding = (await directOnboardingResponse.json()) as {
      sequence_status: string;
      marketing_b2b_released_at: string | null;
      checklist_items: Array<{
        automation_key: string | null;
        title: string;
        task: { project_id: string } | null;
      }>;
    };
    expect(directOnboarding.sequence_status).toBe("marketing_b2b_ready");
    expect(directOnboarding.marketing_b2b_released_at).toBeTruthy();
    expect(
      directOnboarding.checklist_items.some(
        (item) => item.automation_key === "up_zero_website_configuration",
      ),
    ).toBe(false);
    const directVestiItems = directOnboarding.checklist_items.filter((item) =>
      item.title.startsWith("Vesti: "),
    );
    expect(directVestiItems).toHaveLength(11);
    expect(directVestiItems.every((item) => item.task?.project_id === laterB2BProjectId)).toBe(true);

    const directFormResponse = await api.get(
      `/api/onboarding/marketing-b2b-form/${laterB2BTaskId}`,
    );
    expect(directFormResponse.ok()).toBeTruthy();
    const directForm = (await directFormResponse.json()) as {
      can_edit: boolean;
      up_zero_dependency: { uses_up_zero: boolean; blocked: boolean };
    };
    expect(directForm.can_edit).toBe(true);
    expect(directForm.up_zero_dependency).toMatchObject({ uses_up_zero: false, blocked: false });

    const vestiCampaignTask = laterCompany.created_onboarding_tasks.find(
      (task) => task.title === "Vesti: Iniciar Campanha",
    );
    expect(vestiCampaignTask?.id).toBeTruthy();
    if (!vestiCampaignTask) throw new Error("Vesti campaign-start task was not created");

    const completeCampaignResponse = await api.patch(`/api/tasks/${vestiCampaignTask.id}`, {
      data: { status: "done" },
    });
    expect(
      completeCampaignResponse.ok(),
      `completing Vesti campaign start failed: ${completeCampaignResponse.status()} ${await completeCampaignResponse.text()}`,
    ).toBeTruthy();

    const financeHandoff = await prisma.onboardingChecklistItem.findFirst({
      where: {
        onboarding_id: laterCompany.onboarding_id,
        automation_key: "finance_campaign_started:vesti",
      },
      select: {
        required: true,
        task: {
          select: { id: true, title: true, description: true, assignee_id: true },
        },
      },
    });
    expect(financeHandoff?.required).toBe(false);
    expect(financeHandoff?.task?.title).toContain(laterCompany.name);
    expect(financeHandoff?.task?.title).toContain("Vesti");
    expect(financeHandoff?.task?.title).toMatch(/\(\d{2}\/\d{2}\/\d{4}\)$/);
    expect(financeHandoff?.task?.description).toContain("Data de início:");
    expect(financeHandoff?.task?.assignee_id).toBeTruthy();
    if (!financeHandoff?.task?.id || !financeHandoff.task.assignee_id) {
      throw new Error("Finance campaign-start handoff was not assigned");
    }
    expect(
      await prisma.notification.count({
        where: {
          task_id: financeHandoff.task.id,
          user_id: financeHandoff.task.assignee_id,
        },
      }),
    ).toBe(1);

    // A retried completion must reconcile a previously interrupted handoff
    // without adding a duplicate Finance task or notification.
    const retryCampaignResponse = await api.patch(`/api/tasks/${vestiCampaignTask.id}`, {
      data: { status: "done" },
    });
    expect(
      retryCampaignResponse.ok(),
      `retrying Vesti campaign start failed: ${retryCampaignResponse.status()} ${await retryCampaignResponse.text()}`,
    ).toBeTruthy();
    expect(
      await prisma.onboardingChecklistItem.count({
        where: {
          onboarding_id: laterCompany.onboarding_id,
          automation_key: "finance_campaign_started:vesti",
        },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: {
          task_id: financeHandoff.task.id,
          user_id: financeHandoff.task.assignee_id,
        },
      }),
    ).toBe(1);

    const repeatSyncResponse = await api.patch(`/api/companies/${laterCompany.id}`, {
      data: { included_services: ["Meta Ads", "Vesti"] },
    });
    expect(repeatSyncResponse.ok()).toBeTruthy();
    const repeatedSync = (await repeatSyncResponse.json()) as {
      synced_onboarding_tasks: unknown[];
      moved_onboarding_tasks: number;
    };
    expect(repeatedSync.synced_onboarding_tasks).toHaveLength(0);
    expect(repeatedSync.moved_onboarding_tasks).toBe(0);
  } finally {
    if (staleFormTaskId && originalFormProjectId) {
      await prisma.marketingB2BOnboardingForm
        .update({
          where: { task_id: staleFormTaskId },
          data: { project_id: originalFormProjectId },
        })
        .catch(() => undefined);
    }
    if (memberDepartmentChanged && workspaceIdForCleanup && memberUserIdForCleanup) {
      await api.put(
        `/api/workspaces/${workspaceIdForCleanup}/members/${memberUserIdForCleanup}/department`,
        { data: { department_id: previousMemberDepartmentId } },
      );
    }
    if (createdTechnicalDepartmentId && workspaceIdForCleanup) {
      await api.delete(
        `/api/workspaces/${workspaceIdForCleanup}/departments/${createdTechnicalDepartmentId}`,
      );
    }
    await memberApi.dispose();
    await api.dispose();
  }
});

test("UP Zero Marketing B2B dependency requires an audited admin override reason", async ({
  baseURL,
}) => {
  expect(baseURL).toBeTruthy();
  const api = await apiAs(baseURL!, SEEDED.admin.email);

  try {
    const companyResponse = await api.post("/api/companies", {
      data: {
        name: uniq("UP Zero override company"),
        included_services: ["UP Zero"],
        start_onboarding: true,
      },
    });
    expect(companyResponse.ok()).toBeTruthy();
    const company = (await companyResponse.json()) as {
      id: string;
      onboarding_id: string;
      created_onboarding_tasks: Array<{ id: string; title: string }>;
    };
    const formTask = company.created_onboarding_tasks.find(
      (task) => task.title === "Marketing B2B onboarding form",
    );
    expect(formTask?.id).toBeTruthy();

    const missingReasonResponse = await api.patch(`/api/onboarding/${company.onboarding_id}`, {
      data: { marketing_b2b_dependency_override: { reason: "short" } },
    });
    expect(missingReasonResponse.status()).toBe(400);

    const reason = "Approved by operations because the client launch cannot move.";
    const overrideResponse = await api.patch(`/api/onboarding/${company.onboarding_id}`, {
      data: { marketing_b2b_dependency_override: { reason } },
    });
    expect(
      overrideResponse.ok(),
      `override failed: ${overrideResponse.status()} ${await overrideResponse.text()}`,
    ).toBeTruthy();

    const onboardingResponse = await api.get(`/api/onboarding/${company.onboarding_id}`);
    expect(onboardingResponse.ok()).toBeTruthy();
    const onboarding = (await onboardingResponse.json()) as {
      sequence_status: string;
      marketing_b2b_released_at: string | null;
      marketing_b2b_dependency_override_reason: string | null;
      marketing_b2b_dependency_overridden_at: string | null;
    };
    expect(onboarding.sequence_status).toBe("marketing_b2b_ready");
    expect(onboarding.marketing_b2b_released_at).toBeTruthy();
    expect(onboarding.marketing_b2b_dependency_override_reason).toBe(reason);
    expect(onboarding.marketing_b2b_dependency_overridden_at).toBeTruthy();

    const formResponse = await api.get(`/api/onboarding/marketing-b2b-form/${formTask?.id}`);
    expect(formResponse.ok()).toBeTruthy();
    const form = (await formResponse.json()) as {
      can_edit: boolean;
      up_zero_dependency: { blocked: boolean; overridden: boolean; override_reason: string };
    };
    expect(form.can_edit).toBe(true);
    expect(form.up_zero_dependency).toMatchObject({
      blocked: false,
      overridden: true,
      override_reason: reason,
    });

    const activityResponse = await api.get(`/api/activity?company_id=${company.id}&limit=100`);
    expect(activityResponse.ok()).toBeTruthy();
    const activity = (await activityResponse.json()) as {
      items: Array<{ type: string; metadata: { reason?: string } | null }>;
    };
    expect(
      activity.items.some(
        (event) =>
          event.type === "marketing_b2b_dependency_overridden" &&
          event.metadata?.reason === reason,
      ),
    ).toBe(true);
  } finally {
    await api.dispose();
  }
});
