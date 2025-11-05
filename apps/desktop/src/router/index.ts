import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "chat",
    component: () => import("../views/ChatView.vue")
  },
  {
    path: "/todos",
    name: "todos",
    component: () => import("../views/TodosView.vue")
  },
  {
    path: "/projects",
    name: "projects",
    component: () => import("../views/ProjectsView.vue")
  },
  {
    path: "/schedule",
    name: "schedule",
    component: () => import("../views/ScheduleView.vue")
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("../views/SettingsView.vue")
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

export default router;
