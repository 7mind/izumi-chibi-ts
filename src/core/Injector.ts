import { DIKey } from '../model/DIKey.js';
import { Activation } from '../model/Activation.js';
import { ModuleDef } from '../dsl/ModuleDef.js';
import { Planner } from './Planner.js';
import { Producer } from './Producer.js';
import { Locator } from './Locator.js';
import { Plan } from './Plan.js';

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
 * The Injector is the main entry point for DITS.
 * It coordinates the Planner and Producer to build a dependency injection container.
 *
 * Usage:
 *   const injector = new Injector();
 *   const locator = injector.produce(module, [DIKey.of(MyService)]);
 *   const service = locator.get(DIKey.of(MyService));
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
    type: new (...args: any[]) => T,
    options: InjectorOptions = {},
  ): T {
    return this.produceOne(module, DIKey.of(type), options);
  }

  /**
   * Convenience method to produce with a type and ID
   */
  produceByTypeAndId<T>(
    module: ModuleDef,
    type: new (...args: any[]) => T,
    id: string,
    options: InjectorOptions = {},
  ): T {
    return this.produceOne(module, DIKey.named(type, id), options);
  }

  /**
   * Get all keys from a module
   */
  private getAllKeys(module: ModuleDef): DIKey[] {
    return module.getBindings().map(b => b.key);
  }
}
