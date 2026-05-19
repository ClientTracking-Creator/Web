export function calculateBMR(weightKG: number, heightCM: number, age: number, gender: "Male" | "Female") {
  if (!weightKG || !heightCM || heightCM <= 0 || !age) return 0;
  const base = 10 * weightKG + 6.25 * heightCM - 5 * age;
  return Math.round(gender === "Male" ? base + 5 : base - 161);
}

export function calculateBMI(weightKG: number, heightCM: number) {
  if (!weightKG || !heightCM || heightCM <= 0) return 0;
  const heightM = heightCM / 100;
  return Number((weightKG / (heightM * heightM)).toFixed(1));
}

export function getHealthyWeightRange(heightCM: number) {
  if (!heightCM || heightCM <= 0) return { min: 0, max: 0 };
  const heightM = heightCM / 100;
  return {
    min: Number((18.5 * heightM * heightM).toFixed(1)),
    max: Number((24.9 * heightM * heightM).toFixed(1)),
  };
}

export function calculateEstimatedWeeks(currentWeight: number, targetWeight: number, dailyCalorieDelta: number) {
  const weightDiff = Math.abs(currentWeight - targetWeight);
  if (weightDiff < 0.1) return 0;
  if (!dailyCalorieDelta) return "∞";
  const weeklyWeightChange = (Math.abs(dailyCalorieDelta) * 7) / 7700;
  return Math.ceil(weightDiff / weeklyWeightChange);
}

