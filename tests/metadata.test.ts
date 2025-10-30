import { describe, it, expect } from 'vitest';
import { Injectable } from '../src/distage';
import 'reflect-metadata';

describe('Metadata Emission', () => {
  it('should emit constructor parameter metadata with only @Injectable decorator', () => {
    class Config {
      value = 'test';
    }

    @Injectable()
    class Database {
      constructor(config: Config) {}
    }

    // Check if SWC emits design:paramtypes with just @Injectable
    const paramTypes = Reflect.getMetadata('design:paramtypes', Database);

    console.log('Parameter types:', paramTypes);

    expect(paramTypes).toBeDefined();
    expect(paramTypes.length).toBe(1);
    expect(paramTypes[0]).toBe(Config);
  });

  it('should work without @Inject on parameters', () => {
    @Injectable()
    class ServiceA {
      value = 'a';
    }

    @Injectable()
    class ServiceB {
      constructor(serviceA: ServiceA) {}
    }

    const paramTypes = Reflect.getMetadata('design:paramtypes', ServiceB);

    expect(paramTypes).toBeDefined();
    expect(paramTypes[0]).toBe(ServiceA);
  });
});
