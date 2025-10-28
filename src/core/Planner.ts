import { DIKey } from '../model/DIKey.js';
import {
  AnyBinding,
  BindingKind,
  ClassBinding,
  FactoryBinding,
  AliasBinding,
  SetBinding,
  WeakSetBinding,
  InstanceBinding,
} from '../model/Binding.js';
import { Activation } from '../model/Activation.js';
import { ModuleDef } from '../dsl/ModuleDef.js';
import {
  Plan,
  PlanStep,
  MissingDependencyError,
  CircularDependencyError,
  ConflictingBindingsError,
} from './Plan.js';
import { getConstructorDependencies } from './Functoid.js';

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
  plan(module: ModuleDef, roots: DIKey[], activation: Activation = Activation.empty()): Plan {
    // Index bindings by key
    const bindingIndex = this.indexBindings(module.getBindings(), activation);

    // Trace dependencies from roots
    const steps = new Map<string, PlanStep>();
    const visiting = new Set<string>();
    const visited = new Set<string>();

    for (const root of roots) {
      this.traceDependencies(
        root,
        bindingIndex,
        steps,
        visiting,
        visited,
        [],
      );
    }

    // Topologically sort the steps
    const sortedSteps = this.topologicalSort(Array.from(steps.values()));

    return new Plan(sortedSteps, new Set(roots));
  }

  /**
   * Index bindings by key, selecting the most specific binding for each key
   * based on the activation.
   * For set bindings, all matching bindings are kept (accumulated).
   */
  private indexBindings(
    bindings: readonly AnyBinding[],
    activation: Activation,
  ): Map<string, AnyBinding | AnyBinding[]> {
    const index = new Map<string, AnyBinding[]>();

    // Group bindings by key
    for (const binding of bindings) {
      const key = binding.key.toMapKey();
      if (!index.has(key)) {
        index.set(key, []);
      }
      index.get(key)!.push(binding);
    }

    // For each key, select the most specific matching binding(s)
    const result = new Map<string, AnyBinding | AnyBinding[]>();
    for (const [key, candidateBindings] of index) {
      const matching = candidateBindings.filter(b => b.tags.matches(activation));

      if (matching.length === 0) {
        // No bindings match the activation, skip this key
        continue;
      }

      // Check if all matching bindings are set bindings
      const allSets = matching.every(
        b => b.kind === BindingKind.Set || b.kind === BindingKind.WeakSet
      );

      if (allSets && matching.length > 1) {
        // Set bindings are additive - keep all of them
        result.set(key, matching);
      } else {
        // Find the most specific binding(s)
        const maxSpecificity = Math.max(...matching.map(b => b.tags.specificity()));
        const mostSpecific = matching.filter(b => b.tags.specificity() === maxSpecificity);

        if (mostSpecific.length > 1) {
          // Multiple bindings with same specificity - ambiguous
          throw new ConflictingBindingsError(mostSpecific[0].key, mostSpecific);
        }

        result.set(key, mostSpecific[0]);
      }
    }

    return result;
  }

  /**
   * Trace dependencies recursively, building the plan
   */
  private traceDependencies(
    key: DIKey,
    bindingIndex: Map<string, AnyBinding | AnyBinding[]>,
    steps: Map<string, PlanStep>,
    visiting: Set<string>,
    visited: Set<string>,
    path: DIKey[],
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

    // Get binding(s) for this key
    const bindingOrBindings = bindingIndex.get(keyStr);
    if (!bindingOrBindings) {
      const requiredBy = path.length > 0 ? path[path.length - 1] : undefined;
      throw new MissingDependencyError(key, requiredBy);
    }

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

          // Trace each dependency
          for (const dep of deps) {
            this.traceDependencies(dep, bindingIndex, steps, visiting, visited, newPath);
          }

          // If we got here without error, this binding is valid
          validBindings.push(binding);
        } catch (error) {
          if (isWeak && error instanceof MissingDependencyError) {
            // Weak set element with missing dependencies - skip it silently
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

      // Trace dependencies recursively
      for (const dep of dependencies) {
        this.traceDependencies(dep, bindingIndex, steps, visiting, visited, newPath);
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
