import { DIKey } from '@/distage/model/DIKey';
import {
  AnyBinding,
  BindingKind,
  ClassBinding,
  FactoryBinding,
  InstanceBinding,
  AliasBinding,
  SetBinding,
  WeakSetBinding,
  AssistedFactoryBinding,
} from '@/distage/model/Binding';
import { Plan, PlanStep } from '@/distage/core/Plan';
import { Locator, LocatorImpl } from '@/distage/core/Locator';

/**
 * The Producer executes a Plan to create instances.
 * It processes plan steps in order, creating instances and storing them in a Locator.
 *
 * Supports both synchronous and asynchronous production:
 * - produce() for synchronous dependency graphs
 * - produceAsync() for graphs containing async factories
 */
export class Producer {
  /**
   * Execute a plan and produce a Locator with all instances (synchronous version).
   * Will fail if any factories are async - use produceAsync() instead.
   */
  produce(plan: Plan, parentLocator?: Locator): Locator {
    const instances = new Map<string, any>();
    const sets = new Map<string, Set<any>>();

    for (const step of plan.getSteps()) {
      this.executeStep(step, instances, sets, parentLocator);
    }

    return new LocatorImpl(instances);
  }

  /**
   * Execute a plan asynchronously and produce a Locator with all instances.
   * Handles async factories and executes independent dependencies in parallel.
   */
  async produceAsync(plan: Plan, parentLocator?: Locator): Promise<Locator> {
    const instances = new Map<string, any>();
    const sets = new Map<string, Set<any>>();

    // Build dependency map: key -> set of keys it depends on
    const steps = plan.getSteps();
    const dependencyMap = new Map<string, Set<string>>();
    const stepByKey = new Map<string, PlanStep>();

    for (const step of steps) {
      const keyStr = step.key.toMapKey();
      stepByKey.set(keyStr, step);
      dependencyMap.set(keyStr, new Set(step.dependencies.map(dep => dep.toMapKey())));
    }

    // Execute steps in waves: in each wave, execute all steps whose dependencies are satisfied
    const completed = new Set<string>();
    const inProgress = new Map<string, Promise<void>>();

    while (completed.size < steps.length) {
      // Find all steps ready to execute (dependencies satisfied)
      const ready: PlanStep[] = [];

      for (const step of steps) {
        const keyStr = step.key.toMapKey();

        // Skip if already completed or in progress
        if (completed.has(keyStr) || inProgress.has(keyStr)) {
          continue;
        }

        // Check if all dependencies are completed
        const deps = dependencyMap.get(keyStr)!;
        const allDepsCompleted = Array.from(deps).every(dep => {
          // Check if completed in current context
          if (completed.has(dep)) {
            return true;
          }
          // Check if available in instances (might have been created by another wave)
          if (instances.has(dep)) {
            return true;
          }
          // Check if available in parent locator
          // Note: We can't easily check parent without the original DIKey,
          // but the planner should have validated this already
          return false;
        });

        if (allDepsCompleted) {
          ready.push(step);
        }
      }

      if (ready.length === 0 && inProgress.size === 0) {
        // No progress can be made - this shouldn't happen with a valid plan
        throw new Error('Circular dependency detected or invalid plan');
      }

      // Execute all ready steps in parallel
      for (const step of ready) {
        const keyStr = step.key.toMapKey();
        const promise = this.executeStepAsync(step, instances, sets, parentLocator)
          .then(() => {
            completed.add(keyStr);
            inProgress.delete(keyStr);
          });
        inProgress.set(keyStr, promise);
      }

      // Wait for at least one to complete before checking for more ready steps
      if (inProgress.size > 0) {
        await Promise.race(inProgress.values());
      }
    }

    // Wait for any remaining in-progress steps
    await Promise.all(inProgress.values());

    return new LocatorImpl(instances);
  }

  /**
   * Execute a single plan step
   */
  private executeStep(
    step: PlanStep,
    instances: Map<string, any>,
    sets: Map<string, Set<any>>,
    parentLocator?: Locator,
  ): void {
    const keyStr = step.key.toMapKey();

    // Skip if already created (can happen with sets)
    if (instances.has(keyStr)) {
      return;
    }

    const instance = this.createInstance(step, instances, sets, parentLocator);
    instances.set(keyStr, instance);
  }

