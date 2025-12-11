import { initI18n, t } from '@stina/i18n';
import { getLanguage, readSettings } from '@stina/settings';
import { getTodoRepository } from '@stina/work';

import { getMemoryRepository } from '../../memories/index.js';

/**
 * Generates a new prompt for starting a chat session.
 * Incorporates user profile information if available, or encourages gathering it and being welcoming.
 * Includes a list of saved memory titles to give context about what the AI knows.
 * Uses the user's preferred language from settings for all prompts.
 */
export async function generateNewSessionStartPrompt(): Promise<string> {
  // Ensure i18n is initialized with the user's preferred language
  const savedLang = await getLanguage();
  if (savedLang) {
    initI18n(savedLang);
  }

  const settings = await readSettings();

  // Retrieve the user's first name and nickname from settings
  const firstName = settings.userProfile?.firstName;
  const nickName = settings.userProfile?.nickname;

  const promptParts = [];
  const fullName =
    firstName == null && nickName == null
      ? t('new_unknown_user_without_name')
      : firstName + (nickName ? ` (${nickName})` : '');

  // Build the prompt based on available user information
  promptParts.push(
    t('chat.new_session_prompt_start', { name: fullName, nickName: nickName ?? 'hen' }),
  ); // Who Stina is prompt
  if (firstName || nickName) {
    promptParts.push(
      t('chat.new_session_prompt_name_lock', { name: nickName ?? firstName ?? 'the user' }),
    );
  }
  promptParts.push(
    t('chat.new_session_prompt_initial_tool_info', {
      nickName: nickName ?? firstName ?? 'the user',
    }),
  ); // Initial tool usage prompt
  promptParts.push(t('chat.new_session_prompt_day_planning')); // Encourage mixing calendar + todos for day view
  promptParts.push(t('chat.new_session_prompt_initial_memory_info')); // Initial memory usage prompt
  promptParts.push(t('chat.new_session_prompt_fact_vs_todo')); // Encourage facts->memories, actions->todos
  promptParts.push(t('chat.new_session_prompt_todo_completion')); // Keep todos/memories synced
  promptParts.push(t('chat.new_session_prompt_todo_update_prefer_existing')); // Prefer updating over duplicating todos

  // Include saved memories if any exist
  const memories = await getMemoryRepository().list(100); // Get up to 100 most recent memories
  const now = Date.now();
  const activeMemories = memories.filter(
    (m) => m.validUntil == null || (typeof m.validUntil === 'number' && m.validUntil >= now),
  );
  if (activeMemories.length > 0) {
    const memoryList = activeMemories
      .map((m, i) => `${i + 1}. "${m.title}" (id: ${m.id})`)
      .join('\n');
    promptParts.push(
      t('chat.new_session_prompt_memory_active_list', {
        count: activeMemories.length,
        list: memoryList,
      }),
    );
  } else if (memories.length > 0) {
    const memoryList = memories.map((m, i) => `${i + 1}. "${m.title}" (id: ${m.id})`).join('\n');
    promptParts.push(
      t('chat.new_session_prompt_memory_list', { count: memories.length, list: memoryList }),
    );
  }

  // Include project names to give the assistant awareness of ongoing work buckets.
  const projects = await getTodoRepository().listProjects();
  if (projects.length > 0) {
    const projectNames = projects.map((project) => project.name).join(', ');
    promptParts.push(
      t('chat.new_session_prompt_projects_list', {
        count: projects.length,
        list: projectNames,
      }),
    );
  }

  if (firstName == null && nickName == null) {
    promptParts.push(t('chat.new_session_prompt_new_user'));
  } else {
    promptParts.push(
      t('chat.new_session_prompt_end', { name: nickName ?? firstName ?? 'användaren' }),
    );
  }

  return promptParts.join('\n\n');
}
