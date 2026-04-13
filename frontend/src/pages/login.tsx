import { useState } from 'react';
import { useRouter } from 'next/router';
import { fetchApi, setToken } from '@/lib/api';
import { routes } from '@/lib/routes';
import { useToast } from '@/contexts/toast-context';
import { Ship, Eye, EyeOff } from 'lucide-react';
import { BGPattern } from '@/components/ui/bg-pattern';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const isLogin = router.query.mode !== 'signup';

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  async function handleSendOtp() {
    if (!email.trim()) {
      toast('Please enter an email address', 'error');
      return;
    }
    setLoading(true);
    try {
      await fetchApi('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setOtpSent(true);
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to send OTP', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleNext(e: React.SyntheticEvent) {
    e.preventDefault();

    if (step === 1) {
      if (!otpSent) {
        await handleSendOtp();
        return;
      }
      if (!otp || otp.length !== 6) {
        toast('Please enter the 6-digit verification code', 'error');
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!username.trim()) {
        toast('Please enter a username', 'error');
        return;
      }
      setStep(3);
    }
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();

    if (!isLogin && password !== confirmPassword) {
      toast('Passwords do not match', 'error');
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
      toast((err as Error).message || 'An error occurred', 'error');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full h-11 bg-secondary/50 border border-white/10 rounded-xl px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:bg-primary/10 transition-all';
  const disabledInputClass = `${inputClass} opacity-50 cursor-not-allowed`;

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-x-hidden pb-12 sm:pb-20">
      <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.05)" />

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
                        onChange={(e) => setOtp(e.target.value.replaceAll(/\D/g, '').slice(0, 6))}
                        className={`${!otpSent ? disabledInputClass : inputClass} text-center text-xl tracking-[0.5em] font-mono`}

                      />
                    </div>
                  </>
                ) : step === 2 ? (
                  /* ── Signup Step 2: Username ─────────────────────────── */
                  <>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="email-readonly">Email Address</label>
                      <input id="email-readonly" type="email" disabled value={email} className={disabledInputClass} />
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

                      />
                    </div>
                  </>
                ) : (
                  /* ── Signup Step 3: Password ─────────────────────────── */
                  <>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="signup-password">Password</label>
                      <div className="relative">
                        <input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          required
                          autoComplete="new-password"
                          minLength={8}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={inputClass}
                          style={{ paddingRight: "3rem" }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1" htmlFor="confirm-password">Confirm Password</label>
                      <div className="relative">
                        <input
                          id="confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          required
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className={inputClass}
                          style={{ paddingRight: "3rem" }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
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
                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputClass}
                        style={{ paddingRight: "3rem" }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {(() => {
                let submitLabel: React.ReactNode;
                if (loading) submitLabel = <Ship className="animate-bounce" size={24} />;
                else if (isLogin) submitLabel = 'Sign In';
                else if (step === 1 && otpSent) submitLabel = 'Next';
                else if (step === 1) submitLabel = 'Send OTP';
                else if (step < 3) submitLabel = 'Next';
                else submitLabel = 'Create Account';
                return (
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
                    {submitLabel}
                  </button>
                );
              })()}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
