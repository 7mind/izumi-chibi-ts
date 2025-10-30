import { describe, it, expect } from 'vitest';
import { Injector, ModuleDef, DIKey, Axis, AxisPoint, Activation, Injectable } from '../src/distage';

/**
 * Tests for path-aware activation tracing.
 *
 * These tests verify that the planner correctly propagates axis constraints during
 * dependency traversal, similar to how the original distage framework works.
 *
 * Key concept: When we select a binding with specific axis tags, those tags create
 * constraints that affect which bindings are valid deeper in the dependency tree.
 */
describe('Path-Aware Activation Tracing', () => {
  const Environment = Axis.of('Environment', ['Prod', 'Test']);
  const Region = Axis.of('Region', ['US', 'EU']);

  // Test scenario: Database connections that vary by environment and region
  @Injectable()
  abstract class Database {
    abstract query(sql: string): string;
  }

  @Injectable()
  class ProdUSDatabase extends Database {
    query(sql: string): string {
      return `[Prod-US] ${sql}`;
    }
  }

  @Injectable()
  class ProdEUDatabase extends Database {
    query(sql: string): string {
      return `[Prod-EU] ${sql}`;
    }
  }

  @Injectable()
  class TestDatabase extends Database {
    query(sql: string): string {
      return `[Test] ${sql}`;
    }
  }

  // Repository depends on Database
  @Injectable()
  abstract class Repository {
    constructor(protected db: Database) {}
    abstract getData(): string;
  }

  @Injectable()
  class ProdRepository extends Repository {
    getData(): string {
      return `Prod: ${this.db.query('SELECT * FROM data')}`;
    }
  }

  @Injectable()
  class TestRepository extends Repository {
    getData(): string {
      return `Test: ${this.db.query('SELECT * FROM test_data')}`;
    }
  }

  // Service depends on Repository
  @Injectable()
  class DataService {
    constructor(public repo: Repository) {}

    fetchData(): string {
      return this.repo.getData();
    }
  }

  it('should propagate axis constraints through dependency chain', () => {
    // Set up bindings with axis tags
    const module = new ModuleDef()
      // Database bindings
      .make(Database as any)
        .tagged(Environment, 'Prod')
        .tagged(Region, 'US')
        .fromClass(ProdUSDatabase)
      .make(Database as any)
        .tagged(Environment, 'Prod')
        .tagged(Region, 'EU')
        .fromClass(ProdEUDatabase)
      .make(Database as any)
        .tagged(Environment, 'Test')
        .fromClass(TestDatabase)

      // Repository bindings
      .make(Repository as any)
        .tagged(Environment, 'Prod')
        .fromClass(ProdRepository)
      .make(Repository as any)
        .tagged(Environment, 'Test')
        .fromClass(TestRepository)

      // Service binding (no tags)
      .make(DataService).fromSelf();

    const injector = new Injector();

    // Test Prod-US path: Should use ProdRepository -> ProdUSDatabase
    const prodUSActivation = Activation.of(
      AxisPoint.of(Environment, 'Prod'),
      AxisPoint.of(Region, 'US'),
    );
    const prodUSService = injector.produceByType(module, DataService, {
      activation: prodUSActivation,
    });
    expect(prodUSService.repo).toBeInstanceOf(ProdRepository);
    expect(prodUSService.repo['db']).toBeInstanceOf(ProdUSDatabase);
    expect(prodUSService.fetchData()).toBe('Prod: [Prod-US] SELECT * FROM data');

    // Test Prod-EU path: Should use ProdRepository -> ProdEUDatabase
    const prodEUActivation = Activation.of(
      AxisPoint.of(Environment, 'Prod'),
      AxisPoint.of(Region, 'EU'),
    );
    const prodEUService = injector.produceByType(module, DataService, {
      activation: prodEUActivation,
    });
    expect(prodEUService.repo).toBeInstanceOf(ProdRepository);
    expect(prodEUService.repo['db']).toBeInstanceOf(ProdEUDatabase);
    expect(prodEUService.fetchData()).toBe('Prod: [Prod-EU] SELECT * FROM data');

    // Test Test path: Should use TestRepository -> TestDatabase
    const testActivation = Activation.of(
      AxisPoint.of(Environment, 'Test'),
    );
    const testService = injector.produceByType(module, DataService, {
      activation: testActivation,
    });
    expect(testService.repo).toBeInstanceOf(TestRepository);
    expect(testService.repo['db']).toBeInstanceOf(TestDatabase);
    expect(testService.fetchData()).toBe('Test: [Test] SELECT * FROM test_data');
  });

  it('should detect axis conflicts when path constraints are incompatible', () => {
    @Injectable()
    class ConflictingService {
      constructor(public db: Database) {}
    }

    // This module has a binding for ConflictingService tagged with Test environment,
    // but only Prod databases are available
    const module = new ModuleDef()
      .make(Database as any)
        .tagged(Environment, 'Prod')
        .tagged(Region, 'US')
        .fromClass(ProdUSDatabase)
      .make(ConflictingService)
        .tagged(Environment, 'Test')
        .fromSelf();

    const injector = new Injector();

    // This should fail because ConflictingService requires Test environment,
    // but that creates a constraint that makes the Prod database invalid
    const testActivation = Activation.of(
      AxisPoint.of(Environment, 'Test'),
      AxisPoint.of(Region, 'US'),
    );

    expect(() => {
      injector.produceByType(module, ConflictingService, {
        activation: testActivation,
      });
    }).toThrow(/Database/);
  });

  it('should handle multi-level axis constraint propagation', () => {
    // Three-level dependency chain
    @Injectable()
    class Config {
      constructor(public readonly env: string) {}
    }

    @Injectable()
    class Logger {
      constructor(public config: Config) {}

      log(msg: string): string {
        return `[${this.config.env}] ${msg}`;
      }
    }

    @Injectable()
    class Application {
      constructor(public logger: Logger) {}
    }

    const module = new ModuleDef()
      .make(Config)
        .tagged(Environment, 'Prod')
        .fromValue(new Config('production'))
      .make(Config)
        .tagged(Environment, 'Test')
        .fromValue(new Config('test'))
      .make(Logger).fromSelf()
      .make(Application).fromSelf();

    const injector = new Injector();

    // Prod activation should propagate through all levels
    const prodActivation = Activation.of(AxisPoint.of(Environment, 'Prod'));
    const prodApp = injector.produceByType(module, Application, {
      activation: prodActivation,
    });
    expect(prodApp.logger.log('message')).toBe('[production] message');

    // Test activation should propagate through all levels
    const testActivation = Activation.of(AxisPoint.of(Environment, 'Test'));
    const testApp = injector.produceByType(module, Application, {
      activation: testActivation,
    });
    expect(testApp.logger.log('message')).toBe('[test] message');
  });

  it('should allow untagged bindings to be used in any path', () => {
    // Common service with no axis tags
    @Injectable()
    class CommonService {
      getValue(): string {
        return 'common';
      }
    }

    @Injectable()
    class EnvironmentSpecificService {
      constructor(
        public common: CommonService,
        public db: Database,
      ) {}
    }

    const module = new ModuleDef()
      .make(CommonService).fromSelf() // No tags - available everywhere
      .make(Database as any)
        .tagged(Environment, 'Prod')
        .fromClass(ProdUSDatabase)
      .make(Database as any)
        .tagged(Environment, 'Test')
        .fromClass(TestDatabase)
      .make(EnvironmentSpecificService)
        .tagged(Environment, 'Prod')
        .fromSelf()
      .make(EnvironmentSpecificService)
        .tagged(Environment, 'Test')
        .fromSelf();

    const injector = new Injector();

    // Both should successfully use CommonService despite different environment paths
    const prodActivation = Activation.of(AxisPoint.of(Environment, 'Prod'));
    const prodService = injector.produceByType(module, EnvironmentSpecificService, {
      activation: prodActivation,
    });
    expect(prodService.common.getValue()).toBe('common');
    expect(prodService.db).toBeInstanceOf(ProdUSDatabase);

    const testActivation = Activation.of(AxisPoint.of(Environment, 'Test'));
    const testService = injector.produceByType(module, EnvironmentSpecificService, {
      activation: testActivation,
    });
    expect(testService.common.getValue()).toBe('common');
    expect(testService.db).toBeInstanceOf(TestDatabase);
  });

  it('should handle bindings with partial axis tags correctly', () => {
    // A service tagged only with Environment but not Region
    @Injectable()
    class RegionAgnosticService {
      constructor(public db: Database) {}
    }

    const module = new ModuleDef()
      .make(Database as any)
        .tagged(Environment, 'Prod')
        .tagged(Region, 'US')
        .fromClass(ProdUSDatabase)
      .make(Database as any)
        .tagged(Environment, 'Prod')
        .tagged(Region, 'EU')
        .fromClass(ProdEUDatabase)
      .make(RegionAgnosticService)
        .tagged(Environment, 'Prod') // Only env tag, no region tag
        .fromSelf();

    const injector = new Injector();

    // Should work with any region since RegionAgnosticService has no region tag
    const usActivation = Activation.of(
      AxisPoint.of(Environment, 'Prod'),
      AxisPoint.of(Region, 'US'),
    );
    const usService = injector.produceByType(module, RegionAgnosticService, {
      activation: usActivation,
    });
    expect(usService.db).toBeInstanceOf(ProdUSDatabase);

    const euActivation = Activation.of(
      AxisPoint.of(Environment, 'Prod'),
      AxisPoint.of(Region, 'EU'),
    );
    const euService = injector.produceByType(module, RegionAgnosticService, {
      activation: euActivation,
    });
    expect(euService.db).toBeInstanceOf(ProdEUDatabase);
  });

  it('should use most specific binding when multiple bindings match path constraints', () => {
    @Injectable()
    class GenericDatabase extends Database {
      query(sql: string): string {
        return `[Generic] ${sql}`;
      }
    }

    @Injectable()
    class SimpleService {
      constructor(public db: Database) {}
    }

    const module = new ModuleDef()
      .make(Database as any)
        .fromClass(GenericDatabase) // No tags - specificity 0
      .make(Database as any)
        .tagged(Environment, 'Prod')
        .fromClass(ProdUSDatabase) // 1 tag - specificity 1
      .make(Database as any)
        .tagged(Environment, 'Prod')
        .tagged(Region, 'US')
        .fromClass(ProdUSDatabase) // 2 tags - specificity 2
      .make(SimpleService).fromSelf();

    const injector = new Injector();

    // With both axes activated, should choose most specific (2 tags)
    const fullActivation = Activation.of(
      AxisPoint.of(Environment, 'Prod'),
      AxisPoint.of(Region, 'US'),
    );
    const service1 = injector.produceByType(module, SimpleService, {
      activation: fullActivation,
    });
    // Should use the binding with both tags
    expect(service1.db).toBeInstanceOf(ProdUSDatabase);

    // With only environment, should choose binding with 1 tag
    const envOnlyActivation = Activation.of(
      AxisPoint.of(Environment, 'Prod'),
    );
    const service2 = injector.produceByType(module, SimpleService, {
      activation: envOnlyActivation,
    });
    expect(service2.db).toBeInstanceOf(ProdUSDatabase);

    // With no activation, should choose untagged binding
    const service3 = injector.produceByType(module, SimpleService);
    expect(service3.db).toBeInstanceOf(GenericDatabase);
  });

  it('should handle diamond dependencies with consistent axis constraints', () => {
    // Diamond pattern: App -> [ServiceA, ServiceB] -> SharedResource
    @Injectable()
    abstract class SharedResource {
      abstract getValue(): string;
    }

    @Injectable()
    class ProdResource extends SharedResource {
      getValue(): string {
        return 'prod-resource';
      }
    }

    @Injectable()
    class TestResource extends SharedResource {
      getValue(): string {
        return 'test-resource';
      }
    }

    @Injectable()
    class ServiceA {
      constructor(public resource: SharedResource) {}
    }

    @Injectable()
    class ServiceB {
      constructor(public resource: SharedResource) {}
    }

    @Injectable()
    class Application {
      constructor(
        public serviceA: ServiceA,
        public serviceB: ServiceB,
      ) {}
    }

    const module = new ModuleDef()
      .make(SharedResource as any)
        .tagged(Environment, 'Prod')
        .fromClass(ProdResource)
      .make(SharedResource as any)
        .tagged(Environment, 'Test')
        .fromClass(TestResource)
      .make(ServiceA).fromSelf()
      .make(ServiceB).fromSelf()
      .make(Application).fromSelf();

    const injector = new Injector();

    // Both paths should get the same instance of SharedResource
    const prodActivation = Activation.of(AxisPoint.of(Environment, 'Prod'));
    const prodApp = injector.produceByType(module, Application, {
      activation: prodActivation,
    });

    expect(prodApp.serviceA.resource).toBeInstanceOf(ProdResource);
    expect(prodApp.serviceB.resource).toBeInstanceOf(ProdResource);
    // Should be the same instance (singleton behavior)
    expect(prodApp.serviceA.resource).toBe(prodApp.serviceB.resource);
  });

  it('should reject inconsistent axis constraints in different branches', () => {
    @Injectable()
    class ServiceA {
      getValue(): string {
        return 'A';
      }
    }

    @Injectable()
    class ServiceB {
      getValue(): string {
        return 'B';
      }
    }

    @Injectable()
    class Application {
      constructor(
        public serviceA: ServiceA,
        public serviceB: ServiceB,
      ) {}
    }

    // ServiceA requires Prod, ServiceB requires Test - impossible to satisfy
    const module = new ModuleDef()
      .make(ServiceA)
        .tagged(Environment, 'Prod')
        .fromSelf()
      .make(ServiceB)
        .tagged(Environment, 'Test')
        .fromSelf()
      .make(Application).fromSelf();

    const injector = new Injector();

    // Cannot satisfy both Prod and Test simultaneously
    const prodActivation = Activation.of(AxisPoint.of(Environment, 'Prod'));
    expect(() => {
      injector.produceByType(module, Application, { activation: prodActivation });
    }).toThrow(/ServiceB/);

    const testActivation = Activation.of(AxisPoint.of(Environment, 'Test'));
    expect(() => {
      injector.produceByType(module, Application, { activation: testActivation });
    }).toThrow(/ServiceA/);
  });

  it('should handle three-axis constraint propagation', () => {
    const Cloud = Axis.of('Cloud', ['AWS', 'Azure', 'GCP']);

    @Injectable()
    class Storage {
      constructor(
        public readonly env: string,
        public readonly region: string,
        public readonly cloud: string,
      ) {}

      getLocation(): string {
        return `${this.cloud}-${this.region}-${this.env}`;
      }
    }

    @Injectable()
    class DataService {
      constructor(public storage: Storage) {}
    }

    const module = new ModuleDef()
      .make(Storage)
        .tagged(Environment, 'Prod')
        .tagged(Region, 'US')
        .tagged(Cloud, 'AWS')
        .fromValue(new Storage('prod', 'us', 'aws'))
      .make(Storage)
        .tagged(Environment, 'Prod')
        .tagged(Region, 'EU')
        .tagged(Cloud, 'Azure')
        .fromValue(new Storage('prod', 'eu', 'azure'))
      .make(Storage)
        .tagged(Environment, 'Test')
        .tagged(Region, 'US')
        .tagged(Cloud, 'GCP')
        .fromValue(new Storage('test', 'us', 'gcp'))
      .make(DataService).fromSelf();

    const injector = new Injector();

    // Test each combination
    const awsActivation = Activation.of(
      AxisPoint.of(Environment, 'Prod'),
      AxisPoint.of(Region, 'US'),
      AxisPoint.of(Cloud, 'AWS'),
    );
    const awsService = injector.produceByType(module, DataService, {
      activation: awsActivation,
    });
    expect(awsService.storage.getLocation()).toBe('aws-us-prod');

    const azureActivation = Activation.of(
      AxisPoint.of(Environment, 'Prod'),
      AxisPoint.of(Region, 'EU'),
      AxisPoint.of(Cloud, 'Azure'),
    );
    const azureService = injector.produceByType(module, DataService, {
      activation: azureActivation,
    });
    expect(azureService.storage.getLocation()).toBe('azure-eu-prod');

    const gcpActivation = Activation.of(
      AxisPoint.of(Environment, 'Test'),
      AxisPoint.of(Region, 'US'),
      AxisPoint.of(Cloud, 'GCP'),
    );
    const gcpService = injector.produceByType(module, DataService, {
      activation: gcpActivation,
    });
    expect(gcpService.storage.getLocation()).toBe('gcp-us-test');
  });

  it('should handle mixed tagged and untagged dependencies in path', () => {
    @Injectable()
    class UntaggedBase {
      getValue(): string {
        return 'base';
      }
    }

    @Injectable()
    class TaggedMiddle {
      constructor(public base: UntaggedBase) {}
    }

    @Injectable()
    class UntaggedTop {
      constructor(public middle: TaggedMiddle) {}
    }

    const module = new ModuleDef()
      .make(UntaggedBase).fromSelf() // No tags
      .make(TaggedMiddle)
        .tagged(Environment, 'Prod')
        .fromSelf()
      .make(TaggedMiddle)
        .tagged(Environment, 'Test')
        .fromSelf()
      .make(UntaggedTop).fromSelf(); // No tags

    const injector = new Injector();

    // Both should work - untagged services don't restrict paths
    const prodActivation = Activation.of(AxisPoint.of(Environment, 'Prod'));
    const prodTop = injector.produceByType(module, UntaggedTop, {
      activation: prodActivation,
    });
    expect(prodTop.middle.base.getValue()).toBe('base');

    const testActivation = Activation.of(AxisPoint.of(Environment, 'Test'));
    const testTop = injector.produceByType(module, UntaggedTop, {
      activation: testActivation,
    });
    expect(testTop.middle.base.getValue()).toBe('base');
  });

  it('should propagate constraints through alias bindings', () => {
    @Injectable()
    abstract class ICache {
      abstract get(key: string): string;
    }

    @Injectable()
    class RedisCache extends ICache {
      get(key: string): string {
        return `redis:${key}`;
      }
    }

    @Injectable()
    class MemoryCache extends ICache {
      get(key: string): string {
        return `memory:${key}`;
      }
    }

    @Injectable()
    class CacheManager {
      constructor(public cache: ICache) {}
    }

    const module = new ModuleDef()
      .make(RedisCache)
        .tagged(Environment, 'Prod')
        .fromSelf()
      .make(MemoryCache)
        .tagged(Environment, 'Test')
        .fromSelf()
      .make(ICache as any)
        .tagged(Environment, 'Prod')
        .fromAlias(RedisCache)
      .make(ICache as any)
        .tagged(Environment, 'Test')
        .fromAlias(MemoryCache)
      .make(CacheManager).fromSelf();

    const injector = new Injector();

    const prodActivation = Activation.of(AxisPoint.of(Environment, 'Prod'));
    const prodManager = injector.produceByType(module, CacheManager, {
      activation: prodActivation,
    });
    expect(prodManager.cache).toBeInstanceOf(RedisCache);
    expect(prodManager.cache.get('test')).toBe('redis:test');

    const testActivation = Activation.of(AxisPoint.of(Environment, 'Test'));
    const testManager = injector.produceByType(module, CacheManager, {
      activation: testActivation,
    });
    expect(testManager.cache).toBeInstanceOf(MemoryCache);
    expect(testManager.cache.get('test')).toBe('memory:test');
  });
});

