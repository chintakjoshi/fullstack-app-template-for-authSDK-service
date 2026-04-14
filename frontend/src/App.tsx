import { FormEvent, useEffect, useState } from "react";
import {
  ApiError,
  AuthenticatedPayload,
  OtpChallenge,
  ProtectedDemo,
  SessionResponse,
  enableOtp,
  getProtectedDemo,
  getSession,
  login,
  logout,
  reauth,
  requestVerifyEmailResend,
  resendLoginOtp,
  resendVerifyEmail,
  signup,
  verifyLoginOtp,
} from "./api";

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "good" | "warm";
}) {
  const toneClass =
    tone === "good"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "warm"
        ? "bg-orange-100 text-orange-700"
        : "bg-slate-200 text-slate-700";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${toneClass}`}
    >
      {label}
    </span>
  );
}

function App() {
  const [session, setSession] = useState<SessionResponse>({ authenticated: false, user: null });
  const [pendingChallenge, setPendingChallenge] = useState<OtpChallenge | null>(null);
  const [protectedDemo, setProtectedDemo] = useState<ProtectedDemo | null>(null);
  const [signupForm, setSignupForm] = useState({ email: "", password: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [verificationEmail, setVerificationEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    void refreshSession();
  }, []);

  async function refreshSession(forceProbe = false) {
    setLoadingSession(true);
    try {
      const result = await getSession({ forceProbe });
      setSession(result);
      if (!result.authenticated) {
        setProtectedDemo(null);
      }
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setLoadingSession(false);
    }
  }

  function applyAuthenticated(result: AuthenticatedPayload) {
    setSession({ authenticated: true, user: result.user });
    setPendingChallenge(null);
    setOtpCode("");
    setProtectedDemo(null);
    setVerificationEmail(result.user.email);
  }

  async function handleSignup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await signup(signupForm.email, signupForm.password);
      setLoginForm(signupForm);
      setVerificationEmail(signupForm.email);
      setMessage("Account created. Open Mailhog to click the verification link, then log in.");
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await login(loginForm.email, loginForm.password);
      if ("otp_required" in result) {
        setPendingChallenge(result);
        setMessage("OTP required. Grab the code from Mailhog and verify it below.");
      } else {
        applyAuthenticated(result);
        setMessage("Logged in through the same-origin auth proxy. authSDK now owns the browser-session cookies.");
      }
    } catch (caught) {
      const apiError = caught as ApiError;
      if (apiError.code === "email_not_verified") {
        setPendingChallenge(null);
        setProtectedDemo(null);
        setVerificationEmail(loginForm.email);
        setMessage(
          "Email verification is required before login. Resend the verification email below, then use the newest Mailhog link.",
        );
        return;
      }
      setError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent) {
    event.preventDefault();
    if (!pendingChallenge) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await verifyLoginOtp(pendingChallenge.challenge_token, otpCode);
      applyAuthenticated(result);
      setMessage("OTP accepted. authSDK set the browser-session cookies through the app origin.");
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function handleResendOtp() {
    if (!pendingChallenge) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await resendLoginOtp(pendingChallenge.challenge_token);
      setMessage("OTP resent. Check Mailhog for the latest code.");
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function handleResendVerifyEmail() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await resendVerifyEmail();
      setMessage("Verification email sent. Open Mailhog and use the link from the newest message.");
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestVerifyEmailResend(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await requestVerifyEmailResend(verificationEmail);
      setMessage("Verification email sent. Open Mailhog and use the newest link before logging in.");
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function handleEnableOtp() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await enableOtp();
      await refreshSession();
      setMessage(
        result.email_otp_enabled
          ? "Login OTP enabled. Log out and log back in to test the OTP challenge."
          : "OTP state unchanged.",
      );
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function handleReauth(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await reauth(reauthPassword);
      setReauthPassword("");
      await refreshSession();
      setMessage("Fresh authentication granted. Sensitive actions can be retried now.");
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function handleProtectedDemo() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await getProtectedDemo();
      setProtectedDemo(result);
      setMessage("Protected route succeeded through the SDK-protected downstream API.");
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await logout();
      setSession({ authenticated: false, user: null });
      setPendingChallenge(null);
      setProtectedDemo(null);
      setMessage("Logged out. authSDK cleared the browser-session cookies.");
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top,rgba(15,118,110,0.12),transparent_40%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.18),transparent_32%)]" />
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-10 sm:px-6 lg:px-8">
        <header className="animate-rise">
          <div className="inline-flex items-center gap-3 rounded-full border border-slate-300/80 bg-white/80 px-4 py-2 shadow-glow backdrop-blur">
            <span className="h-2.5 w-2.5 rounded-full bg-reef" />
            <span className="font-mono text-xs uppercase tracking-[0.24em] text-slate-600">
              authSDK sample stack
            </span>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h1 className="max-w-3xl font-display text-4xl font-semibold tracking-tight text-ink sm:text-6xl">
                Fast auth flows, browser-session cookies, and one SDK-protected API.
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
                This sample keeps the browser on one app origin.{" "}
                <code className="font-mono">/_auth</code> proxies to authSDK,{" "}
                <code className="font-mono">/api</code> proxies to the downstream service, and{" "}
                <code className="font-mono">auth-service-sdk</code> validates the same cookies at
                the API boundary.
              </p>
            </div>
            <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-glow backdrop-blur">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold text-ink">Runtime status</h2>
                {loadingSession ? (
                  <StatusPill label="Checking" tone="neutral" />
                ) : session.authenticated ? (
                  <StatusPill label="Authenticated" tone="good" />
                ) : pendingChallenge ? (
                  <StatusPill label="OTP pending" tone="warm" />
                ) : (
                  <StatusPill label="Signed out" tone="neutral" />
                )}
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-600">
                <div className="rounded-2xl bg-slate-100/80 p-4">
                  <div className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
                    Browser
                  </div>
                  <div className="mt-1">Frontend uses same-origin proxies for <code className="font-mono">/_auth</code> and <code className="font-mono">/api</code>.</div>
                </div>
                <div className="rounded-2xl bg-slate-100/80 p-4">
                  <div className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
                    Session
                  </div>
                  <div className="mt-1">authSDK owns the HttpOnly access and refresh cookies. The frontend reads only the CSRF cookie.</div>
                </div>
                <div className="rounded-2xl bg-slate-100/80 p-4">
                  <div className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
                    Downstream API
                  </div>
                  <div className="mt-1">Audience enforced locally by the SDK.</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="grid gap-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <form
                onSubmit={handleSignup}
                className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-glow backdrop-blur"
              >
                <h2 className="font-display text-2xl font-semibold text-ink">Create an account</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Signup goes through the same-origin auth proxy and triggers the verification
                  email from authSDK.
                </p>
                <div className="mt-5 grid gap-4">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Email
                    <input
                      className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none transition focus:border-reef"
                      type="email"
                      value={signupForm.email}
                      onChange={(event) =>
                        setSignupForm((current) => ({ ...current, email: event.target.value }))
                      }
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Password
                    <input
                      className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none transition focus:border-reef"
                      type="password"
                      value={signupForm.password}
                      onChange={(event) =>
                        setSignupForm((current) => ({ ...current, password: event.target.value }))
                      }
                      placeholder="Password123!"
                      required
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-5 inline-flex w-full justify-center rounded-2xl bg-ink px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Working..." : "Sign up"}
                </button>
              </form>

              <form
                onSubmit={handleLogin}
                className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-glow backdrop-blur"
              >
                <h2 className="font-display text-2xl font-semibold text-ink">Log in</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Login requests audience <code className="font-mono">sample-protected-api</code>{" "}
                  and lets authSDK mint the browser-session cookies directly.
                </p>
                <div className="mt-5 grid gap-4">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Email
                    <input
                      className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none transition focus:border-reef"
                      type="email"
                      value={loginForm.email}
                      onChange={(event) =>
                        setLoginForm((current) => ({ ...current, email: event.target.value }))
                      }
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Password
                    <input
                      className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none transition focus:border-reef"
                      type="password"
                      value={loginForm.password}
                      onChange={(event) =>
                        setLoginForm((current) => ({ ...current, password: event.target.value }))
                      }
                      placeholder="Password123!"
                      required
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-5 inline-flex w-full justify-center rounded-2xl bg-reef px-4 py-3 font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Working..." : "Log in"}
                </button>
              </form>
            </div>

            {pendingChallenge ? (
              <form
                onSubmit={handleVerifyOtp}
                className="rounded-[28px] border border-orange-200 bg-orange-50/90 p-6 shadow-glow backdrop-blur"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-ink">
                      OTP challenge active
                    </h2>
                    <p className="mt-2 text-sm text-slate-700">
                      Code sent to <span className="font-semibold">{pendingChallenge.masked_email}</span>.
                    </p>
                  </div>
                  <StatusPill label="Mailhog flow" tone="warm" />
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    OTP code
                    <input
                      className="rounded-2xl border border-orange-300 bg-white px-4 py-3 font-mono tracking-[0.3em] outline-none transition focus:border-ember"
                      value={otpCode}
                      onChange={(event) => setOtpCode(event.target.value)}
                      placeholder="123456"
                      required
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleResendOtp()}
                      className="inline-flex w-full justify-center rounded-2xl border border-orange-300 px-4 py-3 font-semibold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Resend OTP
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-5 inline-flex rounded-2xl bg-ember px-5 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Verifying..." : "Verify and finish login"}
                </button>
              </form>
            ) : null}

            <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-glow backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-ink">Protected API</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    This route is validated by <code className="font-mono">JWTAuthMiddleware</code>{" "}
                    plus cookie extraction in the downstream FastAPI service.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || !session.authenticated}
                  onClick={() => void handleProtectedDemo()}
                  className="inline-flex rounded-2xl bg-ink px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Load protected route
                </button>
              </div>
              {protectedDemo ? (
                <div className="mt-5 rounded-3xl bg-slate-950 p-5 text-sm text-slate-100">
                  <div className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">
                    Protected response
                  </div>
                  <p className="mt-3 text-base text-white">{protectedDemo.message}</p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-400">Audience</dt>
                      <dd className="font-mono">{protectedDemo.audience}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">User</dt>
                      <dd className="font-mono">{protectedDemo.user.email}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  Log in first, then load the downstream route to prove the SDK is validating the
                  audience-scoped session cookie.
                </div>
              )}
            </div>
          </section>

          <aside className="grid gap-6">
            <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-glow backdrop-blur">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-semibold text-ink">Current session</h2>
                <button
                  type="button"
                  onClick={() => void refreshSession(true)}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100"
                >
                  Refresh
                </button>
              </div>
              {session.authenticated && session.user ? (
                <div className="mt-5 grid gap-4">
                  <div className="rounded-3xl bg-slate-100 p-5">
                    <div className="text-sm text-slate-500">Signed in as</div>
                    <div className="mt-1 font-display text-2xl font-semibold text-ink">
                      {session.user.email}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <StatusPill
                        label={session.user.email_verified ? "Email verified" : "Email unverified"}
                        tone={session.user.email_verified ? "good" : "warm"}
                      />
                      <StatusPill
                        label={session.user.email_otp_enabled ? "OTP enabled" : "OTP disabled"}
                        tone={session.user.email_otp_enabled ? "good" : "neutral"}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleResendVerifyEmail()}
                      className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Resend verify email
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleEnableOtp()}
                      className="rounded-2xl border border-emerald-300 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Enable login OTP
                    </button>
                  </div>

                  <form onSubmit={handleReauth} className="rounded-3xl border border-slate-200 p-4">
                    <div className="font-semibold text-slate-800">Re-authenticate if needed</div>
                    <p className="mt-1 text-sm text-slate-500">
                      Use this if authSDK asks for a fresh auth time before a sensitive action.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <input
                        className="flex-1 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none transition focus:border-reef"
                        type="password"
                        value={reauthPassword}
                        onChange={(event) => setReauthPassword(event.target.value)}
                        placeholder="Current password"
                        required
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Re-auth
                      </button>
                    </div>
                  </form>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleLogout()}
                    className="rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Log out
                  </button>
                </div>
              ) : (
                <div className="mt-5 grid gap-4">
                  <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                    No active session. Verify the email first, then log in to mint the authSDK
                    browser-session cookies.
                  </div>
                  <form
                    onSubmit={handleRequestVerifyEmailResend}
                    className="rounded-3xl border border-orange-200 bg-orange-50/70 p-4"
                  >
                    <div className="font-semibold text-slate-800">Need a new verification email?</div>
                    <p className="mt-1 text-sm text-slate-600">
                      Use the signup or login email here if verification has not happened yet.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <input
                        className="flex-1 rounded-2xl border border-orange-300 bg-white px-4 py-3 outline-none transition focus:border-ember"
                        type="email"
                        value={verificationEmail}
                        onChange={(event) => setVerificationEmail(event.target.value)}
                        placeholder="you@example.com"
                        required
                      />
                      <button
                        type="submit"
                        disabled={busy || !verificationEmail}
                        className="rounded-2xl bg-ember px-5 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Send verify email
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-dusk p-6 text-slate-100 shadow-glow">
              <h2 className="font-display text-2xl font-semibold">Mailhog checklist</h2>
              <ol className="mt-4 grid gap-3 text-sm text-slate-200">
                <li>1. Open <span className="font-mono">http://127.0.0.1:8025</span>.</li>
                <li>2. After signup, click the verification link from the auth email.</li>
                <li>3. If login says the email is unverified, resend the verification email from this app.</li>
                <li>4. After OTP login starts, copy the newest code from the OTP email.</li>
                <li>5. Paste the code into the OTP panel and finish login.</li>
              </ol>
              <div className="mt-5 rounded-3xl bg-white/10 p-4 text-xs leading-6 text-slate-200">
                The auth service is the source of truth for verification and OTP state. This app
                now shows the same-origin auth-proxy and SDK integration path end to end.
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-glow backdrop-blur">
              <h2 className="font-display text-2xl font-semibold text-ink">Feedback</h2>
              {message ? (
                <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  {message}
                </div>
              ) : null}
              {error ? (
                <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <div className="font-semibold">{error.detail}</div>
                  <div className="mt-1 font-mono text-xs uppercase tracking-[0.18em]">
                    {error.code}
                  </div>
                </div>
              ) : null}
              {!message && !error ? (
                <div className="mt-4 rounded-3xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  The UI will surface auth-service error codes here so you can inspect behavior
                  while testing the stack.
                </div>
              ) : null}
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}

export default App;