  /**
   * Execute a single plan step asynchronously
   */
  private async executeStepAsync(
    step: PlanStep,
    instances: Map<string, any>,
    sets: Map<string, Set<any>>,
    parentLocator?: Locator,
  ): Promise<void> {
    const keyStr = step.key.toMapKey();

    // Skip if already created (can happen with sets)
    if (instances.has(keyStr)) {
      return;
    }

    const instance = await this.createInstanceAsync(step, instances, sets, parentLocator);
    instances.set(keyStr, instance);
  }

  /**
   * Create an instance for a plan step
   */
  private createInstance(
    step: PlanStep,
    instances: Map<string, any>,
    sets: Map<string, Set<any>>,
    parentLocator?: Locator,
  ): any {
    const binding = step.binding;

    // Handle array of set bindings (accumulated from Planner)
    if (Array.isArray(binding)) {
      return this.createSetFromMultipleBindings(
        binding as (SetBinding | WeakSetBinding)[],
        step.key,
        sets,
        instances,
        parentLocator,
      );
    }

    switch (binding.kind) {
      case BindingKind.Instance:
        return (binding as InstanceBinding).instance;

      case BindingKind.Class:
        return this.createFromClass(binding as ClassBinding, step.dependencies, instances, parentLocator);

      case BindingKind.Factory:
        return this.createFromFactory(binding as FactoryBinding, step.dependencies, instances, parentLocator);

      case BindingKind.Alias:
        return this.resolveAlias(binding as AliasBinding, instances, parentLocator);

      case BindingKind.Set:
      case BindingKind.WeakSet:
        return this.createSet(binding as SetBinding | WeakSetBinding, sets, instances, parentLocator);

      case BindingKind.AssistedFactory:
        return this.createAssistedFactory(binding as AssistedFactoryBinding, instances, parentLocator);

      default:
        throw new Error(`Unknown binding kind: ${(binding as any).kind}`);
    }
  }

  /**
   * Create an instance for a plan step asynchronously
   */
  private async createInstanceAsync(
    step: PlanStep,
    instances: Map<string, any>,
    sets: Map<string, Set<any>>,
    parentLocator?: Locator,
  ): Promise<any> {
    const binding = step.binding;

    // Handle array of set bindings (accumulated from Planner)
    if (Array.isArray(binding)) {
      return await this.createSetFromMultipleBindingsAsync(
        binding as (SetBinding | WeakSetBinding)[],
        step.key,
        sets,
        instances,
        parentLocator,
      );
    }

    switch (binding.kind) {
      case BindingKind.Instance:
        return (binding as InstanceBinding).instance;

      case BindingKind.Class:
        return await this.createFromClassAsync(binding as ClassBinding, step.dependencies, instances, parentLocator);

      case BindingKind.Factory:
        return await this.createFromFactoryAsync(binding as FactoryBinding, step.dependencies, instances, parentLocator);

      case BindingKind.Alias:
        return await this.resolveAliasAsync(binding as AliasBinding, instances, parentLocator);

      case BindingKind.Set:
      case BindingKind.WeakSet:
        return await this.createSetAsync(binding as SetBinding | WeakSetBinding, sets, instances, parentLocator);

      case BindingKind.AssistedFactory:
        return this.createAssistedFactoryAsync(binding as AssistedFactoryBinding, instances, parentLocator);

      default:
        throw new Error(`Unknown binding kind: ${(binding as any).kind}`);
    }
  }

  /**
   * Create an instance from a class binding
   */
  private createFromClass(
    binding: ClassBinding,
    dependencies: DIKey[],
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): any {
    const args = dependencies.map(dep => this.resolveInstance(dep, instances, parentLocator));
    return binding.factory.execute(args);
  }

  /**
   * Create an instance from a factory binding
   */
  private createFromFactory(
    binding: FactoryBinding,
    dependencies: DIKey[],
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): any {
    const args = dependencies.map(dep => this.resolveInstance(dep, instances, parentLocator));
    return binding.factory.execute(args);
  }

  /**
   * Resolve an alias binding
   */
  private resolveAlias(
    binding: AliasBinding,
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): any {
    return this.resolveInstance(binding.target, instances, parentLocator);
  }

