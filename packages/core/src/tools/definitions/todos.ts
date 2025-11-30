import type {
  Project,
  RecurringLeadTimeUnit,
  RecurringOverlapPolicy,
  RecurringTemplate,
  RecurringTemplateInput,
  RecurringTemplateUpdate,
  Todo,
  TodoComment,
  TodoStatus,
  TodoUpdate,
} from '@stina/todos';
import { getTodoRepository } from '@stina/todos';
import { getTodoSettings } from '@stina/settings';

import type { ToolDefinition } from '../infrastructure/base.js';

const DEFAULT_TODO_LIMIT = 20;

/**
 * Converts user-provided status strings into the internal TodoStatus enum.
 */
function normalizeTodoStatus(value: unknown): TodoStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (['pending', 'not_started', 'not-started'].includes(normalized)) return 'not_started';
  if (['in_progress', 'in-progress', 'ongoing', 'started'].includes(normalized))
    return 'in_progress';
  if (['completed', 'done', 'finished'].includes(normalized)) return 'completed';
  if (['cancelled', 'canceled', 'aborted'].includes(normalized)) return 'cancelled';
  return undefined;
}

/**
 * Maps a TodoItem into the JSON-friendly payload returned to tools.
 */
function toTodoPayload(item: Todo, comments: TodoComment[] = []) {
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    status: item.status,
    status_label: formatStatusLabel(item.status),
    due_at: item.dueAt ?? null,
    due_at_iso: typeof item.dueAt === 'number' ? new Date(item.dueAt).toISOString() : null,
    is_all_day: item.isAllDay,
    reminder_minutes: item.reminderMinutes ?? null,
    metadata: item.metadata ?? null,
    source: item.source ?? null,
    project_id: item.projectId ?? null,
    project_name: item.projectName ?? null,
    project: item.projectId
      ? {
          id: item.projectId,
          name: item.projectName ?? '',
        }
      : null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    comment_count: item.commentCount ?? 0,
    comments: (comments ?? []).map((comment) => ({
      id: comment.id,
      todo_id: comment.todoId,
      content: comment.content,
      created_at: comment.createdAt,
      created_at_iso: new Date(comment.createdAt).toISOString(),
    })),
  };
}

function toProjectPayload(project: Project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

function formatStatusLabel(status: TodoStatus) {
  switch (status) {
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Not started';
  }
}

/**
 * Parses optional due date inputs (timestamp or ISO string) into a unix epoch.
 */
function parseDueAt(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function parseIsAllDay(input: unknown): boolean | undefined {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (['true', 'yes', '1', 'all_day', 'allday', 'all-day'].includes(normalized)) return true;
    if (['false', 'no', '0', 'timed', 'time', 'clock'].includes(normalized)) return false;
  }
  return undefined;
}

function parseReminderMinutes(input: unknown): number | null | undefined {
  if (input === null) return null;
  if (typeof input === 'number' && Number.isFinite(input) && input >= 0) return input;
  if (typeof input === 'string' && input.trim() !== '') {
    const parsed = Number.parseInt(input.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function normalizeRecurringFrequency(value: unknown): RecurringTemplate['frequency'] | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['weekly', 'week', 'veckovis', 'vecka', 'veckans'].includes(normalized)) return 'weekly';
  if (['monthly', 'month', 'månad', 'manad'].includes(normalized)) return 'monthly';
  if (['yearly', 'annual', 'annually', 'year', 'år', 'arsvis', 'årsvis'].includes(normalized))
    return 'yearly';
  return null;
}

function normalizeOverlapPolicy(value: unknown): RecurringOverlapPolicy | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/-/g, '_');
  if (['skip_if_open', 'skip', 'single', 'one_at_a_time', 'one'].includes(normalized))
    return 'skip_if_open';
  if (['allow_multiple', 'allow', 'multi', 'multiple'].includes(normalized))
    return 'allow_multiple';
  if (['replace_open', 'replace', 'cancel_previous', 'cancel_open'].includes(normalized))
    return 'replace_open';
  return null;
}

function parseTimeOfDayInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return trimmed;
}

function parseDayOfWeekInput(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 6)
    return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    const map: Record<string, number> = {
      sun: 0,
      sunday: 0,
      söndag: 0,
      sondag: 0,
      mon: 1,
      monday: 1,
      måndag: 1,
      mandag: 1,
      tue: 2,
      tuesday: 2,
      tisdag: 2,
      wed: 3,
      wednesday: 3,
      onsdag: 3,
      thu: 4,
      thursday: 4,
      torsdag: 4,
      fri: 5,
      friday: 5,
      fredag: 5,
      sat: 6,
      saturday: 6,
      lördag: 6,
      lordag: 6,
    };
    if (normalized in map) return map[normalized];
    const num = Number.parseInt(normalized, 10);
    if (Number.isFinite(num) && num >= 0 && num <= 6) return num;
  }
  return null;
}

