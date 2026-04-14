const AUTH_BASE_PATH = "/_auth";
const APP_API_BASE_PATH = "/api";
const AUTH_TRANSPORT_HEADER_NAME = "X-Auth-Session-Transport";
const AUTH_TRANSPORT_COOKIE = "cookie";
const PROTECTED_API_AUDIENCE =
  import.meta.env.VITE_PROTECTED_API_AUDIENCE ?? "sample-protected-api";
const CSRF_COOKIE_NAME = import.meta.env.VITE_AUTH_CSRF_COOKIE_NAME ?? "auth_csrf";
const CSRF_HEADER_NAME = import.meta.env.VITE_AUTH_CSRF_HEADER_NAME ?? "X-CSRF-Token";
const SESSION_HINT_STORAGE_KEY = "authsdk.browser_session_hint";

export type ApiErrorCode =
  | "account_locked"
  | "action_token_invalid"
  | "already_verified"
  | "email_not_verified"
  | "expired_api_key"
  | "internal_server_error"
  | "invalid_api_key"
  | "invalid_credentials"
  | "invalid_csrf_token"
  | "invalid_otp"
  | "invalid_reset_token"
  | "invalid_scope"
  | "invalid_token"
  | "invalid_user"
  | "invalid_verify_token"
  | "method_not_allowed"
  | "not_authenticated"
  | "not_found"
  | "otp_expired"
  | "otp_issuance_blocked"
  | "otp_max_attempts_exceeded"
  | "otp_required"
  | "rate_limited"
  | "reauth_required"
  | "revoked_api_key"
  | "service_unavailable"
  | "session_expired"
  | "token_expired"
  | "upstream_error"
  | "upstream_unavailable"
  | (string & {});

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly detail: string;

  constructor(status: number, detail: string, code: ApiErrorCode) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export interface AuthenticatedUser {
  type: "user";
  user_id: string;
  email: string;
  email_verified: boolean;
  email_otp_enabled: boolean;
  role: "admin" | "user" | "service";
  scopes: string[];
  auth_time: number;
}

export interface SessionResponse {
  authenticated: boolean;
  user: AuthenticatedUser | null;
}

export interface OtpChallenge {
  otp_required: true;
  challenge_token: string;
  masked_email: string;
}

export interface AuthenticatedPayload {
  authenticated: true;
  user: AuthenticatedUser;
}

export interface OTPEnabledResponse {
  email_otp_enabled: boolean;
}

export interface ProtectedDemo {
  message: string;
  audience: string;
  user: AuthenticatedUser;
}

interface LoggedOutResponse {
  logged_out: boolean;
}

interface ReauthResponse {
  reauthenticated: boolean;
}

interface SentResponse {
  sent: boolean;
}

interface AcceptedResponse {
  accepted: boolean;
}

interface CookieSessionResponse {
  authenticated: true;
  session_transport: "cookie";
}

interface CSRFTokenResponse {
  csrf_token: string;
}

function hasSessionHint(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(SESSION_HINT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSessionHint(authenticated: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (authenticated) {
      window.localStorage.setItem(SESSION_HINT_STORAGE_KEY, "1");
      return;
    }

    window.localStorage.removeItem(SESSION_HINT_STORAGE_KEY);
  } catch {
    // Ignore storage failures and fall back to cookie-only session detection.
  }
}

function readCookie(name: string): string {
  const prefix = `${name}=`;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return value ? decodeURIComponent(value.slice(prefix.length)) : "";
}

function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method.toUpperCase());
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      response.status,
      "The server returned an invalid JSON response.",
      "upstream_error",
    );
  }
}

function buildHeaders(headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);
  mergedHeaders.set("Accept", "application/json");
  return mergedHeaders;
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      headers: buildHeaders(init.headers),
    });
  } catch {
    throw new ApiError(503, "Unable to reach the sample app origin.", "upstream_unavailable");
  }

  if (!response.ok) {
    const payload = await parseJson<Partial<{ detail: string; code: ApiErrorCode }>>(response).catch(
      () => null,
    );
    throw new ApiError(
      response.status,
      payload?.detail ?? "Request failed.",
      payload?.code ?? "upstream_error",
    );
  }

  return parseJson<T>(response);
}

async function bootstrapCsrfToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const existing = readCookie(CSRF_COOKIE_NAME);
    if (existing) {
      return existing;
    }
  }

  const payload = await fetchJson<CSRFTokenResponse>(`${AUTH_BASE_PATH}/csrf`);
  const resolvedToken = payload.csrf_token || readCookie(CSRF_COOKIE_NAME);
  if (!resolvedToken) {
    throw new ApiError(503, "Unable to bootstrap CSRF protection.", "upstream_error");
  }
  return resolvedToken;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { cookieTransport?: boolean } = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = buildHeaders(init.headers);
  const cookieTransport = options.cookieTransport ?? false;

  if (cookieTransport) {
    headers.set(AUTH_TRANSPORT_HEADER_NAME, AUTH_TRANSPORT_COOKIE);
  }

  if (isUnsafeMethod(method)) {
    const csrfToken = await bootstrapCsrfToken();
    headers.set(CSRF_HEADER_NAME, csrfToken);
  }

  return fetchJson<T>(path, {
    ...init,
    method,
    headers,
  });
}