  /**
   * Create a set from multiple accumulated set bindings
   */
  private createSetFromMultipleBindings(
    bindings: (SetBinding | WeakSetBinding)[],
    key: DIKey,
    sets: Map<string, Set<any>>,
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): Set<any> {
    const setKeyStr = key.toMapKey();

    // Get or create the set
    let set = sets.get(setKeyStr);
    if (!set) {
      set = new Set();
      sets.set(setKeyStr, set);
    }

    // Create and add all elements
    for (const binding of bindings) {
      const isWeak = binding.kind === BindingKind.WeakSet || (binding as SetBinding).weak;

      try {
        const elementInstance = this.createInstanceForSetElement(
          binding.element,
          instances,
          parentLocator,
        );
        set.add(elementInstance);
      } catch (error) {
        if (isWeak) {
          // Weak set element failed to create - that's ok, skip it
          console.warn(`Weak set element failed to create: ${error}`);
        } else {
          // Regular set element must succeed
          throw error;
        }
      }
    }

    return set;
  }

  /**
   * Create a set from set bindings
   */
  private createSet(
    binding: SetBinding | WeakSetBinding,
    sets: Map<string, Set<any>>,
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): Set<any> {
    const setKeyStr = binding.key.toMapKey();

    // Get or create the set
    let set = sets.get(setKeyStr);
    if (!set) {
      set = new Set();
      sets.set(setKeyStr, set);
    }

    // Create the element and add it to the set
    // Note: For weak sets, the element might fail to create if dependencies are missing
    try {
      const elementInstance = this.createInstanceForSetElement(
        binding.element,
        instances,
        parentLocator,
      );
      set.add(elementInstance);
    } catch (error) {
      if (binding.kind === BindingKind.WeakSet || (binding as SetBinding).weak) {
        // Weak set element failed to create - that's ok, skip it
        console.warn(`Weak set element failed to create: ${error}`);
      } else {
        // Regular set element must succeed
        throw error;
      }
    }

    return set;
  }

  /**
   * Create an instance for a set element
   */
  private createInstanceForSetElement(
    element: ClassBinding | InstanceBinding | FactoryBinding,
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): any {
    switch (element.kind) {
      case BindingKind.Instance:
        return (element as InstanceBinding).instance;

      case BindingKind.Class: {
        const classBinding = element as ClassBinding;
        const dependencies = this.getBindingDependencies(classBinding);
        return this.createFromClass(classBinding, dependencies, instances, parentLocator);
      }

      case BindingKind.Factory: {
        const factoryBinding = element as FactoryBinding;
        const dependencies = this.getBindingDependencies(factoryBinding);
        return this.createFromFactory(factoryBinding, dependencies, instances, parentLocator);
      }

      default:
        throw new Error(`Unsupported set element binding kind: ${(element as any).kind}`);
    }
  }

  /**
   * Get dependencies for a binding
   */
  private getBindingDependencies(binding: ClassBinding | FactoryBinding): DIKey[] {
    return binding.factory.getDependencies();
  }

  /**
   * Create an assisted factory that can be called with runtime parameters
   */
  private createAssistedFactory(
    binding: AssistedFactoryBinding,
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): (...runtimeArgs: any[]) => any {
    // Return a factory function that takes runtime arguments
    // and combines them with DI-resolved dependencies
    return (...runtimeArgs: any[]) => {
      const allDeps = binding.factory.getDependencies();

      // For now, we assume runtime args come first, then DI deps
      // In a more sophisticated version, you'd use parameter names to match
      const diArgs = allDeps
        .slice(binding.assistedParams.length)
        .map((dep: DIKey) => this.resolveInstance(dep, instances, parentLocator));

      const allArgs = [...runtimeArgs, ...diArgs];
      return binding.factory.execute(allArgs);
    };
  }

  /**
   * Resolve an instance from either the current instances map or the parent locator
   */
  private resolveInstance(
    key: DIKey,
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): any {
    const keyStr = key.toMapKey();
    const instance = instances.get(keyStr);

    if (instance !== undefined) {
      return instance;
    }

    // Try parent locator
    if (parentLocator) {
      const parentInstance = parentLocator.find(key);
      if (parentInstance !== undefined) {
        return parentInstance;
      }
    }

    throw new Error(`Dependency not found: ${key.toString()}`);
  }

  // ============================================================================
  // Async versions of methods
  // ============================================================================

  /**
   * Create an instance from a class binding (async)
   */
  private async createFromClassAsync(
    binding: ClassBinding,
    dependencies: DIKey[],
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): Promise<any> {
    const args = dependencies.map(dep => this.resolveInstance(dep, instances, parentLocator));
    const result = binding.factory.execute(args);
    // If the result is a promise (async constructor), await it
    return result instanceof Promise ? await result : result;
  }

