/**
 * Helper type to represent any callable that can be used as a dependency source
 * This accepts:
 * - Concrete classes (new (...args) => T)
 * - Abstract classes (abstract new (...args) => T)
 * - Plain functions ((...args) => T)
 */
export type Callable<T = any> =
  | (new (...args: any[]) => T)
  | (abstract new (...args: any[]) => T)
  | ((...args: any[]) => T);

export interface Tagged<TAG>{
  _type: TAG
}

/**
 * Primitive type constructors
 */
export type PrimitiveType =
  | typeof String
  | typeof Number
  | typeof Boolean
  | typeof Symbol
  | typeof BigInt;

/**
 * TypeTag - An ADT representing a type identifier for dependency injection
 *
 * Can be one of:
 * - CallableTag: A class, abstract class, or function
 * - PrimitiveTag: A JavaScript primitive type (String, Number, Boolean, Symbol, BigInt)
 * - TokenTag: A Symbol instance used to represent an interface
 * - SetTag: A set of elements of a given type
 */
export type TypeTag<T = any> =
  | { kind: 'tagged'; value: Tagged<T> }
  | { kind: 'callable'; value: Callable<T> }
  | { kind: 'primitive'; value: PrimitiveType; name: string }
  | { kind: 'token'; value: symbol; description: string }
  | { kind: 'set'; elementTag: TypeTag<any> };

/**
 * Helper functions to create TypeTags
 */
export const TypeTag = {
  /**
   * Create a TypeTag from a callable (class or function)
   */
  callable<T>(callable: Callable<T>): TypeTag<T> {
    return { kind: 'callable', value: callable };
  },

  tagged<TAG>(tagged: Tagged<TAG>): TypeTag<TAG> {
    return { kind: 'tagged', value: tagged };
  },

  /**
   * Create a TypeTag from a symbol token (for representing interfaces)
   */
  token<T>(token: symbol): TypeTag<T> {
    return { kind: 'token', value: token, description: token.description || 'anonymous' };
  },

  /**
   * Create a TypeTag for String type
   */
  string(): TypeTag<string> {
    return { kind: 'primitive', value: String, name: 'String' };
  },

  /**
   * Create a TypeTag for Number type
   */
  number(): TypeTag<number> {
    return { kind: 'primitive', value: Number, name: 'Number' };
  },

  /**
   * Create a TypeTag for Boolean type
   */
  boolean(): TypeTag<boolean> {
    return { kind: 'primitive', value: Boolean, name: 'Boolean' };
  },

  /**
   * Create a TypeTag for Symbol type
   */
  symbol(): TypeTag<symbol> {
    return { kind: 'primitive', value: Symbol, name: 'Symbol' };
  },

  /**
   * Create a TypeTag for BigInt type
   */
  bigint(): TypeTag<bigint> {
    return { kind: 'primitive', value: BigInt, name: 'BigInt' };
  },

  /**
   * Get a string representation of a TypeTag
   */
  toString(tag: TypeTag): string {
    switch (tag.kind) {
      case 'tagged':
        return `tagged:${tag.value._type}`
      case 'callable':
        return `f:${tag.value.name || '<anonymous>'}`;
      case 'primitive':
        return `p:${tag.name}`;
      case 'token':
        return `token:${tag.description}`;
      case 'set':
        return `Set<${TypeTag.toString(tag.elementTag)}>`;
    }
  },

  /**
   * Create a TypeTag for a set of elements
   */
  set<T>(elementTag: TypeTag<T>): TypeTag<Set<T>> {
    return { kind: 'set', elementTag };
  },
};

/**
 * Unique identifier for a dependency in the dependency injection graph.
 * Can identify types by constructor, named bindings using @Id, or set bindings.
 */
export class DIKey<T = any> {
  private readonly _brand!: T; // Brand for type safety

  constructor(
    public readonly type: TypeTag<T>,
    public readonly id?: string,
  ) {}

  /**
   * Create a DIKey for a type
   */
  static of<T>(type: Callable<T>): DIKey<T> {
    return new DIKey(TypeTag.callable(type));
  }

  /**
   * Create a named DIKey (for @Id bindings)
   */
  static named<T>(type: Callable<T>, id: string): DIKey<T> {
    return new DIKey(TypeTag.callable(type), id);
  }

  /**
   * Create a DIKey for a symbol token (for interface bindings)
   */
  static token<T>(token: symbol): DIKey<T> {
    return new DIKey(TypeTag.token(token));
  }

  /**
   * Create a named DIKey for a symbol token
   */
  static namedToken<T>(token: symbol, id: string): DIKey<T> {
    return new DIKey(TypeTag.token(token), id);
  }

  /**
   * Create a DIKey for a set binding
   */
  static set<T>(type: Callable<T>): DIKey<Set<T>> {
    const setTag = TypeTag.set(TypeTag.callable(type));
    return new DIKey(setTag) as any;
  }

  /**
   * Create a DIKey for a named set binding
   */
  static namedSet<T>(type: Callable<T>, id: string): DIKey<Set<T>> {
    const setTag = TypeTag.set(TypeTag.callable(type));
    return new DIKey(setTag, id) as any;
  }

  /**
   * Create a DIKey for a set binding using a symbol token
   */
  static setToken<T>(token: symbol): DIKey<Set<T>> {
    const setTag = TypeTag.set(TypeTag.token(token));
    return new DIKey(setTag) as any;
  }

  /**
   * Create a DIKey for a named set binding using a symbol token
   */
  static namedSetToken<T>(token: symbol, id: string): DIKey<Set<T>> {
    const setTag = TypeTag.set(TypeTag.token(token));
    return new DIKey(setTag, id) as any;
  }

  /**
   * Get the raw callable from this key (for callable types)
   * Returns undefined for primitive types
   */
  getCallable(): Callable<T> | undefined {
    return this.type.kind === 'callable' ? this.type.value : undefined;
  }

  /**
   * Check if this key matches another key
   */
  equals(other: DIKey): boolean {
    return (
      this.typeTagEquals(this.type, other.type) &&
      this.id === other.id
    );
  }

  /**
   * Deep equality check for TypeTags
   */
  private typeTagEquals(a: TypeTag, b: TypeTag): boolean {
    if (a.kind !== b.kind) return false;

    switch (a.kind) {
      case 'callable':
        return a.value === (b as typeof a).value;
      case 'primitive':
        return a.value === (b as typeof a).value;
      case 'token':
        return a.value === (b as typeof a).value;
      case 'tagged':
        return a.value === (b as typeof a).value;
      case 'set':
        return this.typeTagEquals(a.elementTag, (b as typeof a).elementTag);
    }

    throw new Error('Unknown tag type');
  }

  /**
   * Get a string representation of this key for debugging and error messages
   */
  toString(): string {
    const typeName = TypeTag.toString(this.type);
    const idPart = this.id ? `@Id("${this.id}")` : '';
    return `${typeName}${idPart}`;
  }

  /**
   * Get a hashable key for use in Maps
   */
  toMapKey(): string {
    const typeName = TypeTag.toString(this.type);
    return `${typeName}|${this.id || ''}`;
  }
}

/**
 * Metadata key for storing @Id annotations
 */
export const ID_METADATA_KEY = Symbol('distage:id');

/**
 * Store for named parameter annotations
 */
export const PARAM_IDS_METADATA_KEY = Symbol('distage:param-ids');
