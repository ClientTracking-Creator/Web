"use client";

import { ADMIN_EMAILS } from "@/constants/admin";
import { db } from "@/config/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  AdminAppConfig,
  AppSettings,
  AttendanceRecord,
  BakongAdminConfig,
  Client,
  FoodLibraryItem,
  PaymentRecord,
  PaymentRequest,
  ProgressRecord,
  UserProfile,
} from "@/models/types";
import { defaultIngredients } from "@/utils/defaultIngredients";
import { translations } from "@/utils/i18n";
import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

type ClientContextType = {
  clients: Client[];
  records: ProgressRecord[];
  ingredients: FoodLibraryItem[];
  attendance: AttendanceRecord[];
  payments: PaymentRecord[];
  paymentRequests: PaymentRequest[];
  settings: AppSettings;
  settingsLoaded: boolean;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  adminUsers: UserProfile[];
  adminAppConfig: AdminAppConfig;
  bakongConfig: BakongAdminConfig;
  t: (key: string) => string;
  addClient: (client: Client) => Promise<void>;
  editClient: (client: Client) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  addRecord: (record: ProgressRecord) => Promise<void>;
  editRecord: (record: ProgressRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  addIngredient: (item: FoodLibraryItem) => Promise<void>;
  editIngredient: (item: FoodLibraryItem) => Promise<void>;
  deleteIngredient: (id: string) => Promise<void>;
  restoreDefaultIngredients: () => Promise<void>;
  toggleAttendance: (clientId: string, date: string, notes?: string, forceStatus?: boolean) => Promise<void>;
  deleteAttendance: (id: string) => Promise<void>;
  addPayment: (payment: PaymentRecord) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  addPaymentRequest: (request: PaymentRequest) => Promise<void>;
  approvePaymentRequest: (request: PaymentRequest) => Promise<void>;
  rejectPaymentRequest: (request: PaymentRequest) => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  refreshAdminUsers: () => Promise<void>;
  updateUserProfile: (uid: string, updates: Partial<UserProfile>) => Promise<void>;
  updateUserSubscription: (uid: string, subscriptionExpiry?: string, trialStartedAt?: string) => Promise<void>;
  deleteUserData: (uid: string) => Promise<void>;
  updateAdminAppConfig: (config: AdminAppConfig) => Promise<void>;
  updateBakongToken: (token: string, note?: string, proxyUrl?: string) => Promise<void>;
};

const ClientContext = createContext<ClientContextType | null>(null);

const initialSettings: AppSettings = { loseWeightCals: -500, gainMuscleCals: 300, gainWeightCals: 500, language: "en" };

const normalizeEmails = (emails: string[]) => Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)));

const cleanData = <T extends object>(obj: T) => {
  const copy = { ...obj } as Record<string, unknown>;
  Object.keys(copy).forEach((key) => copy[key] === undefined && delete copy[key]);
  return copy as T;
};

const estimateBytes = (path: string, data: unknown) => {
  try {
    return new Blob([`${path}:${JSON.stringify(data || {})}`]).size;
  } catch {
    return path.length;
  }
};

const getAdminEmailsFromData = (data: Record<string, unknown>) => {
  const emails: string[] = [];
  if (Array.isArray(data.adminEmails)) emails.push(...data.adminEmails.map(String));
  if (Array.isArray(data.emails)) emails.push(...data.emails.map(String));
  if (typeof data.adminEmail === "string") emails.push(data.adminEmail);
  if (typeof data.email === "string") emails.push(data.email);
  return normalizeEmails(emails);
};

