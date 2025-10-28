/**
 * Represents an axis for conditional bindings.
 * Axes allow selecting different implementations based on runtime configuration.
 *
 * Example: Axis.of('Environment', ['Prod', 'Test', 'Dev'])
 */
export class Axis {
  constructor(
    public readonly name: string,
    public readonly choices: readonly string[],
  ) {
    if (choices.length === 0) {
      throw new Error(`Axis ${name} must have at least one choice`);
    }
  }

  static of(name: string, choices: string[]): Axis {
    return new Axis(name, choices);
  }

  hasChoice(choice: string): boolean {
    return this.choices.includes(choice);
  }

  toString(): string {
    return `Axis(${this.name}: ${this.choices.join(' | ')})`;
  }
}

/**
 * Represents a specific point on an axis.
 * Used to select which implementation to use for a binding.
 */
export class AxisPoint {
  constructor(
    public readonly axis: Axis,
    public readonly choice: string,
  ) {
    if (!axis.hasChoice(choice)) {
      throw new Error(
        `Invalid choice "${choice}" for axis ${axis.name}. Valid choices: ${axis.choices.join(', ')}`,
      );
    }
  }

  static of(axis: Axis, choice: string): AxisPoint {
    return new AxisPoint(axis, choice);
  }

  equals(other: AxisPoint): boolean {
    return this.axis === other.axis && this.choice === other.choice;
  }

  toString(): string {
    return `${this.axis.name}:${this.choice}`;
  }
}

/**
 * A set of axis points that determines which implementations to use.
 * Multiple axis points can be active simultaneously.
 */
export class Activation {
  private readonly points: Map<Axis, AxisPoint>;

  constructor(points: AxisPoint[] = []) {
    this.points = new Map();
    for (const point of points) {
      if (this.points.has(point.axis)) {
        throw new Error(
          `Duplicate axis ${point.axis.name} in activation. Cannot activate multiple choices on the same axis.`,
        );
      }
      this.points.set(point.axis, point);
    }
  }

  static of(...points: AxisPoint[]): Activation {
    return new Activation(points);
  }

  static empty(): Activation {
    return new Activation([]);
  }

  /**
   * Get the choice for a specific axis, if activated
   */
  getChoice(axis: Axis): string | undefined {
    return this.points.get(axis)?.choice;
  }

  /**
   * Check if this activation has a choice for the given axis
   */
  hasAxis(axis: Axis): boolean {
    return this.points.has(axis);
  }

  /**
   * Get all activated axis points
   */
  getPoints(): AxisPoint[] {
    return Array.from(this.points.values());
  }

  /**
   * Create a new activation with an additional point
   */
  withPoint(point: AxisPoint): Activation {
    return new Activation([...this.getPoints(), point]);
  }

  /**
   * Merge this activation with another, with the other taking precedence
   */
  merge(other: Activation): Activation {
    const merged = new Map(this.points);
    for (const [axis, point] of other.points) {
      merged.set(axis, point);
    }
    return new Activation(Array.from(merged.values()));
  }

  toString(): string {
    const points = Array.from(this.points.values())
      .map(p => p.toString())
      .join(', ');
    return `Activation(${points || 'empty'})`;
  }
}

/**
 * Tags associated with a binding to enable conditional selection
 */
export class BindingTags {
  constructor(private readonly tags: Map<Axis, string> = new Map()) {}

  static empty(): BindingTags {
    return new BindingTags();
  }

  static of(points: AxisPoint[]): BindingTags {
    const tags = new Map<Axis, string>();
    for (const point of points) {
      tags.set(point.axis, point.choice);
    }
    return new BindingTags(tags);
  }

  /**
   * Add a tag for an axis
   */
  withTag(axis: Axis, choice: string): BindingTags {
    const newTags = new Map(this.tags);
    newTags.set(axis, choice);
    return new BindingTags(newTags);
  }

  /**
   * Check if this binding matches the given activation.
   * A binding matches if all its tags are satisfied by the activation.
   * - Bindings with no tags match any activation (including empty)
   * - Bindings with tags only match if activation specifies matching choices for all tagged axes
   */
  matches(activation: Activation): boolean {
    for (const [axis, choice] of this.tags) {
      const activeChoice = activation.getChoice(axis);
      // If activation doesn't have this axis, or has a different choice, binding doesn't match
      if (activeChoice !== choice) {
        return false;
      }
    }
    return true;
  }

  /**
   * Count how many tags this binding has.
   * Used to determine specificity when multiple bindings match.
   */
  specificity(): number {
    return this.tags.size;
  }

  getTags(): Map<Axis, string> {
    return new Map(this.tags);
  }

  toString(): string {
    const tagStrs = Array.from(this.tags.entries())
      .map(([axis, choice]) => `${axis.name}:${choice}`)
      .join(', ');
    return `Tags(${tagStrs || 'empty'})`;
  }
}