function parseDayOfMonthInput(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 31) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 31) return parsed;
  }
  return null;
}

function parseNumberList(value: unknown, min: number, max: number): number[] | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return parseNumberList([value], min, max);
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((v) => (typeof v === 'number' ? v : Number.parseInt(String(v), 10)))
      .filter((v) => Number.isFinite(v) && v >= min && v <= max)
      .map((v) => Math.round(v));
    const unique = Array.from(new Set(normalized)).sort((a, b) => a - b);
    return unique.length ? unique : null;
  }
  if (typeof value === 'string') {
    const parts = value.split(/[,\s]+/).filter(Boolean);
    if (parts.length) {
      return parseNumberList(parts.map((p) => Number.parseInt(p, 10)), min, max);
    }
  }
  return null;
}

function parseDaysOfWeekInput(value: unknown): number[] | null {
  const list = parseNumberList(value, 0, 6);
  if (list) return list;
  const single = parseDayOfWeekInput(value);
  return single != null ? [single] : null;
}

function parseMonthsInput(value: unknown): number[] | null {
  return parseNumberList(value, 1, 12);
}

function parseLeadTimeUnit(value: unknown): RecurringLeadTimeUnit | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/-/g, '_');
  if (['hour', 'hours', 'timme', 'timmar'].includes(normalized)) return 'hours';
  if (['day', 'days', 'dag', 'dagar'].includes(normalized)) return 'days';
  if (['after_completion', 'after_complete', 'aftercompletion', 'aftercomplete', 'after', 'completion', 'complete'].includes(normalized)) return 'after_completion';
  return null;
}

