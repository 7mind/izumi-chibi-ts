import { DIKey } from '@/model/DIKey';
import { AnyBinding } from '@/model/Binding';

/**
 * A step in the execution plan that describes how to create an instance
 */
export interface PlanStep {
  key: DIKey;
  binding: AnyBinding;
  dependencies: DIKey[];
}

/**
 * A plan is an ordered sequence of steps to execute to build a dependency graph.
 * The plan is topologically sorted so that dependencies are created before dependents.
 */
export class Plan {
  constructor(
    private readonly steps: PlanStep[],
    private readonly roots: Set<DIKey>,
  ) {}

  /**
   * Get all steps in execution order
   */
  getSteps(): readonly PlanStep[] {
    return this.steps;
  }

  /**
   * Get the root keys that were requested
   */
  getRoots(): ReadonlySet<DIKey> {
    return this.roots;
  }

  /**
   * Get a specific step by key
   */
  getStep(key: DIKey): PlanStep | undefined {
    return this.steps.find(step => step.key.equals(key));
  }

  /**
   * Check if the plan contains a specific key
   */
  has(key: DIKey): boolean {
    return this.steps.some(step => step.key.equals(key));
  }

  /**
   * Get the number of steps in the plan
   */
  size(): number {
    return this.steps.length;
  }

  /**
   * Get a string representation of the plan for debugging
   */
  toString(): string {
    const lines = ['Plan:'];
    for (const step of this.steps) {
      const deps = step.dependencies.map(d => d.toString()).join(', ');
      lines.push(`  ${step.key.toString()} <- [${deps}]`);
    }
    return lines.join('\n');
  }
}

/**
 * Errors that can occur during planning
 */
export class PlanningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanningError';
  }
}

export class MissingDependencyError extends PlanningError {
  constructor(
    public readonly key: DIKey,
    public readonly requiredBy?: DIKey,
  ) {
    const msg = requiredBy
      ? `Missing binding for ${key.toString()}, required by ${requiredBy.toString()}`
      : `Missing binding for ${key.toString()}`;
    super(msg);
    this.name = 'MissingDependencyError';
  }
}

export class CircularDependencyError extends PlanningError {
  constructor(public readonly cycle: DIKey[]) {
    const cycleStr = cycle.map(k => k.toString()).join(' -> ');
    super(`Circular dependency detected: ${cycleStr}`);
    this.name = 'CircularDependencyError';
  }
}

export class ConflictingBindingsError extends PlanningError {
  constructor(
    public readonly key: DIKey,
    public readonly bindings: AnyBinding[],
  ) {
    super(
      `Multiple bindings found for ${key.toString()} with same specificity. ` +
      `Use axis tagging to disambiguate.`
    );
    this.name = 'ConflictingBindingsError';
  }
}

export class AxisConflictError extends PlanningError {
  constructor(
    public readonly key: DIKey,
    public readonly requiredBy: DIKey | undefined,
    public readonly pathConstraints: string,
  ) {
    const msg = requiredBy
      ? `No valid binding found for ${key.toString()}, required by ${requiredBy.toString()}. ` +
        `Path constraints: ${pathConstraints}`
      : `No valid binding found for ${key.toString()}. Path constraints: ${pathConstraints}`;
    super(msg);
    this.name = 'AxisConflictError';
  }
}
