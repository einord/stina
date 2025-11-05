export interface PolicyRule {
  id: string;
  description: string;
  evaluate(input: PolicyInput): boolean;
}

export interface PolicyInput {
  action: string;
  payload?: Record<string, unknown>;
  actor?: string;
}

export class AllowListRule implements PolicyRule {
  constructor(
    public readonly id: string,
    private readonly allowedActions: string[],
    public readonly description: string
  ) {}

  evaluate(input: PolicyInput): boolean {
    return this.allowedActions.includes(input.action);
  }
}

export class PolicyEngine {
  constructor(private readonly rules: PolicyRule[]) {}

  isAllowed(input: PolicyInput): boolean {
    return this.rules.every((rule) => rule.evaluate(input));
  }
}

export const defaultPolicy = new PolicyEngine([
  new AllowListRule("allow-core-actions", [
    "todo.create",
    "todo.update",
    "todo.delete",
    "project.create",
    "project.list",
    "instructions.get",
    "instructions.update",
    "schedule.create",
    "schedule.update",
    "schedule.list",
    "mcp.invoke"
  ], "Allow standard assistant actions")
]);
