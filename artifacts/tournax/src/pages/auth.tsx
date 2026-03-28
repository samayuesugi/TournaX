import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, ArrowLeft, Mail, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import { getToken, setToken } from "@/lib/auth";
import { setAuthTokenGetter } from "@workspace/api-client-react";

type Screen =
  | "auth"
  | "register-otp"
  | "forgot-email"
  | "forgot-otp"
  | "forgot-newpass";

export default function AuthPage() {
  const { login, setUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [screen, setScreen] = useState<Screen>("auth");
  const [activeTab, setActiveTab] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    referralCode: "",
  });

  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  const [forgotEmail, setForgotEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPasswordForm, setNewPasswordForm] = useState({ password: "", confirmPassword: "" });

  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      setRegisterForm((f) => ({ ...f, referralCode: ref }));
      setActiveTab("register");
    }
  }, []);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  function startResendCooldown() {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  function resetOtpDigits() {
    setOtpDigits(["", "", "", "", "", ""]);
    setTimeout(() => otpInputRef.current?.focus(), 50);
  }

  function handleSingleOtpInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtpDigits(Array(6).fill("").map((_, i) => val[i] ?? ""));
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (paste.length > 0) {
      setOtpDigits(Array(6).fill("").map((_, i) => paste[i] ?? ""));
    }
    e.preventDefault();
  }

  const currentOtp = otpDigits.join("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await login(loginForm.email, loginForm.password);
      const user = res.user;
      if (user.profileSetup === false) {
        navigate("/setup-profile");
      } else if (user.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/");
      }
    } catch (err: any) {
      toast({
        title: "Login failed",
        description: err?.data?.error || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendRegisterOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registerForm.password !== registerForm.confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are the same.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await customFetch("/api/auth/send-register-otp", {
        method: "POST",
        body: JSON.stringify({
          email: registerForm.email,
          password: registerForm.password,
          referralCode: registerForm.referralCode || undefined,
        }),
      });
      resetOtpDigits();
      startResendCooldown();
      setScreen("register-otp");
      toast({ title: "OTP Sent", description: `A 6-digit code has been sent to ${registerForm.email}` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to send OTP", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentOtp.length < 6) {
      toast({ title: "Enter all 6 digits", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await customFetch<{ user: any; token: string }>("/api/auth/verify-register", {
        method: "POST",
        body: JSON.stringify({ email: registerForm.email, otp: currentOtp }),
      });
      setToken(res.token);
      setAuthTokenGetter(getToken);
      setUser(res.user);
      navigate("/setup-profile");
    } catch (err: any) {
      toast({ title: "Verification failed", description: err?.data?.error || "Invalid OTP", variant: "destructive" });
      if (err?.data?.error?.includes("invalidated") || err?.data?.error?.includes("expired") || err?.data?.error?.includes("Too many")) {
        resetOtpDigits();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendRegisterOtp = async () => {
    if (resendCooldown > 0) return;
    setIsLoading(true);
    try {
      await customFetch("/api/auth/send-register-otp", {
        method: "POST",
        body: JSON.stringify({
          email: registerForm.email,
          password: registerForm.password,
          referralCode: registerForm.referralCode || undefined,
        }),
      });
      resetOtpDigits();
      startResendCooldown();
      toast({ title: "OTP Resent", description: "A new code has been sent to your email" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to resend OTP", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendForgotOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await customFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotEmail }),
      });
      resetOtpDigits();
      startResendCooldown();
      setScreen("forgot-otp");
      toast({ title: "OTP Sent", description: `If that email exists, a code has been sent to it` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to send OTP", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyForgotOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentOtp.length < 6) {
      toast({ title: "Enter all 6 digits", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await customFetch<{ resetToken: string }>("/api/auth/verify-reset-otp", {
        method: "POST",
        body: JSON.stringify({ email: forgotEmail, otp: currentOtp }),
      });
      setResetToken(res.resetToken);
      setNewPasswordForm({ password: "", confirmPassword: "" });
      setScreen("forgot-newpass");
    } catch (err: any) {
      toast({ title: "Verification failed", description: err?.data?.error || "Invalid OTP", variant: "destructive" });
      if (err?.data?.error?.includes("invalidated") || err?.data?.error?.includes("expired") || err?.data?.error?.includes("Too many")) {
        resetOtpDigits();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendForgotOtp = async () => {
    if (resendCooldown > 0) return;
    setIsLoading(true);
    try {
      await customFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotEmail }),
      });
      resetOtpDigits();
      startResendCooldown();
      toast({ title: "OTP Resent", description: "A new code has been sent to your email" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to resend OTP", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasswordForm.password !== newPasswordForm.confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await customFetch<{ user: any; token: string }>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ resetToken, newPassword: newPasswordForm.password }),
      });
      setToken(res.token);
      setAuthTokenGetter(getToken);
      setUser(res.user);
      toast({ title: "Password reset!", description: "You have been logged in." });
      const user = res.user;
      if (!user.profileSetup) navigate("/setup-profile");
      else if (user.role === "admin") navigate("/admin");
      else navigate("/");
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to reset password", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const Logo = () => (
    <div className="text-center mb-8">
      <div className="flex items-center justify-center mb-3">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="TournaX" className="w-20 h-20 object-contain" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">TournaX</h1>
      <p className="text-muted-foreground text-sm mt-1">Compete. Win. Dominate.</p>
    </div>
  );

  const filledCount = otpDigits.filter(Boolean).length;

  const OtpInputs = () => (
    <div
      className="relative flex gap-2 justify-center cursor-text"
      onClick={() => otpInputRef.current?.focus()}
      onPaste={handleOtpPaste}
    >
      <input
        ref={otpInputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        value={otpDigits.join("")}
        onChange={handleSingleOtpInput}
        onPaste={handleOtpPaste}
        autoComplete="one-time-code"
        maxLength={6}
        className="absolute opacity-0 pointer-events-none w-px h-px"
        aria-label="OTP input"
      />
      {otpDigits.map((digit, i) => (
        <div
          key={i}
          className={cn(
            "w-11 h-12 border-2 rounded-xl flex items-center justify-center text-xl font-bold select-none transition-all",
            digit
              ? "border-primary/70 bg-primary/5 text-foreground"
              : i === filledCount
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/30 text-transparent"
          )}
        >
          {digit || (i === filledCount ? <span className="w-0.5 h-5 bg-primary animate-pulse rounded-full" /> : "")}
        </div>
      ))}
    </div>
  );

  if (screen === "register-otp") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <Logo />
          <div className="bg-card border border-card-border rounded-2xl p-6 shadow-lg">
            <button
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
              onClick={() => { setScreen("auth"); setActiveTab("register"); }}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-lg font-bold">Verify your email</h2>
              <p className="text-sm text-muted-foreground mt-1">
                We sent a 6-digit code to<br />
                <span className="font-medium text-foreground">{registerForm.email}</span>
              </p>
            </div>
            <form onSubmit={handleVerifyRegister} className="space-y-5">
              <OtpInputs />
              <Button type="submit" className="w-full" disabled={isLoading || currentOtp.length < 6}>
                {isLoading ? "Verifying..." : "Verify & Create Account"}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                onClick={handleResendRegisterOtp}
                disabled={resendCooldown > 0 || isLoading}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "forgot-email") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <Logo />
          <div className="bg-card border border-card-border rounded-2xl p-6 shadow-lg">
            <button
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
              onClick={() => { setScreen("auth"); setActiveTab("login"); }}
            >
              <ArrowLeft className="w-4 h-4" /> Back to Sign In
            </button>
            <div className="text-center mb-6">
              <h2 className="text-lg font-bold">Forgot Password?</h2>
              <p className="text-sm text-muted-foreground mt-1">Enter your registered email and we'll send you a verification code.</p>
            </div>
            <form onSubmit={handleSendForgotOtp} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Sending OTP..." : "Send OTP"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "forgot-otp") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <Logo />
          <div className="bg-card border border-card-border rounded-2xl p-6 shadow-lg">
            <button
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
              onClick={() => { setScreen("forgot-email"); resetOtpDigits(); }}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-lg font-bold">Enter OTP</h2>
              <p className="text-sm text-muted-foreground mt-1">
                We sent a 6-digit code to<br />
                <span className="font-medium text-foreground">{forgotEmail}</span>
              </p>
            </div>
            <form onSubmit={handleVerifyForgotOtp} className="space-y-5">
              <OtpInputs />
              <Button type="submit" className="w-full" disabled={isLoading || currentOtp.length < 6}>
                {isLoading ? "Verifying..." : "Verify OTP"}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                onClick={handleResendForgotOtp}
                disabled={resendCooldown > 0 || isLoading}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "forgot-newpass") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <Logo />
          <div className="bg-card border border-card-border rounded-2xl p-6 shadow-lg">
            <div className="text-center mb-6">
              <h2 className="text-lg font-bold">Set New Password</h2>
              <p className="text-sm text-muted-foreground mt-1">Choose a strong password for your account.</p>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 6 characters"
                    value={newPasswordForm.password}
                    onChange={(e) => setNewPasswordForm((f) => ({ ...f, password: e.target.value }))}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-new-password">Confirm Password</Label>
                <Input
                  id="confirm-new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter new password"
                  value={newPasswordForm.confirmPassword}
                  onChange={(e) => setNewPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Updating..." : "Reset Password & Sign In"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Logo />
        <div className="bg-card border border-card-border rounded-2xl p-6 shadow-lg">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full mb-6">
              <TabsTrigger value="login" className="flex-1">Sign In</TabsTrigger>
              <TabsTrigger value="register" className="flex-1">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className="text-sm font-medium">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-sm font-medium">Password</Label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        setForgotEmail(loginForm.email);
                        setScreen("forgot-email");
                      }}
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleSendRegisterOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-email" className="text-sm font-medium">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Input
                      id="reg-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 6 characters"
                      autoComplete="new-password"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, password: e.target.value }))}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-confirm-password" className="text-sm font-medium">Confirm Password</Label>
                  <Input
                    id="reg-confirm-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    value={registerForm.confirmPassword}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-referral" className="text-sm font-medium">
                    Referral Code <span className="text-muted-foreground font-normal">(Optional)</span>
                  </Label>
                  <Input
                    id="reg-referral"
                    type="text"
                    placeholder="e.g. TournaX001"
                    value={registerForm.referralCode}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, referralCode: e.target.value }))}
                    autoCapitalize="characters"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Sending OTP..." : "Continue with OTP"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
