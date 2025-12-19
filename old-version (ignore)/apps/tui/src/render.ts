import type { Interaction, InteractionMessage } from '@stina/chat';
import type { CalendarEvent } from '@stina/calendar';
import type { Todo } from '@stina/work';
import { t } from '@stina/i18n';

import type { UILayout } from './layout.js';
import type { ViewKey } from './status.js';

function parseMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata) return null;
  if (typeof metadata === 'object') return metadata as Record<string, unknown>;
  if (typeof metadata !== 'string') return null;
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function getToolDisplayName(msg: InteractionMessage): string | null {
  const meta = parseMetadata((msg as unknown as { metadata?: unknown }).metadata);
  const toolName =
    typeof meta?.tool === 'string'
      ? meta.tool
      : typeof meta?.name === 'string'
        ? meta.name
        : null;
  const translated = toolName ? t(`tool.${toolName}`) : null;
  if (translated && translated !== `tool.${toolName}`) return translated;

  const content = (msg.content ?? '').split('\n')[0] ?? '';
  const pieces = content.split('•').map((part) => part.trim()).filter(Boolean);
  const labelFromContent = pieces.length >= 2 ? pieces[1] : content.replace(/^Tool\s*[-:•]?\s*/i, '');
  return translated || toolName || labelFromContent || null;
}

function applyInlineFormatting(text: string): string {
  let out = text;
  // Inline code
  out = out.replace(/`([^`]+)`/g, '{cyan-fg}$1{/cyan-fg}');
  // Bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '{bold}$1{/bold}');
  out = out.replace(/__([^_]+)__/g, '{bold}$1{/bold}');
  // Italic (best-effort)
  out = out.replace(/\*(?!\s)([^*]+)\*(?!\*)/g, '{underline}$1{/underline}');
  out = out.replace(/_(?!\s)([^_]+)_(?!_)/g, '{underline}$1{/underline}');
  return out;
}

function applyMarkdownFormatting(text: string): string {
  // Escape blessed braces unless they are part of tags we insert
  const escaped = text.replace(/\{/g, '\\{').replace(/\}/g, '\\}');

  const lines = escaped.split('\n');
  const out: string[] = [];
  let inCode = false;

  for (const rawLine of lines) {
    // Handle fenced code blocks (```)
    if (/^```/.test(rawLine.trim())) {
      if (!inCode) {
        out.push('{gray-fg}┌──────── code{/gray-fg}');
        inCode = true;
      } else {
        out.push('{gray-fg}└────────{/gray-fg}');
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      out.push(`{gray-fg}│ ${rawLine}{/gray-fg}`);
      continue;
    }

    let line = rawLine;

    // Headings
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const lvl = heading[1].length;
      const content = heading[2].toUpperCase();
      if (lvl === 1) {
        out.push(`{white-fg}{bold}${content}{/bold}{/white-fg}`);
      } else if (lvl === 2) {
        out.push(`{white-fg}${content}{/white-fg}`);
      } else {
        out.push(`{light-gray-fg}${content}{/light-gray-fg}`);
      }
      continue;
    }

    // Blockquote
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      const q = applyInlineFormatting(quote[1]);
      out.push(`{yellow-fg}│ ${q}{/yellow-fg}`);
      continue;
    }

    // Bullets
    if (/^[-*•]\s+/.test(line)) {
      line = line.replace(/^[-*•]\s+/, `{cyan-fg}•{/cyan-fg} `);
    }

    const formatted = applyInlineFormatting(line);
    out.push(`{white-fg}${formatted}{/white-fg}`);
  }

  return out.join('\n');
}

function formatChatMessage(msg: InteractionMessage, isDebugMode: boolean, abortedInteraction = false): string | null {
  if (!isDebugMode && (msg.role === 'instructions' || msg.role === 'debug')) {
    return null;
  }
  if (msg.role === 'tool') return null;

  if (msg.role === 'info') {
    return `{center}${msg.content}{/center}`;
  }
  const isUser = msg.role === 'user';
  const icon = isUser ? '🙂' : '🤖';
  const suffix = abortedInteraction ? ' (avbrutet)' : '';
  const formatted = applyMarkdownFormatting(msg.content ?? '');

  if (isUser) {
    const padded = formatted.split('\n').map((line) => `{black-bg}${line}{/black-bg}`).join('\n');
    return `{right}${padded}{/right}`;
  }

  return `${icon}  ${formatted}${suffix}`;
}

function formatToolMessages(messages: InteractionMessage[]): string | null {
  if (!messages.length) return null;
  const parts = messages.map(getToolDisplayName).filter(Boolean) as string[];
  if (!parts.length) return null;
  const joined = parts.join('  -  ');
  return `{yellow-bg}{black-fg} ${joined} {/black-fg}{/yellow-bg}`;
}

export function renderChatView(options: {
  interactions: Interaction[];
  streamBuffers: Map<string, string>;
  layout: UILayout;
  chatAutoScroll: boolean;
  isDebugMode: boolean;
}) {
  const { interactions, streamBuffers, layout, chatAutoScroll, isDebugMode } = options;
  const parts: string[] = [];
  for (const interaction of interactions) {
    const toolMessages = interaction.messages.filter((m) => m.role === 'tool');
    for (const msg of interaction.messages) {
      if (msg.role === 'tool') continue;
      const formatted = formatChatMessage(msg, isDebugMode, interaction.aborted === true);
      if (formatted) {
        parts.push(formatted);
      }
    }
    const formattedTools = formatToolMessages(toolMessages);
    if (formattedTools) parts.push(formattedTools);
  }
  for (const [, text] of streamBuffers.entries()) {
    const display = text || '…';
    parts.push(`🤖  ${display} ▌`);
  }
  layout.main.setContent(parts.length > 0 ? parts.join('\n\n') : 'Inga meddelanden ännu.');
  if (chatAutoScroll) {
    layout.main.setScrollPerc(100);
  }
}

export function renderMainView(view: ViewKey, renderChat: () => void, layout: UILayout) {
  switch (view) {
    case 'chat':
      renderChat();
      break;
    case 'tools':
      layout.main.setContent('{bold}Tools{/}\n\nInga verktyg valda ännu.');
      break;
    case 'settings':
      layout.main.setContent('{bold}Settings{/}\n\nKonfigurera Stina via GUI/TUI i framtiden.');
      break;
  }
}

function formatDue(todo: Todo): string {
  if (todo.isAllDay && todo.dueAt) {
    const d = new Date(todo.dueAt);
    return ` · ${d.toLocaleDateString()}`;
  }
  if (todo.dueAt) {
    const d = new Date(todo.dueAt);
    return ` · ${d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  }
  return '';
}

