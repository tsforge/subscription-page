/**
 * Exhaustiveness guard for discriminated unions. Placed in the `default` branch of
 * a switch so that adding a new union member becomes a compile-time error (the
 * argument stops being assignable to `never`), and an unreachable value at runtime
 * throws loudly instead of being silently ignored.
 */
export function assertNever(value: never, message = 'Unexpected value'): never {
    throw new Error(`${message}: ${JSON.stringify(value)}`);
}
