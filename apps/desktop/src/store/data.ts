import { defineStore } from "pinia";
import { ref } from "vue";
import { type Todo, type Project, type Schedule } from "@pro-assist/core";

type ToolResponse<T> = T extends Promise<infer U> ? U : never;

const callTool = async <T = unknown>(tool: string, payload: Record<string, unknown> = {}) => {
  if (window.__TAURI__?.invoke) {
    return window.__TAURI__.invoke<T>("proassist_tool", { tool, payload });
  }
  // Offline fallback: simulate success without persistence
  throw new Error("Tauri backend not available.");
};

export const useDataStore = defineStore("data", () => {
  const todos = ref<Todo[]>([]);
  const projects = ref<Project[]>([]);
  const schedules = ref<Schedule[]>([]);

  const loadTodos = async () => {
    const response = (await callTool<{ items: Todo[] }>("todo.list", {
      filter: { completed: false }
    }).catch(() => ({ items: todos.value }))) as ToolResponse<Promise<{ items: Todo[] }>>;
    todos.value = response.items;
  };

const addTodo = async (input: Record<string, unknown>) => {
    try {
      await callTool("todo.create", input);
      await loadTodos();
    } catch (error) {
      const optimistic = {
        id: crypto.randomUUID(),
        title: String((input["title"] as unknown) ?? ""),
        projectId: (input["projectId"] as string | null) ?? null,
        due: (input["due"] as string | null) ?? null,
        notes: (input["notes"] as string | null) ?? null,
        priority: (input["priority"] as "low" | "normal" | "high") ?? "normal",
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date()
      } as Todo;
      todos.value = [...todos.value, optimistic];
      console.warn("Falling back to in-memory todo storage", error);
    }
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    try {
      await callTool("todo.update", { id, patch: { completed } });
      await loadTodos();
    } catch (error) {
      todos.value = todos.value.map((todo: Todo) =>
        todo.id === id ? { ...todo, completed, updatedAt: new Date() } : todo
      );
      console.warn("Todo toggle fallback", error);
    }
  };

  const loadProjects = async () => {
    const response = await callTool<{ items: Project[] }>("project.list", {}).catch(() => ({
      items: projects.value
    }));
    projects.value = response.items;
  };

  const addProject = async (input: Record<string, unknown>) => {
    try {
      await callTool("project.create", input);
      await loadProjects();
    } catch (error) {
      const optimistic = {
        id: crypto.randomUUID(),
        name: String((input["name"] as unknown) ?? "Projekt"),
        color: (input["color"] as string | null) ?? null,
        description: (input["description"] as string | null) ?? null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as Project;
      projects.value = [...projects.value, optimistic];
      console.warn("Project fallback", error);
    }
  };

  const loadSchedules = async () => {
    const response = await callTool<{ items: Schedule[] }>("schedule.list", {
      activeOnly: false
    }).catch(() => ({ items: schedules.value }));
    schedules.value = response.items;
  };

  const addSchedule = async (input: Record<string, unknown>) => {
    try {
      await callTool("schedule.create", input);
      await loadSchedules();
    } catch (error) {
      const optimistic = {
        id: crypto.randomUUID(),
        title: String((input["title"] as unknown) ?? "Schema"),
        message: String((input["message"] as unknown) ?? ""),
        cron: String((input["cron"] as unknown) ?? "* * * * *"),
        active: Boolean((input["active"] as unknown) ?? true),
        createdAt: new Date(),
        updatedAt: new Date()
      } as Schedule;
      schedules.value = [...schedules.value, optimistic];
      console.warn("Schedule fallback", error);
    }
  };

  return {
    todos,
    projects,
    schedules,
    loadTodos,
    addTodo,
    toggleTodo,
    loadProjects,
    addProject,
    loadSchedules,
    addSchedule
  };
});
