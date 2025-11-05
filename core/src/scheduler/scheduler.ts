import cron, { ScheduledTask } from "node-cron";
import { DataRepository } from "../data/repository.js";

export type ScheduleTriggerHandler = (scheduleId: string) => Promise<void> | void;

interface SchedulerOptions {
  repo: DataRepository;
  handler: ScheduleTriggerHandler;
}

export class Scheduler {
  private readonly repo: DataRepository;
  private readonly handler: ScheduleTriggerHandler;
  private tasks = new Map<string, ScheduledTask>();

  constructor(options: SchedulerOptions) {
    this.repo = options.repo;
    this.handler = options.handler;
  }

  async start(): Promise<void> {
    await this.refresh();
  }

  stop(): void {
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.tasks.clear();
  }

  async refresh(): Promise<void> {
    this.stop();
    const schedules = await this.repo.listSchedules(true);
    for (const schedule of schedules) {
      if (!schedule.active) continue;
      const task = cron.schedule(schedule.cron, () => this.handler(schedule.id), {
        scheduled: true
      });
      this.tasks.set(schedule.id, task);
    }
  }

  async toggleSchedule(id: string, active: boolean): Promise<void> {
    const schedule = await this.repo.updateSchedule(id, { active });
    if (this.tasks.has(schedule.id)) {
      const task = this.tasks.get(schedule.id);
      task?.stop();
      this.tasks.delete(schedule.id);
    }
    if (schedule.active) {
      const task = cron.schedule(schedule.cron, () => this.handler(schedule.id), {
        scheduled: true
      });
      this.tasks.set(schedule.id, task);
    }
  }
}
