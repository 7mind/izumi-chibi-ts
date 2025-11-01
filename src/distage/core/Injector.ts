import { DIKey, Callable } from '@/distage/model/DIKey';
import { Activation } from '@/distage/model/Activation';
import { ModuleDef } from '@/distage/dsl/ModuleDef';
import { Planner } from '@/distage/core/Planner';
import { Producer } from '@/distage/core/Producer';
import { Locator } from '@/distage/core/Locator';
import { Plan } from '@/distage/core/Plan';

/**
 * Options for creating an Injector
 */
export interface InjectorOptions {
  /**
   * Activation to use for selecting bindings
   */
  activation?: Activation;

  /**
   * Whether to automatically include all bindings as roots
   * (default: false, only explicitly requested roots are included)
   */
  autoRoots?: boolean;

  /**
   * Parent locator for subcontexts
   * When set, the planner can reference bindings from the parent
   */
  parentLocator?: Locator;
}

/**
 * The Injector is the main entry point for distage.
 * It coordinates the Planner and Producer to build a dependency injection container.
 *
 * Supports both synchronous and asynchronous production:
 * - produce() for synchronous dependency graphs
 * - produceAsync() for graphs containing async factories
 *
 * Usage:
 *   const injector = new Injector();
 *
 *   // Synchronous
 *   const locator = injector.produce(module, [DIKey.of(MyService)]);
 *   const service = locator.get(DIKey.of(MyService));
 *
 *   // Asynchronous
 *   const locator = await injector.produceAsync(module, [DIKey.of(AsyncService)]);
 *   const service = locator.get(DIKey.of(AsyncService));
 */
export class Injector {
  private readonly planner: Planner;
  private readonly producer: Producer;

  constructor() {
    this.planner = new Planner();
    this.producer = new Producer();
  }

  /**
   * Create a plan for the given module and roots
   */
  plan(
    module: ModuleDef,
    roots: DIKey[],
    options: InjectorOptions = {},
  ): Plan {
    const activation = options.activation || Activation.empty();

    // If autoRoots is enabled, include all bindings as roots
    const actualRoots = options.autoRoots
      ? this.getAllKeys(module)
      : roots;

    return this.planner.plan(module, actualRoots, activation, options.parentLocator);
  }

  /**
   * Produce a Locator from a plan
   */
  produceFromPlan(plan: Plan, parentLocator?: Locator): Locator {
    return this.producer.produce(plan, parentLocator);
  }

  /**
   * Plan and produce a Locator in one step
   */
  produce(
    module: ModuleDef,
    roots: DIKey[],
    options: InjectorOptions = {},
  ): Locator {
    const plan = this.plan(module, roots, options);
    return this.produceFromPlan(plan, options.parentLocator);
  }

  /**
   * Convenience method to produce with a single root
   */
  produceOne<T>(
    module: ModuleDef,
    root: DIKey<T>,
    options: InjectorOptions = {},
  ): T {
    const locator = this.produce(module, [root], options);
    return locator.get(root);
  }

  /**
   * Convenience method to produce with a type
   */
  produceByType<T>(
    module: ModuleDef,
    type: Callable<T>,
    options: InjectorOptions = {},
  ): T {
    return this.produceOne(module, DIKey.of(type), options);
  }

  /**
   * Convenience method to produce with a type and ID
   */
  produceByTypeAndId<T>(
    module: ModuleDef,
    type: Callable<T>,
    id: string,
    options: InjectorOptions = {},
  ): T {
    return this.produceOne(module, DIKey.named(type, id), options);
  }

  // ============================================================================
  // Async versions
  // ============================================================================

  /**
   * Produce a Locator from a plan asynchronously
   */
  async produceFromPlanAsync(plan: Plan, parentLocator?: Locator): Promise<Locator> {
    return await this.producer.produceAsync(plan, parentLocator);
  }

  /**
   * Plan and produce a Locator asynchronously in one step
   */
  async produceAsync(
    module: ModuleDef,
    roots: DIKey[],
    options: InjectorOptions = {},
  ): Promise<Locator> {
    const plan = this.plan(module, roots, options);
    return await this.produceFromPlanAsync(plan, options.parentLocator);
  }

  /**
   * Convenience method to produce with a single root asynchronously
   */
  async produceOneAsync<T>(
    module: ModuleDef,
    root: DIKey<T>,
    options: InjectorOptions = {},
  ): Promise<T> {
    const locator = await this.produceAsync(module, [root], options);
    return locator.get(root);
  }

  /**
   * Convenience method to produce with a type asynchronously
   */
  async produceByTypeAsync<T>(
    module: ModuleDef,
    type: Callable<T>,
    options: InjectorOptions = {},
  ): Promise<T> {
    return await this.produceOneAsync(module, DIKey.of(type), options);
  }

  /**
   * Convenience method to produce with a type and ID asynchronously
   */
  async produceByTypeAndIdAsync<T>(
    module: ModuleDef,
    type: Callable<T>,
    id: string,
    options: InjectorOptions = {},
  ): Promise<T> {
    return await this.produceOneAsync(module, DIKey.named(type, id), options);
  }

  /**
   * Get all keys from a module
   */
  private getAllKeys(module: ModuleDef): DIKey[] {
    return module.getBindings().map(b => b.key);
  }
}
