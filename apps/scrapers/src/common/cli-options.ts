import {InvalidArgumentError} from 'commander';

export function integerAtLeast(minimum: number, label: string) {
  return (value: string): number => {
    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < minimum) {
      throw new InvalidArgumentError(
        `${label}は${minimum}以上の整数で指定してください。`,
      );
    }

    return parsed;
  };
}

export function oneOf(values: readonly string[], label: string) {
  return (value: string): string => {
    if (!values.includes(value)) {
      throw new InvalidArgumentError(
        `${label}は次のいずれかで指定してください: ${values.join(' / ')}`,
      );
    }

    return value;
  };
}
