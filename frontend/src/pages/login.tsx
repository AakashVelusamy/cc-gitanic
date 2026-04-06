import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { fetchApi, setToken } from '@/lib/api';
import { routes } from '@/lib/routes';
import { Navbar } from '@/components/navbar';
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

  // 60s resend countdown, resets each time an OTP is sent
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

  async function handleNext(e: React.SyntheticEvent) {
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

  async function handleSubmit(e: React.SyntheticEvent) {
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

  const inputClass =
    'w-full h-11 bg-secondary/50 border border-white/10 rounded-xl px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:bg-primary/10 transition-all';
  const disabledInputClass = `${inputClass} opacity-50 cursor-not-allowed`;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
      <div className="sticky top-0 z-50">
        <Navbar />
      </div>

      <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative z-10 -mt-16">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 blur-[100px] rounded-full pointer-events-none"></div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {isLogin ? 'Welcome Back To Gitanic' : 'Join Gitanic'}
          </h2>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
          <div className="glass rounded-2xl py-8 px-4 sm:px-10 shadow-2xl">
            <form
              className="space-y-6"
              onSubmit={isLogin ? handleSubmit : (step === 3 ? handleSubmit : handleNext)}
            >
              {!isLogin ? (
                step === 1 ? (
                  /* ── Signup Step 1: Email + OTP ─────────────────────── */
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
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="otp">Verification Code</label>
                      <input
                        id="otp"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        autoComplete="one-time-code"
                        disabled={!otpSent}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className={`${!otpSent ? disabledInputClass : inputClass} text-center text-xl tracking-[0.5em] font-mono`}
                        placeholder="000000"
                      />
                    </div>
                  </>
                ) : step === 2 ? (
                  /* ── Signup Step 2: Username ─────────────────────────── */
                  <>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Email Address</label>
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
                )
              ) : (
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
              )}

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  loading ||
                  (!isLogin && (
                    (step === 1 && !otpSent && !email.trim()) ||
                    (step === 1 && otpSent && otp.length !== 6) ||
                    (step === 2 && !username.trim())
                  ))
                }
                className="w-full btn-primary py-3 flex justify-center items-center gap-2 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-background/20 border-t-background rounded-full animate-spin"></div>
                ) : isLogin ? (
                  'Sign In'
                ) : step === 1 ? (
                  otpSent ? 'Next' : 'Send OTP'
                ) : step < 3 ? (
                  'Next'
                ) : (
                  'Create Account'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
