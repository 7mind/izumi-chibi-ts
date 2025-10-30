import 'reflect-metadata';

/**
 * Unique identifier for a dependency in the dependency injection graph.
 * Can identify types by constructor, named bindings using @Id, or set bindings.
 */
export class DIKey<T = any> {
  private readonly _brand!: T; // Brand for type safety

  constructor(
    public readonly type: abstract new (...args: any[]) => T | (new (...args: any[]) => T),
    public readonly id?: string,
    public readonly isSet: boolean = false,
  ) {}

  /**
   * Create a DIKey for a type
   */
  static of<T>(type: abstract new (...args: any[]) => T | (new (...args: any[]) => T)): DIKey<T> {
    return new DIKey(type);
  }

  /**
   * Create a named DIKey (for @Id bindings)
   */
  static named<T>(
    type: abstract new (...args: any[]) => T | (new (...args: any[]) => T),
    id: string,
  ): DIKey<T> {
    return new DIKey(type, id);
  }

  /**
   * Create a DIKey for a set binding
   */
  static set<T>(type: abstract new (...args: any[]) => T | (new (...args: any[]) => T)): DIKey<Set<T>> {
    return new DIKey(type, undefined, true) as any;
  }

  /**
   * Create a DIKey for a named set binding
   */
  static namedSet<T>(
    type: abstract new (...args: any[]) => T | (new (...args: any[]) => T),
    id: string,
  ): DIKey<Set<T>> {
    return new DIKey(type, id, true) as any;
  }

  /**
   * Check if this key matches another key
   */
  equals(other: DIKey): boolean {
    return (
      this.type === other.type &&
      this.id === other.id &&
      this.isSet === other.isSet
    );
  }

  /**
   * Get a string representation of this key for debugging and error messages
   */
  toString(): string {
    const typeName = this.type.name || '<anonymous>';
    const idPart = this.id ? `@Id("${this.id}")` : '';
    const setPart = this.isSet ? 'Set<' : '';
    const setClose = this.isSet ? '>' : '';
    return `${setPart}${typeName}${setClose}${idPart}`;
  }

  /**
   * Get a hashable key for use in Maps
   */
  toMapKey(): string {
    return `${this.type.name}|${this.id || ''}|${this.isSet}`;
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
