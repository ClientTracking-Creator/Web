"use client";

import { auth } from "@/config/firebase";
import { useAuth } from "@/context/AuthContext";
import { useClients } from "@/context/ClientContext";
import { useAsyncLock } from "@/lib/guards";
import { AttendanceRecord, Client, FoodLibraryItem, GoalType, PaymentRecord, ProgressRecord, UserProfile } from "@/models/types";
import { checkPaymentStatus, generatePaymentQR, KHQRResponse } from "@/services/bakongService";
import { calculateBMI, calculateBMR, calculateEstimatedWeeks, getHealthyWeightRange } from "@/utils/bmrEngine";
import { uploadImageToCloudinary } from "@/utils/cloudinary";
import { downloadElementImage, downloadUrl, safeFileName, shareElementImage } from "@/utils/export";
import { getAccessStatus, TRIAL_DAYS } from "@/utils/accessStatus";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Dumbbell,
  Eye,
  EyeOff,
  FileText,
  ImageIcon,
  KeyRound,
  Languages,
  LineChart,
  Lock,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  Utensils,
  X,
} from "lucide-react";
import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { QRCodeSVG } from "qrcode.react";
import { FormEvent, ReactNode, RefObject, TouchEvent, WheelEvent as ReactWheelEvent, useEffect, useMemo, useRef, useState } from "react";

type View =
  | { name: "clients" }
  | { name: "add-client"; clientId?: string }
  | { name: "client-detail"; clientId: string }
  | { name: "record"; recordId: string }
  | { name: "meal"; clientId: string }
  | { name: "attendance"; clientId: string }
  | { name: "ingredients" }
  | { name: "add-ingredient"; ingredientId?: string }
  | { name: "finance" }
  | { name: "subscription" }
  | { name: "settings" }
  | { name: "admin" }
  | { name: "admin-users"; filter: AdminFilter; title: string };

type AdminFilter = "all" | "today" | "week" | "paid" | "trial" | "expired";

const cls = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");

const dateInput = (value?: string) => {
  if (!value) return new Date().toISOString().slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
};

const localDateToISOString = (value: string) => new Date(`${value}T12:00:00`).toISOString();

const formatDate = (value?: string, locale = "en-GB") => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
};

const Button = ({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "ghost" | "danger" | "subtle";
  disabled?: boolean;
  className?: string;
}) => (
  <button
    type={type}
    disabled={disabled}
    onClick={onClick}
    className={cls(
      "inline-flex min-h-11 max-w-full min-w-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-center text-sm font-bold leading-tight transition",
      variant === "primary" && "bg-[#ccff00] text-black hover:brightness-95",
      variant === "ghost" && "border border-[#3a3a3c] bg-transparent text-white hover:bg-[#2c2c2e]",
      variant === "danger" && "border border-[#ff453a] bg-transparent text-[#ff453a] hover:bg-[#ff453a]/10",
      variant === "subtle" && "bg-[#2c2c2e] text-white hover:bg-[#363638]",
      className
    )}
  >
    {children}
  </button>
);

const IconButton = ({ children, onClick, label, disabled }: { children: ReactNode; onClick?: () => void; label: string; disabled?: boolean }) => (
  <button
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#3a3a3c] bg-[#1e1e1e] text-white transition hover:bg-[#2c2c2e]"
  >
    {children}
  </button>
);

const Field = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={cls(
      "min-h-12 w-full min-w-0 rounded-lg border border-[#3a3a3c] bg-[#121212] px-4 text-white outline-none placeholder:text-[#a0a0a5] focus:border-[#ccff00]",
      props.className
    )}
  />
);

const TextArea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...props}
    className={cls(
      "min-h-24 w-full min-w-0 rounded-lg border border-[#3a3a3c] bg-[#121212] px-4 py-3 text-white outline-none placeholder:text-[#a0a0a5] focus:border-[#ccff00]",
      props.className
    )}
  />
);

const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <section className={cls("min-w-0 rounded-xl border border-[#3a3a3c] bg-[#1e1e1e] p-4", className)}>{children}</section>
);

function normalizeImageUrl(url?: string) {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.includes("res.cloudinary.com") && trimmed.includes("/image/upload/") && !trimmed.includes("/image/upload/f_auto")) {
    return trimmed.replace("/image/upload/", "/image/upload/f_auto,q_auto/");
  }
  return trimmed;
}

function isPersistentImageUrl(url?: string) {
  const normalized = normalizeImageUrl(url);
  return normalized.startsWith("https://") || normalized.startsWith("http://") || normalized.startsWith("data:image/");
}

function ImageWithFallback({
  src,
  alt,
  className,
  fallback,
  style,
}: {
  src?: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const finalSrc = normalizeImageUrl(src);
  if (!finalSrc || failed) {
    return <>{fallback || <div className={cls("grid place-items-center bg-[#2c2c2e] text-[#a0a0a5]", className)}><ImageIcon size={24} /></div>}</>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={finalSrc} alt={alt} className={className} style={style} crossOrigin="anonymous" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(true)} />;
}

function AppRoot() {
  const { user, loading } = useAuth();
  const { settingsLoaded } = useClients();
  const [view, setView] = useState<View>({ name: "clients" });

  useEffect(() => {
    const preventDefault = (event: Event) => event.preventDefault();
    const preventTouchZoom = (event: globalThis.TouchEvent) => {
      if ((event.target as Element | null)?.closest?.("[data-photo-gesture='true']")) return;
      if (event.touches.length > 1) event.preventDefault();
    };
    const preventWheelZoom = (event: globalThis.WheelEvent) => {
      if ((event.target as Element | null)?.closest?.("[data-photo-gesture='true']")) return;
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };

    document.addEventListener("gesturestart", preventDefault, { passive: false });
    document.addEventListener("gesturechange", preventDefault, { passive: false });
    document.addEventListener("gestureend", preventDefault, { passive: false });
    document.addEventListener("touchmove", preventTouchZoom, { passive: false });
    window.addEventListener("wheel", preventWheelZoom, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", preventDefault);
      document.removeEventListener("gesturechange", preventDefault);
      document.removeEventListener("gestureend", preventDefault);
      document.removeEventListener("touchmove", preventTouchZoom);
      window.removeEventListener("wheel", preventWheelZoom);
    };
  }, []);

  if (loading) return <CenterLoader labelKey="loadingAccount" />;
  if (!user) return <AuthScreens />;
  if (!settingsLoaded) return <CenterLoader labelKey="syncingData" />;

  return (
    <AccessGate>
      <MainShell view={view} setView={setView} />
    </AccessGate>
  );
}

function CenterLoader({ labelKey }: { labelKey: string }) {
  const { t } = useClients();
  return (
    <main className="grid min-h-screen place-items-center bg-[#121212] px-6">
      <div className="text-center">
        <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin text-[#ccff00]" />
        <p className="text-[#a0a0a5]">{t(labelKey)}</p>
      </div>
    </main>
  );
}

function AuthScreens() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  return (
    <main className="grid min-h-screen place-items-center bg-[#121212] px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[#3a3a3c] bg-[#1e1e1e] p-6 shadow-2xl">
        {mode === "login" && <LoginForm goSignup={() => setMode("signup")} goForgot={() => setMode("forgot")} />}
        {mode === "signup" && <SignupForm goLogin={() => setMode("login")} />}
        {mode === "forgot" && <ForgotForm goLogin={() => setMode("login")} />}
      </div>
    </main>
  );
}

function LoginForm({ goSignup, goForgot }: { goSignup: () => void; goForgot: () => void }) {
  const { t } = useClients();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const { busy, run } = useAsyncLock();

  useEffect(() => {
    setEmail(localStorage.getItem("remembered_login_email") || "");
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      setError("");
      if (!email || !password) throw new Error(t("pleaseFillAll"));
      const cleanEmail = email.trim();
      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      if (remember) localStorage.setItem("remembered_login_email", cleanEmail);
      else localStorage.removeItem("remembered_login_email");
      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user).catch(() => undefined);
        setError(t("emailUnverified"));
      }
    }).catch((err) => setError(err.message));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-center text-3xl font-black text-[#ccff00]">{t("welcomeBack")}</h1>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Field value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} type="email" autoCapitalize="none" />
      <div className="relative">
        <Field value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("passwordPlaceholder")} type={showPassword ? "text" : "password"} className="pr-12" />
        <button type="button" className="absolute right-3 top-3 text-[#a0a0a5]" onClick={() => setShowPassword((v) => !v)}>
          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2 text-[#a0a0a5]">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t("rememberEmail")}
        </label>
        <button type="button" onClick={goForgot} className="font-bold text-[#ccff00]">{t("forgotPassword")}</button>
      </div>
      <Button type="submit" disabled={busy} className="w-full">{busy ? t("loggingIn") : t("logIn")}</Button>
      <button type="button" onClick={goSignup} className="w-full pt-2 text-sm text-[#a0a0a5]">{t("dontHaveAccount")}</button>
    </form>
  );
}

function SignupForm({ goLogin }: { goLogin: () => void }) {
  const { t } = useClients();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { busy, run } = useAsyncLock();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      setError("");
      if (!email || !password || !confirm) throw new Error(t("pleaseFillAll"));
      if (password !== confirm) throw new Error(t("passwordMismatch"));
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await sendEmailVerification(credential.user);
      setNotice(t("verificationEmailSent"));
    }).catch((err) => setError(err.message));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-center text-3xl font-black text-[#ccff00]">{t("createAccount")}</h1>
      {notice && <SuccessBox>{notice}</SuccessBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      <Field value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} type="email" />
      <Field value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("passwordPlaceholder")} type="password" />
      <Field value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t("confirmPasswordPlaceholder")} type="password" />
      <Button type="submit" disabled={busy} className="w-full">{busy ? t("creating") : t("signUp")}</Button>
      <button type="button" onClick={goLogin} className="w-full pt-2 text-sm text-[#a0a0a5]">{t("alreadyHaveAccount")}</button>
    </form>
  );
}

function ForgotForm({ goLogin }: { goLogin: () => void }) {
  const { t } = useClients();
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { busy, run } = useAsyncLock();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      setError("");
      if (!email) throw new Error(t("pleaseFillAll"));
      await sendPasswordResetEmail(auth, email.trim());
      setNotice(t("resetEmailSent"));
    }).catch((err) => setError(err.message));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <button type="button" onClick={goLogin} className="mb-2 inline-flex items-center gap-2 text-[#a0a0a5]"><ArrowLeft size={18} /> {t("back")}</button>
      <h1 className="text-center text-3xl font-black text-[#ccff00]">{t("resetPassword")}</h1>
      {notice && <SuccessBox>{notice}</SuccessBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      <Field value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} type="email" />
      <Button type="submit" disabled={busy} className="w-full">{busy ? t("sending") : t("sendResetLink")}</Button>
    </form>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-[#ff453a] bg-[#ff453a]/10 p-3 text-sm text-[#ffb4ae]">{children}</div>;
}

