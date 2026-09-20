import { useState } from "react";
import { authApi } from "../api";

function LoginPage({ onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const mfaRequired = Boolean(mfaToken);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      let result;

      if (mfaRequired) {
        result = await authApi.verifyMfa(
          mfaToken,
          mfaCode.trim(),
        );
      } else {
        result = await authApi.login(email, password);

        if (result.mfaRequired) {
          setMfaToken(result.mfaToken);
          setPassword("");
          return;
        }
      }

      onAuthenticated(result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Sign in failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  function returnToLogin() {
    setMfaToken("");
    setMfaCode("");
    setPassword("");
    setError("");
  }

  return (
    <main className="soc-login-page">
      <section className="soc-login-card">
        <div className="soc-login-brand">
          <div className="soc-login-shield">✓</div>

          <div>
            <h1>BankShield</h1>
            <p>Security Operations Center</p>
          </div>
        </div>

        <div className="soc-login-heading">
          <p className="page-label">Restricted workspace</p>

          <h2>
            {mfaRequired
              ? "Verify your identity"
              : "Analyst sign in"}
          </h2>

          <p>
            {mfaRequired
              ? "Enter the verification code from your authenticator app."
              : "Sign in with an authorized analyst or administrator account."}
          </p>
        </div>

        <form className="soc-login-form" onSubmit={handleSubmit}>
          {!mfaRequired ? (
            <>
              <label htmlFor="soc-email">Email address</label>

              <input
                id="soc-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
              />

              <label htmlFor="soc-password">Password</label>

              <input
                id="soc-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </>
          ) : (
            <>
              <label htmlFor="soc-mfa-code">
                Authentication code
              </label>

              <input
                id="soc-mfa-code"
                type="text"
                inputMode="numeric"
                value={mfaCode}
                onChange={(event) =>
                  setMfaCode(
                    event.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                autoComplete="one-time-code"
                placeholder="000000"
                minLength={6}
                maxLength={6}
                required
                autoFocus
              />
            </>
          )}

          {error ? (
            <div className="soc-login-error" role="alert">
              {error}
            </div>
          ) : null}

          <button
            className="soc-login-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : mfaRequired
                ? "Verify and continue"
                : "Sign in"}
          </button>

          {mfaRequired ? (
            <button
              className="soc-login-back"
              type="button"
              onClick={returnToLogin}
              disabled={loading}
            >
              Return to sign in
            </button>
          ) : null}
        </form>

        <p className="soc-login-notice">
          Access is limited to fraud analysts, security analysts,
          and administrators.
        </p>
      </section>
    </main>
  );
}

export default LoginPage;