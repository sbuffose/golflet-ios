/** Kept apart from lib/http.ts (which loads auth) so pure modules and tests can throw it without a database. */
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
