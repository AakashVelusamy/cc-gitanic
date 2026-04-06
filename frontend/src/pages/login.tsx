import { useState } from 'react';
import { useRouter } from 'next/router';
import { fetchApi, setToken } from '@/lib/api';
import { routes } from '@/lib/routes';
import { Navbar } from '@/components/navbar';
import { Sailboat, ArrowRight, ShieldCheck, LogIn } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState(''); // Only used for signup
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isLogin = router.query.mode !== 'signup';

  const handleSendOtp = () => {
    if (!email) {
      setError('Please enter an email address');
      return;
    }
    setOtpSent(true);
    setError('');
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();

    if (step === 1) {
      if (!otpSent) {
        handleSendOtp();
        return;
      }

      if (!otp) {
        setError('Please enter the OTP');
        return;
      }

      setStep(2);
      setError('');
      return;
    }

    if (step === 2) {
      if (!username) {
        setError('Please enter a username');
        return;
      }
      setStep(3);
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
        router.push(routes.dashboard);
      } else {
        const { token } = await fetchApi<{ token: string }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ username, password, email }),
        });
        setToken(token);
        router.push(routes.dashboard);
      }
    } catch (err: unknown) {
      console.error(err);
      setError((err as Error).message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
      <div className="sticky top-0 z-50">
        <Navbar />
      </div>

      <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative z-10 -mt-16">
        {/* Background decorations */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 blur-[100px] rounded-full pointer-events-none"></div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {isLogin ? 'Welcome Back To Gitanic' : 'Join Gitanic'}
          </h2>
        </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="glass rounded-2xl py-8 px-4 sm:px-10 shadow-2xl">
          <form className="space-y-6" onSubmit={isLogin ? handleSubmit : (step === 3 ? handleSubmit : handleNext)}>
            {!isLogin ? (
              step === 1 ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="email">Email Address</label>
                    <div className="mt-1">
                      <input 
                        id="email" 
                        type="email" 
                        required 
                        disabled={otpSent}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-secondary/50 border border-white/10 rounded-xl py-2.5 px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:bg-primary/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="otp">OTP</label>
                    <div className="mt-1">
                      <input 
                        id="otp" 
                        type="text" 
                        required={otpSent}
                        disabled={!otpSent}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        className="w-full bg-secondary/50 border border-white/10 rounded-xl py-2.5 px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:bg-primary/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                </>
              ) : step === 2 ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="locked-email">Email Address</label>
                    <div className="mt-1">
                      <input 
                        id="locked-email" 
                        type="email" 
                        disabled
                        value={email}
                        className="w-full bg-secondary/50 border border-white/10 rounded-xl py-2.5 px-4 text-foreground opacity-50 cursor-not-allowed transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="username">Username</label>
                    <div className="mt-1">
                      <input 
                        id="username" 
                        type="text" 
                        required 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-secondary/50 border border-white/10 rounded-xl py-2.5 px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:bg-primary/10 transition-all"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="password">Password</label>
                    <div className="mt-1">
                      <input 
                        id="password" 
                        type="password" 
                        required 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-secondary/50 border border-white/10 rounded-xl py-2.5 px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:bg-primary/10 transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" htmlFor="confirm-password">Confirm Password</label>
                    <div className="mt-1">
                      <input 
                        id="confirm-password" 
                        type="password" 
                        required 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-secondary/50 border border-white/10 rounded-xl py-2.5 px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:bg-primary/10 transition-all"
                      />
                    </div>
                  </div>
                </>
              )
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" htmlFor="username">Username</label>
                  <div className="mt-1">
                    <input 
                      id="username" 
                      type="text" 
                      required 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-secondary/50 border border-white/10 rounded-xl py-2.5 px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:bg-primary/10 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" htmlFor="password">Password</label>
                  <div className="mt-1">
                    <input 
                      id="password" 
                      type="password" 
                      required 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-secondary/50 border border-white/10 rounded-xl py-2.5 px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:bg-primary/10 transition-all"
                    />
                  </div>
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
                (!isLogin &&
                  ((step === 1 && !otpSent && !email) ||
                   (step === 1 && otpSent && !otp) ||
                   (step === 2 && !username)))
              }
              className="w-full btn-primary py-3 flex justify-center items-center gap-2 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-background/20 border-t-background rounded-full animate-spin"></div>
              ) : isLogin ? (
                <>Sign In</>
              ) : step === 1 ? (
                otpSent ? <>Next</> : <>Send OTP</>
              ) : step < 3 ? (
                <>Next</>
              ) : (
                <>Create Account</>
              )}
            </button>
          </form>

          {/* Login/signup switching is handled by the navbar links */}
        </div>
      </div>
      </div>
    </div>
  );
}
