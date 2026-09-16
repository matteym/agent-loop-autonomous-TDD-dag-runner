import type { AgentContext, ContextSufficiency } from "./types.js";

const DEFAULT_MIN_TRUE_FLAGS = 3;

function resolveMinTrueFlags(): number {
  const raw = process.env.CONTEXT_SUFFICIENCY_MIN_TRUE?.trim();
  if (!raw) {
    return DEFAULT_MIN_TRUE_FLAGS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MIN_TRUE_FLAGS;
  }
  return parsed;
}

function assessContext(context: AgentContext): ContextSufficiency {
  const objective = context.objective.trim();
  return {
    files_understood: context.files.length > 0 && objective.length > 0,
    dependencies_understood: context.deps.length > 0 || context.symbols.length > 0,
    tests_found: context.tests.length > 0,
    architecture_found: context.architecture.length > 0,
    history_checked:
      context.recent_git.length > 0 || context.historical_decisions.length > 0,
    failures_checked: context.similar_failures.length > 0,
    invariants_checked: context.invariants.length > 0,
  };
}

export class ContextSufficiencyGate {
  private readonly context: AgentContext;
  private cached: ContextSufficiency | undefined;

  constructor(context: AgentContext) {
    this.context = context;
  }

  assess(): ContextSufficiency {
    if (!this.cached) {
      this.cached = assessContext(this.context);
    }
    return this.cached;
  }

  mayModify(): boolean {
    const flags = this.assess();
    const values = Object.values(flags);
    const trueCount = values.filter(Boolean).length;
    return trueCount >= resolveMinTrueFlags();
  }
}
