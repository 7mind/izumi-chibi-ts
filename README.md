# Chibi Izumi for TypeScript (distage)

[![CI](https://github.com/7mind/izumi-chibi-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/7mind/izumi-chibi-ts/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40izumi-framework%2Fizumi-chibi-ts.svg)](https://www.npmjs.com/package/@izumi-framework/izumi-chibi-ts)
[![codecov](https://codecov.io/gh/7mind/izumi-chibi-ts/branch/main/graph/badge.svg)](https://codecov.io/gh/7mind/izumi-chibi-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A TypeScript re-implementation of some core concepts from Scala's [Izumi Project](https://github.com/7mind/izumi),
`distage` staged dependency injection library in particular.

The port was done by guiding Claude with partial manual reviews.

At this point the project is not battle-tested. Expect dragons, landmines and varying mileage.

Sibling project: [izumi-chibi-py](https://github.com/7mind/izumi-chibi-py).

## Other DI implementations for TypeScript/JavaScript

| Library | Non-invasive | Staged DI | Config Axes | Async | Lifecycle | Factory | Type Safety | Set Bindings |
|---------|--------------|-----------|-------------|-------|-----------|---------|-------------|--------------|
| **izumi-chibi-ts** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| [InversifyJS](https://github.com/inversify/InversifyJS) | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| [TSyringe](https://github.com/microsoft/tsyringe) | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ❌ |
| [TypeDI](https://github.com/typestack/typedi) | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ |
| [NestJS DI](https://docs.nestjs.com/providers) | ⚠️ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| [Awilix](https://github.com/jeffijoe/awilix) | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ❌ |
| [typed-inject](https://github.com/nicojs/typed-inject) | ✅ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ❌ |
| [BottleJS](https://github.com/young-steveo/bottlejs) | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ |

**Legend:** ✅ = Full support | ⚠️ = Partial/limited | ❌ = Not supported

## Features

distage brings the power of distage's staged dependency injection to TypeScript:

- **Fluent DSL** for defining dependency injection modules
- **Type-safe bindings** using TypeScript's type system
- **@Reflected decorator** for automatic dependency resolution without duplication
- **Type-safe factory functions** with parameter type inference
- **Multiple binding types**: regular, set, weak set, aliases, factory bindings
- **Axis tagging** for conditional bindings (e.g., dev vs prod implementations)
- **Named dependencies** using `@Id` decorator
- **Async support** with parallel execution for independent async factories
- **Functoid abstraction** for representing dependency constructors
- **Fail-fast validation** with circular and missing dependency detection
- **Planner/Producer separation** for build-time analysis and runtime instantiation
- **Lifecycle management** for resource acquisition and cleanup

## Installation

```bash
npm install @izumi-framework/izumi-chibi-ts
```

Make sure to enable the following in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

## Quick Start

```typescript
import { Injector, ModuleDef, Reflected, Id } from '@izumi-framework/izumi-chibi-ts';

// Define your classes with @Reflected decorator
class Config {
  constructor(public readonly env: string) {}
}

@Reflected(Config)
class Database {
  constructor(public readonly config: Config) {}
}

@Reflected(Database, String)
class UserService {
  constructor(
    public readonly db: Database,
    @Id('app-name') public readonly appName: string
  ) {}
}

// Define module with bindings
const module = new ModuleDef()
  .make(Config).from().value(new Config('production'))
  .make(Database).from().type(Database)  // @Reflected handles dependencies
  .make(String).named('app-name').from().value('MyApp')
  .make(UserService).from().type(UserService);  // @Reflected handles dependencies

// Create injector and produce instances
const injector = new Injector();
const userService = injector.produceByType(module, UserService);

console.log(userService.appName); // 'MyApp'
console.log(userService.db.config.env); // 'production'
```

## Core Concepts

### @Reflected Decorator - Automatic Dependency Resolution

The `@Reflected` decorator stores constructor parameter types directly on the class, enabling automatic dependency resolution:

```typescript
import { Reflected, Id } from '@izumi-framework/izumi-chibi-ts';

@Reflected(Database, Config)
class UserService {
  constructor(
    public readonly db: Database,
    public readonly config: Config
  ) {}
}

// TypeScript validates at compile-time that:
// - The number of types matches the constructor parameter count
// - The types are in the correct order
// - The types match the constructor parameter types

const module = new ModuleDef()
  .make(UserService).from().type(UserService);  // Dependencies auto-detected!
```

For third-party classes you can't modify, use `ApplyReflection`:

```typescript
import { ApplyReflection } from '@izumi-framework/izumi-chibi-ts';

// Third-party class you can't modify
class ThirdPartyService {
  constructor(db: Database, config: Config) {}
}

// Add reflection metadata
ApplyReflection(ThirdPartyService, Database, Config);

// Now it works without .withDeps()
const module = new ModuleDef()
  .make(ThirdPartyService).from().type(ThirdPartyService);
```

### ModuleDef - DSL for Defining Bindings

ModuleDef provides a fluent API for declaring how to create instances:

```typescript
import { ModuleDef, Functoid } from '@izumi-framework/izumi-chibi-ts';

@Reflected(Config)
class Logger {
  constructor(public readonly config: Config) {}
}

const module = new ModuleDef()
  // Bind to a value
  .make(Config).from().value(new Config('production'))

  // Bind to a class (with @Reflected)
  .make(Database).from().type(PostgresDatabase)

  // Bind using type-safe factory with .func()
  .make(Logger).from().func(
    [Config],
    (config) => new Logger(config)  // Types inferred automatically!
  )

  // Bind using a pre-built Functoid
  .make(Logger).from().functoid(
    Functoid.fromFunction([Config], (config) => new Logger(config))
  )

  // Create an alias
  .make(IDatabase).from().alias(PostgresDatabase);
```

### Type-Safe Factory Functions

The `.func()` method and `Functoid.fromFunction()` provide type-safe factories with automatic type inference:

```typescript
// Types are specified once, then inferred for parameters
const module = new ModuleDef()
  .make(UserService).from().func(
    [Database, Config],
    (db, config) => new UserService(db, config)
    // TypeScript infers: db: Database, config: Config
  );

// Benefits:
// - No type duplication
// - Compile-time validation of parameter count and order
// - Full type safety without 'as' casts
```

### Named Bindings with @Id

Use the `@Id` decorator to distinguish multiple bindings of the same type:

```typescript
import { Id } from '@izumi-framework/izumi-chibi-ts';

@Reflected(Database, Database)
class Service {
  constructor(
    @Id('primary') public readonly primaryDb: Database,
    @Id('replica') public readonly replicaDb: Database
  ) {}
}

const module = new ModuleDef()
  .make(Database).named('primary').from().value(primaryDb)
  .make(Database).named('replica').from().value(replicaDb)
  .make(Service).from().type(Service);  // @Reflected + @Id work together
```

### Async Support

distage fully supports asynchronous factories with intelligent parallel execution:

```typescript
@Reflected(DatabaseConfig)
class Database {
  constructor(public readonly config: DatabaseConfig) {}
  connected = false;

  async connect() {
    this.connected = true;
  }
}

const module = new ModuleDef()
  // Async factory
  .make(DatabaseConfig).from().func(
    [],
    async () => {
      // Simulate loading config from file
      const config = await loadConfigFromFile();
      return config;
    }
  )
  // Another async factory
  .make(Database).from().func(
    [DatabaseConfig],
    async (config) => {
      const db = new Database(config);
      await db.connect();
      return db;
    }
  );

// Use produceAsync for async graphs
const injector = new Injector();
const locator = await injector.produceAsync(module, [DIKey.of(Database)]);
const db = locator.get(DIKey.of(Database));
console.log(db.connected); // true
```

**Parallel Execution**: Independent async factories are executed in parallel automatically:

```typescript
const module = new ModuleDef()
  .make(ServiceA).from().func([], async () => {
    await delay(100);
    return new ServiceA();
  })
  .make(ServiceB).from().func([], async () => {
    await delay(100);
    return new ServiceB();
  });

// ServiceA and ServiceB will be created in parallel (~100ms total, not ~200ms)
await injector.produceAsync(module, [DIKey.of(ServiceA), DIKey.of(ServiceB)]);
```

### Set Bindings

Collect multiple implementations into a set:

```typescript
interface Plugin {
  name: string;
}

@Reflected()
class AuthPlugin implements Plugin {
  name = 'auth';
}

@Reflected()
class LoggingPlugin implements Plugin {
  name = 'logging';
}

@Reflected(Set)
class PluginManager {
  constructor(public readonly plugins: Set<Plugin>) {}
}

const module = new ModuleDef()
  .many(Plugin).from().type(AuthPlugin)
  .many(Plugin).from().type(LoggingPlugin)
  .make(PluginManager).from().type(PluginManager);
```

### Weak Set Bindings

Weak set elements are only included if their dependencies can be satisfied:

```typescript
const module = new ModuleDef()
  .many(Plugin).from().type(CorePlugin)
  .many(Plugin).makeWeak().from().type(OptionalPlugin); // Only included if deps are available
```

### Axis Tagging for Conditional Bindings

Select different implementations based on runtime configuration:

```typescript
import { Axis, AxisPoint, Activation } from '@izumi-framework/izumi-chibi-ts';

const Environment = Axis.of('Environment', ['Dev', 'Prod']);

const module = new ModuleDef()
  .make(Database)
    .tagged(Environment, 'Dev')
    .from().type(InMemoryDatabase)
  .make(Database)
    .tagged(Environment, 'Prod')
    .from().type(PostgresDatabase)
  .make(UserService).from().type(UserService);

// Use dev database
const devActivation = Activation.of(AxisPoint.of(Environment, 'Dev'));
const devService = injector.produceByType(module, UserService, {
  activation: devActivation
});

// Use prod database
const prodActivation = Activation.of(AxisPoint.of(Environment, 'Prod'));
const prodService = injector.produceByType(module, UserService, {
  activation: prodActivation
});
```

### Lifecycle Management

Manage resources with automatic cleanup:

```typescript
import { Lifecycle } from '@izumi-framework/izumi-chibi-ts';

class DatabaseConnection {
  async connect() { /* ... */ }
  async disconnect() { /* ... */ }
}

const dbLifecycle = Lifecycle.make(
  async () => {
    const conn = new DatabaseConnection();
    await conn.connect();
    return conn;
  },
  async (conn) => {
    await conn.disconnect();
  }
);

// Use the resource and automatically clean it up
await dbLifecycle.use(async (db) => {
  // Use database
  return await db.query('SELECT * FROM users');
});
// Database is automatically disconnected here, even if an error occurred
```

### Functoid - Dependency Constructors

Functoid represents a function with its dependencies:

```typescript
import { Functoid } from '@izumi-framework/izumi-chibi-ts';

// Type-safe factory with inference
const functoid1 = Functoid.fromFunction(
  [Database, Config],
  (db, config) => new Service(db, config)
  // Types inferred: db: Database, config: Config
);

// From constructor (with @Reflected)
const functoid2 = Functoid.fromConstructor(MyService);

// Constant value
const functoid3 = Functoid.constant('my-value');

// Manual type specification (when needed)
const functoid4 = Functoid.fromFunctionUnsafe(
  (db, config) => new Service(db, config)
).withTypes([Database, Config]);
```

### Planner and Producer

distage separates planning (building the dependency graph) from production (instantiating):

```typescript
const injector = new Injector();

// Plan phase: analyze dependencies, detect errors
const plan = injector.plan(module, [DIKey.of(UserService)]);
console.log(plan.toString()); // View execution plan

// Produce phase: create instances
const locator = injector.produceFromPlan(plan);
const service = locator.get(DIKey.of(UserService));

// Or async
const locator2 = await injector.produceFromPlanAsync(plan);
```

### Locator - Instance Container

The Locator provides access to created instances:

```typescript
const locator = injector.produce(module, [DIKey.of(UserService)]);

// Get by DIKey
const service = locator.get(DIKey.of(UserService));

// Get set
const plugins = locator.getSet(DIKey.set(Plugin));

// Try to get (returns undefined if not found)
const optional = locator.find(DIKey.of(OptionalService));

// Check if exists
if (locator.has(DIKey.of(Cache))) {
  // ...
}
```

## Error Detection

distage detects common dependency injection errors at planning time:

### Missing Dependencies

```typescript
class Service {
  constructor(public readonly missing: MissingDep) {}
}

const module = new ModuleDef()
  .make(Service).withDeps([MissingDep]).from().type(Service);
  // MissingDep is not bound

const injector = new Injector();
// Throws: MissingDependencyError
injector.produceByType(module, Service);
```

### Circular Dependencies

```typescript
@Reflected(B)
class A {
  constructor(public readonly b: B) {}
}

@Reflected(A)
class B {
  constructor(public readonly a: A) {}
}

const module = new ModuleDef()
  .make(A).from().type(A)
  .make(B).from().type(B);

// Throws: CircularDependencyError
injector.produceByType(module, A);
```

### Conflicting Bindings

```typescript
const module = new ModuleDef()
  .make(Service).tagged(Env, 'Prod').from().type(ServiceA)
  .make(Service).tagged(Env, 'Prod').from().type(ServiceB); // Same specificity!

// Throws: ConflictingBindingsError
injector.produceByType(module, Service, {
  activation: Activation.of(AxisPoint.of(Env, 'Prod'))
});
```

## Module Composition

Combine and override modules:

```typescript
const baseModule = new ModuleDef()
  .make(Database).from().type(PostgresDatabase)
  .make(Cache).from().type(RedisCache);

const testModule = new ModuleDef()
  .make(Database).from().type(InMemoryDatabase);

// Merge modules (both bindings kept, testModule takes precedence for conflicts)
const combined = baseModule.append(testModule);
```

## API Reference

### Injector Methods

```typescript
// Synchronous
injector.produce(module, roots, options?)
injector.produceByType(module, type, options?)
injector.produceOne(module, key, options?)

// Asynchronous
await injector.produceAsync(module, roots, options?)
await injector.produceByTypeAsync(module, type, options?)
await injector.produceOneAsync(module, key, options?)
```

### ModuleDef Binding Methods

```typescript
.make(Type)              // Start a binding
  .named(id)             // Add a name/ID
  .tagged(axis, value)   // Add axis tag
  .from()
    .type(Impl)          // Bind to class
    .value(instance)     // Bind to value
    .func(types, fn)     // Bind to type-safe factory
    .functoid(functoid)  // Bind to Functoid
    .alias(Target)       // Bind to alias

.many(Type)              // Start a set binding
  .makeWeak()            // Make it weak
  .from()
    .type(Impl)          // Add implementation to set
```

## Development

### Setup

```bash
# Enter Nix environment
nix develop

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## Architecture

distage follows distage's architecture:

1. **ModuleDef**: DSL for declaring bindings
2. **Planner**: Analyzes modules and creates execution plans
   - Resolves which bindings to use based on activation
   - Detects circular and missing dependencies
   - Produces topologically sorted plan
3. **Producer**: Executes plans to create instances
   - Creates instances in dependency order
   - Manages singleton semantics
   - Supports parallel async execution
4. **Locator**: Provides access to created instances
5. **Injector**: Main entry point that coordinates everything

## Comparison with distage

distage implements the core concepts of distage with TypeScript-specific adaptations:

**Similarities:**
- Staged DI with Planner/Producer separation
- Fluent ModuleDef DSL
- Axis tagging for conditional bindings
- Set bindings for plugin architectures
- Functoid abstraction
- Named dependencies
- Lifecycle management

**Differences:**
- Uses `@Reflected` decorator for automatic dependency resolution
- Uses `@Id` decorator instead of Scala's type tags
- Type-safe factory functions with parameter type inference
- Async support with parallel execution
- Simplified lifecycle management
- No trait auto-implementation (TypeScript limitation)

**Improvements over manual DI:**
- No type duplication with `@Reflected` and `.func()`
- Compile-time validation of dependency types and counts
- Automatic parallel execution for async factories
- Early error detection at planning time

## Inspired By

- [distage](https://izumi.7mind.io/distage/) - Scala's staged dependency injection
- [izumi-chibi-py](https://github.com/7mind/izumi-chibi-py) - Python port of distage


## License

MIT
