import { initI18n, t } from '@stina/i18n';
import { getLanguage, readSettings } from '@stina/settings';

/**
 * Generates a new prompt for starting a chat session.
 * Incorporates user profile information if available, or encourages gathering it and being welcoming.
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
      ? `(${t('new_unknown_user_without_name')})`
      : firstName + (nickName ? ` (${nickName})` : '');

  // Build the prompt based on available user information
  promptParts.push(
    t('chat.new_session_prompt_start', { name: fullName, nickName: nickName ?? 'hen' }),
  ); // Who Stina is prompt
  promptParts.push(t('chat.new_session_prompt_initial_tool_info')); // Initial tool usage prompt
  if (firstName == null || nickName == null) {
    promptParts.push(t('chat.new_session_prompt_new_user'));
  } else {
    promptParts.push(t('chat.new_session_prompt_end', { name: nickName ?? firstName }));
  }

  return promptParts.join('\n');
}
