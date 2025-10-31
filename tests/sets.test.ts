import { describe, it, expect } from 'vitest';
import { Injector, ModuleDef, DIKey, Functoid } from '../src/distage';

// Test classes
interface Plugin {
  name: string;
}

class AuthPlugin implements Plugin {
  name = 'auth';
}

class LoggingPlugin implements Plugin {
  name = 'logging';
}

class MetricsPlugin implements Plugin {
  name = 'metrics';
}

describe('Set Bindings', () => {
  it('should collect multiple implementations into a set', () => {
    const module = new ModuleDef()
      .many(AuthPlugin).from().value(new AuthPlugin())
      .many(AuthPlugin).from().value(new LoggingPlugin())
      .many(AuthPlugin).from().value(new MetricsPlugin());

    const injector = new Injector();

    // Get the set directly
    const locator = injector.produce(module, [DIKey.set(AuthPlugin as any)]);
    const plugins = locator.getSet(AuthPlugin as any) as Set<AuthPlugin>;

    expect(plugins.size).toBe(3);
    const names = Array.from(plugins).map(p => p.name);
    expect(names).toContain('auth');
    expect(names).toContain('logging');
    expect(names).toContain('metrics');
  });

  it('should support set bindings with classes', () => {
    const module = new ModuleDef()
      .many(AuthPlugin).from().type(AuthPlugin)
      .many(AuthPlugin).from().type(LoggingPlugin);

    const injector = new Injector();
    const locator = injector.produce(
      module,
      [DIKey.set(AuthPlugin as any)],
    );

    const plugins = locator.getSet(AuthPlugin as any);
    expect(plugins.size).toBe(2);
  });

  it('should support named sets', () => {
    const module = new ModuleDef()
      .many(AuthPlugin).named('core').from().type(AuthPlugin)
      .many(AuthPlugin).named('core').from().type(LoggingPlugin)
      .many(AuthPlugin).named('optional').from().type(MetricsPlugin);

    const injector = new Injector();
    const locator = injector.produce(
      module,
      [
        DIKey.namedSet(AuthPlugin as any, 'core'),
        DIKey.namedSet(AuthPlugin as any, 'optional'),
      ],
    );

    const corePlugins = locator.getNamedSet(AuthPlugin as any, 'core');
    const optionalPlugins = locator.getNamedSet(AuthPlugin as any, 'optional');

    expect(corePlugins.size).toBe(2);
    expect(optionalPlugins.size).toBe(1);
  });

  it('should support weak set bindings that can fail gracefully', () => {
        class DependencyThatDoesNotExist {
      value = 'missing';
    }

        class PluginWithDependency implements Plugin {
      name = 'dependent';
      constructor(public readonly dep: DependencyThatDoesNotExist) {}
    }

    const module = new ModuleDef()
      .many(AuthPlugin).from().type(AuthPlugin)
      .many(AuthPlugin).makeWeak().from().factory(
        Functoid.fromConstructor(PluginWithDependency).withTypes([DependencyThatDoesNotExist])
      );

    const injector = new Injector();

    // This should not throw even though PluginWithDependency has missing dependencies
    // The weak set element should just be skipped
    const locator = injector.produce(
      module,
      [DIKey.set(AuthPlugin as any)],
    );

    const plugins = locator.getSet(AuthPlugin as any);
    expect(plugins.size).toBe(1); // Only AuthPlugin, not PluginWithDependency
  });
});