export function renderTodosPane(list: Todo[], layout: UILayout) {
  const open = list.filter((todo) => todo.status !== 'completed' && todo.status !== 'cancelled');
  const closedToday = list.filter((todo) => {
    if (todo.status !== 'completed' && todo.status !== 'cancelled') return false;
    const updated = todo.updatedAt ?? todo.createdAt ?? 0;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return updated >= start;
  });

  const iconForStatus = (status: Todo['status']) => {
    switch (status) {
      case 'completed':
        return '✔';
      case 'in_progress':
        return '…';
      case 'cancelled':
        return '×';
      default:
        return '•';
    }
  };

  const lines: string[] = [`{bold}${t('tui.todos_title')}{/}`];
  if (open.length === 0) {
    lines.push(t('tui.todos_empty'));
  } else {
    const sorted = [...open].sort((a, b) => {
      const aDue = a.dueAt ?? Number.POSITIVE_INFINITY;
      const bDue = b.dueAt ?? Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });
    const top = sorted.slice(0, 12);
    for (const todo of top) {
      const icon = iconForStatus(todo.status);
      const due = formatDue(todo);
      lines.push(`${icon} ${todo.title}${due}`);
    }
    if (sorted.length > top.length) {
      lines.push(t('tui.todos_more', { count: sorted.length - top.length }));
    }
  }

  if (closedToday.length > 0) {
    lines.push('');
    lines.push(t('tui.todos_completed_today', { count: closedToday.length }));
  }

  layout.todos.setContent(lines.join('\n'));
}

export function renderCalendarPane(events: CalendarEvent[], layout: UILayout) {
  const lines: string[] = [`{bold}${t('tui.calendar_title')}{/}`];
  if (events.length === 0) {
    lines.push(t('tui.calendar_empty'));
  } else {
    const top = events.slice(0, 8);
    for (const ev of top) {
      const start = new Date(ev.startTs);
      const label = ev.allDay
        ? start.toLocaleDateString()
        : start.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      lines.push(`• ${ev.title} · ${label}`);
    }
    if (events.length > top.length) {
      lines.push(t('tui.calendar_more', { count: events.length - top.length }));
    }
  }
  layout.calendar.setContent(lines.join('\n'));
}