function SuccessBox({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-[#4CAF50] bg-[#4CAF50]/10 p-3 text-sm text-[#b9f6ca]">{children}</div>;
}

function AccessGate({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { settings, settingsLoaded, userProfile, isAdmin, updateSettings, t } = useClients();
  const { busy, run } = useAsyncLock();

  useEffect(() => {
    if (!user?.emailVerified || !settingsLoaded || settings.trialStartedAt) return;
    updateSettings({ ...settings, trialStartedAt: new Date().toISOString() });
  }, [user?.emailVerified, settingsLoaded, settings.trialStartedAt]);

  if (!user?.emailVerified) {
    return (
      <BlockScreen icon={<Lock size={70} />} title={t("verifyEmailTitle")} message={t("verifyEmailMessage")}>
        <Button disabled={busy} onClick={() => run(async () => auth.currentUser && reload(auth.currentUser))}>{busy ? t("checkingPayment") : t("iHaveVerified")}</Button>
        <Button variant="ghost" onClick={logout}><LogOut size={18} /> {t("logout")}</Button>
      </BlockScreen>
    );
  }

  if (userProfile?.blocked) {
    return (
      <BlockScreen icon={<AlertCircle size={70} />} title={t("accountBlockedTitle")} message={t("accountBlockedMessage")}>
        <Button variant="ghost" onClick={logout}><LogOut size={18} /> {t("logout")}</Button>
      </BlockScreen>
    );
  }

  const access = getAccessStatus(settings);
  if (!access.active && !isAdmin) {
    return <SubscriptionStandalone />;
  }

  return <>{children}</>;
}

function BlockScreen({ icon, title, message, children }: { icon: ReactNode; title: string; message: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#121212] px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-8 grid h-36 w-36 place-items-center rounded-full border-2 border-[#ccff00] bg-[#1e1e1e] text-[#ccff00]">{icon}</div>
        <h1 className="mb-3 text-3xl font-black">{title}</h1>
        <p className="mb-8 text-[#a0a0a5]">{message}</p>
        <div className="grid gap-3">{children}</div>
      </div>
    </main>
  );
}

function MainShell({ view, setView }: { view: View; setView: (view: View) => void }) {
  const { isAdmin, settings, t } = useClients();
  const allTabs = [
    { name: "clients", label: t("tabClients"), icon: <Users size={21} />, view: { name: "clients" } },
    { name: "ingredients", label: t("tabIngredients"), icon: <Utensils size={21} />, view: { name: "ingredients" } },
    { name: "finance", label: t("tabFinance"), icon: <CircleDollarSign size={21} />, view: { name: "finance" } },
    { name: "subscription", label: t("subscription"), icon: <KeyRound size={21} />, view: { name: "subscription" } },
    { name: "admin", label: t("admin"), icon: <ShieldCheck size={21} />, view: { name: "admin" }, admin: true },
    { name: "settings", label: t("tabSettings"), icon: <Settings size={21} />, view: { name: "settings" } },
  ] satisfies Array<{ name: View["name"]; label: string; icon: ReactNode; view: View; admin?: boolean }>;
  const tabs = allTabs.filter((tab) => !tab.admin || isAdmin);

  return (
    <main className="min-h-screen bg-[#121212] text-white lg:flex" data-language={settings.language}>
      <aside className="hidden w-64 shrink-0 border-r border-[#3a3a3c] bg-[#1e1e1e] p-4 lg:block">
        <h1 className="mb-8 text-2xl font-black text-[#ccff00]">ClientTracking</h1>
        <nav className="grid gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setView(tab.view)}
              className={cls("flex items-center gap-3 rounded-lg px-3 py-3 text-left font-bold text-[#a0a0a5]", view.name === tab.name && "bg-[#ccff00] text-black")}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="mx-auto min-h-screen w-full max-w-6xl safe-bottom lg:pb-8">
        {renderView(view, setView)}
      </section>
      <nav className="mobile-tabbar fixed inset-x-0 bottom-0 z-50 flex border-t border-[#3a3a3c] bg-[#1e1e1e]/95 px-1.5 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setView(tab.view)}
            className={cls("flex min-h-[68px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-bold text-[#a0a0a5]", view.name === tab.name && "text-[#ccff00]")}
          >
            {tab.icon}
            <span className="bottom-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}

function renderView(view: View, setView: (view: View) => void) {
  switch (view.name) {
    case "clients": return <ClientsScreen setView={setView} />;
    case "add-client": return <AddClientScreen setView={setView} clientId={view.clientId} />;
    case "client-detail": return <ClientDetailScreen setView={setView} clientId={view.clientId} />;
    case "record": return <RecordScreen setView={setView} recordId={view.recordId} />;
    case "meal": return <MealPlanScreen setView={setView} clientId={view.clientId} />;
    case "attendance": return <AttendanceScreen setView={setView} clientId={view.clientId} />;
    case "ingredients": return <IngredientsScreen setView={setView} />;
    case "add-ingredient": return <AddIngredientScreen setView={setView} ingredientId={view.ingredientId} />;
    case "finance": return <FinanceScreen />;
    case "subscription": return <SubscriptionScreen />;
    case "settings": return <SettingsScreen />;
    case "admin": return <AdminScreen setView={setView} />;
    case "admin-users": return <AdminUsersScreen setView={setView} filter={view.filter} title={view.title} />;
  }
}

function Header({ title, back, right }: { title: string; back?: () => void; right?: ReactNode }) {
  const { t } = useClients();
  return (
    <header className="sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-[#121212]/95 px-5 py-5 pt-8 backdrop-blur lg:static lg:px-8">
      <div className="flex min-w-0 items-center gap-3 overflow-hidden">
        {back && <IconButton label={t("back")} onClick={back}><ArrowLeft size={20} /></IconButton>}
        <h1 className="break-anywhere min-w-0 text-xl font-black leading-tight sm:text-2xl lg:text-4xl">{title}</h1>
      </div>
      {right && <div className="flex min-w-0 shrink-0 justify-end overflow-hidden">{right}</div>}
    </header>
  );
}

function ClientsScreen({ setView }: { setView: (view: View) => void }) {
  const { clients, t } = useClients();
  const [search, setSearch] = useState("");
  const filtered = clients.filter((client) => client.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <Header title={t("dashboardTitle")} />
      <div className="space-y-4 px-5 lg:px-8">
        <div className="relative">
          <Search className="absolute left-4 top-3.5 text-[#a0a0a5]" size={20} />
          <Field value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchClients")} className="pl-12" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((client) => (
            <button key={client.id} onClick={() => setView({ name: "client-detail", clientId: client.id })} className="flex items-center gap-4 rounded-xl border border-[#3a3a3c] bg-[#1e1e1e] p-4 text-left">
              <Avatar src={client.imageUri} name={client.name} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-black">{client.name}</h2>
                <p className="text-sm text-[#a0a0a5]">{t("goal")}: {goalLabel(client.goal, t)}</p>
                <p className="text-xs text-[#a0a0a5]">{t("lastSync")}: {t("justNow")}</p>
                <div className="mt-2 flex gap-3 text-[#ccff00]"><LineChart size={16} /><Dumbbell size={16} /></div>
              </div>
            </button>
          ))}
        </div>
        {!filtered.length && <p className="py-10 text-center text-[#a0a0a5]">{t("noClients")}</p>}
      </div>
      <button
        className="fixed bottom-24 right-5 z-40 grid h-16 w-16 place-items-center rounded-full bg-[#ccff00] text-black shadow-2xl lg:bottom-8"
        onClick={() => setView({ name: "add-client" })}
        aria-label="Add client"
      >
        <Plus size={30} />
      </button>
    </>
  );
}

function Avatar({ src, name, size = "md" }: { src?: string; name: string; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-24 w-24 text-2xl" : "h-16 w-16 text-lg";
  return src ? (
    <ImageWithFallback src={src} alt={name} className={cls(dim, "shrink-0 rounded-full border-2 border-[#ccff00] object-cover")} fallback={<div className={cls(dim, "grid shrink-0 place-items-center rounded-full border-2 border-[#ccff00] bg-[#2c2c2e] font-black text-[#a0a0a5]")}>{name.slice(0, 1).toUpperCase() || "?"}</div>} />
  ) : (
    <div className={cls(dim, "grid shrink-0 place-items-center rounded-full border-2 border-[#ccff00] bg-[#2c2c2e] font-black text-[#a0a0a5]")}>{name.slice(0, 1).toUpperCase() || "?"}</div>
  );
}

function goalLabel(goal: GoalType, t: (key: string) => string) {
  if (goal === "Lose Weight") return t("loseWeight");
  if (goal === "Maintain Weight") return t("maintainWeight");
  if (goal === "Gain Muscle") return t("gainMuscle");
  return t("gainWeight");
}

function AddClientScreen({ setView, clientId }: { setView: (view: View) => void; clientId?: string }) {
  const { clients, addClient, editClient, addRecord, t } = useClients();
  const { user } = useAuth();
  const existing = clients.find((client) => client.id === clientId);
  const [form, setForm] = useState({
    name: existing?.name || "",
    phone: existing?.phone || "",
    email: existing?.email || "",
    age: existing?.age?.toString() || "",
    gender: existing?.gender || "Male",
    height: existing?.heightCM?.toString() || "",
    goal: existing?.goal || "Lose Weight",
    currentWeight: "",
    targetWeight: existing?.targetWeightKG?.toString() || "",
  });
  const [imageUri, setImageUri] = useState(existing?.imageUri || "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const { busy, run } = useAsyncLock();

  const save = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      if (!user || !form.name || !form.height) throw new Error("Name and height are required.");
      let finalImage = imageUri;
      if (file) finalImage = await uploadImageToCloudinary(file, user.uid, "avatars");
      const id = clientId || Date.now().toString();
      const client: Client = {
        id,
        name: form.name,
        phone: form.phone,
        email: form.email,
        age: Number.parseInt(form.age) || 0,
        gender: form.gender as "Male" | "Female",
        heightCM: Number.parseInt(form.height) || 0,
        goal: form.goal as GoalType,
        imageUri: finalImage || undefined,
        targetWeightKG: Number.parseFloat(form.targetWeight) || undefined,
      };
      if (clientId) await editClient(client);
      else {
        await addClient(client);
        const currentWeight = Number.parseFloat(form.currentWeight);
        if (currentWeight) {
          await addRecord({
            id: `${Date.now()}_rec`,
            clientId: id,
            date: new Date().toISOString(),
            currentWeightKG: currentWeight,
            bmi: calculateBMI(currentWeight, client.heightCM),
            notes: "Initial weight",
            photoUris: [],
          });
        }
      }
      setView(clientId ? { name: "client-detail", clientId } : { name: "clients" });
    }).catch((err) => setError(err.message));
  };

  return (
    <>
      <Header title={clientId ? t("saveEdits") : t("addClientTitle")} back={() => setView(clientId ? { name: "client-detail", clientId } : { name: "clients" })} />
      <form onSubmit={save} className="mx-auto max-w-2xl space-y-5 px-5 lg:px-8">
        {error && <ErrorBox>{error}</ErrorBox>}
        <ImagePickerCircle imageUri={imageUri} setImageUri={setImageUri} setFile={setFile} />
        <Label text={t("clientName")}><Field value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("namePlaceholder")} /></Label>
        <Segmented label={t("currentObjective")} value={form.goal} options={["Lose Weight", "Maintain Weight", "Gain Muscle", "Gain Weight"]} map={(v) => goalLabel(v as GoalType, t)} onChange={(goal) => setForm({ ...form, goal: goal as GoalType })} />
        <div className="grid grid-cols-2 gap-4">
          <Label text={t("age")}><Field type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder={t("agePlaceholder")} /></Label>
          <Label text={t("height")}><Field type="number" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} placeholder={t("heightPlaceholder")} /></Label>
        </div>
        <Segmented label={t("gender")} value={form.gender} options={["Male", "Female"]} map={(v) => v === "Male" ? t("male") : t("female")} onChange={(gender) => setForm({ ...form, gender: gender as "Male" | "Female" })} />
        {!clientId && <Label text={t("currentWeight")}><Field type="number" value={form.currentWeight} onChange={(e) => setForm({ ...form, currentWeight: e.target.value })} placeholder={t("currentWeight")} /></Label>}
        <Label text={t("manualTargetWeight")}><Field type="number" value={form.targetWeight} onChange={(e) => setForm({ ...form, targetWeight: e.target.value })} placeholder={t("autoCalculatePlaceholder")} /></Label>
        <Label text={t("phone")}><Field value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t("phonePlaceholder")} /></Label>
        <Label text={t("email")}><Field type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t("emailExamplePlaceholder")} /></Label>
        <Button type="submit" disabled={busy} className="w-full"><Check size={18} /> {busy ? t("saving") : clientId ? t("saveEdits") : t("saveClient")}</Button>
      </form>
    </>
  );
}

function Label({ text, children }: { text: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-2 text-sm font-bold text-white"><span className="break-anywhere block leading-tight">{text}</span>{children}</label>;
}

function categoryLabel(category: string, t: (key: string) => string) {
  if (category === "All") return t("all");
  if (category === "Protein") return t("protein");
  if (category === "Carbs") return t("carbs");
  if (category === "Fats") return t("fats");
  if (category === "Veggies") return t("veggies");
  if (category === "Fruits") return t("fruits");
  return category;
}

function mealLabel(meal: string, t: (key: string) => string) {
  if (meal === "Breakfast") return t("breakfast");
  if (meal === "Lunch") return t("lunch");
  if (meal === "Dinner") return t("dinner");
  return t("snacks");
}

function Segmented({ label, value, options, map, onChange }: { label: string; value: string; options: string[]; map?: (value: string) => string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button type="button" key={option} onClick={() => onChange(option)} className={cls("break-anywhere min-h-12 rounded-lg border border-[#3a3a3c] bg-[#1e1e1e] px-3 py-3 text-center text-sm font-bold leading-tight", value === option && "border-[#ccff00] bg-[#ccff00] text-black")}>
            {map ? map(option) : option}
          </button>
        ))}
      </div>
    </div>
  );
}

function ImagePickerCircle({ imageUri, setImageUri, setFile }: { imageUri: string; setImageUri: (value: string) => void; setFile: (file: File | null) => void }) {
  return (
    <div className="flex justify-center">
      <label className="relative grid h-28 w-28 cursor-pointer place-items-center rounded-full border-2 border-[#ccff00] bg-[#1e1e1e]">
        {imageUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUri} alt="" className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <Camera className="text-[#a0a0a5]" size={44} />
        )}
        <span className="absolute bottom-1 right-1 rounded-full bg-[#2c2c2e] p-2"><Upload size={15} /></span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const selected = e.target.files?.[0] || null;
            setFile(selected);
            if (selected) setImageUri(URL.createObjectURL(selected));
          }}
        />
      </label>
    </div>
  );
}

