<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { MCPServer, MCPServerType } from '@stina/settings';
  import { computed, reactive, ref, watch, withDefaults } from 'vue';

  import FormButtonSelect from '../form/FormButtonSelect.vue';
  import FormCheckbox from '../form/FormCheckbox.vue';
  import FormInputText from '../form/FormInputText.vue';
  import SimpleButton from '../buttons/SimpleButton.vue';

  const emit = defineEmits<{
    save: [
      server: {
        name: string;
        type: MCPServerType;
        url?: string;
        command?: string;
        oauth?: MCPServer['oauth'];
      },
    ];
    cancel?: [];
  }>();

  const props = withDefaults(
    defineProps<{
      initialServer?: Partial<MCPServer>;
      autoExpand?: boolean;
      expandable?: boolean;
    }>(),
    {
      autoExpand: false,
      expandable: true,
    },
  );

  const isExpanded = ref(Boolean(props.autoExpand));
  const form = reactive({
    name: '',
    type: 'websocket' as MCPServerType,
    url: '',
    command: '',
    oauthEnabled: false,
    oauth: {
      authorizationUrl: '',
      tokenUrl: '',
      clientId: '',
      clientSecret: '',
      scope: '',
      redirectUri: '',
      headerName: '',
      sendRawAccessToken: false,
    },
  });

  const isValid = computed(() => {
    const hasName = form.name.trim() !== '';
    if (form.type === 'websocket') {
      const hasUrl = form.url.trim() !== '';
      return hasName && hasUrl && isOAuthValid();
    } else {
      return hasName && form.command.trim() !== '' && isOAuthValid();
    }
  });

  const headerTitle = computed(() =>
    props.initialServer ? t('tools.edit_server_title') : t('tools.add_server.title'),
  );
  const closeLabel = computed(() => t('tools.add_server.cancel'));

  const connectionTypeOptions = computed(() => [
    { value: 'websocket', label: t('tools.add_server.websocket_url') },
    { value: 'stdio', label: t('tools.add_server.command_stdio') },
  ]);

  /**
   * Populates the form with initial server data when editing.
   */
  function applyInitial(server?: Partial<MCPServer>) {
    if (!server) return;
    form.name = server.name ?? '';
    form.type = server.type ?? 'websocket';
    form.url = server.url ?? '';
    form.command = server.command ?? '';
    form.oauthEnabled = Boolean(server.oauth);
    form.oauth.authorizationUrl = server.oauth?.authorizationUrl ?? '';
    form.oauth.tokenUrl = server.oauth?.tokenUrl ?? '';
    form.oauth.clientId = server.oauth?.clientId ?? '';
    form.oauth.clientSecret = '';
    form.oauth.scope = server.oauth?.scope ?? '';
    form.oauth.redirectUri = server.oauth?.redirectUri ?? '';
    form.oauth.headerName = server.oauth?.headerName ?? '';
    form.oauth.sendRawAccessToken = server.oauth?.sendRawAccessToken ?? false;
    isExpanded.value = true;
  }

  /**
   * Emits a valid server payload to the parent component.
   */
  function save() {
    if (!isValid.value) return;

    const server: {
      name: string;
      type: MCPServerType;
      url?: string;
      command?: string;
      oauth?: MCPServer['oauth'];
    } = {
      name: form.name.trim(),
      type: form.type,
    };

    if (form.type === 'websocket') {
      server.url = form.url.trim();
    } else {
      server.command = form.command.trim();
    }

    const oauthPayload = buildOAuthPayload();
    if (oauthPayload) {
      server.oauth = oauthPayload;
    }

    emit('save', server);
    resetForm();
  }

  /**
   * Resets state and notifies parent that the form was cancelled.
   */
  function cancel() {
    resetForm();
    emit('cancel');
  }

  /**
   * Restores default state and reapplies provided initial data.
   */
  function resetForm(initial?: Partial<MCPServer>) {
    form.name = '';
    form.type = 'websocket';
    form.url = '';
    form.command = '';
    form.oauthEnabled = false;
    form.oauth.authorizationUrl = '';
    form.oauth.tokenUrl = '';
    form.oauth.clientId = '';
    form.oauth.clientSecret = '';
    form.oauth.scope = '';
    form.oauth.redirectUri = '';
    form.oauth.headerName = '';
    form.oauth.sendRawAccessToken = false;
    isExpanded.value = props.expandable === false ? Boolean(props.autoExpand) : false;
    applyInitial(initial ?? props.initialServer);
  }

  /**
   * Validates required OAuth fields before saving.
   */
  function isOAuthValid(): boolean {
    if (!form.oauthEnabled) return true;
    return (
      form.oauth.authorizationUrl.trim() !== '' &&
      form.oauth.tokenUrl.trim() !== '' &&
      form.oauth.clientId.trim() !== '' &&
      form.oauth.redirectUri.trim() !== ''
    );
  }

  /**
   * Builds the OAuth payload if enabled and valid.
   */
  function buildOAuthPayload(): MCPServer['oauth'] | undefined {
    if (!form.oauthEnabled) return undefined;
    if (!isOAuthValid()) return undefined;
    const payload: MCPServer['oauth'] = {
      authorizationUrl: form.oauth.authorizationUrl.trim(),
      tokenUrl: form.oauth.tokenUrl.trim(),
      clientId: form.oauth.clientId.trim(),
      redirectUri: form.oauth.redirectUri.trim(),
      sendRawAccessToken: form.oauth.sendRawAccessToken,
    };
    if (form.oauth.clientSecret.trim()) payload.clientSecret = form.oauth.clientSecret.trim();
    if (form.oauth.scope.trim()) payload.scope = form.oauth.scope.trim();
    if (form.oauth.headerName.trim()) payload.headerName = form.oauth.headerName.trim();
    return payload;
  }

  watch(
    () => props.initialServer,
    (server) => {
      resetForm(server ?? undefined);
    },
  );

  if (props.initialServer) {
    applyInitial(props.initialServer);
  }
