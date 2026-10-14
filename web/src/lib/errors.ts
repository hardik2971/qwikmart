export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(message: string, status = 400, errors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) {
    const first = err.errors ? Object.values(err.errors)[0]?.[0] : undefined;
    return first || err.message || fallback;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}
