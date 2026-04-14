// authentication and session entry point
// implements secure multi-step registration flow
// handles login and token persistence logic
// coordinates email-based otp verification
// provides responsive authentication interface
// manage form state and navigation triggers
import { useState } from 'react';
import { useRouter } from 'next/router';
import { fetchApi, setToken } from '@/lib/api';
import { routes } from '@/lib/routes';
import { useToast } from '@/contexts/toastContext';
import { Ship, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import { BGPattern } from '@/components/ui/bgPattern';


const INPUT_CLASS =
  'w-full h-11 bg-secondary/50 border border-white/10 rounded-xl px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:bg-primary/10 transition-all';
const DISABLED_INPUT_CLASS = `${INPUT_CLASS} opacity-50 cursor-not-allowed`;


interface LoginFieldsProps {
  readonly username: string;
  readonly password: string;
  readonly showPassword: boolean;
  readonly onUsername: (v: string) => void;
  readonly onPassword: (v: string) => void;
  readonly onTogglePassword: () => void;
}

function LoginFields({ username, password, showPassword, onUsername, onPassword, onTogglePassword }: Readonly<LoginFieldsProps>) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="login-username">Username</label>
        <input
          id="login-username"
          type="text"
          required
          autoComplete="username"
          value={username}
          onChange={(e) => onUsername(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="login-password">Password</label>
        <div className="relative">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            className={INPUT_CLASS}
            style={{ paddingRight: '3rem' }}
          />
          <button type="button" onClick={onTogglePassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
    </>
  );
}

interface SignupStep1Props {
  readonly email: string;
  readonly otp: string;
  readonly otpSent: boolean;
  readonly onEmail: (v: string) => void;
  readonly onOtp: (v: string) => void;
}

function SignupStep1({ email, otp, otpSent, onEmail, onOtp }: Readonly<SignupStep1Props>) {
  return (
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
          onChange={(e) => onEmail(e.target.value)}
          className={otpSent ? DISABLED_INPUT_CLASS : INPUT_CLASS}
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
          onChange={(e) => onOtp(e.target.value.replaceAll(/\D/g, '').slice(0, 6))}
          className={`${otpSent ? INPUT_CLASS : DISABLED_INPUT_CLASS} text-center text-xl tracking-[0.5em] font-mono`}
        />
      </div>
    </>
  );
}

interface SignupStep2Props {
  readonly email: string;
  readonly username: string;
  readonly onUsername: (v: string) => void;
}

function SignupStep2({ email, username, onUsername }: Readonly<SignupStep2Props>) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="email-readonly">Email Address</label>
        <input id="email-readonly" type="email" disabled value={email} className={DISABLED_INPUT_CLASS} />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="signup-username">Username</label>
        <input
          id="signup-username"
          type="text"
          required
          autoComplete="username"
          value={username}
          onChange={(e) => onUsername(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>
    </>
  );
}

interface SignupStep3Props {
  readonly password: string;
  readonly confirmPassword: string;
  readonly showPassword: boolean;
  readonly showConfirmPassword: boolean;
  readonly onPassword: (v: string) => void;
  readonly onConfirmPassword: (v: string) => void;
  readonly onTogglePassword: () => void;
  readonly onToggleConfirmPassword: () => void;
}

function SignupStep3({
  password, confirmPassword, showPassword, showConfirmPassword,
  onPassword, onConfirmPassword, onTogglePassword, onToggleConfirmPassword,
}: Readonly<SignupStep3Props>) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="signup-password">Password</label>
        <div className="relative">
          <input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            className={INPUT_CLASS}
            style={{ paddingRight: '3rem' }}
          />
          <button type="button" onClick={onTogglePassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="confirm-password">Confirm Password</label>
        <div className="relative">
          <input
            id="confirm-password"
            type={showConfirmPassword ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => onConfirmPassword(e.target.value)}
            className={INPUT_CLASS}
            style={{ paddingRight: '3rem' }}
          />
          <button type="button" onClick={onToggleConfirmPassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
    </>
  );
}

// resolve submit button label
function resolveSubmitLabel(loading: boolean, isLogin: boolean, step: number, otpSent: boolean): React.ReactNode {
  if (loading) return <Ship className="animate-bounce" size={24} />;
  if (isLogin) return 'Sign In';
  if (step === 1 && otpSent) return 'Next';
  if (step === 1) return 'Send OTP';
  if (step < 3) return 'Next';
  return 'Create Account';
}

// validate submission state
function isSubmitDisabled(loading: boolean, isLogin: boolean, step: number, otpSent: boolean, email: string, otp: string, username: string): boolean {
  if (loading) return true;
  if (isLogin) return false;
  if (step === 1 && !otpSent) return !email.trim();
  if (step === 1 && otpSent) return otp.length !== 6;
  if (step === 2) return !username.trim();
  return false;
}

// page component

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
      toast('Please Enter Your Email Address', 'error');
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
      toast((err as Error).message || 'Failed To Send OTP', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleNext(e: React.SyntheticEvent) {
    e.preventDefault();
    if (step === 1 && !otpSent) {
      await handleSendOtp();
      return;
    }
    if (step === 1) {
      if (otp.length !== 6) {
        toast('Please Enter The Recieved Verification Code', 'error');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!username.trim()) {
        toast('Please Enter Your Username', 'error');
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
      toast((err as Error).message || 'An Error Occurred', 'error');
    } finally {
      setLoading(false);
    }
  }

  function renderFormFields() {
    if (isLogin) {
      return (
        <LoginFields
          username={username} password={password} showPassword={showPassword}
          onUsername={setUsername} onPassword={setPassword} onTogglePassword={() => setShowPassword(p => !p)}
        />
      );
    }
    if (step === 1) {
      return <SignupStep1 email={email} otp={otp} otpSent={otpSent} onEmail={setEmail} onOtp={setOtp} />;
    }
    if (step === 2) {
      return <SignupStep2 email={email} username={username} onUsername={setUsername} />;
    }
    return (
      <SignupStep3
        password={password} confirmPassword={confirmPassword}
        showPassword={showPassword} showConfirmPassword={showConfirmPassword}
        onPassword={setPassword} onConfirmPassword={setConfirmPassword}
        onTogglePassword={() => setShowPassword(p => !p)}
        onToggleConfirmPassword={() => setShowConfirmPassword(p => !p)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-x-hidden">
      <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.05)" />

      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="mx-auto w-full max-w-md relative z-10 text-center mb-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 flex items-center justify-center drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] animate-pulse-slow">
              <Image
                src="/logo.png"
                alt="Gitanic"
                width={64}
                height={64}
                priority
                className="w-16 h-16 object-contain"
              />
            </div>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {isLogin ? 'Welcome Back To Gitanic' : 'Join Gitanic'}
          </h2>
        </div>

        <div className="mx-auto w-full max-w-md relative z-10">
          <div className="glass rounded-2xl py-8 px-5 sm:px-10 shadow-2xl">
            <form className="space-y-6" onSubmit={isLogin || step === 3 ? handleSubmit : handleNext}>
              {renderFormFields()}
              <button
                type="submit"
                disabled={isSubmitDisabled(loading, isLogin, step, otpSent, email, otp, username)}
                className="w-full btn-primary py-3 flex justify-center items-center gap-2 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resolveSubmitLabel(loading, isLogin, step, otpSent)}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