</script>

<template>
  <div class="add-server-form">
    <div v-if="!isExpanded && expandable" class="collapsed">
      <div class="collapsed-copy">
        <h3>{{ headerTitle }}</h3>
        <p>{{ t('tools.add_server_hint') }}</p>
      </div>
      <SimpleButton type="primary" @click="isExpanded = true">
        {{ t('tools.add_server.button') }}
      </SimpleButton>
    </div>

    <form v-else class="form" @submit.prevent="save">
      <div v-if="expandable" class="inline-header">
        <h3>{{ headerTitle }}</h3>
        <SimpleButton class="close" :title="closeLabel" @click.prevent="cancel">
          {{ closeLabel }}
        </SimpleButton>
      </div>

      <div class="inputs">
        <FormInputText
          v-model="form.name"
          :label="t('tools.add_server.name_label')"
          :placeholder="t('tools.add_server.name_placeholder')"
          required
        />

        <FormButtonSelect
          v-model="form.type"
          :label="t('tools.add_server.connection_type')"
          :options="connectionTypeOptions"
          required
        />

        <FormInputText
          v-if="form.type === 'websocket'"
          v-model="form.url"
          :label="t('tools.add_server.websocket_url')"
          :placeholder="t('tools.add_server.websocket_placeholder')"
          :hint="t('tools.add_server.websocket_hint')"
          required
        />

        <FormInputText
          v-else
          v-model="form.command"
          :label="t('tools.add_server.command_label')"
          :placeholder="t('tools.add_server.command_placeholder')"
          :hint="t('tools.add_server.command_hint')"
          required
        />

        <FormCheckbox
          v-model="form.oauthEnabled"
          :label="t('tools.add_server.enable_oauth')"
          :hint="t('tools.add_server.oauth_hint')"
        />

        <div v-if="form.oauthEnabled" class="oauth-grid">
          <FormInputText
            v-model="form.oauth.authorizationUrl"
            :label="t('tools.add_server.oauth_authorization_url')"
            :placeholder="t('tools.add_server.oauth_authorization_placeholder')"
            required
          />
          <FormInputText
            v-model="form.oauth.tokenUrl"
            :label="t('tools.add_server.oauth_token_url')"
            :placeholder="t('tools.add_server.oauth_token_placeholder')"
            required
          />
          <FormInputText
            v-model="form.oauth.clientId"
            :label="t('tools.add_server.oauth_client_id')"
            :placeholder="t('tools.add_server.oauth_client_id_placeholder')"
            required
          />
          <FormInputText
            v-model="form.oauth.clientSecret"
            type="password"
            :label="t('tools.add_server.oauth_client_secret')"
            :placeholder="t('tools.add_server.oauth_client_secret_placeholder')"
          />
          <FormInputText
            v-model="form.oauth.scope"
            :label="t('tools.add_server.oauth_scope')"
            :placeholder="t('tools.add_server.oauth_scope_placeholder')"
          />
          <FormInputText
            v-model="form.oauth.redirectUri"
            :label="t('tools.add_server.oauth_redirect_uri')"
            :placeholder="t('tools.add_server.oauth_redirect_placeholder')"
            :hint="t('tools.add_server.oauth_redirect_hint')"
            required
          />
          <FormInputText
            v-model="form.oauth.headerName"
            :label="t('tools.add_server.oauth_header_name')"
            :placeholder="t('tools.add_server.oauth_header_placeholder')"
          />
          <FormCheckbox
            v-model="form.oauth.sendRawAccessToken"
            :label="t('tools.add_server.oauth_send_raw')"
          />
        </div>
      </div>

      <div class="actions">
        <SimpleButton @click.prevent="cancel">
          {{ t('tools.add_server.cancel') }}
        </SimpleButton>
        <SimpleButton type="primary" :disabled="!isValid">
          {{ t('tools.add_server.save') }}
        </SimpleButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
  .add-server-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    > .collapsed {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;
      border: 1px dashed var(--border);
      border-radius: var(--border-radius-normal);
      background: var(--panel);

      > .collapsed-copy {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;

        > h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        > p {
          margin: 0;
          color: var(--muted);
          font-size: 0.95rem;
        }
      }
    }

    > .form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.25rem;
      border: 1px solid var(--border);
      border-radius: var(--border-radius-normal);
      background: var(--panel);

      > .inline-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;

        > h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        > .close {
          padding-inline: 0.75rem;
        }
      }

      > .inputs {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;

        > .oauth-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 0.85rem;
        }
      }

      > .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
      }
    }
  }
</style>
