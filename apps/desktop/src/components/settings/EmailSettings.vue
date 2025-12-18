<template>
  <div class="email-settings">
    <SettingsPanel>
      <EntityList
        :title="t('tools.modules.email.title')"
        :description="t('tools.modules.email.description')"
        :loading="loading"
        :error="loadError"
        :empty-text="t('tools.modules.email.empty')"
      >
        <template #actions>
          <SimpleButton type="primary" @click="startEdit(null)" :title="t('tools.modules.email.add')">
            <Add01Icon class="add-icon" />
          </SimpleButton>
        </template>

        <template v-for="account in accounts" :key="account.id">
          <li class="account-card">
            <div class="card-left">
              <SubFormHeader :title="account.label" :description="account.emailAddress">
                <SimpleButton size="sm" type="secondary" @click="toggleEnabled(account)">
                  {{
                    account.enabled === false
                      ? t('tools.modules.email.enable_button')
                      : t('tools.modules.email.disable_button')
                  }}
                </SimpleButton>
                <IconButton @click="startEdit(account)" :title="t('tools.modules.email.edit')">
                  <EditIcon />
                </IconButton>
                <IconButton
                  type="danger"
                  @click="handleDelete(account.id)"
                  :title="t('tools.modules.email.remove')"
                >
                  <DeleteIcon />
                </IconButton>
              </SubFormHeader>
              <div class="meta">
                <span class="badge" :class="{ off: account.enabled === false }">
                  {{
                    account.enabled === false
                      ? t('tools.modules.email.disabled')
                      : t('tools.modules.email.enabled')
                  }}
                </span>
                <span class="badge" :class="{ off: !ruleForAccount(account.id)?.enabled }">
                  {{
                    ruleForAccount(account.id)?.enabled
                      ? t('tools.modules.email.auto_react_on')
                      : t('tools.modules.email.auto_react_off')
                  }}
                </span>
                <span class="badge policy">
                  {{ sendModeLabel(ruleForAccount(account.id)?.sendMode ?? 'require_approval') }}
                </span>
              </div>
            </div>
          </li>
        </template>
      </EntityList>
    </SettingsPanel>
  </div>

  <BaseModal
    :open="showModal"
    :title="editingId === 'new' || !editingId ? t('tools.modules.email.add') : t('tools.modules.email.edit')"
    :close-label="t('tools.modules.email.close')"
    @close="cancelEdit"
  >
    <div class="modal-form">
      <FormInputText v-model="form.label" :label="t('tools.modules.email.fields.label')" />
      <FormInputText v-model="form.emailAddress" :label="t('tools.modules.email.fields.email')" />
      <FormInputText v-model="form.username" :label="t('tools.modules.email.fields.username')" />
      <FormInputText
        v-model="form.loginUsername"
        :label="t('tools.modules.email.fields.login_username')"
        :hint="t('tools.modules.email.fields.login_username_hint')"
      />
      <FormInputText
        v-model="form.password"
        :label="t('tools.modules.email.fields.password')"
        :placeholder="passwordPlaceholder"
      />

      <div class="server-grid">
        <div class="server">
          <SubFormHeader
            :title="t('tools.modules.email.imap.title')"
            :description="t('tools.modules.email.imap.description')"
          />
          <FormInputText v-model="form.imapHost" :label="t('tools.modules.email.fields.host')" />
          <FormInputText v-model="form.imapPort" :label="t('tools.modules.email.fields.port')" />
          <FormCheckbox v-model="form.imapSecure" :label="t('tools.modules.email.fields.secure')" />
        </div>

        <div class="server">
          <SubFormHeader
            :title="t('tools.modules.email.smtp.title')"
            :description="t('tools.modules.email.smtp.description')"
          />
          <FormInputText v-model="form.smtpHost" :label="t('tools.modules.email.fields.host')" />
          <FormInputText v-model="form.smtpPort" :label="t('tools.modules.email.fields.port')" />
          <FormCheckbox v-model="form.smtpSecure" :label="t('tools.modules.email.fields.secure')" />
        </div>
      </div>

      <div class="automation">
        <SubFormHeader
          :title="t('tools.modules.email.automation.title')"
          :description="t('tools.modules.email.automation.description')"
        />
        <FormCheckbox v-model="form.autoReact" :label="t('tools.modules.email.automation.enable')" />
        <FormTextArea
          v-model="form.instruction"
          :label="t('tools.modules.email.automation.instruction_label')"
          :placeholder="t('tools.modules.email.automation.instruction_placeholder')"
          :disabled="!form.autoReact"
        />
        <FormSelect
          v-model="form.sendMode"
          :label="t('tools.modules.email.automation.send_mode_label')"
          :hint="t('tools.modules.email.automation.send_mode_hint')"
          :options="sendModeOptions"
          :disabled="!form.autoReact"
        />
      </div>

      <p v-if="modalError" class="error">{{ modalError }}</p>
      <div class="modal-actions">
        <SimpleButton type="primary" :disabled="saving" @click="saveEdit">
          {{ saving ? t('tools.modules.email.saving') : t('tools.modules.email.save') }}
        </SimpleButton>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
  import Add01Icon from '~icons/hugeicons/add-01';
  import DeleteIcon from '~icons/hugeicons/delete-01';
  import EditIcon from '~icons/hugeicons/edit-01';

  import { t } from '@stina/i18n';
  import type { EmailAccount, EmailAutomationRule, EmailSendMode } from '@stina/settings';
  import { computed, onMounted, ref } from 'vue';

  import SimpleButton from '../buttons/SimpleButton.vue';
  import BaseModal from '../common/BaseModal.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';
  import FormCheckbox from '../form/FormCheckbox.vue';
  import FormInputText from '../form/FormInputText.vue';
  import FormSelect from '../form/FormSelect.vue';
  import FormTextArea from '../form/FormTextArea.vue';
  import IconButton from '../ui/IconButton.vue';

  import EntityList from './EntityList.vue';

  type EmailFormState = {
    id: string | null;
    label: string;
    emailAddress: string;
    username: string;
    loginUsername: string;
    password: string;
    imapHost: string;
    imapPort: string;
    imapSecure: boolean;
    smtpHost: string;
    smtpPort: string;
    smtpSecure: boolean;
    autoReact: boolean;
    instruction: string;
    sendMode: EmailSendMode;
    hasPassword: boolean;
  };

  const accounts = ref<EmailAccount[]>([]);
  const rules = ref<EmailAutomationRule[]>([]);
  const loading = ref(true);
  const loadError = ref<string | null>(null);
  const saving = ref(false);
  const showModal = ref(false);
  const editingId = ref<string | null>(null);
  const modalError = ref<string | null>(null);

  const form = ref<EmailFormState>({
    id: null,
    label: '',
    emailAddress: '',
    username: '',
    loginUsername: '',
    password: '',
    imapHost: '',
    imapPort: '993',
    imapSecure: true,
    smtpHost: '',
    smtpPort: '465',
    smtpSecure: true,
    autoReact: false,
    instruction: '',
    sendMode: 'require_approval',
    hasPassword: false,
  });

  const sendModeOptions = computed(() => [
    { value: 'blocked', label: t('tools.modules.email.automation.send_mode.blocked') },
    { value: 'require_approval', label: t('tools.modules.email.automation.send_mode.require_approval') },
    { value: 'auto_send', label: t('tools.modules.email.automation.send_mode.auto_send') },
  ]);

  const passwordPlaceholder = computed(() => {
    if (editingId.value && editingId.value !== 'new' && form.value.hasPassword) {
      return t('tools.modules.email.fields.password_keep_placeholder');
    }
    return t('tools.modules.email.fields.password_placeholder');
  });

  function sendModeLabel(mode: EmailSendMode) {
    if (mode === 'blocked') return t('tools.modules.email.automation.send_mode.blocked');
    if (mode === 'auto_send') return t('tools.modules.email.automation.send_mode.auto_send');
    return t('tools.modules.email.automation.send_mode.require_approval');
  }

  function ruleForAccount(accountId: string): EmailAutomationRule | null {
    return rules.value.find((r) => r.accountId === accountId) ?? null;
  }

  async function load() {
    loading.value = true;
    loadError.value = null;
    try {
      accounts.value = await window.stina.settings.getEmailAccounts();
      rules.value = await window.stina.settings.getEmailRules();
    } catch {
      loadError.value = t('tools.modules.email.load_error');
      accounts.value = [];
      rules.value = [];
    } finally {
      loading.value = false;
    }
  }

  function startEdit(account: EmailAccount | null) {
    const id = account?.id ?? 'new';
    editingId.value = id;
    const rule = account ? ruleForAccount(account.id) : null;
    form.value = {
      id: account?.id ?? null,
      label: account?.label ?? '',
      emailAddress: account?.emailAddress ?? '',
      username: account?.username ?? '',
      loginUsername: account?.loginUsername ?? '',
      password: '',
      imapHost: account?.imap?.host ?? '',
      imapPort: String(account?.imap?.port ?? 993),
      imapSecure: account?.imap?.secure ?? true,
      smtpHost: account?.smtp?.host ?? '',
      smtpPort: String(account?.smtp?.port ?? 465),
      smtpSecure: account?.smtp?.secure ?? true,
      autoReact: rule?.enabled ?? false,
      instruction: rule?.instruction ?? '',
      sendMode: (rule?.sendMode as EmailSendMode) ?? 'require_approval',
      hasPassword: Boolean((account as any)?.hasPassword),
    };
    modalError.value = null;
    showModal.value = true;
  }

  function cancelEdit() {
    showModal.value = false;
    editingId.value = null;
    modalError.value = null;
  }

  async function saveEdit() {
    if (saving.value) return;
    modalError.value = null;
    saving.value = true;
    try {
      const accountPayload: Partial<EmailAccount> = {
        id: form.value.id ?? undefined,
        label: form.value.label,
        emailAddress: form.value.emailAddress,
        username: form.value.username,
        loginUsername: form.value.loginUsername || undefined,
        password: form.value.password ? form.value.password : undefined,
        imap: {
          host: form.value.imapHost,
          port: Number(form.value.imapPort),
          secure: form.value.imapSecure,
        },
        smtp: {
          host: form.value.smtpHost,
          port: Number(form.value.smtpPort),
          secure: form.value.smtpSecure,
        },
        enabled: true,
      };

      const saved = await window.stina.settings.upsertEmailAccount(accountPayload);

      if (form.value.autoReact) {
        const existing = ruleForAccount(saved.id);
        await window.stina.settings.upsertEmailRule({
          id: existing?.id,
          accountId: saved.id,
          enabled: true,
          instruction: form.value.instruction,
          sendMode: form.value.sendMode,
        });
      } else {
        const existing = ruleForAccount(saved.id);
        if (existing) {
          await window.stina.settings.upsertEmailRule({ id: existing.id, accountId: saved.id, enabled: false });
        }
      }

      await load();
      cancelEdit();
    } catch (err) {
      modalError.value = err instanceof Error ? err.message : t('tools.modules.email.save_error');
    } finally {
      saving.value = false;
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('tools.modules.email.confirm_delete'))) return;
    try {
      await window.stina.settings.removeEmailAccount(id);
      await load();
    } catch {
      alert(t('tools.modules.email.remove_error'));
    }
  }

  async function toggleEnabled(account: EmailAccount) {
    try {
      await window.stina.settings.setEmailAccountEnabled(
        account.id,
        account.enabled === false ? true : false,
      );
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('tools.modules.email.toggle_error');
      alert(message);
    }
  }

  onMounted(load);
</script>

<style scoped>
  .email-settings {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .account-card {
    display: flex;
    align-items: stretch;
    padding: 1rem;

    > .card-left {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;

      > .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;

        > .badge {
          font-size: 0.8rem;
          padding: 0.25rem 0.5rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--primary) 12%, transparent);
          color: var(--text);

          &.off {
            background: color-mix(in srgb, var(--muted) 18%, transparent);
            color: var(--muted);
          }

          &.policy {
            background: color-mix(in srgb, var(--window-bg-lower) 80%, transparent);
          }
        }
      }
    }
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .server-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;

    > .server {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 0.75rem;
      border: 1px solid var(--border);
      border-radius: var(--border-radius-normal);
      background: var(--window-bg-lower);
    }
  }

  .automation {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--border-radius-normal);
    background: var(--window-bg-lower);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
  }

  .error {
    color: var(--error);
    font-size: 0.9rem;
  }
</style>
