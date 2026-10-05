import { ORG_RESTRICTION_PATTERN, SSO_HEADER } from './access';
import { GITHUB_API_VERSION, GITHUB_USER_AGENT } from './config';
import {
  AuthLostError,
  GithubHttpError,
  NetworkError,
  OrgRestrictedError,
  RateLimitedError,
  SsoRequiredError,
  describeError,
  redactCause,
  redactToken,
} from './errors';

export interface ResponseHeaders {
  get(name: string): string | null;
}

export interface FetchResponse {
  status: number;
  headers: ResponseHeaders;
  body?: AsyncIterable<Uint8Array> | null;
  text(): Promise<string>;
}

export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type FetchLike = (
  url: string,
  init: FetchInit,
) => Promise<FetchResponse>;

export type Clock = () => number;

export interface GithubRequest {
  url: string;
  method?: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface GithubResponse {
  status: number;
  headers: ResponseHeaders;
  body: unknown;
}

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_NO_CONTENT = 204;
const HTTP_NOT_MODIFIED = 304;
const MS_PER_SECOND = 1000;
const ABORT_ERROR_NAME = 'AbortError';
const SSO_REQUIRED_PREFIX = 'required';
const SSO_ORG_PATTERN = /\/orgs\/([^/?#]+)\/sso/;
const RESTRICTED_ORG_PATTERN = /the [`'"]?([\w.-]+)[`'"]? organization/i;

export async function githubRequest(
  fetchImpl: FetchLike,
  request: GithubRequest,
  now: Clock = Date.now,
): Promise<GithubResponse> {
  const response = await send(fetchImpl, request);
  const body = await readBody(response);
  const failure = toHttpError(response, body, request.token, now);
  if (failure) throw failure;
  return { status: response.status, headers: response.headers, body };
}

export function rateLimitResetAt(
  headers: ResponseHeaders,
  now: Clock,
): Date | null {
  const retryAfterSeconds = numericHeader(headers, 'retry-after');
  if (retryAfterSeconds !== null) {
    return new Date(now() + retryAfterSeconds * MS_PER_SECOND);
  }
  if (headers.get('x-ratelimit-remaining') !== '0') return null;
  const resetEpochSeconds = numericHeader(headers, 'x-ratelimit-reset');
  if (resetEpochSeconds === null) return null;
  return new Date(resetEpochSeconds * MS_PER_SECOND);
}

export function numericHeader(
  headers: ResponseHeaders,
  name: string,
): number | null {
  const value = headers.get(name);
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function send(
  fetchImpl: FetchLike,
  request: GithubRequest,
): Promise<FetchResponse> {
  try {
    return await fetchImpl(request.url, toFetchInit(request));
  } catch (error) {
    if (isAbort(error, request.signal)) throw error;
    throw new NetworkError(redactToken(describeError(error), request.token), {
      cause: redactCause(error, request.token),
    });
  }
}

function toFetchInit(request: GithubRequest): FetchInit {
  const hasBody = request.body !== undefined;
  return {
    method: request.method ?? (hasBody ? 'POST' : 'GET'),
    headers: buildHeaders(request, hasBody),
    body: hasBody ? JSON.stringify(request.body) : undefined,
    signal: request.signal,
  };
}

export function buildHeaders(
  request: GithubRequest,
  hasBody: boolean,
): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent': GITHUB_USER_AGENT,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(request.token ? { Authorization: `Bearer ${request.token}` } : {}),
    ...request.headers,
  };
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  return asRecord(error).name === ABORT_ERROR_NAME;
}

async function readBody(response: FetchResponse): Promise<unknown> {
  if (response.status === HTTP_NO_CONTENT) return null;
  if (response.status === HTTP_NOT_MODIFIED) return null;
  const text = await response.text();
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isSuccess(status: number): boolean {
  return (status >= 200 && status < 300) || status === HTTP_NOT_MODIFIED;
}

function toHttpError(
  response: FetchResponse,
  body: unknown,
  token: string | undefined,
  now: Clock,
): Error | null {
  const { status, headers } = response;
  if (isSuccess(status)) return null;
  const message = redactToken(errorMessage(status, body), token);
  if (status === HTTP_UNAUTHORIZED) return new AuthLostError(message);
  const resetAt = rateLimitResetAtFor(status, headers, now);
  if (resetAt) return new RateLimitedError(message, resetAt);
  if (status === HTTP_FORBIDDEN) return forbiddenError(message, headers);
  return new GithubHttpError(message, status, errorCode(body), body);
}

function rateLimitResetAtFor(
  status: number,
  headers: ResponseHeaders,
  now: Clock,
): Date | null {
  if (status !== HTTP_FORBIDDEN && status !== HTTP_TOO_MANY_REQUESTS) {
    return null;
  }
  return rateLimitResetAt(headers, now);
}

function forbiddenError(message: string, headers: ResponseHeaders): Error {
  const sso = headers.get(SSO_HEADER);
  if (sso?.startsWith(SSO_REQUIRED_PREFIX)) {
    return new SsoRequiredError(message, matchGroup(sso, SSO_ORG_PATTERN));
  }
  if (ORG_RESTRICTION_PATTERN.test(message)) {
    return new OrgRestrictedError(
      message,
      matchGroup(message, RESTRICTED_ORG_PATTERN),
    );
  }
  return new GithubHttpError(message, HTTP_FORBIDDEN, null);
}

function matchGroup(text: string, pattern: RegExp): string | null {
  return pattern.exec(text)?.[1] ?? null;
}

function errorMessage(status: number, body: unknown): string {
  const fields = asRecord(body);
  const candidates = [
    fields.message,
    asRecord(fields.details).message,
    fields.error_description,
    fields.error,
  ];
  const message = candidates.find((value) => typeof value === 'string');
  if (typeof message === 'string') return message;
  return `GitHub answered with HTTP ${status}`;
}

function errorCode(body: unknown): string | null {
  const code = asRecord(body).error;
  return typeof code === 'string' ? code : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return {};
  return value as Record<string, unknown>;
}