function ClientDetailScreen({ setView, clientId }: { setView: (view: View) => void; clientId: string }) {
  const {
    clients, records, attendance, payments, settings, t, deleteClient, editClient,
  } = useClients();
  const { user } = useAuth();
  const client = clients.find((c) => c.id === clientId);
  const history = useMemo(() => records.filter((r) => r.clientId === clientId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [records, clientId]);
  const reportRef = useRef<HTMLDivElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [beforePhotoIdx, setBeforePhotoIdx] = useState(0);
  const [afterPhotoIdx, setAfterPhotoIdx] = useState(0);
  const [beforeZoom, setBeforeZoom] = useState(1);
  const [afterZoom, setAfterZoom] = useState(1);
  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
  const initializedMonthsRef = useRef(false);
  const comparisonRef = useRef<HTMLDivElement>(null);
  const { busy: deleteBusy, run: deleteRun } = useAsyncLock();

  const beforeRecord = selectedCompareIds[0] ? history.find((r) => r.id === selectedCompareIds[0]) : null;
  const afterRecord = selectedCompareIds[1] ? history.find((r) => r.id === selectedCompareIds[1]) : null;
  const groupedHistory = useMemo(() => {
    const groups: Record<string, { label: string; records: ProgressRecord[] }> = {};
    history.forEach((record) => {
      const date = new Date(record.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      groups[key] ||= {
        label: date.toLocaleDateString(settings.language === "km" ? "km-KH" : "en-GB", { month: "long", year: "numeric" }),
        records: [],
      };
      groups[key].records.push(record);
    });
    return groups;
  }, [history, settings.language]);
  const monthKeys = Object.keys(groupedHistory);

  useEffect(() => {
    if (monthKeys.length && !initializedMonthsRef.current) {
      setExpandedMonths([monthKeys[0]]);
      initializedMonthsRef.current = true;
    }
    if (!monthKeys.length) {
      initializedMonthsRef.current = false;
      setExpandedMonths([]);
    }
  }, [monthKeys]);

  useEffect(() => {
    if (!compareOpen) return;
    const preventGesture = (event: Event) => event.preventDefault();
    const preventScreenPinch = (event: globalThis.TouchEvent) => {
      if ((event.target as Element | null)?.closest?.("[data-photo-gesture='true']")) return;
      if (event.touches.length > 1) event.preventDefault();
    };

    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("gestureend", preventGesture, { passive: false });
    document.addEventListener("touchmove", preventScreenPinch, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("gestureend", preventGesture);
      document.removeEventListener("touchmove", preventScreenPinch);
    };
  }, [compareOpen]);

  const startCompareMode = () => {
    if (history.length < 2) {
      alert(t("noDataForChart"));
      return;
    }
    setCompareMode(true);
    setSelectedCompareIds([]);
    setBeforePhotoIdx(0);
    setAfterPhotoIdx(0);
    setBeforeZoom(1);
    setAfterZoom(1);
  };
  const toggleCompareRecord = (record: ProgressRecord) => {
    if (!record.photoUris?.length) return;
    setSelectedCompareIds((prev) => {
      if (prev.includes(record.id)) return prev.filter((id) => id !== record.id);
      const next = [...prev, record.id].slice(0, 2);
      if (next.length === 2) {
        window.setTimeout(() => setCompareOpen(true), 0);
      }
      return next;
    });
  };

  if (!client) return <NotFound title={t("clientNotFound")} back={() => setView({ name: "clients" })} />;

  const latest = history[0];
  const { min, max } = getHealthyWeightRange(client.heightCM);
  const targetWeight = client.targetWeightKG || (client.goal === "Maintain Weight" && latest ? latest.currentWeightKG : client.goal === "Gain Muscle" ? Math.round(max) : client.goal === "Gain Weight" ? Math.round(max + 5) : Math.round((min + max) / 2));
  const calorieDelta = client.customCalorieModifier ?? (client.goal === "Gain Weight" ? settings.gainWeightCals : client.goal === "Gain Muscle" ? settings.gainMuscleCals : client.goal === "Lose Weight" ? settings.loseWeightCals : 0);
  const estimatedWeeks = latest ? calculateEstimatedWeeks(latest.currentWeightKG, targetWeight, calorieDelta) : "N/A";
  const attendedCount = attendance.filter((a) => a.clientId === client.id && a.attended).length;
  const clientPayments = payments.filter((p) => p.clientId === client.id);
  const gymLogo = isPersistentImageUrl(settings.gymLogo) ? settings.gymLogo : "";
  const dateLocale = settings.language === "km" ? "km-KH" : "en-GB";
  const generatedDate = new Date().toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });
  const oldestWeight = history.length > 0 ? history[history.length - 1].currentWeightKG : null;
  const weightChange = latest && oldestWeight !== null ? Number((latest.currentWeightKG - oldestWeight).toFixed(1)) : null;
  const weightChangeText = weightChange === null ? t("notAvailable") : `${weightChange > 0 ? "+" : ""}${weightChange} kg`;
  const estimatedWeeksDisplay = estimatedWeeks === "∞" ? t("maintainingStatus") : estimatedWeeks === 0 ? t("goalReached") : estimatedWeeks === "N/A" ? t("notAvailable") : `${estimatedWeeks} ${t("weeks")}`;
  const displayGoal = goalLabel(client.goal, t);

  return (
    <>
      <Header
        title={t("clientDetailsTitle")}
        back={() => setView({ name: "clients" })}
        right={<div className="flex max-w-full flex-wrap justify-end gap-2">
          <IconButton label={t("paymentTitle")} onClick={() => setPaymentOpen(true)}><CircleDollarSign size={20} className="text-[#ccff00]" /></IconButton>
          <IconButton label={t("progressReportTitle")} onClick={() => setReportOpen(true)}><FileText size={20} className="text-[#ccff00]" /></IconButton>
          <IconButton label={t("config")} onClick={() => setConfigOpen(true)}><Settings size={20} /></IconButton>
          <IconButton label={t("edit")} onClick={() => setView({ name: "add-client", clientId })}><Pencil size={20} /></IconButton>
        </div>}
      />
      <div className="space-y-6 px-5 lg:px-8">
        <div className="flex items-center gap-4 px-1">
          <Avatar src={client.imageUri} name={client.name} size="lg" />
          <div className="min-w-0">
            <h2 className="break-anywhere text-2xl font-black leading-tight">{client.name}</h2>
            <p className="break-anywhere text-sm text-[#a0a0a5]">{t("goal")}: {displayGoal}</p>
            <p className="break-anywhere text-sm text-[#a0a0a5]">{t("age")}: {client.age} | {client.gender === "Male" ? t("male") : t("female")}</p>
            <p className="break-anywhere text-sm text-[#a0a0a5]">{t("height")}: {client.heightCM} cm</p>
          </div>
        </div>

        <Card className="space-y-1">
          <p className="break-anywhere text-[15px] text-[#a0a0a5]">{t("latestWeight")}: <span className="text-white">{latest ? `${latest.currentWeightKG} kg` : t("notAvailable")}</span></p>
          <p className="break-anywhere text-[15px] text-[#a0a0a5]">{t("bmi")}: <span className="text-white">{latest ? calculateBMI(latest.currentWeightKG, client.heightCM) : t("notAvailable")}</span></p>
          <p className="break-anywhere text-[15px] text-[#a0a0a5]">{t("targetWeight")}: <span className="text-white">{targetWeight} kg</span></p>
          <p className="break-anywhere text-[15px] text-[#a0a0a5]">{t("standardWeight")}: <span className="text-white">{min} - {max} kg</span></p>
          <p className="break-anywhere text-[15px] text-[#a0a0a5]">{t("estimatedTime")}: <span className="font-bold text-[#ccff00]">{estimatedWeeksDisplay}</span></p>
        </Card>

        <button onClick={() => setView({ name: "attendance", clientId })} className="flex w-full items-center justify-between rounded-xl border border-[#3a3a3c] bg-[#1e1e1e] p-4 text-left">
          <div className="flex min-w-0 items-center gap-3">
            <CalendarDays className="shrink-0 text-[#ccff00]" size={24} />
            <div>
              <p className="font-black">{t("attendanceTitle")}</p>
              <p className="text-xs text-[#a0a0a5]">{attendedCount} {t("sessions")}</p>
            </div>
          </div>
          <ChevronRight className="shrink-0 text-[#a0a0a5]" size={24} />
        </button>

        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <h3 className="text-lg font-black">{t("progressHistory")}</h3>
          <div className="flex gap-3">
            <button className={cls("text-sm font-bold", compareMode ? "text-[#ff453a]" : "text-[#ccff00]")} onClick={() => compareMode ? (setCompareMode(false), setSelectedCompareIds([])) : startCompareMode()}>
              {compareMode ? t("cancel") : t("comparePhotos")}
            </button>
            {!compareMode && <button className="text-sm font-bold text-[#ccff00]" onClick={() => setAddOpen(true)}>{t("addWeight")}</button>}
          </div>
        </div>

        <Card className="p-2">
          {compareMode && <p className="mb-3 text-center text-sm font-bold text-[#ccff00]">{selectedCompareIds.length === 0 ? t("selectBeforePhoto") : t("selectAfterPhoto")}</p>}
          <div className="grid gap-1">
            {!history.length && <p className="py-5 text-center text-[#a0a0a5]">{t("noRecords")}</p>}
            {monthKeys.map((monthKey) => {
              const isExpanded = expandedMonths.includes(monthKey);
              const group = groupedHistory[monthKey];
              return (
                <div key={monthKey} className="mb-1">
                  <button
                    type="button"
                    onClick={() => setExpandedMonths((prev) => prev.includes(monthKey) ? prev.filter((item) => item !== monthKey) : [...prev, monthKey])}
                    className="flex w-full items-center justify-between border-b border-white/5 px-1 py-3 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {isExpanded ? <ChevronRight className="rotate-90 text-[#ccff00]" size={18} /> : <ChevronRight className="text-[#ccff00]" size={18} />}
                      <span className="break-anywhere text-[15px] font-bold">{group.label}</span>
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-[#ccff00]">{group.records.length}</span>
                  </button>
                  {isExpanded && (
                    <div className="mt-1 grid gap-2 pl-2">
                      {group.records.map((record) => {
                        const isSelected = selectedCompareIds.includes(record.id);
                        return (
                          <button
                            key={record.id}
                            onClick={() => compareMode ? toggleCompareRecord(record) : setView({ name: "record", recordId: record.id })}
                            className={cls("flex min-w-0 items-center rounded-lg bg-[#2c2c2e] p-3 text-left", isSelected && "border border-[#ccff00]")}
                          >
                            <div className="flex min-w-0 flex-1 items-center">
                              {compareMode && (isSelected ? <Check className="mr-3 shrink-0 text-[#ccff00]" size={22} /> : <span className="mr-3 h-[22px] w-[22px] shrink-0 rounded-full border border-[#a0a0a5]" />)}
                              <span className="break-anywhere text-[15px] text-[#a0a0a5]">
                                {new Date(record.date).toLocaleDateString(settings.language === "km" ? "km-KH" : "en-GB", { day: "numeric", month: "short" })}: {record.currentWeightKG} kg
                              </span>
                            </div>
                            {record.photoUris?.length ? <span className="ml-2 flex shrink-0 items-center gap-1 text-xs font-bold text-[#ccff00]"><Camera size={16} />{record.photoUris.length}</span> : null}
                            {!compareMode && <ChevronRight className="ml-2 shrink-0 text-[#a0a0a5]" size={20} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-black">{t("generateMealPlanSection")}</h3>
            <Activity className="text-[#ccff00]" size={36} />
          </div>
          <div className="mb-6 flex justify-around text-center">
            <div><p className="text-3xl">🥩</p><p className="text-xs text-[#a0a0a5]">{t("meat")}</p></div>
            <div><p className="text-3xl">🥦</p><p className="text-xs text-[#a0a0a5]">{t("vegetables")}</p></div>
            <div><p className="text-3xl">🍎</p><p className="text-xs text-[#a0a0a5]">{t("fruitsLabel")}</p></div>
            <div><p className="text-3xl">🍞</p><p className="text-xs text-[#a0a0a5]">{t("carbsLabel")}</p></div>
          </div>
          <Button className="w-full" onClick={() => setView({ name: "meal", clientId })}>{t("generateMealPlanBtn")}</Button>
        </Card>
        <div ref={reportRef} className="fixed -left-[10000px] top-0 w-[794px] bg-white p-6 text-[#172033]">
          <div className="mb-[18px] flex items-start justify-between border-b-2 border-[#d9e7f7] pb-4">
            <div className="flex-1">
              <p className="mb-1.5 text-[11px] font-bold uppercase text-[#2b6cb0]">{t("reportBrand")}</p>
              <h1 className="mb-1 text-[28px] font-bold leading-tight text-[#172033]">{t("progressReportTitle")}</h1>
              <p className="text-xs text-[#667085]">{t("reportPreparedFor")} {client.name}</p>
              {(settings.gymName || settings.trainerName) && (
                <div className="mt-2">
                  {settings.gymName && <p className="text-sm font-bold text-[#2b6cb0]">{settings.gymName}</p>}
                  {settings.trainerName && <p className="text-xs text-[#667085]">{t("trainer")}: {settings.trainerName}</p>}
                </div>
              )}
            </div>
            {gymLogo && <ImageWithFallback src={gymLogo} alt="" className="ml-4 h-[60px] w-[60px] rounded-lg object-contain" />}
            <div className="ml-4 pt-1 text-right">
              <p className="mb-1 text-[9px] font-bold uppercase text-[#98a2b3]">{t("reportDate")}</p>
              <p className="text-xs font-bold text-[#172033]">{generatedDate}</p>
            </div>
          </div>

          <div className="mb-[18px] flex items-center border-l-4 border-[#2b6cb0] bg-[#f8fafc] p-3.5">
            {client.imageUri ? (
              <ImageWithFallback src={client.imageUri} alt={client.name} className="mr-3.5 h-[58px] w-[58px] shrink-0 rounded-full object-cover" />
            ) : (
              <div className="mr-3.5 grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full bg-[#eaf1f8] text-xl font-black text-[#667085]">{client.name.slice(0, 1).toUpperCase() || "?"}</div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="mb-1 text-lg font-bold text-[#172033]">{client.name}</h2>
              <p className="text-xs text-[#667085]">{t("age")}: {client.age}  |  {client.gender === "Male" ? t("male") : t("female")}  |  {t("height")}: {client.heightCM} cm</p>
              <p className="mt-1 text-xs font-bold text-[#2b6cb0]">{t("goal")}: {displayGoal}</p>
            </div>
          </div>

          <h3 className="mb-2.5 text-sm font-bold text-[#172033]">{t("reportSummary")}</h3>
          <div className="mb-2.5 grid grid-cols-2 gap-2">
            <ReportMetric label={t("latestWeight")} value={latest ? `${latest.currentWeightKG} kg` : t("notAvailable")} />
            <ReportMetric label={t("bmi")} value={latest ? calculateBMI(latest.currentWeightKG, client.heightCM).toString() : t("notAvailable")} />
            <ReportMetric label={t("targetWeight")} value={`${targetWeight} kg`} />
            <ReportMetric label={t("reportChange")} value={weightChangeText} />
          </div>

          <div className="mb-2.5 grid grid-cols-2 gap-2">
            <ReportHighlight label={t("estimatedTime")} value={estimatedWeeksDisplay} />
            <ReportHighlight label={t("attendanceTitle")} value={`${attendedCount} ${t("sessions")}`} />
          </div>

          <p className="mb-[18px] text-xs text-[#667085]">{t("standardWeight")}: {min} - {max} kg</p>

          <h3 className="mb-2.5 text-sm font-bold text-[#172033]">{t("progressHistory")}</h3>
          <div className="mb-4 overflow-hidden border border-[#d0d7de] bg-white">
            <div className="grid grid-cols-[1.3fr_1fr_1fr] bg-[#172033] px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-white">{t("reportDate")}</p>
              <p className="text-[10px] font-bold uppercase text-white">{t("reportWeight")}</p>
              <p className="text-[10px] font-bold uppercase text-white">{t("bmi")}</p>
            </div>
            {!history.length ? (
              <p className="p-[18px] text-center text-[13px] text-[#667085]">{t("noRecords")}</p>
            ) : history.map((record) => (
              <div key={record.id} className="grid grid-cols-[1.3fr_1fr_1fr] border-t border-[#e5e7eb] px-3 py-2.5">
                <p className="text-xs font-semibold text-[#172033]">{new Date(record.date).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" })}</p>
                <p className="text-xs font-semibold text-[#172033]">{record.currentWeightKG} kg</p>
                <p className="text-xs font-semibold text-[#172033]">{record.bmi || calculateBMI(record.currentWeightKG, client.heightCM)}</p>
              </div>
            ))}
          </div>
          <p className="text-right text-[10px] text-[#98a2b3]">{t("reportGeneratedBy")}</p>
        </div>
        <Button variant="danger" disabled={deleteBusy} onClick={() => deleteRun(async () => { if (confirm(t("deleteClientConfirm"))) { await deleteClient(client.id); setView({ name: "clients" }); } })}><Trash2 size={18} /> {t("deleteClient")}</Button>
      </div>
      {addOpen && <AddProgressModal client={client} userId={user?.uid || ""} close={() => setAddOpen(false)} />}
      {paymentOpen && <PaymentModal clientId={clientId} close={() => setPaymentOpen(false)} />}
      {configOpen && <ClientConfigModal client={client} close={() => setConfigOpen(false)} save={editClient} />}
      {reportOpen && <ExportImageModal title={t("reportShareClient")} targetRef={reportRef} fileName={safeFileName(client.name, "progress-report")} close={() => setReportOpen(false)} />}
      {compareOpen && beforeRecord && afterRecord && (
        <div className="fixed inset-0 z-[100] overscroll-none bg-black/80 p-2 [touch-action:none] sm:p-5">
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#3a3a3c] bg-[#1e1e1e] p-3 shadow-2xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">{t("comparePhotos")}</h2>
                <p className="text-sm text-[#a0a0a5]">{t("reportChange")}: <span className="font-bold text-[#ccff00]">{(afterRecord.currentWeightKG - beforeRecord.currentWeightKG).toFixed(1)} kg</span></p>
              </div>
              <IconButton label={t("close")} onClick={() => setCompareOpen(false)}><X size={20} /></IconButton>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div ref={comparisonRef} className="shrink-0 touch-none select-none overflow-hidden rounded-xl bg-black [touch-action:none]">
                <div className="grid aspect-[3/2] max-h-[48vh] grid-cols-2">
                  <ComparePane label={t("before")} record={beforeRecord} index={beforePhotoIdx} zoom={beforeZoom} setZoom={setBeforeZoom} />
                  <ComparePane label={t("after")} record={afterRecord} index={afterPhotoIdx} zoom={afterZoom} setZoom={setAfterZoom} />
                </div>
              </div>
              <div className="mt-4 grid shrink-0 gap-3 sm:grid-cols-2">
                <PhotoStrip label={`${t("before")} ${t("photos")}`} record={beforeRecord} active={beforePhotoIdx} setActive={(index) => { setBeforePhotoIdx(index); setBeforeZoom(1); }} />
                <PhotoStrip label={`${t("after")} ${t("photos")}`} record={afterRecord} active={afterPhotoIdx} setActive={(index) => { setAfterPhotoIdx(index); setAfterZoom(1); }} />
              </div>
              <div className="mt-4 grid shrink-0 gap-3 pb-2 sm:grid-cols-3">
                <Button variant="ghost" onClick={() => comparisonRef.current && shareElementImage(comparisonRef.current, safeFileName(client.name, "comparison"), t("comparePhotos"))}><Share2 size={18} /> {t("reportShareImage")}</Button>
                <Button variant="ghost" onClick={() => comparisonRef.current && downloadElementImage(comparisonRef.current, safeFileName(client.name, "comparison"))}><Download size={18} /> {t("save")}</Button>
                <Button onClick={() => { setCompareOpen(false); setCompareMode(false); setSelectedCompareIds([]); }}>{t("done")}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {clientPayments.length > 0 && null}
    </>
  );
}

function ComparePane({ label, record, index, zoom, setZoom }: { label: string; record: ProgressRecord; index: number; zoom: number; setZoom: (value: number) => void }) {
  const src = record.photoUris?.[index] || record.photoUris?.[0];
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; moveX: number; moveY: number } | null>(null);
  const [move, setMove] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setMove({ x: 0, y: 0 });
    pinchStart.current = null;
    panStart.current = null;
  }, [src]);

  const clampZoom = (value: number) => Math.min(3, Math.max(1, Number(value.toFixed(2))));
  const clampMove = (value: number, scale: number) => {
    const limit = 120 * scale;
    return Math.max(-limit, Math.min(limit, value));
  };
  const touchDistance = (touches: TouchEvent<HTMLDivElement>["touches"]) => {
    const first = touches[0];
    const second = touches[1];
    if (!first || !second) return 0;
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  };
  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      if (!touch) return;
      panStart.current = { x: touch.clientX, y: touch.clientY, moveX: move.x, moveY: move.y };
      return;
    }
    if (event.touches.length < 2) return;
    event.preventDefault();
    pinchStart.current = { distance: touchDistance(event.touches), zoom };
  };
  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 1) event.preventDefault();
    if (event.touches.length === 1 && panStart.current && zoom > 1) {
      const touch = event.touches[0];
      if (!touch) return;
      const nextX = clampMove(panStart.current.moveX + touch.clientX - panStart.current.x, zoom);
      const nextY = clampMove(panStart.current.moveY + touch.clientY - panStart.current.y, zoom);
      setMove({ x: nextX, y: nextY });
      return;
    }
    if (event.touches.length < 2 || !pinchStart.current) return;
    event.preventDefault();
    const nextDistance = touchDistance(event.touches);
    if (!nextDistance || !pinchStart.current.distance) return;
    setZoom(clampZoom(pinchStart.current.zoom * (nextDistance / pinchStart.current.distance)));
  };
  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) pinchStart.current = null;
    if (event.touches.length === 0) panStart.current = null;
  };
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.ctrlKey || event.metaKey) {
      const nextZoom = clampZoom(zoom - event.deltaY * 0.01);
      setZoom(nextZoom);
      setMove((current) => ({
        x: clampMove(current.x, nextZoom),
        y: clampMove(current.y, nextZoom),
      }));
      return;
    }

    if (zoom > 1) {
      setMove((current) => ({
        x: clampMove(current.x - event.deltaX, zoom),
        y: clampMove(current.y - event.deltaY, zoom),
      }));
    }
  };
  return (
    <div
      data-photo-gesture="true"
      className="relative min-w-0 touch-none overflow-hidden border-r border-[#333] bg-[#111] [touch-action:none]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { pinchStart.current = null; }}
      onWheel={handleWheel}
      onDoubleClick={() => setZoom(1)}
    >
      <ImageWithFallback
        src={src}
        alt={label}
        className="h-full w-full select-none object-contain transition-transform duration-150"
        fallback={<div className="grid h-full w-full place-items-center bg-[#111] text-[#444]"><ImageIcon size={40} /></div>}
        style={{ transform: `translate(${move.x}px, ${move.y}px) scale(${zoom})` }}
      />
      <div className="absolute bottom-2 left-2 text-white drop-shadow">
        <p className="text-sm font-black uppercase text-[#ccff00]">{label}</p>
        <p className="text-[11px] font-bold">{formatDate(record.date, "en-US")}</p>
        <p className="text-[10px]">{record.currentWeightKG} kg</p>
      </div>
    </div>
  );
}

function PhotoStrip({ label, record, active, setActive }: { label: string; record: ProgressRecord; active: number; setActive: (index: number) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold">{label}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(record.photoUris || []).map((uri, index) => (
          <button key={`${uri}-${index}`} onClick={() => setActive(index)} className={cls("h-14 w-14 shrink-0 overflow-hidden rounded-lg border", active === index ? "border-[#ccff00]" : "border-transparent")}>
            <ImageWithFallback src={uri} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return <div className="border border-[#d0d7de] p-3"><p className="text-[10px] font-black uppercase text-[#667085]">{label}</p><p className="text-lg font-black">{value}</p></div>;
}

function ReportHighlight({ label, value }: { label: string; value: string }) {
  return <div className="border border-[#bfdbfe] bg-[#eef6ff] p-3"><p className="mb-1 text-[10px] font-black uppercase text-[#667085]">{label}</p><p className="text-base font-black text-[#1d4ed8]">{value}</p></div>;
}

function ReportMealRow({ category, item, portion }: { category: string; item: string; portion: string }) {
  return (
    <div className="grid grid-cols-[1.1fr_1.5fr_1fr] border-t border-[#e5e7eb] px-3 py-2.5">
      <p className="text-xs font-semibold text-[#172033]">{category}</p>
      <p className="break-anywhere text-xs font-semibold text-[#172033]">{item}</p>
      <p className="text-xs font-semibold text-[#172033]">{portion}</p>
    </div>
  );
}

function ExportImageModal({ title, targetRef, fileName, close }: { title: string; targetRef: RefObject<HTMLElement | null>; fileName: string; close: () => void }) {
  const { t } = useClients();
  const { busy, run } = useAsyncLock();

  const runExport = (action: (element: HTMLElement) => Promise<void>) => {
    run(async () => {
      const element = targetRef.current;
      if (!element) return;
      await action(element);
      close();
    });
  };

  return (
    <Modal title={title} close={close}>
      <div className="grid gap-3">
        <Button disabled={busy} onClick={() => runExport((element) => shareElementImage(element, fileName, title))}>
          <Share2 size={18} /> {t("reportShareImage")}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => runExport((element) => downloadElementImage(element, fileName))}>
          <Download size={18} /> {t("reportSaveImage")}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={close}>{t("cancel")}</Button>
      </div>
    </Modal>
  );
}

function AddProgressModal({ client, userId, close }: { client: Client; userId: string; close: () => void }) {
  const { addRecord, t } = useClients();
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const { busy, run } = useAsyncLock();

  return (
    <Modal title={t("addProgress")} close={close}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const w = Number.parseFloat(weight);
          if (!w) return;
          const photoUris: string[] = [];
          for (const file of Array.from(files || [])) photoUris.push(await uploadImageToCloudinary(file, userId, "progress_photos"));
          await addRecord({ id: Date.now().toString(), clientId: client.id, date: new Date().toISOString(), currentWeightKG: w, bmi: calculateBMI(w, client.heightCM), notes, photoUris });
          close();
        });
      }}>
        <Label text={t("currentWeight")}><Field type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={t("currentWeight")} /></Label>
        <Label text={t("notes")}><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} /></Label>
        <Label text={t("photos")}><Field type="file" multiple accept="image/*" onChange={(e) => setFiles(e.target.files)} /></Label>
        <Button type="submit" disabled={busy} className="w-full">{busy ? t("saving") : t("save")}</Button>
      </form>
    </Modal>
  );
}

function PaymentModal({ clientId, close }: { clientId: string; close: () => void }) {
  const { addPayment, t } = useClients();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(dateInput());
  const { busy, run } = useAsyncLock();
  return (
    <Modal title={t("logPayment")} close={close}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const value = Number.parseFloat(amount);
          if (!value) return;
          await addPayment({ id: Date.now().toString(), clientId, amount: value, date: localDateToISOString(date), currency: "USD" });
          close();
        });
      }}>
        <Label text={t("amount")}><Field type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Label>
        <Label text={t("paymentDate")}><Field type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Label>
        <Button type="submit" disabled={busy} className="w-full">{busy ? t("saving") : t("save")}</Button>
      </form>
    </Modal>
  );
}

