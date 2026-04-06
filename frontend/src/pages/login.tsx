import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { fetchApi, setToken } from '@/lib/api';
import { routes } from '@/lib/routes';
import { Navbar } from '@/components/navbar';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const isLogin = router.query.mode !== 'signup';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSentAt, setOtpSentAt] = useState<number | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Countdown timer — counts down from 60 each time an OTP is sent
  useEffect(() => {
    if (otpSentAt === null) return;
    const tick = () => {
      const remaining = Math.max(0, 60 - Math.floor((Date.now() - otpSentAt) / 1000));
      setResendCooldown(remaining);
      return remaining;
    };
    if (tick() === 0) return;
    const interval = setInterval(() => { if (tick() === 0) clearInterval(interval); }, 1000);
    return () => clearInterval(interval);
  }, [otpSentAt]);

  // Reset form state when switching between login/signup
  function resetForm() {
    setStep(1);
    setOtpSent(false);
    setOtpSentAt(null);
    setResendCooldown(0);
    setOtp('');
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setEmail('');
    setError('');
  }

  async function handleSendOtp() {
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await fetchApi('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setOtpSent(true);
      setOtpSentAt(Date.now());
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignupStep(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (step === 1) {
      if (!otpSent) {
        await handleSendOtp();
        return;
      }
      if (!otp || otp.length !== 6) {
        setError('Please enter the 6-digit verification code');
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!username.trim()) {
        setError('Please enter a username');
        return;
      }
      setStep(3);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!isLogin && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { token } = await fetchApi<{ token: string }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        setToken(token);
      } else {
        // Register returns a token (auto-login)
        const { token } = await fetchApi<{ token: string }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ username, password, email: email.trim(), otp }),
        });
        setToken(token);
      }
      router.push(routes.dashboard);
    } catch (err: unknown) {
      setError((err as Error).message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  // Shared input class
  const inputClass =
    'w-full bg-secondary/50 border border-white/10 rounded-xl py-2.5 px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:bg-primary/10 transition-all';
  const disabledInputClass = `${inputClass} opacity-50 cursor-not-allowed`;

  function handleBack() {
    setError('');
    setStep((s) => s - 1);
  }

  // Step indicator for signup
  const stepLabels = ['Verify Email', 'Choose Username', 'Set Password'];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
      <div className="sticky top-0 z-50">
        <Navbar />
      </div>

      <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative z-10 -mt-16">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 blur-[100px] rounded-full pointer-events-none"></div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {isLogin ? 'Welcome Back To Gitanic' : 'Join Gitanic'}
          </h2>
          {!isLogin && (
            <p className="mt-2 text-sm text-muted-foreground">
              Step {step} of 3 — {stepLabels[step - 1]}
            </p>
          )}
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
          <div className="glass rounded-2xl py-8 px-4 sm:px-10 shadow-2xl">
            <form
              className="space-y-6"
              onSubmit={isLogin ? handleSubmit : (step === 3 ? handleSubmit : handleSignupStep)}
            >
              {isLogin ? (
                /* ── Login form ──────────────────────────────────────── */
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="login-username">Username</label>
                    <input
                      id="login-username"
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="login-password">Password</label>
                    <input
                      id="login-password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </>
              ) : step === 1 ? (
                /* ── Signup Step 1: Email + OTP ──────────────────────── */
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="email">Email Address</label>
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      disabled={otpSent}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={otpSent ? disabledInputClass : inputClass}
                      placeholder="you@example.com"
                    />
                    {otpSent && (
                      <button
                        type="button"
                        onClick={() => { setOtpSent(false); setOtp(''); }}
                        className="text-xs text-primary hover:text-accent mt-1 transition-colors"
                      >
                        Change email
                      </button>
                    )}
                  </div>
                  {otpSent && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="otp">Verification Code</label>
                      <input
                        id="otp"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        autoComplete="one-time-code"
                        value={otp}
                        onChange={(e) => {
                          // Only allow digits
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setOtp(val);
                        }}
                        className={`${inputClass} text-center text-2xl tracking-[0.5em] font-mono`}
                        placeholder="000000"
                      />
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-muted-foreground">Check your email for the 6-digit code</p>
                        {resendCooldown > 0 ? (
                          <span className="text-xs text-muted-foreground">Resend in {resendCooldown}s</span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            disabled={loading}
                            className="text-xs text-primary hover:text-accent transition-colors disabled:opacity-50"
                          >
                            Resend code
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : step === 2 ? (
                /* ── Signup Step 2: Username ─────────────────────────── */
                <>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Email</label>
                    <input type="email" disabled value={email} className={disabledInputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="signup-username">Username</label>
                    <input
                      id="signup-username"
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={inputClass}
                      placeholder="cool-developer"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Letters, numbers, and hyphens only</p>
                  </div>
                </>
              ) : (
                /* ── Signup Step 3: Password ─────────────────────────── */
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="signup-password">Password</label>
                    <input
                      id="signup-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass}
                      placeholder="At least 8 characters"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="confirm-password">Confirm Password</label>
                    <input
                      id="confirm-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  {error}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3">
                {!isLogin && step > 1 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex items-center justify-center gap-1 px-4 py-3 rounded-xl border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition-all text-sm"
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 btn-primary py-3 flex justify-center items-center gap-2 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-background/20 border-t-background rounded-full animate-spin"></div>
                  ) : isLogin ? (
                    'Sign In'
                  ) : step === 1 ? (
                    otpSent ? 'Verify & Continue' : 'Send Verification Code'
                  ) : step === 2 ? (
                    'Continue'
                  ) : (
                    'Create Account'
                  )}
                </button>
              </div>
            </form>

            {/* Mode toggle */}
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {isLogin ? (
                <>
                  Don&apos;t have an account?{' '}
                  <Link
                    href={routes.signup}
                    onClick={resetForm}
                    className="text-primary hover:text-accent font-medium transition-colors"
                  >
                    Sign up
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <Link
                    href={routes.login}
                    onClick={resetForm}
                    className="text-primary hover:text-accent font-medium transition-colors"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
