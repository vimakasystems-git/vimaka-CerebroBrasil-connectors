export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function ensure(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
export function record(value: unknown): asserts value is Record<string, unknown> {
  ensure(value !== null && typeof value === 'object' && !Array.isArray(value), 'Objeto JSON obrigatório');
}
export function keys(value: Record<string, unknown>, allowed: string[]): void {
  ensure(Object.keys(value).every(key => allowed.includes(key)), 'Propriedade desconhecida');
}