describe('Set Bindings with Axis Constraints', () => {
  const Environment = Axis.of('Environment', ['Prod', 'Test']);
  const Region = Axis.of('Region', ['US', 'EU']);

  @Injectable()
  abstract class Plugin {
    abstract getName(): string;
  }

  @Injectable()
  class CorePlugin extends Plugin {
    getName(): string {
      return 'core';
    }
  }

  @Injectable()
  class ProdPlugin extends Plugin {
    getName(): string {
      return 'prod-plugin';
    }
  }

  @Injectable()
  class TestPlugin extends Plugin {
    getName(): string {
      return 'test-plugin';
    }
  }

  @Injectable()
  class USPlugin extends Plugin {
    getName(): string {
      return 'us-plugin';
    }
  }

  @Injectable()
  class EUPlugin extends Plugin {
    getName(): string {
      return 'eu-plugin';
    }
  }

  class PluginManager {
    constructor(public plugins: Set<Plugin>) {}

    getPluginNames(): string[] {
      return Array.from(this.plugins).map(p => p.getName()).sort();
    }
  }

  it('should filter set elements based on path activation', () => {
    const module = new ModuleDef()
      .many(Plugin as any).addValue(new CorePlugin()) // No tags - always included
      .many(Plugin as any)
        .tagged(Environment, 'Prod')
        .addValue(new ProdPlugin())
      .many(Plugin as any)
        .tagged(Environment, 'Test')
        .addValue(new TestPlugin())
      .many(Plugin as any)
        .tagged(Region, 'US')
        .addValue(new USPlugin())
      .many(Plugin as any)
        .tagged(Region, 'EU')
        .addValue(new EUPlugin());

    const injector = new Injector();

    // Prod + US should get: core, prod-plugin, us-plugin
    const prodUSActivation = Activation.of(
      AxisPoint.of(Environment, 'Prod'),
      AxisPoint.of(Region, 'US'),
    );
    const prodUSLocator = injector.produce(module, [DIKey.set(Plugin as any)], {
      activation: prodUSActivation,
    });
    const prodUSPlugins = prodUSLocator.getSet(Plugin as any);
    const prodUSManager = new PluginManager(prodUSPlugins);
    expect(prodUSManager.getPluginNames()).toEqual(['core', 'prod-plugin', 'us-plugin']);

    // Test + EU should get: core, test-plugin, eu-plugin
    const testEUActivation = Activation.of(
      AxisPoint.of(Environment, 'Test'),
      AxisPoint.of(Region, 'EU'),
    );
    const testEULocator = injector.produce(module, [DIKey.set(Plugin as any)], {
      activation: testEUActivation,
    });
    const testEUPlugins = testEULocator.getSet(Plugin as any);
    const testEUManager = new PluginManager(testEUPlugins);
    expect(testEUManager.getPluginNames()).toEqual(['core', 'eu-plugin', 'test-plugin']);

    // No activation should get only core (untagged)
    const noActivationLocator = injector.produce(module, [DIKey.set(Plugin as any)]);
    const noActivationPlugins = noActivationLocator.getSet(Plugin as any);
    const noActivationManager = new PluginManager(noActivationPlugins);
    expect(noActivationManager.getPluginNames()).toEqual(['core']);
  });

  it('should handle set elements with dependencies that have axis constraints', () => {
    @Injectable()
    abstract class Logger {
      abstract log(msg: string): string;
    }

    @Injectable()
    class ProdLogger extends Logger {
      log(msg: string): string {
        return `[PROD] ${msg}`;
      }
    }

    @Injectable()
    class TestLogger extends Logger {
      log(msg: string): string {
        return `[TEST] ${msg}`;
      }
    }

    @Injectable()
    class PluginWithLogger extends Plugin {
      constructor(private logger: Logger) {
        super();
      }

      getName(): string {
        return this.logger.log('plugin-with-logger');
      }
    }

    const module = new ModuleDef()
      .make(Logger as any)
        .tagged(Environment, 'Prod')
        .fromClass(ProdLogger)
      .make(Logger as any)
        .tagged(Environment, 'Test')
        .fromClass(TestLogger)
      .many(Plugin as any).addValue(new CorePlugin())
      .many(Plugin as any)
        .tagged(Environment, 'Prod')
        .addClass(PluginWithLogger); // Has Logger dependency

    const injector = new Injector();

    // Prod activation should include plugin with prod logger
    const prodActivation = Activation.of(AxisPoint.of(Environment, 'Prod'));
    const prodLocator = injector.produce(module, [DIKey.set(Plugin as any)], {
      activation: prodActivation,
    });
    const prodPlugins = prodLocator.getSet(Plugin as any);
    const prodManager = new PluginManager(prodPlugins);
    const names = prodManager.getPluginNames();
    expect(names).toContain('core');
    expect(names).toContain('[PROD] plugin-with-logger');

    // Test activation should NOT include the prod plugin (filtered out)
    const testActivation = Activation.of(AxisPoint.of(Environment, 'Test'));
    const testLocator = injector.produce(module, [DIKey.set(Plugin as any)], {
      activation: testActivation,
    });
    const testPlugins = testLocator.getSet(Plugin as any);
    const testManager = new PluginManager(testPlugins);
    expect(testManager.getPluginNames()).toEqual(['core']);
  });

  it('should handle weak set elements that fail due to axis conflicts', () => {
    @Injectable()
    class Database {
      query(): string {
        return 'query-result';
      }
    }

    @Injectable()
    class PluginWithDB extends Plugin {
      constructor(private db: Database) {
        super();
      }

      getName(): string {
        return `plugin-with-db: ${this.db.query()}`;
      }
    }

    const module = new ModuleDef()
      .make(Database)
        .tagged(Environment, 'Prod')
        .fromSelf()
      .many(Plugin as any).addValue(new CorePlugin())
      .many(Plugin as any)
        .makeWeak()
        .tagged(Environment, 'Test') // Requires Test environment
        .addClass(PluginWithDB); // But DB only available in Prod

    const injector = new Injector();

    // Test activation: weak set element should be silently excluded
    // because its dependency (Database) requires Prod but we're in Test
    const testActivation = Activation.of(AxisPoint.of(Environment, 'Test'));
    const testLocator = injector.produce(module, [DIKey.set(Plugin as any)], {
      activation: testActivation,
    });
    const testPlugins = testLocator.getSet(Plugin as any);
    const testManager = new PluginManager(testPlugins);
    // Should only have core, not the weak plugin with conflicting dependency
    expect(testManager.getPluginNames()).toEqual(['core']);

    // Prod activation: PluginWithDB isn't available because it's tagged Test
    const prodActivation = Activation.of(AxisPoint.of(Environment, 'Prod'));
    const prodLocator = injector.produce(module, [DIKey.set(Plugin as any)], {
      activation: prodActivation,
    });
    const prodPlugins = prodLocator.getSet(Plugin as any);
    const prodManager = new PluginManager(prodPlugins);
    // Should only have core
    expect(prodManager.getPluginNames()).toEqual(['core']);
  });

  it('should correctly accumulate set elements from multiple modules with axis tags', () => {
    const module = new ModuleDef()
      .many(Plugin as any).addValue(new CorePlugin())
      .many(Plugin as any)
        .tagged(Environment, 'Prod')
        .addValue(new ProdPlugin())
      .many(Plugin as any)
        .tagged(Environment, 'Test')
        .addValue(new TestPlugin());

    const injector = new Injector();

    // Prod should get core + prod
    const prodActivation = Activation.of(AxisPoint.of(Environment, 'Prod'));
    const prodLocator = injector.produce(module, [DIKey.set(Plugin as any)], {
      activation: prodActivation,
    });
    const prodPlugins = prodLocator.getSet(Plugin as any);
    const prodManager = new PluginManager(prodPlugins);
    expect(prodManager.getPluginNames()).toEqual(['core', 'prod-plugin']);

    // Test should get core + test
    const testActivation = Activation.of(AxisPoint.of(Environment, 'Test'));
    const testLocator = injector.produce(module, [DIKey.set(Plugin as any)], {
      activation: testActivation,
    });
    const testPlugins = testLocator.getSet(Plugin as any);
    const testManager = new PluginManager(testPlugins);
    expect(testManager.getPluginNames()).toEqual(['core', 'test-plugin']);
  });

  it('should handle nested dependencies in set elements with multi-axis constraints', () => {
    @Injectable()
    class Config {
      constructor(
        public readonly env: string,
        public readonly region: string,
      ) {}
    }

    @Injectable()
    class ConfigurablePlugin extends Plugin {
      constructor(private config: Config) {
        super();
      }

      getName(): string {
        return `${this.config.env}-${this.config.region}-plugin`;
      }
    }

    const module = new ModuleDef()
      .make(Config)
        .tagged(Environment, 'Prod')
        .tagged(Region, 'US')
        .fromValue(new Config('prod', 'us'))
      .make(Config)
        .tagged(Environment, 'Prod')
        .tagged(Region, 'EU')
        .fromValue(new Config('prod', 'eu'))
      .make(Config)
        .tagged(Environment, 'Test')
        .tagged(Region, 'US')
        .fromValue(new Config('test', 'us'))
      .many(Plugin as any).addValue(new CorePlugin())
      .many(Plugin as any)
        .tagged(Environment, 'Prod')
        .tagged(Region, 'US')
        .addClass(ConfigurablePlugin)
      .many(Plugin as any)
        .tagged(Environment, 'Prod')
        .tagged(Region, 'EU')
        .addClass(ConfigurablePlugin);

    const injector = new Injector();

    // Prod-US
    const prodUSActivation = Activation.of(
      AxisPoint.of(Environment, 'Prod'),
      AxisPoint.of(Region, 'US'),
    );
    const prodUSLocator = injector.produce(module, [DIKey.set(Plugin as any)], {
      activation: prodUSActivation,
    });
    const prodUSPlugins = prodUSLocator.getSet(Plugin as any);
    const prodUSManager = new PluginManager(prodUSPlugins);
    expect(prodUSManager.getPluginNames()).toEqual(['core', 'prod-us-plugin']);

    // Prod-EU
    const prodEUActivation = Activation.of(
      AxisPoint.of(Environment, 'Prod'),
      AxisPoint.of(Region, 'EU'),
    );
    const prodEULocator = injector.produce(module, [DIKey.set(Plugin as any)], {
      activation: prodEUActivation,
    });
    const prodEUPlugins = prodEULocator.getSet(Plugin as any);
    const prodEUManager = new PluginManager(prodEUPlugins);
    expect(prodEUManager.getPluginNames()).toEqual(['core', 'prod-eu-plugin']);

    // Test-US (no plugin configured for this combination)
    const testUSActivation = Activation.of(
      AxisPoint.of(Environment, 'Test'),
      AxisPoint.of(Region, 'US'),
    );
    const testUSLocator = injector.produce(module, [DIKey.set(Plugin as any)], {
      activation: testUSActivation,
    });
    const testUSPlugins = testUSLocator.getSet(Plugin as any);
    const testUSManager = new PluginManager(testUSPlugins);
    expect(testUSManager.getPluginNames()).toEqual(['core']);
  });
});