function parseLeadTimeValue(input: unknown): number | null {
  if (input === null) return null;
  if (typeof input === 'number' && Number.isFinite(input) && input >= 0) return Math.round(input);
  if (typeof input === 'string' && input.trim() !== '') {
    const parsed = Number.parseInt(input.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function parseLeadTimeMinutes(input: unknown): number | undefined {
  if (input === null) return undefined;
  if (typeof input === 'number' && Number.isFinite(input) && input >= 0) return input;
  if (typeof input === 'string' && input.trim() !== '') {
    const parsed = Number.parseInt(input.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function toRecurringPayload(template: RecurringTemplate) {
  return {
    id: template.id,
    title: template.title,
    description: template.description ?? null,
    project_id: template.projectId ?? null,
    is_all_day: template.isAllDay,
    time_of_day: template.timeOfDay ?? null,
    timezone: template.timezone ?? null,
    frequency: template.frequency,
    day_of_week: template.dayOfWeek ?? null,
    days_of_week: template.daysOfWeek ?? (template.dayOfWeek != null ? [template.dayOfWeek] : []),
    day_of_month: template.dayOfMonth ?? null,
    months: template.months ?? null,
    month_of_year: template.monthOfYear ?? null,
    cron: template.cron ?? null,
    lead_time_minutes: template.leadTimeMinutes ?? 0,
    lead_time_value: template.leadTimeValue ?? 0,
    lead_time_unit: template.leadTimeUnit ?? 'days',
    reminder_minutes: template.reminderMinutes ?? null,
    overlap_policy: template.overlapPolicy,
    last_generated_due_at: template.lastGeneratedDueAt ?? null,
    enabled: template.enabled,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  };
}

async function resolveProjectFromPayload(
  repo: ReturnType<typeof getTodoRepository>,
  payload: Record<string, unknown>,
): Promise<string | null | undefined> {
  if ('project_id' in payload) return normalizeProjectIdentifier(repo, payload.project_id);
  if ('projectId' in payload) return normalizeProjectIdentifier(repo, payload.projectId);
  if ('project_name' in payload) return normalizeProjectIdentifier(repo, payload.project_name);
  if ('projectName' in payload) return normalizeProjectIdentifier(repo, payload.projectName);
  return undefined;
}

async function normalizeProjectIdentifier(
  repo: ReturnType<typeof getTodoRepository>,
  value: unknown,
): Promise<string | null> {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const project = await repo.findProjectByIdentifier(trimmed);
  if (!project) throw new Error(`Project not found: ${trimmed}`);
  return project.id;
}

/**
 * Implements the todo_list tool by reading todos from the store with optional filters.
 */
async function handleTodoList(args: unknown) {
  const payload = toRecord(args);
  const status = normalizeTodoStatus(payload.status);
  const limitRaw = typeof payload.limit === 'number' ? Math.floor(payload.limit) : undefined;
  const limit = limitRaw && limitRaw > 0 ? Math.min(limitRaw, 200) : DEFAULT_TODO_LIMIT;
  const repo = getTodoRepository();
  const todos = await repo.list({ status, limit });
  const commentMap = await repo.listCommentsByTodoIds(todos.map((todo) => todo.id));
  return {
    ok: true,
    todos: todos.map((todo) => toTodoPayload(todo, commentMap[todo.id])),
  };
}

/**
 * Implements the todo_add tool by creating a new entry in the store.
 */
async function handleTodoAdd(args: unknown) {
  const payload = toRecord(args);
  const title = typeof payload.title === 'string' ? payload.title : '';
  const description = typeof payload.description === 'string' ? payload.description : undefined;
  const dueAt = parseDueAt(payload.due_at ?? payload.dueAt);
  const isAllDay = parseIsAllDay(payload.is_all_day ?? payload.isAllDay);
  const reminderMinutes = parseReminderMinutes(payload.reminder_minutes ?? payload.reminderMinutes);
  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  const status = normalizeTodoStatus(payload.status) ?? 'not_started';
  try {
    const repo = getTodoRepository();
    const projectId = await resolveProjectFromPayload(repo, payload);
    const resolvedIsAllDay = isAllDay ?? false;
    let resolvedReminder = reminderMinutes;
    if (resolvedReminder === undefined && dueAt !== null && !resolvedIsAllDay) {
      try {
        const settings = await getTodoSettings();
        resolvedReminder = settings?.defaultReminderMinutes ?? null;
      } catch {
        resolvedReminder = null;
      }
    }
    const todo = await repo.insert({
      title,
      description,
      dueAt,
      isAllDay: resolvedIsAllDay,
      reminderMinutes: resolvedReminder === undefined ? null : resolvedReminder,
      metadata: metadata ?? null,
      status,
      projectId: projectId ?? null,
    });
    return { ok: true, todo: toTodoPayload(todo) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Implements the todo_update tool by patching existing todo fields.
 */
async function handleTodoUpdate(args: unknown) {
  const payload = toRecord(args);
  const identifier = extractTodoIdentifier(payload);
  if (!identifier) {
    return { ok: false, error: 'todo_update requires { id } or { todo_title }' };
  }
  const repo = getTodoRepository();
  const target = await repo.findByIdentifier(identifier);
  if (!target) {
    return { ok: false, error: `Todo not found: ${identifier}` };
  }
  const id = target.id;
  const patch: TodoUpdate = {};
  if (typeof payload.title === 'string') patch.title = payload.title;
  if (typeof payload.description === 'string') patch.description = payload.description;
  const status = normalizeTodoStatus(payload.status);
  if (status) patch.status = status;
  const dueAt = parseDueAt(payload.due_at ?? payload.dueAt);
  if (dueAt !== null) patch.dueAt = dueAt;
  if (payload.due_at === null || payload.dueAt === null) patch.dueAt = null;
  const isAllDay = parseIsAllDay(payload.is_all_day ?? payload.isAllDay);
  if (isAllDay !== undefined) patch.isAllDay = isAllDay;
  const reminderMinutes = parseReminderMinutes(payload.reminder_minutes ?? payload.reminderMinutes);
  if (reminderMinutes !== undefined) patch.reminderMinutes = reminderMinutes;
  if (payload.metadata === null) patch.metadata = null;
  else if (isRecord(payload.metadata)) patch.metadata = payload.metadata;

  try {
    const projectId = await resolveProjectFromPayload(repo, payload);
    if (projectId !== undefined) patch.projectId = projectId;
    const next = await repo.update(id, patch);
    if (!next) {
      return { ok: false, error: `Todo not found: ${id}` };
    }
    return { ok: true, todo: toTodoPayload(next) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

async function handleTodoCommentAdd(args: unknown) {
  const payload = toRecord(args);
  const todoId = typeof payload.todo_id === 'string' ? payload.todo_id.trim() : '';
  const content = typeof payload.content === 'string' ? payload.content : '';
  if (!todoId || !content.trim()) {
    return { ok: false, error: 'todo_comment_add requires { todo_id, content }' };
  }
  const repo = getTodoRepository();
  const todo = await repo.findByIdentifier(todoId);
  if (!todo) {
    return { ok: false, error: `Todo not found: ${todoId}` };
  }
  try {
    const comment = await repo.insertComment(todo.id, content);
    return {
      ok: true,
      comment: {
        id: comment.id,
        todo_id: comment.todoId,
        content: comment.content,
        created_at: comment.createdAt,
        created_at_iso: new Date(comment.createdAt).toISOString(),
      },
    };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

async function handleProjectList() {
  const repo = getTodoRepository();
  const projects = await repo.listProjects();
  return { ok: true, projects: projects.map(toProjectPayload) };
}

async function handleProjectAdd(args: unknown) {
  const payload = toRecord(args);
  const name = typeof payload.name === 'string' ? payload.name : '';
  const description = typeof payload.description === 'string' ? payload.description : undefined;
  try {
    const repo = getTodoRepository();
    const project = await repo.insertProject({ name, description });
    return { ok: true, project: toProjectPayload(project) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

async function handleProjectUpdate(args: unknown) {
  const payload = toRecord(args);
  const identifier = extractProjectIdentifier(payload);
  if (!identifier) {
    return { ok: false, error: 'project_update requires { project_id } or { project_name }' };
  }
  const repo = getTodoRepository();
  const project = await repo.findProjectByIdentifier(identifier);
  if (!project) {
    return { ok: false, error: `Project not found: ${identifier}` };
  }
  const updates: { name?: string; description?: string | null } = {};
  if (typeof payload.name === 'string') updates.name = payload.name;
  if (typeof payload.description === 'string' || payload.description === null) {
    updates.description = payload.description ?? null;
  }
  try {
    const next = await repo.updateProject(project.id, updates);
    if (!next) return { ok: false, error: `Project not found: ${project.id}` };
    return { ok: true, project: toProjectPayload(next) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

async function handleProjectDelete(args: unknown) {
  const payload = toRecord(args);
  const identifier = extractProjectIdentifier(payload);
  if (!identifier) {
    return { ok: false, error: 'project_delete requires { project_id } or { project_name }' };
  }
  const repo = getTodoRepository();
  const project = await repo.findProjectByIdentifier(identifier);
  if (!project) {
    return { ok: false, error: `Project not found: ${identifier}` };
  }
  const deleted = await repo.deleteProject(project.id);
  return deleted ? { ok: true, deleted: true, project: toProjectPayload(project) } : { ok: false, error: 'Failed to delete project' };
}

async function handleRecurringList(args: unknown) {
  const payload = toRecord(args);
  const enabledOnly =
    payload.enabled === undefined ? false : payload.enabled === true || payload.enabled === 'true';
  const repo = getTodoRepository();
  const templates = await repo.listRecurringTemplates(enabledOnly);
  return { ok: true, templates: templates.map(toRecurringPayload) };
}

async function handleRecurringAdd(args: unknown) {
  const payload = toRecord(args);
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description : undefined;
  const frequency =
    normalizeRecurringFrequency(payload.frequency ?? payload.repeat ?? payload.type) ?? undefined;
  if (!title) return { ok: false, error: 'recurring_add requires a title' };
  if (!frequency) {
    return {
      ok: false,
      error: 'recurring_add requires frequency (weekly | monthly | yearly)',
    };
  }
  const repo = getTodoRepository();
  const projectId = await resolveProjectFromPayload(repo, payload);
  const timeOfDay = parseTimeOfDayInput(payload.time_of_day ?? payload.timeOfDay ?? payload.time);
  const dayOfWeek = parseDayOfWeekInput(payload.day_of_week ?? payload.dayOfWeek);
  const daysOfWeek =
    parseDaysOfWeekInput(payload.days_of_week ?? payload.daysOfWeek ?? payload.weekdays) ??
    (dayOfWeek != null ? [dayOfWeek] : null);
  const dayOfMonth = parseDayOfMonthInput(payload.day_of_month ?? payload.dayOfMonth);
  const months = parseMonthsInput(payload.months ?? payload.month_list ?? payload.monthList);
  const monthOfYear = parseMonthsInput(payload.month_of_year ?? payload.monthOfYear)?.[0] ?? null;
  const overlapPolicy =
    normalizeOverlapPolicy(payload.overlap_policy ?? payload.overlapPolicy) ?? 'skip_if_open';
  const leadTimeUnit =
    parseLeadTimeUnit(
      payload.lead_time_unit ?? payload.leadTimeUnit ?? payload.lead_time_mode ?? payload.leadTimeMode,
    ) ?? undefined;
  const leadTimeValue =
    parseLeadTimeValue(payload.lead_time_value ?? payload.leadTimeValue) ?? undefined;
  const leadTimeMinutes = parseLeadTimeMinutes(payload.lead_time_minutes ?? payload.leadTimeMinutes);
  const reminderMinutes = parseReminderMinutes(payload.reminder_minutes ?? payload.reminderMinutes);
  const isAllDay = parseIsAllDay(payload.is_all_day ?? payload.isAllDay) ?? false;
  try {
    const newTemplate: RecurringTemplateInput = {
      title,
      description,
      projectId: projectId ?? undefined,
      isAllDay,
      timeOfDay,
      frequency,
      dayOfWeek: dayOfWeek ?? undefined,
      daysOfWeek: daysOfWeek ?? undefined,
      dayOfMonth: dayOfMonth ?? undefined,
      months: months ?? undefined,
      monthOfYear: monthOfYear ?? undefined,
      leadTimeMinutes,
      leadTimeUnit,
      leadTimeValue,
      reminderMinutes,
      overlapPolicy,
      enabled: payload.enabled === undefined ? true : !!payload.enabled,
    };
    const created = await repo.insertRecurringTemplate(newTemplate);
    return { ok: true, template: toRecurringPayload(created) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

async function handleRecurringUpdate(args: unknown) {
  const payload = toRecord(args);
  const identifier = extractRecurringIdentifier(payload);
  if (!identifier) {
    return { ok: false, error: 'recurring_update requires { id } or { recurring_template_id }' };
  }
  const repo = getTodoRepository();
  const template = await repo.findRecurringTemplateById(identifier);
  if (!template) return { ok: false, error: `Recurring template not found: ${identifier}` };

  const patch: RecurringTemplateUpdate = {};
  if (typeof payload.title === 'string') patch.title = payload.title;
  if (typeof payload.description === 'string' || payload.description === null) {
    patch.description = payload.description ?? null;
  }
  const freq = normalizeRecurringFrequency(payload.frequency ?? payload.repeat ?? payload.type);
  if (freq) patch.frequency = freq;
  const dayOfWeek = parseDayOfWeekInput(payload.day_of_week ?? payload.dayOfWeek);
  if (dayOfWeek != null) patch.dayOfWeek = dayOfWeek;
  const daysOfWeek =
    parseDaysOfWeekInput(payload.days_of_week ?? payload.daysOfWeek ?? payload.weekdays) ?? null;
  if (daysOfWeek) patch.daysOfWeek = daysOfWeek;
  const dayOfMonth = parseDayOfMonthInput(payload.day_of_month ?? payload.dayOfMonth);
  if (dayOfMonth != null) patch.dayOfMonth = dayOfMonth;
  const months = parseMonthsInput(payload.months ?? payload.month_list ?? payload.monthList);
  if (months) patch.months = months;
  const monthOfYear = parseMonthsInput(payload.month_of_year ?? payload.monthOfYear)?.[0];
  if (monthOfYear != null) patch.monthOfYear = monthOfYear;
  const overlapPolicy = normalizeOverlapPolicy(payload.overlap_policy ?? payload.overlapPolicy);
  if (overlapPolicy) patch.overlapPolicy = overlapPolicy;
  const leadTimeUnit =
    parseLeadTimeUnit(
      payload.lead_time_unit ?? payload.leadTimeUnit ?? payload.lead_time_mode ?? payload.leadTimeMode,
    );
  if (leadTimeUnit) patch.leadTimeUnit = leadTimeUnit;
  const leadTimeValue = parseLeadTimeValue(payload.lead_time_value ?? payload.leadTimeValue);
  if (leadTimeValue !== null) patch.leadTimeValue = leadTimeValue;
  const leadTimeMinutes = parseLeadTimeMinutes(payload.lead_time_minutes ?? payload.leadTimeMinutes);
  if (leadTimeMinutes !== undefined) patch.leadTimeMinutes = leadTimeMinutes;
  const reminderMinutes = parseReminderMinutes(payload.reminder_minutes ?? payload.reminderMinutes);
  if (reminderMinutes !== undefined) patch.reminderMinutes = reminderMinutes;
  const isAllDay = parseIsAllDay(payload.is_all_day ?? payload.isAllDay);
  if (isAllDay !== undefined) patch.isAllDay = isAllDay;
  const timeOfDay = parseTimeOfDayInput(payload.time_of_day ?? payload.timeOfDay ?? payload.time);
  if (timeOfDay !== null) patch.timeOfDay = timeOfDay;
  if (payload.time_of_day === null || payload.timeOfDay === null || payload.time === null) {
    patch.timeOfDay = null;
  }
  if (payload.timezone !== undefined) {
    patch.timezone = typeof payload.timezone === 'string' ? payload.timezone : null;
  }
  if (payload.enabled !== undefined) patch.enabled = !!payload.enabled;

  try {
    const projectId = await resolveProjectFromPayload(repo, payload);
    if (projectId !== undefined) patch.projectId = projectId;
    const next = await repo.updateRecurringTemplate(template.id, patch);
    if (!next) return { ok: false, error: `Recurring template not found: ${template.id}` };
    return { ok: true, template: toRecurringPayload(next) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

async function handleRecurringDelete(args: unknown) {
  const payload = toRecord(args);
  const identifier = extractRecurringIdentifier(payload);
  if (!identifier) {
    return { ok: false, error: 'recurring_delete requires { id }' };
  }
  const repo = getTodoRepository();
  const template = await repo.findRecurringTemplateById(identifier);
  if (!template) return { ok: false, error: `Recurring template not found: ${identifier}` };
  const deleted = await repo.deleteRecurringTemplate(template.id);
  return deleted
    ? { ok: true, deleted: true, template: toRecurringPayload(template) }
    : { ok: false, error: 'Failed to delete recurring template' };
}

export const todoTools: ToolDefinition[] = [
  {
    spec: {
      name: 'todo_list',
      description: `**View the user's todo list stored in Stina.**

Returns todos with their status, description, timepoint (all-day vs timed), and comments.

When to use:
- User asks "what's on my todo list?"
- User asks "show my tasks"
- Before updating a todo (to get its ID)
- To check if a todo already exists before creating it

Example:
User: "What do I need to do today?"
You: Call todo_list with no parameters (or status="not_started")`,
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description:
              "Filter by status. Options: 'not_started', 'in_progress', 'completed', 'cancelled'. Omit to see all todos.",
          },
          limit: {
            type: 'integer',
            description:
              'Maximum number of items to return. Default: 20, Maximum: 200. Use this to avoid overwhelming responses.',
          },
        },
        additionalProperties: false,
      },
    },
    handler: handleTodoList,
  },
  {
    spec: {
      name: 'todo_add',
      description: `**Create a new todo item for the user.**

Use this when the user asks you to remember a task or add something to their todo list. Prefer the term **timepoint/tidpunkt** over deadline. Set is_all_day=true when the user only says a day ("i morgon") and no clock time; use due_at with time and optionally reminder_minutes when a clock time is provided.

When to use:
- User: "Add X to my todo list"
- User: "Remind me to do Y"
- User: "I need to remember to Z"

When NOT to use:
- If a similar todo already exists - use todo_update instead
- For general note-taking - todos are for actionable tasks

Always confirm after adding: "Added 'X' to your todo list."`,
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description:
              'Brief, actionable task description. Example: "Buy groceries" or "Call dentist"',
          },
          description: {
            type: 'string',
            description: 'Optional longer context, notes, or details about the task.',
          },
          status: {
            type: 'string',
            description:
              "Initial status. Usually 'not_started'. Options: 'not_started', 'in_progress', 'completed', 'cancelled'",
          },
          due_at: {
            type: 'string',
            description:
              'Optional timepoint in ISO 8601 format (e.g., "2025-11-15T14:00:00Z"). Include when user specifies a clock time.',
          },
          is_all_day: {
            type: 'boolean',
            description:
              'Set true when the user mentions a day without a clock time (all-day timepoint). False when a specific clock time applies.',
          },
          reminder_minutes: {
            type: 'integer',
            description:
              'Minutes before the timepoint to remind (only for non-all-day). Suggested options: 0,5,15,30,60. Omit or null to skip.',
          },
          project_id: {
            type: 'string',
            description: 'Optional project id to link this todo to (use project_list to find ids).',
          },
          project_name: {
            type: 'string',
            description: 'Optional project name to link to an existing project (exact match).',
          },
          metadata: {
            type: 'object',
            description:
              'Optional JSON metadata for advanced use cases. Usually omitted unless the user provides structured data.',
            additionalProperties: true,
          },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
    handler: handleTodoAdd,
  },
  {
    spec: {
      name: 'todo_update',
      description: `**Update an existing todo item.**

Use this to mark todos as complete, change their status, modify details, or adjust timepoint/reminder settings.

When to use:
- User: "Mark X as done"
- User: "Complete the Y task"
- User: "Change Z to in progress"
- User: "Update the title of X"

Workflow:
1. If you don't have the todo ID, call todo_list first to find it
2. Then call todo_update with the ID and fields to change

Always confirm: "Marked 'X' as completed." or "Updated 'X'."`,
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'Todo ID from a previous todo_list or todo_add response. Preferred over todo_title.',
          },
          todo_title: {
            type: 'string',
            description:
              'Alternative: match by title if ID is unknown. Case-insensitive partial match.',
          },
          title: {
            type: 'string',
            description: 'New title to replace the existing one.',
          },
          description: {
            type: 'string',
            description: 'New description to replace the existing one.',
          },
          status: {
            type: 'string',
            description:
              "Update status. Options: 'not_started', 'in_progress', 'completed', 'cancelled'",
          },
          due_at: {
            type: 'string',
            description: 'New due date in ISO 8601 format. Set to null to remove deadline.',
          },
          is_all_day: {
            type: 'boolean',
            description: 'Toggle whether the timepoint is all-day (true) or time-specific (false).',
          },
          reminder_minutes: {
            type: 'integer',
            description:
              'Minutes before the timepoint to remind (only for non-all-day). Use null to remove, omit to leave unchanged.',
          },
          metadata: {
            type: 'object',
            description: 'Replace the metadata payload entirely.',
            additionalProperties: true,
          },
          project_id: {
            type: 'string',
            description: 'Set or change the linked project by id. Use null to clear.',
          },
          project_name: {
            type: 'string',
            description: 'Set or change the linked project by name (exact match). Use null to clear.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
    handler: handleTodoUpdate,
  },
  {
    spec: {
      name: 'todo_comment_add',
      description: `**Add a progress note or comment to a todo.**

Use this to track updates, notes, or progress on a specific task.

When to use:
- User provides an update: "Add note to X: made good progress"
- Tracking incremental work: "Log progress on Y"

When NOT to use:
- To mark complete - use todo_update with status="completed" instead
- For major changes - use todo_update to change the description

Workflow:
1. Get the todo_id from todo_list
2. Call todo_comment_add with the ID and comment text`,
      parameters: {
        type: 'object',
        properties: {
          todo_id: {
            type: 'string',
            description: 'ID of the todo to comment on (from todo_list or todo_add).',
          },
          content: {
            type: 'string',
            description: 'The comment or progress update to add. Keep it concise.',
          },
        },
        required: ['todo_id', 'content'],
        additionalProperties: false,
      },
    },
    handler: handleTodoCommentAdd,
  },
  {
    spec: {
      name: 'project_list',
      description: `**List all projects configured in Stina.**

Use this before attaching todos to a project so you can reference the correct id and name.

When to use:
- User asks what projects exist
- Before linking a todo to a project`,
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    handler: handleProjectList,
  },
  {
    spec: {
      name: 'project_add',
      description: `**Create a new project.**

Projects group todos. Always confirm the name and optional description with the user if unclear.`,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the project (required).',
          },
          description: {
            type: 'string',
            description: 'Optional project description.',
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
    handler: handleProjectAdd,
  },
  {
    spec: {
      name: 'project_update',
      description: `**Update an existing project by id or name.**

Use this to rename a project or adjust its description.`,
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project id to update (preferred).',
          },
          project_name: {
            type: 'string',
            description: 'Project name to update (exact match).',
          },
          name: {
            type: 'string',
            description: 'New project name.',
          },
          description: {
            type: 'string',
            description: 'New description. Use null to clear.',
          },
        },
        additionalProperties: false,
      },
    },
    handler: handleProjectUpdate,
  },
  {
    spec: {
      name: 'project_delete',
      description: `**Remove a project by id or name.**

Todos linked to this project will remain but lose their project association. Confirm with the user before deleting.`,
      parameters: {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            description: 'Project id to delete.',
          },
          project_name: {
            type: 'string',
            description: 'Project name (exact match) to delete.',
          },
        },
        additionalProperties: false,
      },
    },
    handler: handleProjectDelete,
  },
  {
    spec: {
      name: 'recurring_list',
      description: `**List recurring todo templates (scheduled tasks).**

Use this before updating or deleting a recurring template.`,
      parameters: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'If true, only return enabled templates. Default returns all.',
          },
        },
        additionalProperties: false,
      },
    },
    handler: handleRecurringList,
  },
  {
    spec: {
      name: 'recurring_add',
      description: `**Create a recurring todo template.**

Examples:
- "Varje vecka på måndagar kl 09:00" → frequency=weekly, days_of_week=[1], time_of_day=09:00
- "Varje månad den 15e" → frequency=monthly, day_of_month=15
- "Varje år 5 juni" → frequency=yearly, month_of_year=6, day_of_month=5

The scheduler will create real todos based on this template.`,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title for the generated todos.' },
          description: { type: 'string', description: 'Optional description/notes.' },
          frequency: {
            type: 'string',
            description: "Repeat cadence: 'weekly' | 'monthly' | 'yearly'.",
          },
          days_of_week: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Weekdays (0=Sun..6=Sat) when frequency=weekly. Defaults to today.',
          },
          day_of_week: {
            type: 'integer',
            description: '0-6 (Sunday=0) when frequency=weekly. Deprecated in favor of days_of_week.',
          },
          day_of_month: {
            type: 'integer',
            description: '1-31 when frequency=monthly/yearly (clamped to last day).',
          },
          months: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Months (1-12) when frequency=monthly. Omit for all months.',
          },
          month_of_year: {
            type: 'integer',
            description: 'Month (1-12) when frequency=yearly.',
          },
          time_of_day: {
            type: 'string',
            description: 'HH:MM (24h). Use together with is_all_day=false.',
          },
          is_all_day: {
            type: 'boolean',
            description: 'True for all-day todos (time_of_day ignored).',
          },
          lead_time_unit: {
            type: 'string',
            description:
              "Lead time unit: 'hours', 'days', or 'after_completion' (create next once the prior is done).",
          },
          lead_time_value: {
            type: 'integer',
            description: 'Lead time value paired with lead_time_unit. Non-negative.',
          },
          lead_time_minutes: {
            type: 'integer',
            description:
              'Optional legacy input. Minutes before due time. lead_time_unit/value preferred.',
          },
          reminder_minutes: {
            type: 'integer',
            description: 'Reminder offset in minutes before due time. Null or omit for none.',
          },
          overlap_policy: {
            type: 'string',
            description:
              "How to handle existing open instances: 'skip_if_open' (default), 'allow_multiple', 'replace_open' (cancel open then create new).",
          },
          enabled: { type: 'boolean', description: 'Set false to create paused.' },
          project_id: { type: 'string', description: 'Optional project id.' },
          project_name: { type: 'string', description: 'Optional project name (exact match).' },
        },
        required: ['title', 'frequency'],
        additionalProperties: false,
      },
    },
    handler: handleRecurringAdd,
  },
  {
    spec: {
      name: 'recurring_update',
      description: `**Update a recurring todo template.**

Use after recurring_list to get the id.`,
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Template id (preferred).' },
          recurring_template_id: { type: 'string', description: 'Alias for id.' },
          title: { type: 'string', description: 'New title.' },
          description: { type: 'string', description: 'New description.' },
          frequency: {
            type: 'string',
            description: "Repeat cadence: 'weekly' | 'monthly' | 'yearly'.",
          },
          days_of_week: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Weekdays (0=Sun..6=Sat) when frequency=weekly.',
          },
          day_of_week: {
            type: 'integer',
            description: '0-6 (Sunday=0) for weekly. Deprecated in favor of days_of_week.',
          },
          day_of_month: { type: 'integer', description: '1-31 for monthly/yearly.' },
          months: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Months (1-12) when frequency=monthly. Omit for all months.',
          },
          month_of_year: {
            type: 'integer',
            description: 'Month (1-12) when frequency=yearly.',
          },
          time_of_day: { type: 'string', description: 'HH:MM (24h).' },
          is_all_day: { type: 'boolean', description: 'All-day toggle.' },
          lead_time_unit: {
            type: 'string',
            description:
              "Lead time unit: 'hours', 'days', or 'after_completion' (create next once the prior is done).",
          },
          lead_time_value: {
            type: 'integer',
            description: 'Lead time value paired with lead_time_unit. Non-negative.',
          },
          lead_time_minutes: {
            type: 'integer',
            description: 'Minutes before due time to create the todo (legacy).',
          },
          reminder_minutes: {
            type: 'integer',
            description: 'Reminder offset in minutes before due time. Null or omit for none.',
          },
          overlap_policy: {
            type: 'string',
            description:
              "How to handle existing open instances: 'skip_if_open', 'allow_multiple', 'replace_open'.",
          },
          enabled: { type: 'boolean', description: 'Enable/disable the template.' },
          project_id: { type: 'string', description: 'Project id to link future todos.' },
          project_name: { type: 'string', description: 'Project name (exact match).' },
        },
        required: [],
        additionalProperties: false,
      },
    },
    handler: handleRecurringUpdate,
  },
  {
    spec: {
      name: 'recurring_delete',
      description: `**Delete a recurring todo template by id.**

Existing todos stay but lose the template link.`,
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Template id to delete.' },
          recurring_template_id: { type: 'string', description: 'Alias for id.' },
        },
        required: [],
        additionalProperties: false,
      },
    },
    handler: handleRecurringDelete,
  },
];

/**
 * Coerces arbitrary input into a plain record for easier property access.
 */
function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    const parsed = parseJsonRecord(value);
    if (parsed) return unwrapPayload(parsed);
    return {};
  }
  if (isRecord(value)) {
    return unwrapPayload(value);
  }
  return {};
}

function unwrapPayload(record: Record<string, unknown>): Record<string, unknown> {
  const unwrapKeys = ['message', 'payload', 'parameters', 'args', 'arguments'];
  for (const key of unwrapKeys) {
    const candidate = record[key];
    if (isRecord(candidate)) return candidate;
    if (typeof candidate === 'string') {
      const parsed = parseJsonRecord(candidate);
      if (parsed) return parsed;
    }
  }
  return record;
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Type guard verifying that a value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Normalizes unknown errors so tool responses get a user-friendly string.
 */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
function extractTodoIdentifier(payload: Record<string, unknown>): string {
  const candidates = ['id', 'todo_id', 'todoId', 'todo_title', 'title', 'name', 'label'];
  for (const key of candidates) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function extractProjectIdentifier(payload: Record<string, unknown>): string {
  const candidates = ['project_id', 'projectId', 'id', 'project_name', 'projectName', 'identifier'];
  for (const key of candidates) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function extractRecurringIdentifier(payload: Record<string, unknown>): string {
  const candidates = ['id', 'recurring_template_id', 'recurringId', 'template_id', 'identifier'];
  for (const key of candidates) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}