function ClientConfigModal({ client, close, save }: { client: Client; close: () => void; save: (client: Client) => Promise<void> }) {
  const { t } = useClients();
  const [modifier, setModifier] = useState(client.customCalorieModifier?.toString() || "");
  const [kg, setKg] = useState(client.customCalorieModifier ? ((Math.abs(client.customCalorieModifier) * 30) / 7700).toFixed(1).replace(".0", "") : "");
  const { busy, run } = useAsyncLock();

  return (
    <Modal title={t("customCalorieTitle")} close={close}>
      <div className="space-y-4">
        <Label text={t("caloriesPerDay")}>
          <Field value={modifier} onChange={(e) => {
            setModifier(e.target.value);
            const val = Number.parseInt(e.target.value) || 0;
            setKg(((Math.abs(val) * 30) / 7700).toFixed(1).replace(".0", ""));
          }} />
        </Label>
        <Label text={t("kgPerMonth")}>
          <Field value={kg} onChange={(e) => {
            setKg(e.target.value);
            const val = Number.parseFloat(e.target.value) || 0;
            const cals = Math.round((val * 7700) / 30);
            setModifier(`${client.goal === "Lose Weight" ? "-" : ""}${cals}`);
          }} />
        </Label>
        <Button className="w-full" disabled={busy} onClick={() => run(async () => { await save({ ...client, customCalorieModifier: Number.parseInt(modifier) || undefined }); close(); })}>{busy ? t("saving") : t("save")}</Button>
      </div>
    </Modal>
  );
}

