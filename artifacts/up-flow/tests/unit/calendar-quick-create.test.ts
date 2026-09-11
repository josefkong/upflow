import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("calendar create control opens one guided meeting and event dialog", () => {
  const page = source("src/app/(dashboard)/calendar/page.tsx");
  const guidedDialog = source(
    "src/components/calendar/guided-calendar-create-dialog.tsx",
  );
  const eventEditor = source("src/components/calendar/event-editor-sheet.tsx");
  const eventsRoute = source("src/app/api/calendar/events/route.ts");
  const translations = source("src/lib/i18n/translations.ts");

  assert.match(page, /manualCreateOpen/);
  assert.match(page, /calendar\.quickCreate/);
  assert.match(page, /calendar\.quickCreateShort/);
  assert.match(page, /data-testid="calendar-create-control"/);
  assert.match(page, /setManualCreateOpen\(true\)/);
  assert.match(page, /<GuidedCalendarCreateDialog/);
  assert.doesNotMatch(page, /quickCreateOpen/);
  assert.doesNotMatch(page, /openSchedule\("meeting"\)/);
  assert.doesNotMatch(page, /openSchedule\("reminder"\)/);
  assert.doesNotMatch(page, /calendar-mode-tabs/);
  assert.doesNotMatch(page, /manageEvents/);
  assert.equal(page.match(/data-testid="calendar-create-control"/g)?.length, 1);
  assert.doesNotMatch(page, /openTaskDialog/);
  assert.doesNotMatch(page, /<TaskCreateSheet/);
  assert.doesNotMatch(page, /\/api\/tasks\?/);

  assert.match(guidedDialog, /data-testid="guided-calendar-create-dialog"/);
  assert.match(guidedDialog, /type="radio"/);
  assert.match(guidedDialog, /type="checkbox"/);
  assert.match(guidedDialog, /responsible_user_id: responsibleUserId/);
  assert.match(guidedDialog, /attendee_ids:/);
  assert.match(guidedDialog, /value="online"/);
  assert.match(guidedDialog, /value="onboarding"/);
  assert.match(guidedDialog, /calendarCreate\.onboarding/);
  assert.match(guidedDialog, /google_meet_requested: audience === "online"/);
  assert.match(guidedDialog, /company_id: companyId/);
  assert.match(
    guidedDialog,
    /const type = kind === "event" \? "reminder" : "client_call"/,
  );
  assert.match(guidedDialog, /if \(!companyId\)/);
  assert.doesNotMatch(guidedDialog, /audience === "external" && !companyId/);
  assert.doesNotMatch(
    guidedDialog,
    /audience === "external" && \(\s*<div className="mt-5">/,
  );
  assert.match(guidedDialog, /grid grid-cols-1 gap-2 sm:grid-cols-3/);
  assert.match(guidedDialog, /reminder_minutes: \[5\]/);
  assert.match(guidedDialog, /endTimeOneHourAfter/);
  assert.match(guidedDialog, /openNativeDatePicker/);
  assert.match(translations, /"calendar.quickCreateShort"/);
  assert.match(translations, /"calendarCreate.meeting": "Reunião"/);
  assert.match(translations, /"calendarCreate.event": "Evento"/);
  assert.match(translations, /"calendarCreate.onboarding": "Onboarding"/);
  assert.match(translations, /"calendarCreate.internal": "Interno"/);
  assert.match(translations, /"calendarCreate.external": "Externo"/);
  assert.match(translations, /"calendarCreate.online": "Online"/);
  assert.match(translations, /"calendarCreate.attendees": "Acompanhantes"/);
  assert.match(translations, /"calendarEditor.creator": "Criador"/);
  assert.match(eventEditor, /personLabel\(detail\.creator\)/);
  assert.match(eventEditor, /calendarEditor\.creator/);
  assert.match(
    eventsRoute,
    /google_meet_requested: z\.boolean\(\)\.default\(false\)/,
  );
  assert.match(eventsRoute, /auth\.prismaUser\.id,/);
  assert.match(
    eventsRoute,
    /google_meet_requested: body\.google_meet_requested/,
  );
});

test("calendar creation stays grouped with date navigation without mode tabs", () => {
  const page = source("src/app/(dashboard)/calendar/page.tsx");
  const createButton = source("src/components/ui/create-action-button.tsx");
  const controlStandards = source("src/components/ui/control-standards.ts");

  assert.doesNotMatch(page, /data-testid="calendar-mode-tabs"/);
  assert.match(page, /data-testid="calendar-create-control"/);
  assert.match(page, /<CreateActionButton/);
  assert.match(createButton, /upflowControlDefaultSizeClassName/);
  assert.match(controlStandards, /h-9 min-h-9/);
  assert.match(controlStandards, /rounded-xl/);
  assert.match(controlStandards, /\[&_svg\]:h-4/);
  assert.match(page, /data-testid="calendar-date-navigation"/);
  assert.match(page, /className="inline-flex shrink-0 items-center gap-1"/);
  assert.match(page, /xl:flex-row xl:items-start xl:justify-between/);
  assert.match(
    page,
    /flex w-full shrink-0 flex-wrap items-center justify-end gap-2/,
  );
  assert.doesNotMatch(page, /sm:gap-1 sm:pt-1/);
  assert.match(page, /xl:grid-cols-\[minmax\(0,1fr\)_320px\]/);
  assert.match(page, /xl:col-span-2/);

  const newEventControl = page.indexOf('data-testid="calendar-create-control"');
  const dateNavigation = page.indexOf('data-testid="calendar-date-navigation"');
  assert.ok(newEventControl >= 0 && dateNavigation > newEventControl);
});

test("calendar switches between day, four-day, week, and month views", () => {
  const page = source("src/app/(dashboard)/calendar/page.tsx");
  const timeline = source("src/components/calendar/calendar-time-grid.tsx");
  const translations = source("src/lib/i18n/translations.ts");

  assert.match(
    page,
    /type CalendarViewMode = "day" \| "fourDays" \| "week" \| "month"/,
  );
  assert.match(page, /useState<CalendarViewMode>\("month"\)/);
  assert.match(page, /data-testid="calendar-view-selector"/);
  assert.match(page, /value="day"/);
  assert.match(page, /value="fourDays"/);
  assert.match(page, /value="week"/);
  assert.match(page, /value="month"/);
  assert.match(page, /viewMode === "month"/);
  assert.match(page, /<CalendarTimeGrid/);
  assert.match(timeline, /data-testid="calendar-time-grid"/);
  assert.match(timeline, /Array\.from\(\{ length: 24 \}/);
  assert.match(timeline, /currentMinutes/);
  assert.match(timeline, /layoutOverlappingItems/);
  assert.match(
    timeline,
    /left: `calc\(\$\{layout\.column \* width\}% \+ 4px\)`/,
  );
  assert.match(
    timeline,
    /days\.length === 1 \? 240 : days\.length <= 4 \? 190 : 120/,
  );
  assert.match(translations, /"calendar\.viewDay": "Dia"/);
  assert.match(translations, /"calendar\.viewFourDays": "4 Dias"/);
  assert.match(translations, /"calendar\.viewWeek": "Semana"/);
  assert.match(translations, /"calendar\.viewMonth": "Mês"/);
});

test("calendar source tabs keep equal responsive widths in every language", () => {
  const page = source("src/app/(dashboard)/calendar/page.tsx");

  assert.match(page, /data-testid="calendar-source-tabs"/);
  assert.match(page, /grid min-h-11 w-full shrink-0 grid-cols-4 gap-1/);
  assert.match(page, /xl:w-\[30rem\]/);
  assert.match(page, /h-9 min-w-0 items-center justify-center gap-2/);
  assert.match(page, /className="whitespace-nowrap"/);
  assert.match(page, /Icon: CalendarDays/);
  assert.match(page, /Icon: Workflow/);
  assert.match(page, /h-4 w-4 shrink-0 stroke-\[1\.75\]/);
});

test("selected-day agenda prioritizes the event name and has no edit actions", () => {
  const page = source("src/app/(dashboard)/calendar/page.tsx");
  const selectedAgendaStart = page.indexOf(
    'data-testid="selected-day-event-title"',
  );
  const selectedAgendaEnd = page.indexOf(
    '{t("calendar.legendDepartments")}',
    selectedAgendaStart,
  );
  const selectedAgenda = page.slice(selectedAgendaStart, selectedAgendaEnd);

  assert.ok(
    selectedAgendaStart >= 0 && selectedAgendaEnd > selectedAgendaStart,
  );
  assert.match(page, /data-testid="selected-day-event-title"/);
  assert.match(page, /data-testid="selected-day-event-meta"/);
  assert.doesNotMatch(page, /data-testid="selected-day-event-actions"/);
  assert.match(selectedAgenda, /break-words text-sm font-semibold/);
  assert.match(selectedAgenda, /mt-1 flex items-center gap-2/);
  assert.match(page, /<Clock\s+aria-hidden="true"/);
  assert.doesNotMatch(
    selectedAgenda,
    /\{eventTime\(event, language\)\} \{event\.title\}/,
  );
});

test("calendar headings follow localized title casing without changing all-caps labels", () => {
  const page = source("src/app/(dashboard)/calendar/page.tsx");
  const translations = source("src/lib/i18n/translations.ts");

  assert.match(
    page,
    /capitalizeCalendarLabel\(formattedMonthTitle, language\)/,
  );
  assert.match(page, /text-\[10px\] font-semibold uppercase/);
  assert.match(translations, /"calendar\.sources": "Fontes do Calendário"/);
  assert.match(
    translations,
    /"calendar\.sourcesDescription":\s*"Gerencie a sincronização com o Google Agenda e as agendas compartilhadas\."/,
  );
  assert.match(translations, /"calendar\.peopleFilter": "Agenda da Equipe"/);
  assert.match(translations, /"calendar\.mySchedule": "Minha Agenda"/);
  assert.match(translations, /"calendar\.unifiedSchedule": "Agenda unificada"/);
  assert.match(translations, /"nav\.inbox": "Caixa de Entrada"/);
  assert.match(translations, /"nav\.timeTracking": "Controle de Tempo"/);
  assert.match(translations, /"nav\.meetingRoom": "Sala de Reunião"/);
});

test("calendar events show completion state but expose no calendar edit controls", () => {
  const page = source("src/app/(dashboard)/calendar/page.tsx");
  const api = source("src/app/api/calendar/events/[id]/route.ts");
  const translations = source("src/lib/i18n/translations.ts");

  assert.match(page, /COMPLETED_EVENT_COLOR/);
  assert.match(page, /eventIsComplete/);
  assert.match(page, /eventHasEnded/);
  assert.match(page, /eventDisplayState/);
  assert.match(page, /isAutoComplete/);
  assert.match(
    page,
    /isComplete \? COMPLETED_EVENT_COLOR : eventColor\(event\)/,
  );
  assert.doesNotMatch(page, /openEventMenu/);
  assert.doesNotMatch(page, /onContextMenu=/);
  assert.match(page, /onClick=\{\(\) => setEditingEvent\(event\)\}/);
  assert.match(page, /setEditingEvent\(event\)/);
  assert.doesNotMatch(page, /updateEventColor/);
  assert.match(page, /setSelected\(new Date\(event\.starts_at\)\)/);
  assert.doesNotMatch(page, /calendar\.markComplete/);
  assert.match(page, /calendar\.autoCompleted/);
  assert.doesNotMatch(page, /calendar\.changeColor/);
  assert.match(page, /resolveUniqueDepartmentColors/);
  assert.match(page, /departmentColorTone/);
  assert.match(page, /calendar\.legendDepartments/);

  assert.match(
    api,
    /color: z\.string\(\)\.trim\(\)\.optional\(\)\.nullable\(\)/,
  );
  assert.match(api, /body\.color !== undefined/);

  assert.match(translations, /"calendar.markComplete"/);
  assert.match(translations, /"calendar.editEvent"/);
  assert.match(translations, /"calendar.autoCompleted"/);
  assert.match(translations, /"calendar.colorComplete"/);
  assert.match(translations, /"calendar.legendDepartments"/);
});

test("calendar month cells support dense event days without a two-item cap", () => {
  const page = source("src/app/(dashboard)/calendar/page.tsx");

  assert.match(page, /DAY_CELL_VISIBLE_ITEM_LIMIT = 6/);
  assert.match(page, /data-calendar-day-items/);
  assert.match(page, /visibleDayEvents\.map/);
  assert.match(page, /visibleDaySharedAgendaEntries\.map/);
  assert.match(page, /hiddenDayItems > 0/);
  assert.match(page, /calendar\.more/);
  assert.doesNotMatch(page, /dayEvents\.slice\(0,\s*2\)/);
  assert.doesNotMatch(page, /dayTasks/);
});

test("calendar defaults to the current user and expands by department, member, or all schedules", () => {
  const page = source("src/app/(dashboard)/calendar/page.tsx");
  const usersApi = source("src/app/api/users/route.ts");
  const translations = source("src/lib/i18n/translations.ts");

  assert.match(page, /useAppUser/);
  assert.match(page, /useState<AgendaScope>\("me"\)/);
  assert.match(page, /type AgendaScope = "me" \| "all"/);
  assert.match(page, /selectedUserIds/);
  assert.match(page, /eventUserIds/);
  assert.match(page, /event\.created_by/);
  assert.match(page, /attendee\.user_id/);
  assert.match(page, /filteredEvents/);
  assert.match(page, /filteredEvents\.forEach/);
  assert.match(page, /department_id === departmentId/);
  assert.match(
    page,
    /\/api\/workspaces\/\$\{user\.currentWorkspaceId\}\/departments/,
  );
  assert.match(page, /workspaceDepartments/);
  assert.match(page, /eventDepartmentTone/);
  assert.match(page, /eventVisualClass/);
  assert.match(page, /isCalendarAppointment/);
  assert.match(page, /event\.type !== "task" && event\.type !== "deadline"/);
  assert.match(page, /calendar\.peopleFilter/);
  assert.match(page, /calendar\.mySchedule/);
  assert.match(page, /calendar\.allSchedules/);
  assert.match(page, /calendar\.departmentSchedule/);
  assert.match(page, /calendar\.legendDepartments/);

  assert.match(
    usersApi,
    /department: \{ select: \{ name: true, color: true, sort_order: true \} \}/,
  );
  assert.match(usersApi, /department_color/);
  assert.match(usersApi, /department_sort_order/);

  assert.match(translations, /"calendar.peopleFilter"/);
  assert.match(translations, /"calendar.mySchedule"/);
  assert.match(translations, /"calendar.departmentSchedule"/);
  assert.match(translations, /"calendar.departmentGroup"/);
  assert.match(translations, /"calendar.allSchedules"/);
  assert.match(translations, /"calendar.legendDepartments"/);
  assert.match(translations, /"calendar.noUsersToFilter"/);
});
