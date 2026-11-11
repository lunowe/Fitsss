import { Cloud, CloudLightning, CloudRain, Snowflake, Sun, Wind, type LucideIcon } from "lucide-react";

import type { WeatherCondition } from "@/domain";

/** The icon per weather condition. A plain module, so server components can draw it too. */
export const CONDITION_ICON: Record<WeatherCondition, LucideIcon> = {
  clear: Sun,
  cloudy: Cloud,
  rain: CloudRain,
  snow: Snowflake,
  wind: Wind,
  storm: CloudLightning,
};
