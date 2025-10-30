import { DIKey } from '@/model/DIKey';
import {
  AnyBinding,
  BindingKind,
  ClassBinding,
  FactoryBinding,
  AliasBinding,
  SetBinding,
  WeakSetBinding,
  InstanceBinding,
} from '@/model/Binding';
import { Activation, Axis, AxisPoint } from '@/model/Activation';
import { ModuleDef } from '@/dsl/ModuleDef';
import {
  Plan,
  PlanStep,
  MissingDependencyError,
  CircularDependencyError,
  ConflictingBindingsError,
  AxisConflictError,
} from '@/core/Plan';
import { getConstructorDependencies } from '@/core/Functoid';

/**
 * Tracks valid and invalid axis choices along the current traversal path.
 * This is used to detect conflicts where a selected binding's tags
 * make certain axis choices invalid deeper in the dependency tree.
 */
class PathActivation {
  constructor(
    private readonly baseActivation: Activation,
    private readonly requiredChoices: Map<Axis, Set<string>> = new Map(),
    private readonly forbiddenChoices: Map<Axis, Set<string>> = new Map(),
  ) {}

  /**
   * Create a new PathActivation from the user's base activation
   */
  static fromActivation(activation: Activation): PathActivation {
    return new PathActivation(activation);
  }

  /**
   * Create a new PathActivation with additional constraints from a selected binding.
   * When we select a binding with tags, those tags become required constraints
   * for the rest of the traversal path.
   */
  withBindingConstraints(binding: AnyBinding): PathActivation {
    const newRequired = new Map(this.requiredChoices);
    const newForbidden = new Map(this.forbiddenChoices);

    // For each tag on the binding, mark it as required and forbid other choices
    for (const [axis, choice] of binding.tags.getTags()) {
      // Add this choice as required
      if (!newRequired.has(axis)) {
        newRequired.set(axis, new Set());
      }
      newRequired.get(axis)!.add(choice);

      // Forbid all other choices on this axis
      if (!newForbidden.has(axis)) {
        newForbidden.set(axis, new Set());
      }
      for (const otherChoice of axis.choices) {
        if (otherChoice !== choice) {
          newForbidden.get(axis)!.add(otherChoice);
        }
      }
    }

    return new PathActivation(this.baseActivation, newRequired, newForbidden);
  }

