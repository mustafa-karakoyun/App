export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function httpError(statusCode: number, code: string, message: string, extra?: Record<string, unknown>) {
  return new HttpError(statusCode, code, message, extra);
}
