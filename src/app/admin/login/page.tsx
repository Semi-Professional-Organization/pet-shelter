"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  PawPrint,
  Lock,
  ArrowLeft,
  AlertCircle,
  ShieldCheck,
  UserPlus,
  LogIn,
  KeyRound,
  CheckCircle2,
  Eye,
  EyeOff,
  Clock,
} from "lucide-react";
import { enterAdminConsole, registerStaff, signInStaff } from "@/lib/client/adminAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLoginPage() {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form states
  const [loginData, setLoginData] = useState({ email: "", password: "" });

  const [regData, setRegData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    inviteCode: "",
  });

  // Countdown timer for rate limiting
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          setError(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signInStaff(loginData.email, loginData.password);
    if (result.success) {
      enterAdminConsole();
    } else {
      if (result.retryAfterSeconds) {
        setCountdown(result.retryAfterSeconds);
      }
      setError(result.error || "Invalid staff email or password.");
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (regData.password !== regData.confirmPassword) {
      setError("Passwords do not match. Please verify.");
      return;
    }
    if (regData.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    const result = await registerStaff({
      name: regData.name,
      email: regData.email,
      password: regData.password,
      staffInviteCode: regData.inviteCode,
    });

    if (result.success) {
      setSuccess("Account created successfully! Redirecting...");
      enterAdminConsole();
    } else {
      if (result.retryAfterSeconds) {
        setCountdown(result.retryAfterSeconds);
      }
      setError(result.error || "Registration failed. Please check your details.");
      setIsSubmitting(false);
    }
  };

  const handleQuickDemoLogin = async (email: string, pass: string) => {
    setLoginData({ email, password: pass });
    setError(null);
    setIsSubmitting(true);
    const result = await signInStaff(email, pass);
    if (result.success) {
      enterAdminConsole();
    } else {
      setError(result.error || "Quick demo login failed.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-card flex flex-col justify-center py-10 px-6 sm:px-8 lg:px-10">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="size-4" />
          Back to Public Shelter Site
        </Link>

        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex size-10 items-center justify-center bg-primary text-primary-foreground">
            <PawPrint className="size-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground leading-tight">
              Hope for Strays
            </h1>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Shelter Management & Staff Portal
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="border border-border bg-background shadow-xs">
          {/* Tab Selector */}
          <div className="grid grid-cols-2 border-b border-border text-xs font-bold uppercase tracking-wider">
            <button
              type="button"
              onClick={() => { setActiveTab("login"); setError(null); }}
              className={`py-3.5 flex items-center justify-center gap-2 transition-colors border-b-2 ${
                activeTab === "login"
                  ? "border-foreground text-foreground bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground bg-muted/40"
              }`}
            >
              <LogIn className="size-3.5" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("register"); setError(null); }}
              className={`py-3.5 flex items-center justify-center gap-2 transition-colors border-b-2 ${
                activeTab === "register"
                  ? "border-foreground text-foreground bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground bg-muted/40"
              }`}
            >
              <UserPlus className="size-3.5" />
              Create Account
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 p-3.5 text-xs text-destructive flex items-center gap-2">
                {countdown ? <Clock className="size-4 shrink-0 animate-spin" /> : <AlertCircle className="size-4 shrink-0" />}
                <span>
                  {error} {countdown && countdown > 0 ? `(${countdown}s remaining)` : null}
                </span>
              </div>
            )}

            {success && (
              <div className="bg-success-surface border border-success-accent/30 p-3.5 text-xs text-success-text flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {/* TAB 1: SIGN IN */}
            {activeTab === "login" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-bold text-foreground">Sign In to Staff Portal</h2>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Access shelter records, applications, and animal management.
                  </p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email" className="text-xs font-bold uppercase tracking-wider">
                      Staff Email
                    </Label>
                    <Input
                      id="login-email"
                      type="email"
                      required
                      value={loginData.email}
                      onChange={(e) => setLoginData((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="admin@hopeforstrays.org"
                      className="text-sm py-2.5"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="login-password" className="text-xs font-bold uppercase tracking-wider">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={loginData.password}
                        onChange={(e) => setLoginData((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="••••••••"
                        className="text-sm py-2.5 font-mono pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting || (countdown !== null && countdown > 0)}
                    className="w-full text-xs font-semibold uppercase tracking-wider py-2.5 mt-2"
                  >
                    <Lock className="size-3.5 mr-1.5" />
                    {isSubmitting ? "Authenticating..." : "Sign In to Portal"}
                  </Button>
                </form>

                {/* The offline demo only. Every one of these passwords is published in this
                    repository, and loginAction refuses them in production; see
                    src/lib/security/publishedPasswords.ts. Gated here so a production page
                    neither advertises them nor ships them in its bundle. */}
                {process.env.NODE_ENV !== "production" && (
                  <div className="border-t border-border pt-4 bg-muted/20 -mx-6 -mb-6 sm:-mx-8 sm:-mb-8 p-4 sm:p-6 space-y-2.5 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-foreground">
                      <ShieldCheck className="size-4 text-success-text " />
                      <span>1-Click Quick Demo Staff Sign In</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      {[
                        { role: "Super Admin", email: "admin@hopeforstrays.org", pass: "admin123" },
                        { role: "Volunteer Coord.", email: "coordinator@hopeforstrays.org", pass: "coord123" },
                        { role: "Animal Manager", email: "animals@hopeforstrays.org", pass: "animal123" },
                        { role: "Content Editor", email: "content@hopeforstrays.org", pass: "content123" },
                        { role: "Staff", email: "staff@hopeforstrays.org", pass: "staff123" },
                      ].map((demo) => (
                        <Button
                          key={demo.role}
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => handleQuickDemoLogin(demo.email, demo.pass)}
                          className="text-2xs font-semibold"
                        >
                          {demo.role}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: REGISTER */}
            {activeTab === "register" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-bold text-foreground">Create Staff / Volunteer Account</h2>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Register with scrypt encrypted authentication and direct role assignment.
                  </p>
                </div>

                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  <div className="space-y-1">
                    <Label htmlFor="reg-name" className="text-xs font-bold uppercase tracking-wider">
                      Full Name
                    </Label>
                    <Input
                      id="reg-name"
                      type="text"
                      required
                      value={regData.name}
                      onChange={(e) => setRegData((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Nurul Huda"
                      className="text-sm py-2"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="reg-email" className="text-xs font-bold uppercase tracking-wider">
                      Email Address
                    </Label>
                    <Input
                      id="reg-email"
                      type="email"
                      required
                      value={regData.email}
                      onChange={(e) => setRegData((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="nurul@hopeforstrays.org"
                      className="text-sm py-2"
                    />
                  </div>

                  <div className="space-y-1 bg-muted/40 border border-border p-2.5 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-foreground">
                      <KeyRound className="size-3.5" />
                      <span>Access Level: Shelter Staff</span>
                    </div>
                    <p className="text-2xs text-muted-foreground leading-relaxed">
                      Self-registration always creates a read-only Staff account. Animal
                      Manager, Content Editor, Volunteer Coordinator and Super Admin access
                      is granted only by invitation from a Super Admin under{" "}
                      <strong className="text-foreground">Staff &amp; Permissions</strong>.
                    </p>
                  </div>

                  {/* Every role now requires an invite code — the shelter has no anonymous-staff
                      use case, and STAFF can read applicant PII. Rendering this only for elevated
                      roles would leave STAFF/VOLUNTEER sign-up rejected with no field to fill. */}
                  <div className="space-y-1 bg-warning-surface border border-warning-accent/30 p-2.5 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-warning-text ">
                      <KeyRound className="size-3.5" />
                      <span>Staff Invite Code Required</span>
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      All shelter accounts require an invite code. Request one from a shelter
                      administrator — it is distributed out-of-band and is never shown here.
                    </p>
                    <Input
                      id="reg-invite-code"
                      type="password"
                      required
                      value={regData.inviteCode}
                      onChange={(e) => setRegData((prev) => ({ ...prev, inviteCode: e.target.value }))}
                      placeholder="Staff invite code"
                      className="text-xs py-1.5 bg-background font-mono mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label htmlFor="reg-password" className="text-xs font-bold uppercase tracking-wider">
                        Password (min 8)
                      </Label>
                      <Input
                        id="reg-password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={regData.password}
                        onChange={(e) => setRegData((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="••••••••"
                        className="text-sm py-2 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="reg-confirm-password" className="text-xs font-bold uppercase tracking-wider">
                        Confirm
                      </Label>
                      <Input
                        id="reg-confirm-password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={regData.confirmPassword}
                        onChange={(e) => setRegData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="••••••••"
                        className="text-sm py-2 font-mono"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting || (countdown !== null && countdown > 0)}
                    className="w-full text-xs font-semibold uppercase tracking-wider py-2.5 mt-3"
                  >
                    <UserPlus className="size-3.5 mr-1.5" />
                    {isSubmitting ? "Creating Account..." : "Create Account & Enter"}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
