import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  canViewClientCreativeTracking,
  getClientCreativeTaskMetadata,
  isClientCreativeTrackingTask,
  isMarketingB2BOrB2CDepartmentName,
  resolveClientCreativeTaskStage,
} from "../../src/lib/client-creative-tracking";
import { buildCreativeBriefingDescription } from "../../src/lib/creative-briefing";

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("client creative tracking is limited to admins, B2B, B2C, and Creative", () => {
  assert.equal(
    canViewClientCreativeTracking({
      isWorkspaceAdmin: true,
      membership: { role: "owner", departmentName: "Comercial" },
    }),
    true,
  );

  for (const departmentName of [
    "Marketing B2B",
    "Performance B2C",
    "B2B",
    "Creative & Design",
    "Criação",
  ]) {
    assert.equal(
      canViewClientCreativeTracking({
        isWorkspaceAdmin: false,
        membership: { role: "member", departmentName },
      }),
      true,
      departmentName,
    );
  }

  for (const departmentName of ["Comercial", "Suporte Técnico", "Financeiro"]) {
    assert.equal(
      canViewClientCreativeTracking({
        isWorkspaceAdmin: false,
        membership: { role: "member", departmentName },
      }),
      false,
      departmentName,
    );
  }

  assert.equal(
    canViewClientCreativeTracking({
      isWorkspaceAdmin: false,
      membership: { role: "guest", departmentName: "Marketing B2B" },
    }),
    false,
  );
  assert.equal(isMarketingB2BOrB2CDepartmentName("Marketing B2C"), true);
  assert.equal(isMarketingB2BOrB2CDepartmentName("Marketing"), false);
});

test("creative tasks are detected by their source space, project, or structured brief", () => {
  assert.equal(
    isClientCreativeTrackingTask({ spaceName: "Creative & Design" }),
    true,
  );
  assert.equal(
    isClientCreativeTrackingTask({ projectName: "Produção Criativa" }),
    true,
  );

  const description = buildCreativeBriefingDescription({
    designerNames: ["Ana"],
    formats: ["Carousel"],
    videoSizes: ["1080 × 1080 px"],
    priority: "medium",
  });
  assert.equal(isClientCreativeTrackingTask({ description }), true);
  assert.equal(
    isClientCreativeTrackingTask({
      projectName: "Leads",
      spaceName: "Comercial",
      description: "Ordinary task",
    }),
    false,
  );
});

test("tracker resolves the live workflow stage and creative format", () => {
  assert.equal(
    resolveClientCreativeTaskStage(
      [
        {
          value: "Roteiros",
          definition: {
            name: "Upflow Space Status",
            type: "dropdown",
            position: 0,
          },
        },
      ],
      "in_progress",
    ),
    "Roteiros",
  );
  assert.equal(resolveClientCreativeTaskStage([], "todo"), "todo");

  const video = getClientCreativeTaskMetadata({
    title: "Produção para Vionix",
    description: buildCreativeBriefingDescription({
      designerNames: ["Ana"],
      requesterName: "Josef Kong",
      formats: ["Video edit"],
      videoSizes: ["9:16"],
      priority: "high",
    }),
  });
  assert.equal(video.kind, "video");
  assert.equal(video.requester, "Josef Kong");
  assert.equal(video.formats, "Video edit");
});

test("client API sends the creative mirror only when server access allows it", () => {
  const route = read("src/app/api/companies/[id]/route.ts");
  const page = read("src/app/(dashboard)/clients/[id]/page.tsx");
  const tracker = read(
    "src/components/clients/client-creative-tracker.tsx",
  );

  assert.match(route, /canViewClientCreativeTracking/);
  assert.match(route, /creative_tracking_visible: options\.canViewCreativeTracking/);
  assert.match(route, /creative_work: options\.canViewCreativeTracking/);
  assert.match(route, /: undefined/);
  assert.match(page, /company\.creative_tracking_visible === true/);
  assert.match(tracker, /data-testid="client-creative-tracker"/);
  assert.match(tracker, /\/projects\/\$\{item\.project\.id\}\?task=\$\{item\.id\}/);
  assert.doesNotMatch(tracker, /method:\s*["'](?:POST|PATCH|PUT|DELETE)/);
});
