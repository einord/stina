import { createDatabase, DataRepository } from "@pro-assist/core/data";

(async () => {
  const db = createDatabase({ path: "./data/pro-assist.db" });
  const repo = new DataRepository(db);

  const project = await repo.createProject({
    name: "Lansera Pro Assist",
    color: "#6366f1",
    description: "Huvudprojekt för lansering"
  });

  await repo.createTodo({
    title: "Designa desktop-UI",
    projectId: project.id,
    due: new Date().toISOString(),
    notes: "Fokusera på tillgänglighet",
    priority: "high",
    completed: false
  });

  await repo.createTodo({
    title: "Skriv CLI-manual",
    projectId: project.id,
    due: null,
    notes: null,
    priority: "normal",
    completed: false
  });

  await repo.createSchedule({
    title: "Daglig genomgång",
    message: "Har du koll på dagens fokus?",
    cron: "0 8 * * 1-5",
    active: true
  });

  console.log("Seed data created.");
})();
