import { describe, it, expect } from 'vitest';
import { Functoid, DIKey, Injector, ModuleDef } from '../src/distage';

// Test classes
class Config {
  constructor(public readonly value: string = 'default') {}
}

class Database {
  constructor(public readonly config: Config) {}
}

describe('Functoid', () => {
  it('should extract dependencies from a function', () => {
    const functoid = Functoid.fromFunctionUnsafe(
      (config: Config, db: Database) => {
        return { config, db };
      }
    ).withTypes([Config, Database]);

    const deps = functoid.getDependencies();
    expect(deps.length).toBe(2);
    expect(deps[0].getCallable()).toBe(Config);
    expect(deps[1].getCallable()).toBe(Database);
  });

  it('should support manual annotation of parameter IDs', () => {
    const functoid = Functoid.fromFunctionUnsafe(
      (config: Config, db: Database) => {
        return { config, db };
      }
    ).withParams([
      { type: Config, id: 'primary' },
      { type: Database }
    ]);

    const deps = functoid.getDependencies();
    expect(deps.length).toBe(2);
    expect(deps[0].equals(DIKey.named(Config, 'primary'))).toBe(true);
    expect(deps[1].equals(DIKey.of(Database))).toBe(true);
  });

  it('should execute with provided arguments', () => {
    const functoid = Functoid.fromFunctionUnsafe(
      (a: number, b: number) => a + b
    );

    const result = functoid.execute([5, 3]);
    expect(result).toBe(8);
  });

  it('should support constant functoids', () => {
    const functoid = Functoid.constant(42);

    const result = functoid.execute([]);
    expect(result).toBe(42);
  });

  it('should support mapping functoid results', () => {
    const functoid = Functoid.fromFunctionUnsafe(
      (a: number, b: number) => a + b
    ).map(result => result * 2);

    const result = functoid.execute([5, 3]);
    expect(result).toBe(16); // (5 + 3) * 2
  });

  it('should work with ModuleDef factory bindings', () => {
        class ComputedValue {
      constructor(public readonly value: number) {}
    }

    const module = new ModuleDef()
      .make(Config).from().value(new Config('10'))
      .make(ComputedValue).from().factory(
        Functoid.fromFunctionUnsafe((config: Config) => {
          return new ComputedValue(parseInt(config.value) * 2);
        }).withTypes([Config])
      );

    const injector = new Injector();
    const result = injector.produceByType(module, ComputedValue);

    expect(result.value).toBe(20);
  });

  it('should handle functoids with annotated IDs in factory bindings', () => {
        class Service {
      constructor(
        public readonly primary: Config,
        public readonly secondary: Config,
      ) {}
    }

    const module = new ModuleDef()
      .make(Config).named('primary').from().value(new Config('primary-value'))
      .make(Config).named('secondary').from().value(new Config('secondary-value'))
      .make(Service).from().factory(
        Functoid.fromFunctionUnsafe((p: Config, s: Config) => {
          return new Service(p, s);
        }).withParams([
          { type: Config, id: 'primary' },
          { type: Config, id: 'secondary' }
        ])
      );

    const injector = new Injector();
    const service = injector.produceByType(module, Service);

    expect(service.primary.value).toBe('primary-value');
    expect(service.secondary.value).toBe('secondary-value');
  });

  it('should extract dependencies from constructors with explicit types', () => {
    const functoid = Functoid.fromConstructor(Database).withTypes([Config]);

    const deps = functoid.getDependencies();
    expect(deps.length).toBe(1);
    expect(deps[0].getCallable()).toBe(Config);
  });

  it('should throw helpful error when type information is missing', () => {
    // Create a function without type information
    const fn = (a: any, b: any) => a + b;

    // Strip metadata
    const functoid = new Functoid(fn);

    // Should throw when trying to get dependencies
    expect(() => {
      functoid.getDependencies();
    }).toThrow(/type information is missing/);
  });
});
