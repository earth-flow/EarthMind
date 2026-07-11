import {
  BASE_URL_API,
  HEALTH_CHECK_URL,
} from "@/customization/config-constants";

export function getBaseUrl(): string {
  return BASE_URL_API || `${window.location.origin}/api/v1/`;
}

export function getHealthCheckUrl(): string {
  return HEALTH_CHECK_URL || `${window.location.origin}/health`;
}

export const EarthMindButtonRedirectTarget = () => {
  return "https://earthmind.org";
};