function RecordScreen({ setView, recordId }: { setView: (view: View) => void; recordId: string }) {
  const { records, clients, editRecord, deleteRecord, t } = useClients();
  const { user } = useAuth();
  const record = records.find((r) => r.id === recordId);
  const client = record ? clients.find((c) => c.id === record.clientId) : null;
  const [editOpen, setEditOpen] = useState(false);
  const [activeImage, setActiveImage] = useState("");
  const { busy, run } = useAsyncLock();

  if (!record || !client) return <NotFound title={t("recordNotFound")} back={() => setView({ name: "clients" })} />;

  return (
    <>
      <Header title={t("progressRecordTitle")} back={() => setView({ name: "client-detail", clientId: client.id })} right={<div className="flex gap-2"><IconButton label={t("edit")} onClick={() => setEditOpen(true)}><Pencil size={20} /></IconButton><IconButton label={t("delete")} disabled={busy} onClick={() => run(async () => { if (confirm(t("deleteRecordConfirm"))) { await deleteRecord(record.id); setView({ name: "client-detail", clientId: client.id }); } })}><Trash2 size={20} className="text-[#ff453a]" /></IconButton></div>} />
      <div className="space-y-5 px-5 lg:px-8">
        <Card>
          <p className="text-[#a0a0a5]">{t("date")}</p><p className="mb-4 text-xl font-black">{formatDate(record.date)}</p>
          <p className="text-[#a0a0a5]">{t("weight")}</p><p className="mb-4 text-xl font-black">{record.currentWeightKG} kg</p>
          <p className="text-[#a0a0a5]">{t("bmi")}</p><p className="mb-4 text-xl font-black">{record.bmi}</p>
          {record.notes && <><p className="text-[#a0a0a5]">{t("notes")}</p><p className="text-lg">{record.notes}</p></>}
        </Card>
        <PhotoUploader record={record} userId={user?.uid || ""} save={editRecord} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(record.photoUris || []).map((uri, index) => (
            <button key={uri + index} onClick={() => setActiveImage(uri)} className="aspect-square overflow-hidden rounded-xl bg-[#1e1e1e]">
              <ImageWithFallback src={uri} alt="" className="h-full w-full object-cover" fallback={<div className="grid h-full w-full place-items-center bg-[#1e1e1e] text-[#a0a0a5]"><ImageIcon size={34} /></div>} />
            </button>
          ))}
        </div>
      </div>
      {activeImage && <Modal title={t("photo")} close={() => setActiveImage("")}><ImageWithFallback src={activeImage} alt="" className="max-h-[70vh] w-full rounded-xl object-contain" fallback={<div className="grid min-h-72 place-items-center rounded-xl bg-[#121212] text-[#a0a0a5]">{t("imageLoadError")}</div>} /><Button className="mt-4 w-full" onClick={() => downloadUrl(activeImage, "progress-photo.jpg")}><Download size={18} /> {t("saveToGallery")}</Button></Modal>}
      {editOpen && <EditRecordModal record={record} client={client} close={() => setEditOpen(false)} save={editRecord} />}
    </>
  );
}

function PhotoUploader({ record, userId, save }: { record: ProgressRecord; userId: string; save: (record: ProgressRecord) => Promise<void> }) {
  const { t } = useClients();
  const [files, setFiles] = useState<FileList | null>(null);
  const { busy, run } = useAsyncLock();
  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Field type="file" multiple accept="image/*" onChange={(e) => setFiles(e.target.files)} />
        <Button disabled={busy || !files?.length} onClick={() => run(async () => {
          const uploaded: string[] = [];
          for (const file of Array.from(files || [])) uploaded.push(await uploadImageToCloudinary(file, userId, "progress_photos"));
          await save({ ...record, photoUris: [...(record.photoUris || []), ...uploaded] });
          setFiles(null);
        })}>{busy ? t("uploading") : t("add")}</Button>
      </div>
    </Card>
  );
}

function EditRecordModal({ record, client, close, save }: { record: ProgressRecord; client: Client; close: () => void; save: (record: ProgressRecord) => Promise<void> }) {
  const { t } = useClients();
  const [date, setDate] = useState(dateInput(record.date));
  const [weight, setWeight] = useState(record.currentWeightKG.toString());
  const [notes, setNotes] = useState(record.notes || "");
  const { busy, run } = useAsyncLock();
  return (
    <Modal title={t("editRecord")} close={close}>
      <div className="space-y-4">
        <Label text={t("date")}><Field type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Label>
        <Label text={t("weight")}><Field type="number" value={weight} onChange={(e) => setWeight(e.target.value)} /></Label>
        <Label text={t("notes")}><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} /></Label>
        <Button disabled={busy} className="w-full" onClick={() => run(async () => {
          const w = Number.parseFloat(weight);
          await save({ ...record, date: new Date(date).toISOString(), currentWeightKG: w, bmi: calculateBMI(w, client.heightCM), notes });
          close();
        })}>{busy ? t("saving") : t("saveEdits")}</Button>
      </div>
    </Modal>
  );
}

