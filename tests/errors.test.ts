import { describe, it, expect } from 'vitest';
import {
  Injector,
  ModuleDef,
  DIKey,
  MissingDependencyError,
  CircularDependencyError,
  Functoid,
  Reflected,
} from '../src/distage';

describe('Error Handling', () => {
  it('should detect circular dependencies', () => {
    // Use simple classes without circular type references in decorators
    class ServiceA {
      constructor(public readonly serviceB: any) {}
    }

    class ServiceB {
      constructor(public readonly serviceC: any) {}
    }

    class ServiceC {
      constructor(public readonly serviceA: any) {}
    }

    // Use factories to define circular dependencies at DI level
    const module = new ModuleDef()
      .make(ServiceA).from().factory(
        Functoid.fromFunction((b: any) => new ServiceA(b)).withTypes([ServiceB])
      )
      .make(ServiceB).from().factory(
        Functoid.fromFunction((c: any) => new ServiceB(c)).withTypes([ServiceC])
      )
      .make(ServiceC).from().factory(
        Functoid.fromFunction((a: any) => new ServiceC(a)).withTypes([ServiceA])
      );

    const injector = new Injector();

    expect(() => {
      injector.produceByType(module, ServiceA);
    }).toThrow(CircularDependencyError);
  });

  it('should detect missing dependencies', () => {
        class MissingService {
      value = 'missing';
    }

    @Reflected(MissingService)
    class DependsOnMissing {
      constructor(public readonly missing: MissingService) {}
    }

    const module = new ModuleDef()
      .make(DependsOnMissing).from().type(DependsOnMissing);
    // Note: MissingService is not bound

    const injector = new Injector();

    expect(() => {
      injector.produceByType(module, DependsOnMissing);
    }).toThrow(MissingDependencyError);
  });

  it('should provide helpful error messages for missing dependencies', () => {
        class MissingService {
      value = 'missing';
    }

    @Reflected(MissingService)
    class DependsOnMissing {
      constructor(public readonly missing: MissingService) {}
    }

    const module = new ModuleDef()
      .make(DependsOnMissing).from().type(DependsOnMissing);

    const injector = new Injector();

    try {
      injector.produceByType(module, DependsOnMissing);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MissingDependencyError);
      const err = error as MissingDependencyError;
      expect(err.message).toContain('MissingService');
      expect(err.message).toContain('DependsOnMissing');
    }
  });

  it('should provide helpful error messages for circular dependencies', () => {
    class ServiceA {
      constructor(public readonly serviceB: any) {}
    }

    class ServiceB {
      constructor(public readonly serviceC: any) {}
    }

    class ServiceC {
      constructor(public readonly serviceA: any) {}
    }

    const module = new ModuleDef()
      .make(ServiceA).from().factory(
        Functoid.fromFunction((b: any) => new ServiceA(b)).withTypes([ServiceB])
      )
      .make(ServiceB).from().factory(
        Functoid.fromFunction((c: any) => new ServiceB(c)).withTypes([ServiceC])
      )
      .make(ServiceC).from().factory(
        Functoid.fromFunction((a: any) => new ServiceC(a)).withTypes([ServiceA])
      );

    const injector = new Injector();

    try {
      injector.produceByType(module, ServiceA);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CircularDependencyError);
      const err = error as CircularDependencyError;
      expect(err.message).toContain('Circular dependency');
      expect(err.cycle.length).toBeGreaterThan(0);
    }
  });

  it('should detect missing @Id dependencies', () => {
        class MissingService {
      value = 'missing';
    }

    @Reflected(MissingService)
    class NeedsNamedDep {
      constructor(public readonly dep: MissingService) {}
    }

    const module = new ModuleDef()
      .make(MissingService).named('other').from().value(new MissingService())
      .make(NeedsNamedDep).from().type(NeedsNamedDep);
    // Note: MissingService without ID is not bound, only 'other' is

    const injector = new Injector();

    expect(() => {
      injector.produceByType(module, NeedsNamedDep);
    }).toThrow(MissingDependencyError);
  });
});
