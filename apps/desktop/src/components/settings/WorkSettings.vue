<template>
  <div class="work-settings">
    <h2>{{ t('settings.work.projects') }}</h2>
    <p class="description">{{ t('settings.work.description') }}</p>

    <section class="panel">
      <header class="panel-header">
        <div>
          <h3>{{ t('settings.work.add_title') }}</h3>
          <p class="hint">{{ t('settings.work.add_hint') }}</p>
        </div>
        <button class="primary" :disabled="!newName.trim()" @click="createProject">
          {{ t('settings.work.add_button') }}
        </button>
      </header>
      <div class="form-grid">
        <label class="field">
          <span>{{ t('settings.work.name_label') }}</span>
          <input v-model="newName" type="text" :placeholder="t('settings.work.name_placeholder')" />
        </label>
        <label class="field">
          <span>{{ t('settings.work.description_label') }}</span>
          <textarea
            v-model="newDescription"
            rows="2"
            :placeholder="t('settings.work.description_placeholder')"
          />
        </label>
      </div>
    </section>

    <section class="panel">
      <header class="panel-header">
        <div>
          <h3>{{ t('settings.work.projects_list_title') }}</h3>
          <p class="hint">{{ t('settings.work.projects_hint') }}</p>
        </div>
        <span class="pill">{{
          t('settings.work.project_count', { count: String(sortedProjects.length) })
        }}</span>
      </header>

      <p v-if="loading" class="status">{{ t('settings.work.loading') }}</p>
      <p v-else-if="error" class="status error">{{ error }}</p>
      <p v-else-if="!sortedProjects.length" class="status">{{ t('settings.work.empty') }}</p>

      <ul v-else class="project-list">
        <li v-for="project in sortedProjects" :key="project.id" class="project-card">
          <div v-if="project.isEditing" class="project-edit">
            <label class="field">
              <span>{{ t('settings.work.name_label') }}</span>
              <input v-model="project.draftName" type="text" />
            </label>
            <label class="field">
              <span>{{ t('settings.work.description_label') }}</span>
              <textarea v-model="project.draftDescription" rows="2" />
            </label>
            <div class="actions">
              <button class="primary" @click="saveProject(project)">
                {{ t('settings.work.save') }}
              </button>
              <button class="ghost" @click="cancelEdit(project)">
                {{ t('settings.work.cancel') }}
              </button>
            </div>
          </div>
          <div v-else class="project-view">
            <div class="project-heading">
              <div>
                <h4>{{ project.name }}</h4>
                <p class="meta">
                  {{ t('settings.work.updated_at', { date: relativeTime(project.updatedAt) }) }}
                </p>
              </div>
              <span class="pill" v-if="project.description">
                {{ t('settings.work.with_description') }}
              </span>
            </div>
            <p class="project-description">
              {{ project.description || t('settings.work.no_description') }}
            </p>
            <div class="actions">
              <button class="ghost" @click="startEdit(project)">
                {{ t('settings.work.edit') }}
              </button>
              <button class="danger" @click="deleteProject(project)">
                {{ t('settings.work.delete') }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { formatRelativeTime, t } from '@stina/i18n';
  import type { Project } from '@stina/todos';
  import { computed, onMounted, onUnmounted, ref } from 'vue';

  type EditableProject = Project & {
    isEditing?: boolean;
    draftName: string;
    draftDescription: string;
  };

  const projects = ref<EditableProject[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const newName = ref('');
  const newDescription = ref('');
  const disposables: Array<() => void> = [];

  const sortedProjects = computed(() =>
    projects.value.slice().sort((a, b) => a.name.localeCompare(b.name)),
  );

  const locale = typeof navigator !== 'undefined' ? navigator.language : 'sv-SE';

  function relativeTime(ts: number) {
    return formatRelativeTime(ts, { t, absoluteFormatter: new Intl.DateTimeFormat(locale) });
  }

  function shapeProjects(list: Project[]): EditableProject[] {
    return list.map((project) => ({
      ...project,
      draftName: project.name,
      draftDescription: project.description ?? '',
      isEditing: false,
    }));
  }

  async function loadProjects() {
    loading.value = true;
    try {
      const list = await window.stina.projects.get();
      projects.value = shapeProjects(list ?? []);
      error.value = null;
    } catch (err) {
      error.value = t('settings.work.error');
      console.error('[settings] Failed to load projects', err);
    } finally {
      loading.value = false;
    }
  }

  async function createProject() {
    if (!newName.value.trim()) return;
    await window.stina.projects.create({
      name: newName.value,
      description: newDescription.value || undefined,
    });
    newName.value = '';
    newDescription.value = '';
    await loadProjects();
  }

  function startEdit(project: EditableProject) {
    project.isEditing = true;
    project.draftName = project.name;
    project.draftDescription = project.description ?? '';
  }

  function cancelEdit(project: EditableProject) {
    project.isEditing = false;
    project.draftName = project.name;
    project.draftDescription = project.description ?? '';
  }

  async function saveProject(project: EditableProject) {
    if (!project.draftName.trim()) return;
    await window.stina.projects.update(project.id, {
      name: project.draftName,
      description: project.draftDescription || null,
    });
    project.isEditing = false;
    await loadProjects();
  }

  async function deleteProject(project: EditableProject) {
    const confirmed = window.confirm(t('settings.work.delete_confirm', { name: project.name }));
    if (!confirmed) return;
    await window.stina.projects.delete(project.id);
    await loadProjects();
  }

  onMounted(async () => {
    await loadProjects();
    const off = window.stina.projects.onChanged((items: Project[]) => {
      projects.value = shapeProjects(items ?? []);
    });
    disposables.push(off);
  });

  onUnmounted(() => {
    disposables.splice(0).forEach((dispose) => {
      try {
        dispose?.();
      } catch (err) {
        console.error('[settings] Failed to dispose project listener', err);
      }
    });
  });
</script>

<style scoped>
  .work-settings {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  h2 {
    margin: 0;
    font-size: 1.5rem;
  }

  h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  h4 {
    margin: 0 0 0.25rem 0;
  }

  .description {
    margin: 0;
    color: var(--muted);
  }

  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-normal);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .hint {
    margin: 0.25rem 0 0 0;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.95rem;
    color: var(--text);
  }

  input,
  textarea {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--border-radius-normal);
    padding: 0.65rem 0.75rem;
    background: var(--window-bg-lower);
    color: var(--text);
  }

  textarea {
    resize: vertical;
    min-height: 64px;
  }

  .primary {
    background: var(--accent);
    color: var(--accent-fg);
    border: none;
    border-radius: var(--border-radius-normal);
    padding: 0.6rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  .primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--border-radius-normal);
    padding: 0.5rem 0.9rem;
    cursor: pointer;
  }

  .danger {
    background: #f54949;
    color: white;
    border: none;
    border-radius: var(--border-radius-normal);
    padding: 0.5rem 0.9rem;
    cursor: pointer;
  }

  .pill {
    background: var(--window-bg-lower);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.3rem 0.75rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .status {
    margin: 0;
    color: var(--muted);
  }

  .status.error {
    color: #c44c4c;
  }

  .project-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .project-card {
    border: 1px solid var(--border);
    border-radius: var(--border-radius-normal);
    padding: 0.9rem;
    background: var(--window-bg-lower);
  }

  .project-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }

  .project-description {
    margin: 0.5rem 0 0.75rem 0;
    color: var(--text);
    white-space: pre-wrap;
  }

  .meta {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .project-edit .actions {
    justify-content: flex-end;
  }

  @media (max-width: 640px) {
    .panel-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .actions {
      width: 100%;
    }
  }
</style>