function MealPlanScreen({ setView, clientId }: { setView: (view: View) => void; clientId: string }) {
  const { clients, records, ingredients, settings, t } = useClients();
  const client = clients.find((c) => c.id === clientId);
  const [tab, setTab] = useState("Lunch");
  const getRand = (arr: FoodLibraryItem[]) => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  const createMeal = () => ({
    p: getRand(ingredients.filter((i) => i.category === "Protein")),
    c: getRand(ingredients.filter((i) => i.category === "Carbs")),
    v: getRand(ingredients.filter((i) => i.category === "Veggies" || i.category === "Fruits")),
  });
  const [meal, setMeal] = useState(createMeal);
  const [swap, setSwap] = useState<"Protein" | "Carbs" | "Veggies" | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);

  if (!client) return <NotFound title={t("clientNotFound")} back={() => setView({ name: "clients" })} />;
  const history = records.filter((r) => r.clientId === clientId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latestWeight = history[0]?.currentWeightKG || 70;
  const bmr = calculateBMR(latestWeight, client.heightCM, client.age || 25, client.gender || "Male");
  const modifier = client.customCalorieModifier ?? (client.goal === "Gain Weight" ? settings.gainWeightCals : client.goal === "Gain Muscle" ? settings.gainMuscleCals : client.goal === "Lose Weight" ? settings.loseWeightCals : 0);
  const cals = Math.max(1200, Math.round(bmr * 1.375 + modifier));
  const waterLiters = (latestWeight * 0.033).toFixed(1);
  const targetMealCals = tab === "Snacks" ? cals * 0.1 : cals * 0.3;
  const baseMealCals = ((meal.p?.calsBase || 0) * 1.5) + (meal.c?.calsBase || 0) + (meal.v?.calsBase || 0);
  const mult = baseMealCals > 0 ? targetMealCals / baseMealCals : 1;
  const proteinGrams = Math.round(150 * mult);
  const carbGrams = Math.round(100 * mult);
  const veggieGrams = Math.round(100 * mult);
  const totalProtein = Math.round((((meal.p?.proteinBase || 0) * 1.5) + (meal.c?.proteinBase || 0) + (meal.v?.proteinBase || 0)) * mult);
  const totalCarbs = Math.round((((meal.p?.carbBase || 0) * 1.5) + (meal.c?.carbBase || 0) + (meal.v?.carbBase || 0)) * mult);
  const totalFats = Math.round((((meal.p?.fatBase || 0) * 1.5) + (meal.c?.fatBase || 0) + (meal.v?.fatBase || 0)) * mult);
  const totalMealCals = Math.round(baseMealCals * mult);
  const displayGoal = goalLabel(client.goal, t);
  const currentMealLabel = mealLabel(tab, t);
  const gymLogo = isPersistentImageUrl(settings.gymLogo) ? settings.gymLogo : "";
  const dateLocale = settings.language === "km" ? "km-KH" : "en-GB";
  const generatedDate = new Date().toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <Header
        title={t("mealPlanTitle")}
        back={() => setView({ name: "client-detail", clientId })}
        right={<IconButton label={t("reportShareMeal")} onClick={() => setExportOpen(true)}><FileText size={20} className="text-[#ccff00]" /></IconButton>}
      />
      <div className="space-y-5 px-5 lg:px-8">
        <Card className="text-center">
          <p>{t("recommendedDaily")}: <b className="text-[#ccff00]">{cals} kcal</b></p>
          <p>{t("recommendedWater")}: <b className="text-[#ccff00]">{waterLiters} L</b></p>
        </Card>
        <div className="flex gap-3 overflow-x-auto">
          {["Breakfast", "Lunch", "Dinner", "Snacks"].map((name) => (
            <button key={name} onClick={() => { setTab(name); setMeal(createMeal()); }} className={cls("shrink-0 border-b-2 border-transparent px-2 py-2 font-bold text-[#a0a0a5]", tab === name && "border-[#ccff00] text-white")}>{mealLabel(name, t)}</button>
          ))}
        </div>
        <Card>
          <h3 className="mb-4 font-black">{t("currentPlan")}</h3>
          <MealItem label={t("protein")} item={meal.p} grams={proteinGrams} onClick={() => setSwap("Protein")} />
          <MealItem label={t("carbs")} item={meal.c} grams={carbGrams} onClick={() => setSwap("Carbs")} />
          <MealItem label={t("veggieFruit")} item={meal.v} grams={veggieGrams} onClick={() => setSwap("Veggies")} />
        </Card>
        <Card className="text-center text-sm">
          <p>{t("protein")}: {totalProtein}g | {t("carbs")}: {totalCarbs}g | {t("fats")}: {totalFats}g</p>
          <p className="mt-1 font-black text-[#ccff00]">{t("totalMealCals")}: {totalMealCals} kcal</p>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="ghost" onClick={() => setMeal(createMeal())}><RefreshCw size={18} /> {t("reRoll")}</Button>
          <Button onClick={() => setView({ name: "client-detail", clientId })}><Check size={18} /> {t("confirmMealPlan")}</Button>
        </div>
        <div ref={reportRef} className="fixed -left-[10000px] top-0 w-[794px] bg-white p-6 text-[#172033]">
          <div className="mb-[18px] flex items-start justify-between border-b-2 border-[#d9e7f7] pb-4">
            <div className="flex-1">
              <p className="mb-1.5 text-[11px] font-bold uppercase text-[#2b6cb0]">{t("reportBrand")}</p>
              <h1 className="mb-1 text-[28px] font-bold leading-tight text-[#172033]">{t("mealPlanTitle")}</h1>
              <p className="text-xs text-[#667085]">{t("reportPreparedFor")} {client.name || t("clientName")}</p>
              {(settings.gymName || settings.trainerName) && (
                <div className="mt-2">
                  {settings.gymName && <p className="text-sm font-bold text-[#2b6cb0]">{settings.gymName}</p>}
                  {settings.trainerName && <p className="text-xs text-[#667085]">{t("trainer")}: {settings.trainerName}</p>}
                </div>
              )}
            </div>
            {gymLogo && <ImageWithFallback src={gymLogo} alt="" className="ml-4 h-[60px] w-[60px] rounded-lg object-contain" />}
            <div className="ml-4 pt-1 text-right">
              <p className="mb-1 text-[9px] font-bold uppercase text-[#98a2b3]">{t("reportDate")}</p>
              <p className="text-xs font-bold text-[#172033]">{generatedDate}</p>
            </div>
          </div>

          <div className="mb-[18px] flex items-center border-l-4 border-[#2b6cb0] bg-[#f8fafc] p-3.5">
            {client.imageUri ? (
              <ImageWithFallback src={client.imageUri} alt={client.name} className="mr-3.5 h-[58px] w-[58px] shrink-0 rounded-full object-cover" />
            ) : (
              <div className="mr-3.5 grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full bg-[#eaf1f8] text-xl font-black text-[#667085]">{client.name.slice(0, 1).toUpperCase() || "?"}</div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="mb-1 text-lg font-bold text-[#172033]">{client.name || t("clientName")}</h2>
              <p className="text-xs text-[#667085]">{t("goal")}: {displayGoal}  |  {t("height")}: {client.heightCM} cm</p>
              <p className="mt-1 text-xs font-bold text-[#2b6cb0]">{currentMealLabel} {t("reportNutritionTarget")}</p>
            </div>
          </div>

          <h3 className="mb-2.5 text-sm font-bold text-[#172033]">{t("reportDailyTargets")}</h3>
          <div className="mb-2.5 grid grid-cols-2 gap-2">
            <ReportMetric label={t("recommendedDaily")} value={`${cals} kcal`} />
            <ReportMetric label={t("recommendedWater")} value={`${waterLiters} L`} />
            <ReportMetric label={t("totalMealCals")} value={`${totalMealCals} kcal`} />
            <ReportMetric label={t("basedOnGoal")} value={displayGoal} />
          </div>

          <div className="mb-[18px] grid grid-cols-3 gap-2">
            <ReportHighlight label={t("protein")} value={`${totalProtein}g`} />
            <ReportHighlight label={t("carbs")} value={`${totalCarbs}g`} />
            <ReportHighlight label={t("fats")} value={`${totalFats}g`} />
          </div>

          <h3 className="mb-2.5 text-sm font-bold text-[#172033]">{t("currentPlan")}</h3>
          <div className="mb-4 overflow-hidden border border-[#d0d7de] bg-white">
            <div className="grid grid-cols-[1.1fr_1.5fr_1fr] bg-[#172033] px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-white">{t("reportCategory")}</p>
              <p className="text-[10px] font-bold uppercase text-white">{t("reportIngredient")}</p>
              <p className="text-[10px] font-bold uppercase text-white">{t("reportPortion")}</p>
            </div>
            <ReportMealRow category={t("protein")} item={meal.p?.name || t("notAvailable")} portion={`${proteinGrams}g`} />
            <ReportMealRow category={t("carbs")} item={meal.c?.name || t("notAvailable")} portion={`${carbGrams}g`} />
            <ReportMealRow category={t("veggieFruit")} item={meal.v?.name || t("notAvailable")} portion={`${veggieGrams}g`} />
          </div>

          <div className="mb-4 border border-[#e5e7eb] bg-[#f8fafc] p-3.5">
            <h3 className="mb-2.5 text-sm font-bold text-[#172033]">{t("mealPlanNote")}</h3>
            <p className="mb-1 text-xs text-[#475467]">- {t("noteWater")}</p>
            <p className="mb-1 text-xs text-[#475467]">- {t("noteSleep")}</p>
            <p className="text-xs text-[#475467]">- {t("noteExercise")}</p>
          </div>
          <p className="text-right text-[10px] text-[#98a2b3]">{t("reportGeneratedBy")}</p>
        </div>
      </div>
      {exportOpen && <ExportImageModal title={t("reportShareMeal")} targetRef={reportRef} fileName={safeFileName(client.name, "meal-plan")} close={() => setExportOpen(false)} />}
      {swap && <IngredientSwap category={swap} close={() => setSwap(null)} select={(item) => { setMeal((prev) => swap === "Protein" ? { ...prev, p: item } : swap === "Carbs" ? { ...prev, c: item } : { ...prev, v: item }); setSwap(null); }} />}
    </>
  );
}

function MealItem({ label, item, grams, onClick }: { label: string; item: FoodLibraryItem | null; grams: number; onClick: () => void }) {
  const { t } = useClients();
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-bold text-[#a0a0a5]">{label}</p>
      <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg bg-[#2c2c2e] p-3 text-left">
        {item?.imageUri ? <img src={item.imageUri} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="text-2xl">{item?.icon || "🍽️"}</span>}
        <span className="flex-1">{item?.name || t("notAvailable")} x {grams}g</span>
        <RefreshCw size={16} className="text-[#ccff00]" />
      </button>
    </div>
  );
}

function IngredientSwap({ category, close, select }: { category: "Protein" | "Carbs" | "Veggies"; close: () => void; select: (item: FoodLibraryItem) => void }) {
  const { ingredients, t } = useClients();
  const options = ingredients.filter((item) => category === "Veggies" ? item.category === "Veggies" || item.category === "Fruits" : item.category === category);
  return (
    <Modal title={t("swapIngredient")} close={close}>
      <div className="max-h-[60vh] space-y-2 overflow-auto">
        {options.map((item) => <button key={item.id} onClick={() => select(item)} className="flex w-full items-center gap-3 rounded-lg bg-[#2c2c2e] p-3 text-left"><span className="text-xl">{item.icon || "🍽️"}</span><span className="flex-1">{item.name}</span><span className="text-sm text-[#a0a0a5]">{item.calsBase} kcal</span></button>)}
      </div>
    </Modal>
  );
}

function AttendanceScreen({ setView, clientId }: { setView: (view: View) => void; clientId: string }) {
  const { clients, attendance, toggleAttendance, deleteAttendance, settings, t } = useClients();
  const client = clients.find((c) => c.id === clientId);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState("");
  const [note, setNote] = useState("");
  const { busy, run } = useAsyncLock();
  if (!client) return <NotFound title={t("clientNotFound")} back={() => setView({ name: "clients" })} />;

  const monthKey = month.toISOString().slice(0, 7);
  const monthRecords = attendance.filter((a) => a.clientId === clientId && a.date.startsWith(monthKey)).sort((a, b) => b.date.localeCompare(a.date));
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  const openDay = (date: string) => {
    const existing = attendance.find((a) => a.clientId === clientId && a.date === date);
    setSelectedDate(date);
    setNote(existing?.notes || "");
  };

  return (
    <>
      <Header title={t("attendanceTitle")} back={() => setView({ name: "client-detail", clientId })} />
      <div className="space-y-5 px-5 lg:px-8">
        <Card className="flex items-center gap-4"><Avatar src={client.imageUri} name={client.name} /><div><h2 className="text-xl font-black">{client.name}</h2><p className="text-[#ccff00]">{attendance.filter((a) => a.clientId === clientId && a.attended).length} {t("sessions")}</p></div></Card>
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <IconButton label={t("previousMonth")} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={20} /></IconButton>
            <h3 className="font-black">{month.toLocaleDateString(settings.language === "km" ? "km-KH" : "en-US", { month: "long", year: "numeric" })}</h3>
            <IconButton label={t("nextMonth")} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={20} /></IconButton>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: days }, (_, i) => {
              const date = `${monthKey}-${String(i + 1).padStart(2, "0")}`;
              const record = attendance.find((a) => a.clientId === clientId && a.date === date);
              return <button key={date} onClick={() => openDay(date)} className={cls("aspect-square rounded-lg border border-[#3a3a3c] bg-[#121212] text-sm font-bold", record?.attended && "bg-[#ccff00] text-black", record && !record.attended && "bg-[#ff453a] text-white")}>{i + 1}</button>;
            })}
          </div>
        </Card>
        <Card><h3 className="mb-3 font-black">{t("progressHistory")}</h3>{monthRecords.map((item) => <AttendanceRow key={item.id} item={item} />)}{!monthRecords.length && <p className="text-center text-[#a0a0a5]">{t("noRecordsThisMonth")}</p>}</Card>
      </div>
      {selectedDate && (
        <Modal title={selectedDate} close={() => setSelectedDate("")}>
          <div className="space-y-4">
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("addNotePlaceholder")} />
            <div className="grid grid-cols-2 gap-3"><Button disabled={busy} onClick={() => run(async () => { await toggleAttendance(clientId, selectedDate, note, true); setSelectedDate(""); })}>{t("markAttended")}</Button><Button disabled={busy} variant="danger" onClick={() => run(async () => { await toggleAttendance(clientId, selectedDate, note, false); setSelectedDate(""); })}>{t("markAbsent")}</Button></div>
            <Button variant="ghost" disabled={busy} className="w-full" onClick={() => run(async () => { await deleteAttendance(`${clientId}_${selectedDate}`); setSelectedDate(""); })}><Trash2 size={18} /> {t("clearRecord")}</Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function AttendanceRow({ item }: { item: AttendanceRecord }) {
  const { t } = useClients();
  return <div className="mb-2 rounded-lg bg-[#2c2c2e] p-3"><div className="flex justify-between"><b>{formatDate(item.date)}</b><span className={item.attended ? "text-[#ccff00]" : "text-[#ff453a]"}>{item.attended ? t("attended") : t("absent")}</span></div>{item.notes && <p className="mt-1 text-sm text-[#a0a0a5]">{item.notes}</p>}</div>;
}

function IngredientsScreen({ setView }: { setView: (view: View) => void }) {
  const { ingredients, deleteIngredient, t } = useClients();
  const [tab, setTab] = useState("All");
  const [query, setQuery] = useState("");
  const data = ingredients.filter((item) => (tab === "All" || item.category === tab) && item.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <Header title={t("ingredientsLibrary")} right={<Button onClick={() => setView({ name: "add-ingredient" })}><Plus size={18} /> {t("addNew")}</Button>} />
      <div className="space-y-4 px-5 lg:px-8">
        <Field value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchIngredients")} />
        <div className="flex gap-2 overflow-x-auto">{["All", "Protein", "Carbs", "Veggies", "Fruits"].map((name) => <button key={name} onClick={() => setTab(name)} className={cls("rounded-full px-4 py-2 font-bold text-[#a0a0a5]", tab === name && "bg-[#ccff00] text-black")}>{categoryLabel(name, t)}</button>)}</div>
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          {data.map((item) => (
            <Card key={item.id} className="flex min-w-0 items-center gap-3 overflow-hidden">
              {item.imageUri ? <ImageWithFallback src={item.imageUri} alt={item.name} className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <span className="shrink-0 text-2xl">{item.icon || "🍽️"}</span>}
              <div className="min-w-0 flex-1">
                <h3 className="break-anywhere font-black leading-tight">{item.name}</h3>
                <p className="break-anywhere text-xs text-[#a0a0a5] sm:text-sm">P: {item.proteinBase}g | C: {item.carbBase}g | F: {item.fatBase}g | {item.calsBase} kcal</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <IconButton label={t("edit")} onClick={() => setView({ name: "add-ingredient", ingredientId: item.id })}><Pencil size={18} /></IconButton>
                <IconButton label={t("delete")} onClick={() => deleteIngredient(item.id)}><Trash2 size={18} className="text-[#ff453a]" /></IconButton>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

function AddIngredientScreen({ setView, ingredientId }: { setView: (view: View) => void; ingredientId?: string }) {
  const { ingredients, addIngredient, editIngredient, t } = useClients();
  const { user } = useAuth();
  const existing = ingredients.find((i) => i.id === ingredientId);
  const [form, setForm] = useState({
    name: existing?.name || "", category: existing?.category || "Protein", protein: existing?.proteinBase?.toString() || "", carbs: existing?.carbBase?.toString() || "", fats: existing?.fatBase?.toString() || "", cals: existing?.calsBase?.toString() || "", notes: existing?.notes || "",
  });
  const [imageUri, setImageUri] = useState(existing?.imageUri || "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const { busy, run } = useAsyncLock();
  const save = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      if (!form.name.trim()) return;
      let finalImage = imageUri;
      if (imageFile && user?.uid) finalImage = await uploadImageToCloudinary(imageFile, user.uid, "ingredients");
      const item: FoodLibraryItem = { id: ingredientId || Date.now().toString(), name: form.name.trim(), category: form.category, proteinBase: Number.parseFloat(form.protein) || 0, carbBase: Number.parseFloat(form.carbs) || 0, fatBase: Number.parseFloat(form.fats) || 0, calsBase: Number.parseFloat(form.cals) || 0, notes: form.notes, icon: form.category === "Protein" ? "🍗" : form.category === "Carbs" ? "🍚" : form.category === "Fruits" ? "🍎" : "🥦", imageUri: finalImage || undefined };
      if (ingredientId) await editIngredient(item); else await addIngredient(item);
      setView({ name: "ingredients" });
    });
  };
  return (
    <>
      <Header title={ingredientId ? t("editIngredientTitle") : t("addIngredientTitle")} back={() => setView({ name: "ingredients" })} right={<Button variant="ghost" onClick={() => setView({ name: "ingredients" })}>{t("cancel")}</Button>} />
      <form onSubmit={save} className="mx-auto max-w-2xl space-y-5 px-5 lg:px-8">
        <div className="flex justify-center pt-2">
          <label className="relative grid h-[104px] w-[104px] cursor-pointer place-items-center rounded-full border-2 border-[#ccff00] bg-[#1e1e1e]">
            {imageUri ? <ImageWithFallback src={imageUri} alt={form.name || t("ingredientName")} className="h-[96px] w-[96px] rounded-full object-cover" /> : <Camera size={54} className="text-[#a0a0a5]" />}
            <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-[#2c2c2e] text-white"><Plus size={16} /></span>
            <input className="sr-only" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setImageFile(file); setImageUri(URL.createObjectURL(file)); } }} />
          </label>
        </div>
        <Label text={t("ingredientName")}><Field value={form.name} placeholder={t("ingredientNamePlaceholder")} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Label>
        <Segmented label={t("category")} value={form.category} options={["Protein", "Carbs", "Veggies", "Fruits"]} map={(category) => category === "Protein" ? t("protein") : category === "Carbs" ? t("carbs") : category === "Veggies" ? t("veggies") : t("fruits")} onChange={(category) => setForm({ ...form, category })} />
        <div className="space-y-3">
          <p className="text-sm font-bold">{t("nutritionLabel")}</p>
          <div className="grid gap-3 sm:grid-cols-3"><Label text={`${t("protein")} (g)`}><Field type="number" inputMode="decimal" placeholder={t("ingredientProteinPlaceholder")} value={form.protein} onChange={(e) => setForm({ ...form, protein: e.target.value })} /></Label><Label text={`${t("carbs")} (g)`}><Field type="number" inputMode="decimal" placeholder={t("ingredientCarbsPlaceholder")} value={form.carbs} onChange={(e) => setForm({ ...form, carbs: e.target.value })} /></Label><Label text={`${t("fats")} (g)`}><Field type="number" inputMode="decimal" placeholder={t("ingredientFatsPlaceholder")} value={form.fats} onChange={(e) => setForm({ ...form, fats: e.target.value })} /></Label></div>
        </div>
        <Label text={t("caloriesKcal")}><Field type="number" inputMode="decimal" placeholder={t("ingredientCaloriesPlaceholder")} value={form.cals} onChange={(e) => setForm({ ...form, cals: e.target.value })} /></Label>
        <Label text={t("descriptionNotes")}><TextArea placeholder={t("ingredientNotesPlaceholder")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Label>
        <Button type="submit" disabled={busy} className="w-full">{busy ? t("saving") : ingredientId ? t("saveChanges") : t("addToLibrary")}</Button>
      </form>
    </>
  );
}

function FinanceScreen() {
  const { payments, clients, t, settings, addPayment, deletePayment } = useClients();
  const [viewDate, setViewDate] = useState(new Date());
  const monthKey = viewDate.toLocaleDateString(settings.language === "km" ? "km-KH" : "en-US", { month: "long", year: "numeric" });
  const filtered = payments.filter((p) => { const date = new Date(p.date); return date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear(); }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total = filtered.reduce((sum, p) => sum + p.amount, 0);
  return (
    <>
      <Header title={t("financeTitle")} />
      <div className="space-y-5 px-5 lg:px-8">
        <div className="flex items-center justify-between"><IconButton label={t("previousMonth")} onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}><ChevronLeft size={20} /></IconButton><h2 className="font-black">{monthKey}</h2><IconButton label={t("nextMonth")} onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}><ChevronRight size={20} /></IconButton></div>
        <div className="rounded-2xl bg-[#ccff00] p-6 text-center text-black"><p className="font-bold opacity-75">{t("totalRevenue")}</p><p className="break-anywhere text-4xl font-black sm:text-5xl">${total.toLocaleString()}</p><p className="mt-2 rounded-full bg-black/10 px-3 py-1 text-sm font-bold">{filtered.length} {t("paymentsLabel")}</p></div>
        <div className="grid gap-3">{filtered.map((p) => <PaymentRow key={p.id} payment={p} client={clients.find((c) => c.id === p.clientId)} save={addPayment} remove={deletePayment} />)}{!filtered.length && <p className="py-10 text-center text-[#a0a0a5]">{t("noRecords")}</p>}</div>
      </div>
    </>
  );
}

function PaymentRow({ payment, client, save, remove }: { payment: PaymentRecord; client?: Client; save: (payment: PaymentRecord) => Promise<void>; remove: (id: string) => Promise<void> }) {
  const { t } = useClients();
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex items-center justify-between gap-3 border-l-4 border-l-[#ccff00]">
      <div><h3 className="font-black">{client?.name || t("unknownClient")}</h3><p className="text-sm text-[#a0a0a5]">{formatDate(payment.date)}</p></div>
      <div className="shrink-0 text-right"><p className="break-anywhere text-xl font-black">${payment.amount.toLocaleString()}</p><div className="mt-2 flex justify-end gap-2"><button className="grid h-8 w-8 place-items-center rounded-md" onClick={() => setOpen(true)}><Pencil size={17} /></button><button className="grid h-8 w-8 place-items-center rounded-md" onClick={() => remove(payment.id)}><Trash2 size={17} className="text-[#ff453a]" /></button></div></div>
      {open && <EditPaymentModal payment={payment} save={save} close={() => setOpen(false)} />}
    </Card>
  );
}

function EditPaymentModal({ payment, save, close }: { payment: PaymentRecord; save: (payment: PaymentRecord) => Promise<void>; close: () => void }) {
  const { t } = useClients();
  const [amount, setAmount] = useState(payment.amount.toString());
  const [date, setDate] = useState(dateInput(payment.date));
  const { busy, run } = useAsyncLock();
  return <Modal title={t("editPayment")} close={close}><div className="space-y-4"><Label text={t("amount")}><Field type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Label><Label text={t("paymentDate")}><Field type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Label><Button disabled={busy} onClick={() => run(async () => { await save({ ...payment, amount: Number.parseFloat(amount) || 0, date: localDateToISOString(date) }); close(); })} className="w-full">{busy ? t("saving") : t("save")}</Button></div></Modal>;
}

function SubscriptionStandalone() {
  const { logout } = useAuth();
  return <main className="min-h-screen bg-[#121212] text-white"><SubscriptionScreen /><button className="fixed right-4 top-4 rounded-lg bg-[#1e1e1e] p-3 text-[#a0a0a5]" onClick={logout}><LogOut size={22} /></button></main>;
}

function SubscriptionScreen() {
  const { settings, updateSettings, t } = useClients();
  const [payment, setPayment] = useState<{ plan: { title: string; amount: number; months: number }; qr: KHQRResponse } | null>(null);
  const [success, setSuccess] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const [paymentError, setPaymentError] = useState("");
  const { busy: checkingPayment, run: runPaymentCheck } = useAsyncLock();
  const plans = [{ title: t("oneMonth"), amount: 5, months: 1 }, { title: t("threeMonths"), amount: 13, months: 3 }, { title: t("sixMonths"), amount: 24, months: 6 }, { title: t("oneYear"), amount: 45, months: 12 }];
  const access = getAccessStatus(settings);

  const completeSubscription = async (activePayment: { plan: { months: number } }) => {
    const base = settings.subscriptionExpiry && new Date(settings.subscriptionExpiry) > new Date() ? new Date(settings.subscriptionExpiry) : new Date();
    const expiry = new Date(base);
    expiry.setMonth(expiry.getMonth() + activePayment.plan.months);
    await updateSettings({ ...settings, subscriptionExpiry: expiry.toISOString() });
    setSuccess(true);
    setPaymentError("");
  };

  const verifyPayment = async (activePayment: { plan: { months: number }; qr: KHQRResponse }, showWaitingMessage = false) => {
    setPaymentError("");
    const status = await checkPaymentStatus(activePayment.qr.md5);
    const paid = status && (status.responseCode === 0 || status.data);
    if (paid) {
      await completeSubscription(activePayment);
      return;
    }
    if (showWaitingMessage) setPaymentError(status?.error || t("paymentNotFound"));
  };

  useEffect(() => {
    if (!payment || success) return;
    setTimeLeft(300);
    const timer = window.setInterval(() => setTimeLeft((v) => Math.max(0, v - 1)), 1000);
    const poll = window.setInterval(() => { verifyPayment(payment); }, 5000);
    return () => { clearInterval(timer); clearInterval(poll); };
  }, [payment, success]);

  return (
    <>
      <Header title={t("subscription")} />
      <div className="space-y-5 px-5 lg:px-8">
        <Card className="flex items-center gap-4"><Activity className={access.active ? "text-[#ccff00]" : "text-[#a0a0a5]"} size={34} /><div><h2 className="text-2xl font-black">{access.active ? access.type === "trial" ? t("freeTrial") : t("active") : t("expired")}</h2>{access.active && <p className="text-[#ccff00]">{t("remainingDays")}{access.days} {t("daysRemaining").toLowerCase()}</p>}</div></Card>
        <h2 className="text-xl font-black">{t("selectPlan")}</h2>
        <div className="grid gap-3 md:grid-cols-2">{plans.map((plan) => <button key={plan.title} onClick={() => { setPayment({ plan, qr: generatePaymentQR(plan.amount, "USD") }); setSuccess(false); setPaymentError(""); }} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-[#3a3a3c] bg-[#1e1e1e] p-5 text-left"><div className="min-w-0"><h3 className="break-anywhere text-lg font-black">{plan.title}</h3><p className="text-2xl font-black text-[#ccff00]">${plan.amount}</p></div><span className="break-anywhere shrink-0 rounded-lg bg-[#ccff00] px-3 py-2 text-center text-sm font-black leading-tight text-black">{t("subscribeNow")}</span></button>)}</div>
        <Card className="flex gap-3 text-sm text-[#a0a0a5]"><AlertCircle size={20} /> {t("subscriptionInfo")}</Card>
      </div>
      {payment && <Modal title={success ? t("paymentSuccess") : t("paymentTitle")} close={() => setPayment(null)}>{success ? <div className="text-center"><Check className="mx-auto mb-4 text-[#ccff00]" size={80} /><p className="mb-4 text-[#a0a0a5]">{t("subscriptionUpdated")}</p><Button onClick={() => setPayment(null)} className="w-full">{t("done")}</Button></div> : <div className="flex flex-col items-center gap-4"><p className={timeLeft < 60 ? "text-[#ff453a]" : "text-[#a0a0a5]"}>{t("sessionExpires")}{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}</p><KHQRCard qrString={payment.qr.qrString} amount={payment.plan.amount} /><p className="text-[#a0a0a5]">{timeLeft > 0 ? t("paymentPending") : t("sessionExpired")}</p>{paymentError && <p className="text-center text-sm text-[#ff453a]">{paymentError}</p>}<Button disabled={checkingPayment} onClick={() => runPaymentCheck(() => verifyPayment(payment, true))} className="w-full">{checkingPayment ? t("checkingPayment") : t("checkPayment")}</Button><p className="text-lg font-bold">{t("scanToPay")}</p></div>}</Modal>}
    </>
  );
}

function KHQRCard({ qrString, amount }: { qrString: string; amount: number }) {
  const { t } = useClients();
  return (
    <div className="w-[300px] overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="bg-[#E21A1A] px-8 py-6 text-center font-black text-white">KHQR</div>
      <div className="px-8 py-5 text-black"><p className="font-black">{t("clientTrackingApp")}</p><p className="text-3xl font-black text-[#E21A1A]">{amount} <span className="text-sm">USD</span></p></div>
      <div className="border-t border-dashed border-black/40 px-10 py-8"><QRCodeSVG value={qrString || "pending"} size={220} /></div>
    </div>
  );
}

function SettingsScreen() {
  const { settings, updateSettings, restoreDefaultIngredients, t } = useClients();
  const { user, logout } = useAuth();
  const [local, setLocal] = useState(settings);
  const [gymLogoFile, setGymLogoFile] = useState<File | null>(null);
  const { busy, run } = useAsyncLock();
  useEffect(() => setLocal(settings), [settings]);
  const updateFromKg = (kg: string, key: "loseWeightCals" | "gainMuscleCals" | "gainWeightCals", negative = false) => setLocal({ ...local, [key]: (negative ? -1 : 1) * Math.round(((Number.parseFloat(kg) || 0) * 7700) / 30) });
  const saveBranding = () => run(async () => {
    let gymLogo = local.gymLogo || "";
    if (gymLogoFile && user?.uid) gymLogo = await uploadImageToCloudinary(gymLogoFile, user.uid, "branding");
    await updateSettings({ ...local, gymLogo: isPersistentImageUrl(gymLogo) ? gymLogo : "" });
    setGymLogoFile(null);
  });
  return (
    <>
      <Header title={t("settingsTitle")} />
      <div className="space-y-5 px-5 lg:px-8">
        <Card><h2 className="mb-3 flex items-center gap-2 text-xl font-black"><Users size={22} className="text-[#ccff00]" /> {t("account")}</h2><p className="truncate text-[#a0a0a5]">{t("loggedInAs")}{user?.email}</p><p className={user?.emailVerified ? "text-[#4CAF50]" : "text-[#ff9800]"}>{user?.emailVerified ? t("verified") : t("unverified")}</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Button variant="ghost" onClick={() => restoreDefaultIngredients()}>{t("restoreFoodLibrary")}</Button><Button variant="danger" onClick={logout}>{t("logOut")}</Button></div></Card>
        <Card><h2 className="mb-4 flex items-center gap-2 text-xl font-black"><Languages size={22} className="text-[#ccff00]" /> {t("language")}</h2><div className="grid grid-cols-2 gap-3"><Button variant={local.language === "en" ? "primary" : "ghost"} onClick={() => updateSettings({ ...settings, language: "en" })}>{t("english")}</Button><Button variant={local.language === "km" ? "primary" : "ghost"} onClick={() => updateSettings({ ...settings, language: "km" })}>{t("khmer")}</Button></div></Card>
        <Card className="space-y-4"><h2 className="text-xl font-black">{t("gymBranding")}</h2><Label text={t("trainerNameLabel")}><Field value={local.trainerName || ""} onChange={(e) => setLocal({ ...local, trainerName: e.target.value })} placeholder={t("enterYourName")} /></Label><Label text={t("gymNameLabel")}><Field value={local.gymName || ""} onChange={(e) => setLocal({ ...local, gymName: e.target.value })} placeholder={t("enterGymName")} /></Label><Label text={t("uploadGymLogo")}><Field type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setGymLogoFile(file); setLocal({ ...local, gymLogo: URL.createObjectURL(file) }); } }} /></Label>{local.gymLogo && <div className="flex items-center gap-3"><ImageWithFallback src={local.gymLogo} alt="" className="h-14 w-14 rounded-lg object-contain" /><Button variant="ghost" onClick={() => { setGymLogoFile(null); setLocal({ ...local, gymLogo: "" }); }}>{t("removeLogo")}</Button></div>}<Button disabled={busy} onClick={saveBranding}>{busy ? t("saving") : t("save")}</Button></Card>
        <Card className="space-y-4"><h2 className="text-xl font-black">{t("goalPrograms")}</h2><GoalSetting label={`${t("loseWeight")} (${t("cutting")})`} value={local.loseWeightCals} onCals={(v) => setLocal({ ...local, loseWeightCals: v })} onKg={(v) => updateFromKg(v, "loseWeightCals", true)} warning={Math.abs(local.loseWeightCals) * 30 / 7700 > 4} /><GoalSetting label={`${t("gainMuscle")} (${t("leanBulk")})`} value={local.gainMuscleCals} onCals={(v) => setLocal({ ...local, gainMuscleCals: v })} onKg={(v) => updateFromKg(v, "gainMuscleCals")} warning={local.gainMuscleCals * 30 / 7700 > 3} /><GoalSetting label={`${t("gainWeight")} (${t("heavyBulk")})`} value={local.gainWeightCals} onCals={(v) => setLocal({ ...local, gainWeightCals: v })} onKg={(v) => updateFromKg(v, "gainWeightCals")} warning={local.gainWeightCals * 30 / 7700 > 5} /><div className="grid grid-cols-2 gap-3"><Button variant="ghost" onClick={() => setLocal({ ...local, loseWeightCals: -500, gainMuscleCals: 300, gainWeightCals: 500 })}>{t("resetDefaults")}</Button><Button disabled={busy} onClick={() => run(async () => updateSettings(local))}>{t("save")}</Button></div></Card>
      </div>
    </>
  );
}

function GoalSetting({ label, value, onCals, onKg, warning }: { label: string; value: number; onCals: (value: number) => void; onKg: (value: string) => void; warning: boolean }) {
  const { t } = useClients();
  return <div className="rounded-lg border border-[#3a3a3c] p-3"><p className="mb-2 font-bold">{label}</p><div className="grid grid-cols-2 gap-3"><Field type="number" value={value} onChange={(e) => onCals(Number.parseInt(e.target.value) || 0)} /><Field type="number" placeholder={t("kgMonthPlaceholder")} onChange={(e) => onKg(e.target.value)} /></div>{warning && <p className="mt-2 text-xs font-bold text-[#ff9800]">{t("unhealthyWarning")}</p>}</div>;
}

function AdminScreen({ setView }: { setView: (view: View) => void }) {
  const { isAdmin, adminUsers, ingredients, adminAppConfig, bakongConfig, refreshAdminUsers, updateBakongToken, t } = useClients();
  const [token, setToken] = useState(bakongConfig.bakongToken || "");
  const [note, setNote] = useState(bakongConfig.bakongNote || "");
  const [proxyUrl, setProxyUrl] = useState(bakongConfig.bakongProxyUrl || "");
  const { busy, run } = useAsyncLock();
  useEffect(() => { setToken(bakongConfig.bakongToken || ""); setNote(bakongConfig.bakongNote || ""); setProxyUrl(bakongConfig.bakongProxyUrl || ""); }, [bakongConfig]);
  if (!isAdmin) return <NotFound title={t("adminAccessRequired")} back={() => setView({ name: "clients" })} />;
  const stats = adminUsers.reduce((acc, profile) => { const activeAt = new Date(profile.lastActiveAt).getTime(); const status = userAccess(profile, t); acc.total++; if (Date.now() - activeAt <= 86400000) acc.today++; if (Date.now() - activeAt <= 7 * 86400000) acc.week++; if (status.kind === "paid") acc.paid++; if (status.kind === "trial") acc.trial++; if (status.kind === "expired") acc.expired++; return acc; }, { total: 0, today: 0, week: 0, paid: 0, trial: 0, expired: 0 });
  const storage = adminUsers.reduce((sum, p) => sum + (p.firestoreBytes || 0), 0);
  const cloud = adminUsers.reduce((sum, p) => sum + (p.storageBytes || 0), 0);
  return (
    <>
      <Header title={t("admin")} right={<IconButton label={t("refresh")} onClick={refreshAdminUsers}><RefreshCw size={20} /></IconButton>} />
      <div className="space-y-5 px-5 lg:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{([{ label: t("users"), value: stats.total, filter: "all" }, { label: t("today"), value: stats.today, filter: "today" }, { label: t("thisWeek"), value: stats.week, filter: "week" }, { label: t("paid"), value: stats.paid, filter: "paid" }, { label: t("trial"), value: stats.trial, filter: "trial" }, { label: t("expired"), value: stats.expired, filter: "expired" }] as const).map((item) => <button key={item.filter} onClick={() => setView({ name: "admin-users", filter: item.filter, title: item.label })} className="rounded-lg border border-[#3a3a3c] bg-[#1e1e1e] p-4 text-left"><p className="text-3xl font-black text-[#ccff00]">{item.value}</p><p className="text-sm text-[#a0a0a5]">{item.label}</p></button>)}</div>
        <Card className="flex items-center gap-3"><Utensils className="text-[#ccff00]" /><div className="flex-1"><h3 className="font-black">{t("ingredientLibrarySingular")}</h3><p className="text-sm text-[#a0a0a5]">{ingredients.length} {t("ingredientsCount")}</p></div><Button variant="ghost" onClick={() => setView({ name: "ingredients" })}>{t("open")}</Button></Card>
        <Card><h3 className="mb-3 font-black">{t("firestoreStorage")}</h3><UsageBar used={storage} quotaGb={Number(adminAppConfig.storageQuotaGb) || 1} /><p className="mt-2 text-sm text-[#a0a0a5]">{t("estimatedFromUserDocuments")}</p></Card>
        <Card><h3 className="mb-3 font-black">{t("cloudinaryStorage")}</h3><UsageBar used={cloud} quotaGb={Number(adminAppConfig.cloudinaryStorageQuotaGb) || 25} /></Card>
        <Card className="space-y-3"><h3 className="font-black">{t("bakongPaymentSetup")}</h3><TextArea value={token} onChange={(e) => setToken(e.target.value)} placeholder={t("bakongTokenPlaceholder")} /><Field value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} placeholder={t("bakongProxyPlaceholder")} /><Field value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("expiryNotePlaceholder")} /><Button disabled={busy} onClick={() => run(async () => updateBakongToken(token, note, proxyUrl))}>{busy ? t("saving") : t("saveBakongTokenNote")}</Button></Card>
      </div>
    </>
  );
}

function UsageBar({ used, quotaGb }: { used: number; quotaGb: number }) {
  const { t } = useClients();
  const quota = quotaGb * 1024 * 1024 * 1024;
  const pct = quota ? Math.min((used / quota) * 100, 100) : 0;
  return <><div className="h-3 overflow-hidden rounded-full bg-[#121212]"><div className={cls("h-full rounded-full", pct > 90 ? "bg-[#ff453a]" : pct > 70 ? "bg-[#ff9800]" : "bg-[#4CAF50]")} style={{ width: `${pct}%` }} /></div><div className="mt-2 flex justify-between text-sm text-[#a0a0a5]"><span>{formatBytes(used)} {t("used")}</span><span>{quotaGb} GB {t("quota")}</span></div></>;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function AdminUsersScreen({ setView, filter, title }: { setView: (view: View) => void; filter: AdminFilter; title: string }) {
  const { adminUsers, updateUserProfile, updateUserSubscription, deleteUserData, t } = useClients();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const users = adminUsers.filter((profile) => {
    if (query && !profile.email?.toLowerCase().includes(query.toLowerCase())) return false;
    const activeAt = new Date(profile.lastActiveAt).getTime();
    const access = userAccess(profile, t).kind;
    if (filter === "today") return Date.now() - activeAt <= 86400000;
    if (filter === "week") return Date.now() - activeAt <= 7 * 86400000;
    if (filter === "paid") return access === "paid";
    if (filter === "trial") return access === "trial";
    if (filter === "expired") return access === "expired";
    return true;
  });
  return (
    <>
      <Header title={title} back={() => setView({ name: "admin" })} />
      <div className="space-y-4 px-5 lg:px-8"><Field value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchEmailPlaceholder")} />{users.map((profile) => { const access = userAccess(profile, t); return <button key={profile.uid} onClick={() => setSelected(profile)} className="w-full rounded-lg border border-[#3a3a3c] bg-[#1e1e1e] p-4 text-left"><div className="flex gap-3"><div className="min-w-0 flex-1"><h3 className="truncate font-black">{profile.email || t("emailNotSaved")}</h3><p className="text-xs text-[#a0a0a5]">{t("lastActive")}: {formatDate(profile.lastActiveAt)} | {profile.platform}</p><p className="text-xs text-[#a0a0a5]">{t("clientsLabel")}: {profile.clientCount || 0} | {t("recordsLabel")}: {profile.recordCount || 0} | {t("attendanceLabel")}: {profile.attendanceCount || 0}</p></div><span className="h-fit rounded border px-2 py-1 text-xs font-bold" style={{ borderColor: access.color, color: access.color }}>{access.label}</span></div></button>; })}</div>
      {selected && <AdminUserModal profile={selected} close={() => setSelected(null)} updateProfile={updateUserProfile} updateSubscription={updateUserSubscription} deleteData={deleteUserData} />}
    </>
  );
}

function userAccess(profile: UserProfile, t: (key: string) => string) {
  if (profile.blocked) return { label: t("blocked"), color: "#ff453a", kind: "blocked" };
  const status = getAccessStatus({ loseWeightCals: -500, gainMuscleCals: 300, gainWeightCals: 500, language: "en", trialStartedAt: profile.trialStartedAt, subscriptionExpiry: profile.subscriptionExpiry });
  if (!status.active) return { label: t("expired"), color: "#ff9800", kind: "expired" };
  if (status.type === "subscription") return { label: `${t("paid")} ${status.days}${t("daysShort")}`, color: "#ccff00", kind: "paid" };
  return { label: `${t("trial")} ${status.days}${t("daysShort")}`, color: "#4CAF50", kind: "trial" };
}

function AdminUserModal({ profile, close, updateProfile, updateSubscription, deleteData }: { profile: UserProfile; close: () => void; updateProfile: (uid: string, updates: Partial<UserProfile>) => Promise<void>; updateSubscription: (uid: string, sub?: string, trial?: string) => Promise<void>; deleteData: (uid: string) => Promise<void> }) {
  const { t } = useClients();
  const { busy, run } = useAsyncLock();
  const extend = (months: number) => run(async () => { const base = profile.subscriptionExpiry && new Date(profile.subscriptionExpiry) > new Date() ? new Date(profile.subscriptionExpiry) : new Date(); base.setMonth(base.getMonth() + months); await updateSubscription(profile.uid, base.toISOString(), profile.trialStartedAt); close(); });
  return <Modal title={profile.email || t("user")} close={close}><div className="grid grid-cols-2 gap-2"><Button disabled={busy} onClick={() => extend(1)}>{t("plusOneMonth")}</Button><Button disabled={busy} onClick={() => extend(3)}>{t("plusThreeMonths")}</Button><Button variant="ghost" disabled={busy} onClick={() => run(async () => { await updateSubscription(profile.uid, "", new Date().toISOString()); close(); })}>{t("resetTrial")}</Button><Button variant="danger" disabled={busy} onClick={() => run(async () => { await updateSubscription(profile.uid, "", new Date(Date.now() - (TRIAL_DAYS + 1) * 86400000).toISOString()); close(); })}>{t("expireUser")}</Button><Button variant="danger" disabled={busy} onClick={() => run(async () => { await updateProfile(profile.uid, { blocked: !profile.blocked }); close(); })}>{profile.blocked ? t("unblockUser") : t("blockUser")}</Button><Button variant="danger" disabled={busy} onClick={() => run(async () => { if (confirm(t("deleteUserDataConfirm"))) await deleteData(profile.uid); close(); })}>{t("deleteData")}</Button></div></Modal>;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const { t } = useClients();
  return (
    <div className="fixed inset-0 z-[100] grid place-items-end bg-black/75 p-0 sm:place-items-center sm:p-5">
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-[#3a3a3c] bg-[#1e1e1e] p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-black">{title}</h2>
          <IconButton label={t("close")} onClick={close}><X size={20} /></IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

function NotFound({ title, back }: { title: string; back: () => void }) {
  const { t } = useClients();
  return <><Header title={title} back={back} /><div className="px-5"><Card><p className="text-[#a0a0a5]">{t("nothingToShow")}</p></Card></div></>;
}

export default AppRoot;