function shouldAttemptRefresh(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    (error.code === "invalid_token" ||
      error.code === "session_expired" ||
      error.code === "token_expired" ||
      error.code === "not_authenticated")
  );
}

async function refreshBrowserSession(): Promise<boolean> {
  try {
    await request<CookieSessionResponse>(`${AUTH_BASE_PATH}/token`, {
      method: "POST",
    }, {
      cookieTransport: true,
    });
    return true;
  } catch (error) {
    if (shouldAttemptRefresh(error)) {
      return false;
    }
    throw error;
  }
}

async function withSessionRefresh<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!shouldAttemptRefresh(error)) {
      throw error;
    }

    const refreshed = await refreshBrowserSession();
    if (!refreshed) {
      throw error;
    }
    return operation();
  }
}

async function getCurrentUser(): Promise<AuthenticatedUser> {
  return request<AuthenticatedUser>(`${APP_API_BASE_PATH}/me`);
}

function toAuthenticatedPayload(user: AuthenticatedUser): AuthenticatedPayload {
  return { authenticated: true, user };
}

export async function signup(email: string, password: string): Promise<AcceptedResponse> {
  return request<AcceptedResponse>(`${AUTH_BASE_PATH}/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  }, {
    cookieTransport: true,
  });
}

export async function login(
  email: string,
  password: string,
): Promise<OtpChallenge | AuthenticatedPayload> {
  const result = await request<OtpChallenge | CookieSessionResponse>(`${AUTH_BASE_PATH}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      audience: PROTECTED_API_AUDIENCE,
    }),
  }, {
    cookieTransport: true,
  });

  if ("otp_required" in result) {
    return result;
  }

  const session = await getSession({ forceProbe: true });
  if (!session.authenticated || !session.user) {
    throw new ApiError(
      503,
      "Login completed but the browser session could not be established.",
      "upstream_error",
    );
  }
  return toAuthenticatedPayload(session.user);
}

export async function verifyLoginOtp(
  challengeToken: string,
  code: string,
): Promise<AuthenticatedPayload> {
  await request<CookieSessionResponse>(`${AUTH_BASE_PATH}/otp/verify/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      challenge_token: challengeToken,
      code,
    }),
  }, {
    cookieTransport: true,
  });

  const session = await getSession({ forceProbe: true });
  if (!session.authenticated || !session.user) {
    throw new ApiError(
      503,
      "OTP verification completed but the browser session could not be established.",
      "upstream_error",
    );
  }
  return toAuthenticatedPayload(session.user);
}

export async function resendLoginOtp(challengeToken: string): Promise<SentResponse> {
  return request<SentResponse>(`${AUTH_BASE_PATH}/otp/resend/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      challenge_token: challengeToken,
    }),
  }, {
    cookieTransport: true,
  });
}

export async function getSession(
  options: { forceProbe?: boolean } = {},
): Promise<SessionResponse> {
  if (!options.forceProbe && !hasSessionHint()) {
    return { authenticated: false, user: null };
  }

  try {
    const user = await withSessionRefresh(() => getCurrentUser());
    writeSessionHint(true);
    return { authenticated: true, user };
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 ||
        error.code === "invalid_token" ||
        error.code === "session_expired" ||
        error.code === "token_expired" ||
        error.code === "not_authenticated")
    ) {
      writeSessionHint(false);
      return { authenticated: false, user: null };
    }
    throw error;
  }
}

export async function resendVerifyEmail(): Promise<SentResponse> {
  return withSessionRefresh(() =>
    request<SentResponse>(`${AUTH_BASE_PATH}/verify-email/resend`, {
      method: "POST",
    }, {
      cookieTransport: true,
    }),
  );
}

export async function requestVerifyEmailResend(email: string): Promise<SentResponse> {
  return request<SentResponse>(`${AUTH_BASE_PATH}/verify-email/resend/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  }, {
    cookieTransport: true,
  });
}

export async function reauth(password: string): Promise<ReauthResponse> {
  await withSessionRefresh(() =>
    request<CookieSessionResponse>(`${AUTH_BASE_PATH}/reauth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    }, {
      cookieTransport: true,
    }),
  );
  return { reauthenticated: true };
}

export async function enableOtp(): Promise<OTPEnabledResponse> {
  return withSessionRefresh(() =>
    request<OTPEnabledResponse>(`${AUTH_BASE_PATH}/otp/enable`, {
      method: "POST",
    }, {
      cookieTransport: true,
    }),
  );
}

export async function logout(): Promise<LoggedOutResponse> {
  try {
    await withSessionRefresh(() =>
      request<unknown>(`${AUTH_BASE_PATH}/logout`, {
        method: "POST",
      }, {
        cookieTransport: true,
      }),
    );
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }
  }

  writeSessionHint(false);
  return { logged_out: true };
}

export async function getProtectedDemo(): Promise<ProtectedDemo> {
  return withSessionRefresh(() => request<ProtectedDemo>(`${APP_API_BASE_PATH}/demo`));
}
