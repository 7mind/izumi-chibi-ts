import { describe, it, expect } from 'vitest';
import { Injector, ModuleDef, DIKey, Axis, AxisPoint, Activation, Injectable } from '../src/index.js';

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
});