  /**
   * Check if a binding is valid under the current path constraints.
   * A binding is valid if:
   * 1. It matches the base activation (user's selected axis points)
   * 2. All its tags are compatible with required choices on the path
   * 3. None of its tags conflict with forbidden choices on the path
   *
   * Important: Untagged bindings (bindings with no axis tags) are always valid
   * as long as they match the base activation, regardless of path constraints.
   */
  isBindingValid(binding: AnyBinding): boolean {
    // First check if it matches the base activation
    if (!binding.tags.matches(this.baseActivation)) {
      return false;
    }

    const bindingTags = binding.tags.getTags();

    // If the binding has no tags, it's valid in any path
    // (as long as it matched base activation, which we already checked)
    if (bindingTags.size === 0) {
      return true;
    }

    // Check each tag on the binding against path constraints
    for (const [axis, choice] of bindingTags) {
      // If this axis has required choices, this binding must have one of them
      const required = this.requiredChoices.get(axis);
      if (required && required.size > 0 && !required.has(choice)) {
        return false;
      }

      // If this choice is forbidden on this axis, reject the binding
      const forbidden = this.forbiddenChoices.get(axis);
      if (forbidden && forbidden.has(choice)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get a description of the current path constraints for error messages
   */
  getConstraintsDescription(): string {
    const parts: string[] = [];

    for (const [axis, choices] of this.requiredChoices) {
      if (choices.size > 0) {
        parts.push(`${axis.name} must be ${Array.from(choices).join(' or ')}`);
      }
    }

    for (const [axis, choices] of this.forbiddenChoices) {
      if (choices.size > 0) {
        parts.push(`${axis.name} cannot be ${Array.from(choices).join(' or ')}`);
      }
    }

    return parts.join(', ');
  }
}

/**
 * The Planner takes a ModuleDef, a set of roots, and an Activation,
 * and produces an execution Plan.
 *
 * The planner:
 * 1. Resolves which bindings to use based on activation (axis tags)
 * 2. Traces dependencies from roots
 * 3. Detects circular dependencies
 * 4. Detects missing dependencies
 * 5. Produces a topologically sorted execution plan
 */
export class Planner {
  /**
   * Create a plan for the given module, roots, and activation
   */
  plan(
    module: ModuleDef,
    roots: DIKey[],
    activation: Activation = Activation.empty(),
    parentLocator?: import('@/core/Locator').Locator
  ): Plan {
    // Group bindings by key (no filtering yet - we'll filter during traversal)
    const bindingIndex = this.groupBindings(module.getBindings());

    // Create initial path activation from user's activation
    const pathActivation = PathActivation.fromActivation(activation);

    // Trace dependencies from roots
    const steps = new Map<string, PlanStep>();
    const visiting = new Set<string>();
    const visited = new Set<string>();

    for (const root of roots) {
      this.traceDependencies(
        root,
        bindingIndex,
        pathActivation,
        steps,
        visiting,
        visited,
        [],
        parentLocator,
      );
    }

    // Topologically sort the steps
    const sortedSteps = this.topologicalSort(Array.from(steps.values()));

    return new Plan(sortedSteps, new Set(roots));
  }

  /**
   * Group bindings by key without filtering.
   * Filtering will happen during traversal based on path-aware activation.
   */
  private groupBindings(bindings: readonly AnyBinding[]): Map<string, AnyBinding[]> {
    const index = new Map<string, AnyBinding[]>();

    for (const binding of bindings) {
      const key = binding.key.toMapKey();
      if (!index.has(key)) {
        index.set(key, []);
      }
      index.get(key)!.push(binding);
    }

    return index;
  }

  /**
   * Select the most appropriate binding for a key given the current path activation.
   * Returns either a single binding or an array of set bindings.
   */
  private selectBinding(
    key: DIKey,
    candidates: AnyBinding[],
    pathActivation: PathActivation,
    requiredBy: DIKey | undefined,
  ): AnyBinding | AnyBinding[] {
    // Filter bindings that are valid under current path constraints
    const valid = candidates.filter(b => pathActivation.isBindingValid(b));

    if (valid.length === 0) {
      // Check if there were any candidates that matched base activation but failed path constraints
      const baseMatching = candidates.filter(b => b.tags.matches(pathActivation['baseActivation']));
      if (baseMatching.length > 0) {
        // There were bindings that matched base activation but conflicted with path
        throw new AxisConflictError(
          key,
          requiredBy,
          pathActivation.getConstraintsDescription(),
        );
      }
      // No bindings match the base activation at all
      throw new MissingDependencyError(key, requiredBy);
    }

    // Check if all valid bindings are set bindings
    const allSets = valid.every(
      b => b.kind === BindingKind.Set || b.kind === BindingKind.WeakSet
    );

    if (allSets && valid.length > 1) {
      // Set bindings are additive - keep all of them
      return valid;
    }

    // Find the most specific binding(s)
    const maxSpecificity = Math.max(...valid.map(b => b.tags.specificity()));
    const mostSpecific = valid.filter(b => b.tags.specificity() === maxSpecificity);

    if (mostSpecific.length > 1) {
      // Multiple bindings with same specificity - ambiguous
      throw new ConflictingBindingsError(key, mostSpecific);
    }

    return mostSpecific[0];
  }

  /**
   * Trace dependencies recursively, building the plan with path-aware activation tracking.
   *
   * The key insight is that when we select a binding with axis tags, those tags create
   * constraints for the rest of the dependency traversal. For example, if we select a binding
   * tagged with "env:prod" and "region:us", then deeper dependencies cannot use bindings
   * tagged with "env:test" or "region:eu".
   */
  private traceDependencies(
    key: DIKey,
    bindingIndex: Map<string, AnyBinding[]>,
    pathActivation: PathActivation,
    steps: Map<string, PlanStep>,
    visiting: Set<string>,
    visited: Set<string>,
    path: DIKey[],
    parentLocator?: import('@/core/Locator').Locator,
  ): void {
    const keyStr = key.toMapKey();

    // Already processed
    if (visited.has(keyStr)) {
      return;
    }

    // Cycle detection
    if (visiting.has(keyStr)) {
      throw new CircularDependencyError([...path, key]);
    }

    // Get candidate bindings for this key
    const candidates = bindingIndex.get(keyStr);
    if (!candidates || candidates.length === 0) {
      // Check if the key exists in the parent locator
      if (parentLocator && parentLocator.has(key)) {
        // Mark as visited - this dependency will come from parent
        visited.add(keyStr);
        return;
      }

      const requiredBy = path.length > 0 ? path[path.length - 1] : undefined;
      throw new MissingDependencyError(key, requiredBy);
    }

    // Select the most appropriate binding given current path constraints
    const requiredBy = path.length > 0 ? path[path.length - 1] : undefined;
    const bindingOrBindings = this.selectBinding(key, candidates, pathActivation, requiredBy);

    // Mark as visiting
    visiting.add(keyStr);
    const newPath = [...path, key];

    // Handle array of bindings (for sets)
    if (Array.isArray(bindingOrBindings)) {
      const allDependencies: DIKey[] = [];
      const validBindings: AnyBinding[] = [];

      // Trace dependencies for all set element bindings
      for (const binding of bindingOrBindings) {
        const isWeak = binding.kind === BindingKind.WeakSet ||
                      (binding.kind === BindingKind.Set && (binding as SetBinding).weak);

        try {
          const deps = this.getDependencies(binding);
          allDependencies.push(...deps);

          // Create new path activation with constraints from this binding
          const newPathActivation = pathActivation.withBindingConstraints(binding);

          // Trace each dependency with the new path activation
          for (const dep of deps) {
            this.traceDependencies(
              dep,
              bindingIndex,
              newPathActivation,
              steps,
              visiting,
              visited,
              newPath,
              parentLocator,
            );
          }

          // If we got here without error, this binding is valid
          validBindings.push(binding);
        } catch (error) {
          if (isWeak && (error instanceof MissingDependencyError || error instanceof AxisConflictError)) {
            // Weak set element with missing or conflicting dependencies - skip it silently
            continue;
          }
          // Re-throw if not a weak set or different error
          throw error;
        }
      }

      // Add step with valid bindings only (Producer will handle the array)
      if (validBindings.length > 0) {
        steps.set(keyStr, {
          key,
          binding: validBindings as any,
          dependencies: allDependencies,
        });
      }
    } else {
      // Single binding (normal case)
      const binding = bindingOrBindings;
      const dependencies = this.getDependencies(binding);

      // Create new path activation with constraints from this binding
      const newPathActivation = pathActivation.withBindingConstraints(binding);

      // Trace dependencies recursively with the new path activation
      for (const dep of dependencies) {
        this.traceDependencies(
          dep,
          bindingIndex,
          newPathActivation,
          steps,
          visiting,
          visited,
          newPath,
          parentLocator,
        );
      }

      // Add step for this key
      steps.set(keyStr, {
        key,
        binding,
        dependencies,
      });
    }

    // Mark as visited
    visiting.delete(keyStr);
    visited.add(keyStr);
  }

  /**
   * Get dependencies for a binding
   */
  private getDependencies(binding: AnyBinding): DIKey[] {
    switch (binding.kind) {
      case BindingKind.Instance:
        return []; // Instances have no dependencies

      case BindingKind.Class:
        return getConstructorDependencies((binding as ClassBinding).implementation);

      case BindingKind.Factory:
        return (binding as FactoryBinding).factory.getDependencies();

      case BindingKind.Alias:
        return [(binding as AliasBinding).target];

      case BindingKind.Set:
      case BindingKind.WeakSet:
        // Set bindings depend on their elements
        const setBinding = binding as SetBinding | WeakSetBinding;
        return this.getDependencies(setBinding.element);

      case BindingKind.AssistedFactory:
        // Assisted factory dependencies are resolved at construction time
        // For now, we assume no dependencies (runtime params are provided)
        return [];

      default:
        throw new Error(`Unknown binding kind: ${(binding as any).kind}`);
    }
  }

  /**
   * Topologically sort plan steps so dependencies come before dependents
   */
  private topologicalSort(steps: PlanStep[]): PlanStep[] {
    const sorted: PlanStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (step: PlanStep) => {
      const keyStr = step.key.toMapKey();

      if (visited.has(keyStr)) {
        return;
      }

      if (visiting.has(keyStr)) {
        // This should have been caught earlier, but just in case
        throw new CircularDependencyError([step.key]);
      }

      visiting.add(keyStr);

      // Visit dependencies first
      for (const depKey of step.dependencies) {
        const depStep = steps.find(s => s.key.equals(depKey));
        if (depStep) {
          visit(depStep);
        }
      }

      visiting.delete(keyStr);
      visited.add(keyStr);
      sorted.push(step);
    };

    for (const step of steps) {
      visit(step);
    }

    return sorted;
  }
}
