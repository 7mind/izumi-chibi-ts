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
 */
export class Producer {
  /**
   * Execute a plan and produce a Locator with all instances
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
}
