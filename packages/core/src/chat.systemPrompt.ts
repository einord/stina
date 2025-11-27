import { initI18n, t } from '@stina/i18n';
import { getLanguage, readSettings } from '@stina/settings';
import { getTodoRepository } from '@stina/todos';
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
  promptParts.push(t('chat.new_session_prompt_initial_tool_info')); // Initial tool usage prompt
  promptParts.push(t('chat.new_session_prompt_initial_memory_info')); // Initial memory usage prompt

  // Include saved memories if any exist
  const memories = await getMemoryRepository().list(100); // Get up to 100 most recent memories
  if (memories.length > 0) {
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
