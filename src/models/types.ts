export type GoalType = "Lose Weight" | "Gain Muscle" | "Maintain Weight" | "Gain Weight";

export interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
  age: number;
  gender: "Male" | "Female";
  heightCM: number;
  goal: GoalType;
  imageUri?: string;
  targetWeightKG?: number;
  customCalorieModifier?: number;
}

export interface ProgressRecord {
  id: string;
  clientId: string;
  date: string;
  currentWeightKG: number;
  bmi: number;
  notes: string;
  photoUris?: string[];
}

export interface FoodLibraryItem {
  id: string;
  category: "Protein" | "Carbs" | "Fats" | "Veggies" | "Fruits" | string;
  name: string;
  proteinBase: number;
  carbBase: number;
  fatBase: number;
  calsBase: number;
  notes?: string;
  icon?: string;
  imageUri?: string;
}

export interface AttendanceRecord {
  id: string;
  clientId: string;
  date: string;
  attended: boolean;
  notes?: string;
}

export interface PaymentRecord {
  id: string;
  clientId: string;
  amount: number;
  date: string;
  currency: string;
  note?: string;
}

export interface AppSettings {
  loseWeightCals: number;
  gainMuscleCals: number;
  gainWeightCals: number;
  language: "en" | "km";
  subscriptionExpiry?: string;
  trialStartedAt?: string;
  gymLogo?: string;
  gymName?: string;
  trainerName?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  createdAt: string;
  lastActiveAt: string;
  platform: string;
  appVersion: string;
  role: "admin" | "user";
  blocked?: boolean;
  trialStartedAt?: string;
  subscriptionExpiry?: string;
  clientCount?: number;
  recordCount?: number;
  ingredientCount?: number;
  attendanceCount?: number;
  firestoreBytes?: number;
  firestoreDocCount?: number;
  storageBytes?: number;
  storageUploadCount?: number;
  untrackedPhotoCount?: number;
  paymentCount?: number;
  dailyReads?: number;
  dailyWrites?: number;
}

export interface AdminAppConfig {
  adminEmails?: string[];
  maintenanceMessage?: string;
  forceUpdateVersion?: string;
  storageQuotaGb?: number;
  cloudinaryStorageQuotaGb?: number;
}

export interface BakongAdminConfig {
  bakongToken?: string;
  bakongNote?: string;
  updatedAt?: string;
  updatedBy?: string;
}

