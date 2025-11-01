# Chibi Izumi for TypeScript (distage)

[![CI](https://github.com/7mind/izumi-chibi-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/7mind/izumi-chibi-ts/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40izumi-framework%2Fizumi-chibi-ts.svg)](https://www.npmjs.com/package/@izumi-framework/izumi-chibi-ts)
[![codecov](https://codecov.io/gh/7mind/izumi-chibi-ts/branch/main/graph/badge.svg)](https://codecov.io/gh/7mind/izumi-chibi-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A TypeScript re-implementation of some core concepts from Scala's [Izumi Project](https://github.com/7mind/izumi),
`distage` staged dependency injection library in particular.

The port was done by guiding Claude, at this point no manual reviews were done.

At this point the project is not battle-tested. Expect dragons, landmines and varying mileage.

Sibling project: [izumi-chibi-py](https://github.com/7mind/izumi-chibi-py).

## Features

distage brings the power of distage's staged dependency injection to TypeScript:

- **Fluent DSL** for defining dependency injection modules
- **Type-safe bindings** using TypeScript's type system
- **Multiple binding types**: regular, set, weak set, aliases, factory bindings
- **Axis tagging** for conditional bindings (e.g., dev vs prod implementations)
- **Named dependencies** using `@Id` decorator
- **Functoid abstraction** for representing dependency constructors
- **Fail-fast validation** with circular and missing dependency detection
- **Planner/Producer separation** for build-time analysis and runtime instantiation

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

**Note:** distage does not use reflect-metadata or decorators for dependency injection. You must explicitly specify dependencies using `.withDeps()` or provide them via factory functions with `.withTypes()` or `.withParams()`.

## Quick Start

```typescript
import { Injector, ModuleDef, Id } from 'distage';

// Define your classes
class Config {
  constructor(public readonly env: string) {}
}

class Database {
  constructor(public readonly config: Config) {}
}

class UserService {
  constructor(
    public readonly db: Database,
    @Id('app-name') public readonly appName: string
  ) {}
}

// Define module with bindings - dependencies must be explicitly specified
const module = new ModuleDef()
  .make(Config).from().value(new Config('production'))
  .make(Database).withDeps([Config]).from().type(Database)
  .make(String).named('app-name').from().value('MyApp')
  .make(UserService).withDeps([Database, String]).from().type(UserService);

// Create injector and produce instances
const injector = new Injector();
const userService = injector.produceByType(module, UserService);

console.log(userService.appName); // 'MyApp'
console.log(userService.db.config.env); // 'production'
```

## Core Concepts

### ModuleDef - DSL for Defining Bindings

ModuleDef provides a fluent API for declaring how to create instances:

```typescript
class Config {
  constructor(public readonly logLevel: string) {}
}

class Logger {
  constructor(public readonly config: Config) {}
}

const module = new ModuleDef()
  // Bind to a value
  .make(Config).from().value(new Config('production'))

  // Bind to a class (with explicit dependencies)
  .make(Database).withDeps([Config]).from().type(PostgresDatabase)

  // Bind using the type itself (with explicit dependencies)
  .make(UserService).withDeps([Database, Logger]).from().type(UserService)

  // Bind using a factory (manual dependencies)
  .make(Logger).from().factory(
    Functoid.fromFunction((config: Config) => {
      return new Logger(config);
    }).withTypes([Config])
  )

  // Create an alias
  .make(IDatabase).from().alias(PostgresDatabase);
```

### Named Bindings with @Id

Use the `@Id` decorator to distinguish multiple bindings of the same type:

```typescript
class Service {
  constructor(
    @Id('primary') public readonly primaryDb: Database,
    @Id('replica') public readonly replicaDb: Database
  ) {}
}

const module = new ModuleDef()
  .make(Database).named('primary').from().value(primaryDb)
  .make(Database).named('replica').from().value(replicaDb)
  .make(Service).withDeps([Database, Database]).from().type(Service);
```

**Note:** Dependencies must be explicitly specified using `.withDeps()` when binding classes, or by using `.withTypes()` or `.withParams()` when creating Functoids. Named dependencies still require the `@Id` decorator on parameters.

### Set Bindings

Collect multiple implementations into a set:

```typescript
interface Plugin {
  name: string;
}

class AuthPlugin implements Plugin {
  name = 'auth';
}

class LoggingPlugin implements Plugin {
  name = 'logging';
}

const module = new ModuleDef()
  .many(Plugin).from().type(AuthPlugin)
  .many(Plugin).from().type(LoggingPlugin)
  .make(PluginManager).from().factory(
    Functoid.fromFunction((plugins: Set<Plugin>) => {
      return new PluginManager(plugins);
    }).withTypes([Set])
  );
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
import { Axis, AxisPoint, Activation } from 'distage';

const Environment = Axis.of('Environment', ['Dev', 'Prod']);

const module = new ModuleDef()
  .make(Database)
    .tagged(Environment, 'Dev')
    .from().type(InMemoryDatabase)
  .make(Database)
    .tagged(Environment, 'Prod')
    .withDeps([Config]).from().type(PostgresDatabase)
  .make(UserService).withDeps([Database]).from().type(UserService);

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

### Functoid - Dependency Constructors

Functoid represents a function with its dependencies. It supports both automatic type extraction and manual annotation:

```typescript
import { Functoid } from 'distage';

// Manual type specification (required)
const functoid1 = Functoid.fromFunction((db: Database, config: Config) => {
  return new Service(db, config);
}).withTypes([Database, Config]);

// Manual annotation for named parameters
const functoid2 = Functoid.fromFunction((db: Database, name: string) => {
  return new Service(db, name);
}).annotate([null, 'app-name']); // 'db' has no ID, 'name' gets ID 'app-name'
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
```

### Locator - Instance Container

The Locator provides access to created instances:

```typescript
const locator = injector.produce(module, [DIKey.of(UserService)]);

// Get by DIKey
const service = locator.get(DIKey.of(UserService));

// Get by type
const db = locator.getByType(Database);

// Get by type and ID
const primaryDb = locator.getByTypeAndId(Database, 'primary');

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
  // Error: MissingDep is not bound

const injector = new Injector();
// Throws: MissingDependencyError
injector.produceByType(module, Service);
```

### Circular Dependencies

```typescript
class A {
  constructor(public readonly b: B) {}
}

class B {
  constructor(public readonly a: A) {}
}

const module = new ModuleDef()
  .make(A).withDeps([B]).from().type(A)
  .make(B).withDeps([A]).from().type(B);

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
  .make(Database).withDeps([Config]).from().type(PostgresDatabase)
  .make(Cache).withDeps([Config]).from().type(RedisCache);

const testModule = new ModuleDef()
  .make(Database).from().type(InMemoryDatabase);

// Merge modules
const combined = baseModule.append(testModule);

// Override bindings (later takes precedence)
const overridden = baseModule.overriddenBy(testModule);
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

**Differences:**
- Uses `@Id` decorator instead of Scala's type tags
- Requires explicit dependency specification via `.withDeps()` or Functoid annotations
- Manual annotation for lambda parameters (TypeScript limitation)
- No automatic type reflection (explicit `.withTypes()` or `.withParams()` required)
- Simplified lifecycle management
- No trait auto-implementation (TypeScript limitation)

## Inspired By

- [distage](https://izumi.7mind.io/distage/) - Scala's staged dependency injection
- [izumi-chibi-py](https://github.com/7mind/izumi-chibi-py) - Python port of distage

## License

MIT
