import { Alert } from 'react-native';
import type { Result } from '../../korev-desktop/src/shared/model';

type Failure = Extract<Result, { ok: false }>;

function isFailure(value: unknown): value is Failure {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<Failure>).ok === false
  );
}

export async function attempt(
  failureTitle: string,
  action: () => Promise<unknown>,
): Promise<boolean> {
  try {
    const result = await action();
    if (!isFailure(result)) return true;
    Alert.alert(failureTitle, result.message);
  } catch (error) {
    Alert.alert(
      failureTitle,
      error instanceof Error ? error.message : String(error),
    );
  }
  return false;
}