  /**
   * Create an instance from a factory binding (async)
   */
  private async createFromFactoryAsync(
    binding: FactoryBinding,
    dependencies: DIKey[],
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): Promise<any> {
    const args = dependencies.map(dep => this.resolveInstance(dep, instances, parentLocator));
    const result = binding.factory.execute(args);
    // If the result is a promise (async factory), await it
    return result instanceof Promise ? await result : result;
  }

  /**
   * Resolve an alias binding (async)
   */
  private async resolveAliasAsync(
    binding: AliasBinding,
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): Promise<any> {
    return this.resolveInstance(binding.target, instances, parentLocator);
  }

  /**
   * Create a set from multiple accumulated set bindings (async)
   */
  private async createSetFromMultipleBindingsAsync(
    bindings: (SetBinding | WeakSetBinding)[],
    key: DIKey,
    sets: Map<string, Set<any>>,
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): Promise<Set<any>> {
    const setKeyStr = key.toMapKey();

    // Get or create the set
    let set = sets.get(setKeyStr);
    if (!set) {
      set = new Set();
      sets.set(setKeyStr, set);
    }

    // Create and add all elements
    for (const binding of bindings) {
      const isWeak = binding.kind === BindingKind.WeakSet || (binding as SetBinding).weak;

      try {
        const elementInstance = await this.createInstanceForSetElementAsync(
          binding.element,
          instances,
          parentLocator,
        );
        set.add(elementInstance);
      } catch (error) {
        if (isWeak) {
          // Weak set element failed to create - that's ok, skip it
          console.warn(`Weak set element failed to create: ${error}`);
        } else {
          // Regular set element must succeed
          throw error;
        }
      }
    }

    return set;
  }

  /**
   * Create a set from set bindings (async)
   */
  private async createSetAsync(
    binding: SetBinding | WeakSetBinding,
    sets: Map<string, Set<any>>,
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): Promise<Set<any>> {
    const setKeyStr = binding.key.toMapKey();

    // Get or create the set
    let set = sets.get(setKeyStr);
    if (!set) {
      set = new Set();
      sets.set(setKeyStr, set);
    }

    // Create the element and add it to the set
    try {
      const elementInstance = await this.createInstanceForSetElementAsync(
        binding.element,
        instances,
        parentLocator,
      );
      set.add(elementInstance);
    } catch (error) {
      if (binding.kind === BindingKind.WeakSet || (binding as SetBinding).weak) {
        // Weak set element failed to create - that's ok, skip it
        console.warn(`Weak set element failed to create: ${error}`);
      } else {
        // Regular set element must succeed
        throw error;
      }
    }

    return set;
  }

  /**
   * Create an instance for a set element (async)
   */
  private async createInstanceForSetElementAsync(
    element: ClassBinding | InstanceBinding | FactoryBinding,
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): Promise<any> {
    switch (element.kind) {
      case BindingKind.Instance:
        return (element as InstanceBinding).instance;

      case BindingKind.Class: {
        const classBinding = element as ClassBinding;
        const dependencies = this.getBindingDependencies(classBinding);
        return await this.createFromClassAsync(classBinding, dependencies, instances, parentLocator);
      }

      case BindingKind.Factory: {
        const factoryBinding = element as FactoryBinding;
        const dependencies = this.getBindingDependencies(factoryBinding);
        return await this.createFromFactoryAsync(factoryBinding, dependencies, instances, parentLocator);
      }

      default:
        throw new Error(`Unsupported set element binding kind: ${(element as any).kind}`);
    }
  }

  /**
   * Create an assisted factory that can be called with runtime parameters (async version)
   */
  private createAssistedFactoryAsync(
    binding: AssistedFactoryBinding,
    instances: Map<string, any>,
    parentLocator?: Locator,
  ): (...runtimeArgs: any[]) => any | Promise<any> {
    // Return a factory function that takes runtime arguments
    // and combines them with DI-resolved dependencies
    return async (...runtimeArgs: any[]) => {
      const allDeps = binding.factory.getDependencies();

      // For now, we assume runtime args come first, then DI deps
      const diArgs = allDeps
        .slice(binding.assistedParams.length)
        .map((dep: DIKey) => this.resolveInstance(dep, instances, parentLocator));

      const allArgs = [...runtimeArgs, ...diArgs];
      const result = binding.factory.execute(allArgs);
      return result instanceof Promise ? await result : result;
    };
  }
}