export function ClientProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [records, setRecords] = useState<ProgressRecord[]>([]);
  const [ingredients, setIngredients] = useState<FoodLibraryItem[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [adminAppConfig, setAdminAppConfig] = useState<AdminAppConfig>({});
  const [startAdminEmails, setStartAdminEmails] = useState<string[]>([]);
  const [bakongConfig, setBakongConfig] = useState<BakongAdminConfig>({});

  const fallbackAdminEmails = normalizeEmails(ADMIN_EMAILS);
  const configAdminEmails = normalizeEmails(adminAppConfig.adminEmails || []);
  const firebaseAdminEmails = normalizeEmails([...configAdminEmails, ...startAdminEmails]);
  const allAdminEmails = normalizeEmails([...fallbackAdminEmails, ...firebaseAdminEmails]);
  const isAdmin = user?.email ? allAdminEmails.includes(user.email.toLowerCase()) : false;

  useEffect(() => {
    if (!user) {
      setClients([]);
      setRecords([]);
      setIngredients([]);
      setAttendance([]);
      setPayments([]);
      setPaymentRequests([]);
      setSettings(initialSettings);
      setSettingsLoaded(false);
      setUserProfile(null);
      setAdminUsers([]);
      return;
    }

    const uid = user.uid;
    const profileRef = doc(db, "users", uid);
    const now = new Date().toISOString();
    const baseProfile: UserProfile = {
      uid,
      email: user.email || "",
      createdAt: now,
      lastActiveAt: now,
      platform: "web",
      appVersion: "web-1.0.0",
      role: isAdmin ? "admin" : "user",
      blocked: false,
    };

    getDoc(profileRef).then((snap) => {
      if (snap.exists()) {
        setDoc(profileRef, {
          email: user.email || "",
          lastActiveAt: now,
          platform: "web",
          appVersion: "web-1.0.0",
          role: isAdmin ? "admin" : "user",
        }, { merge: true });
      } else {
        setDoc(profileRef, baseProfile);
      }
    });

    const unsubProfile = onSnapshot(profileRef, (snap) => setUserProfile(snap.exists() ? snap.data() as UserProfile : baseProfile));
    const unsubClients = onSnapshot(collection(db, "users", uid, "clients"), (snap) => setClients(snap.docs.map((d) => d.data() as Client)));
    const unsubRecords = onSnapshot(collection(db, "users", uid, "records"), (snap) => setRecords(snap.docs.map((d) => d.data() as ProgressRecord)));
    const unsubAttendance = onSnapshot(collection(db, "users", uid, "attendance"), (snap) => setAttendance(snap.docs.map((d) => d.data() as AttendanceRecord)));
    const unsubPayments = onSnapshot(collection(db, "users", uid, "payments"), (snap) => setPayments(snap.docs.map((d) => d.data() as PaymentRecord)));
    const unsubSettings = onSnapshot(doc(db, "users", uid, "settings", "app_settings"), (snap) => {
      const localBranding = typeof window === "undefined" ? null : localStorage.getItem(`branding_${uid}`);
      const branding = localBranding ? JSON.parse(localBranding) : {};
      if (snap.exists()) {
        const cloudSettings = snap.data() as AppSettings;
        const next = { ...initialSettings, ...cloudSettings, ...branding };
        setSettings(next);
        setDoc(profileRef, { trialStartedAt: next.trialStartedAt || "", subscriptionExpiry: next.subscriptionExpiry || "" }, { merge: true });
      } else {
        const next = { ...initialSettings, trialStartedAt: user.emailVerified ? new Date().toISOString() : undefined, ...branding };
        setSettings(next);
        setDoc(doc(db, "users", uid, "settings", "app_settings"), next);
      }
      setSettingsLoaded(true);
    });
    const unsubIngredients = onSnapshot(collection(db, "users", uid, "ingredients"), (snap) => {
      if (snap.empty) {
        defaultIngredients.forEach((ing) => setDoc(doc(db, "users", uid, "ingredients", ing.id), ing));
      } else {
        setIngredients(snap.docs.map((d) => d.data() as FoodLibraryItem));
      }
    });
    const unsubStorage = onSnapshot(collection(db, "users", uid, "storage_uploads"), (snap) => {
      const storageBytes = snap.docs.reduce((total, uploadDoc) => total + (Number(uploadDoc.data().bytes) || 0), 0);
      setDoc(profileRef, { storageBytes, storageUploadCount: snap.size, lastActiveAt: new Date().toISOString() }, { merge: true });
    });

    return () => {
      unsubProfile();
      unsubClients();
      unsubRecords();
      unsubAttendance();
      unsubPayments();
      unsubSettings();
      unsubIngredients();
      unsubStorage();
    };
  }, [user, user?.emailVerified, isAdmin]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "start"), (snap) => {
      setStartAdminEmails(normalizeEmails(snap.docs.flatMap((document) => getAdminEmailsFromData(document.data()))));
    }, () => setStartAdminEmails([]));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "admin_config", "app"), (snap) => {
      setAdminAppConfig(snap.exists() ? snap.data() as AdminAppConfig : { adminEmails: ADMIN_EMAILS });
    });
  }, [user]);

  useEffect(() => {
    if (!isAdmin) {
      setAdminUsers([]);
      setPaymentRequests([]);
      return;
    }
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setAdminUsers(snap.docs.map((d) => d.data() as UserProfile).sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()));
    });
    const unsubBakong = onSnapshot(doc(db, "admin", "config"), (snap) => setBakongConfig(snap.exists() ? snap.data() as BakongAdminConfig : {}));
    const unsubPaymentRequests = onSnapshot(collectionGroup(db, "paymentRequests"), (snap) => {
      setPaymentRequests(snap.docs.map((d) => d.data() as PaymentRequest).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    });
    return () => {
      unsubUsers();
      unsubBakong();
      unsubPaymentRequests();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!user || !settingsLoaded) return;
    const timeout = window.setTimeout(() => {
      const uid = user.uid;
      const firestoreBytes =
        estimateBytes(`users/${uid}`, userProfile) +
        estimateBytes(`users/${uid}/settings/app_settings`, settings) +
        clients.reduce((t, c) => t + estimateBytes(`users/${uid}/clients/${c.id}`, c), 0) +
        records.reduce((t, r) => t + estimateBytes(`users/${uid}/records/${r.id}`, r), 0) +
        ingredients.reduce((t, i) => t + estimateBytes(`users/${uid}/ingredients/${i.id}`, i), 0) +
        attendance.reduce((t, a) => t + estimateBytes(`users/${uid}/attendance/${a.id}`, a), 0) +
        payments.reduce((t, p) => t + estimateBytes(`users/${uid}/payments/${p.id}`, p), 0);
      setDoc(doc(db, "users", uid), {
        clientCount: clients.length,
        recordCount: records.length,
        ingredientCount: ingredients.length,
        attendanceCount: attendance.length,
        paymentCount: payments.length,
        firestoreBytes,
        firestoreDocCount: 2 + clients.length + records.length + ingredients.length + attendance.length + payments.length,
        dailyReads: clients.length * 25 + records.length * 10 + ingredients.length * 2 + attendance.length * 10 + payments.length * 5 + 150,
        dailyWrites: Math.max(5, Math.floor(records.length / 3) + Math.floor(attendance.length / 3) + Math.floor(payments.length / 3) + 10),
        lastActiveAt: new Date().toISOString(),
      }, { merge: true });
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [user, settingsLoaded, clients.length, records.length, ingredients.length, attendance.length, payments.length]);

  const assertUser = () => {
    if (!user) throw new Error("Login required");
    return user.uid;
  };

  const assertAdmin = () => {
    if (!user || !isAdmin) throw new Error("Admin access required");
  };

  const actions = useMemo(() => ({
    addClient: (client: Client) => setDoc(doc(db, "users", assertUser(), "clients", client.id), cleanData(client)),
    editClient: (client: Client) => setDoc(doc(db, "users", assertUser(), "clients", client.id), cleanData(client)),
    deleteClient: async (id: string) => {
      const uid = assertUser();
      await deleteDoc(doc(db, "users", uid, "clients", id));
      await Promise.all(records.filter((r) => r.clientId === id).map((r) => deleteDoc(doc(db, "users", uid, "records", r.id))));
    },
    addRecord: (record: ProgressRecord) => setDoc(doc(db, "users", assertUser(), "records", record.id), cleanData(record)),
    editRecord: (record: ProgressRecord) => setDoc(doc(db, "users", assertUser(), "records", record.id), cleanData(record)),
    deleteRecord: (id: string) => deleteDoc(doc(db, "users", assertUser(), "records", id)),
    addIngredient: (item: FoodLibraryItem) => setDoc(doc(db, "users", assertUser(), "ingredients", item.id), cleanData(item)),
    editIngredient: (item: FoodLibraryItem) => setDoc(doc(db, "users", assertUser(), "ingredients", item.id), cleanData(item)),
    deleteIngredient: (id: string) => deleteDoc(doc(db, "users", assertUser(), "ingredients", id)),
    restoreDefaultIngredients: async () => {
      const uid = assertUser();
      await Promise.all(defaultIngredients.map((ing) => setDoc(doc(db, "users", uid, "ingredients", ing.id), ing)));
    },
    toggleAttendance: async (clientId: string, date: string, notes?: string, forceStatus?: boolean) => {
      const uid = assertUser();
      const existing = attendance.find((a) => a.clientId === clientId && a.date === date);
      const id = existing ? existing.id : `${clientId}_${date}`;
      await setDoc(doc(db, "users", uid, "attendance", id), {
        id,
        clientId,
        date,
        attended: forceStatus !== undefined ? forceStatus : existing ? !existing.attended : true,
        notes: notes ?? existing?.notes ?? "",
      });
    },
    deleteAttendance: (id: string) => deleteDoc(doc(db, "users", assertUser(), "attendance", id)),
    addPayment: (payment: PaymentRecord) => setDoc(doc(db, "users", assertUser(), "payments", payment.id), cleanData(payment)),
    deletePayment: (id: string) => deleteDoc(doc(db, "users", assertUser(), "payments", id)),
    addPaymentRequest: (request: PaymentRequest) => {
      const uid = assertUser();
      return setDoc(doc(db, "users", uid, "paymentRequests", request.id), cleanData({ ...request, uid }));
    },
    approvePaymentRequest: async (request: PaymentRequest) => {
      assertAdmin();
      const settingsRef = doc(db, "users", request.uid, "settings", "app_settings");
      const settingsSnap = await getDoc(settingsRef);
      const profileSnap = await getDoc(doc(db, "users", request.uid));
      const currentExpiry = (settingsSnap.exists() ? settingsSnap.data().subscriptionExpiry : "") || (profileSnap.exists() ? profileSnap.data().subscriptionExpiry : "");
      const base = currentExpiry && new Date(currentExpiry) > new Date() ? new Date(currentExpiry) : new Date();
      const expiry = new Date(base);
      expiry.setMonth(expiry.getMonth() + request.months);
      const update = { subscriptionExpiry: expiry.toISOString() };
      await setDoc(settingsRef, update, { merge: true });
      await setDoc(doc(db, "users", request.uid), update, { merge: true });
      await setDoc(doc(db, "users", request.uid, "paymentRequests", request.id), {
        status: "approved",
        reviewedAt: new Date().toISOString(),
        reviewedBy: user?.uid,
      }, { merge: true });
    },
    rejectPaymentRequest: async (request: PaymentRequest) => {
      assertAdmin();
      await setDoc(doc(db, "users", request.uid, "paymentRequests", request.id), {
        status: "rejected",
        reviewedAt: new Date().toISOString(),
        reviewedBy: user?.uid,
      }, { merge: true });
    },
    updateSettings: async (next: AppSettings) => {
      const uid = assertUser();
      setSettings(next);
      const branding = { gymLogo: next.gymLogo || "", gymName: next.gymName || "", trainerName: next.trainerName || "" };
      localStorage.setItem(`branding_${uid}`, JSON.stringify(branding));
      const { gymLogo, gymName, trainerName, ...cloudSettings } = next;
      await setDoc(doc(db, "users", uid, "settings", "app_settings"), cloudSettings);
      await setDoc(doc(db, "users", uid), {
        gymLogo: deleteField(),
        gymName: deleteField(),
        trainerName: deleteField(),
        trialStartedAt: next.trialStartedAt || "",
        subscriptionExpiry: next.subscriptionExpiry || "",
      }, { merge: true });
    },
    refreshAdminUsers: async () => {
      if (!isAdmin) return;
      const usersSnap = await getDocs(collection(db, "users"));
      const settingsSnap = await getDocs(collectionGroup(db, "settings"));
      const ids = new Set<string>();
      usersSnap.docs.forEach((d) => ids.add(d.id));
      settingsSnap.docs.forEach((d) => d.id === "app_settings" && d.ref.parent.parent && ids.add(d.ref.parent.parent.id));
      const profiles = await Promise.all([...ids].map(async (uid) => {
        const profileSnap = await getDoc(doc(db, "users", uid));
        return { uid, ...(profileSnap.exists() ? profileSnap.data() : {}) } as UserProfile;
      }));
      setAdminUsers(profiles);
    },
    updateUserProfile: async (uid: string, updates: Partial<UserProfile>) => {
      assertAdmin();
      await setDoc(doc(db, "users", uid), updates, { merge: true });
    },
    updateUserSubscription: async (uid: string, subscriptionExpiry?: string, trialStartedAt?: string) => {
      assertAdmin();
      const update: Partial<AppSettings> = {};
      if (subscriptionExpiry !== undefined) update.subscriptionExpiry = subscriptionExpiry;
      if (trialStartedAt !== undefined) update.trialStartedAt = trialStartedAt;
      await setDoc(doc(db, "users", uid, "settings", "app_settings"), update, { merge: true });
      await setDoc(doc(db, "users", uid), update, { merge: true });
    },
    deleteUserData: async (uid: string) => {
      assertAdmin();
      for (const collectionName of ["clients", "records", "ingredients", "attendance", "payments"]) {
        const snap = await getDocs(collection(db, "users", uid, collectionName));
        await Promise.all(snap.docs.map((document) => deleteDoc(document.ref)));
      }
    },
    updateAdminAppConfig: async (config: AdminAppConfig) => {
      assertAdmin();
      const nextConfig = {
        ...config,
        adminEmails: normalizeEmails(config.adminEmails || []),
        storageQuotaGb: Number(config.storageQuotaGb) > 0 ? Number(config.storageQuotaGb) : 1,
        cloudinaryStorageQuotaGb: Number(config.cloudinaryStorageQuotaGb) > 0 ? Number(config.cloudinaryStorageQuotaGb) : 25,
      };
      await setDoc(doc(db, "admin_config", "app"), nextConfig, { merge: true });
      await setDoc(doc(db, "start", "admin"), { adminEmails: nextConfig.adminEmails, updatedAt: new Date().toISOString(), updatedBy: user?.uid }, { merge: true });
    },
    updateBakongToken: async (token: string, note?: string, proxyUrl?: string) => {
      assertAdmin();
      const nextProxyUrl = proxyUrl?.trim() || "";
      await setDoc(doc(db, "admin", "config"), {
        bakongToken: token.trim(),
        bakongNote: note?.trim() || "",
        bakongProxyUrl: nextProxyUrl,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
      }, { merge: true });

      // Normal users typically cannot read admin/config due to Firestore rules.
      // Mirror the proxy URL into admin_config/app so the subscription screen can verify payment.
      await setDoc(doc(db, "admin_config", "app"), { bakongProxyUrl: nextProxyUrl }, { merge: true });
    },
  }), [user, isAdmin, records, attendance]);

  const t = (key: string) => {
    const dictionary = translations[settings.language] || translations.en;
    return (dictionary as Record<string, string>)[key] || (translations.en as Record<string, string>)[key] || key;
  };

  return (
    <ClientContext.Provider value={{
      clients,
      records,
      ingredients,
      attendance,
      payments,
      paymentRequests,
      settings,
      settingsLoaded,
      userProfile,
      isAdmin,
      adminUsers,
      adminAppConfig: { ...adminAppConfig, adminEmails: firebaseAdminEmails },
      bakongConfig,
      t,
      ...actions,
    }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClients() {
  const context = useContext(ClientContext);
  if (!context) throw new Error("useClients must be used within ClientProvider");
  return context;
}
