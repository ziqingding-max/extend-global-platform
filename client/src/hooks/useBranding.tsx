/**
 * CP Branding Context & Provider
 *
 * Fetches branding data from the server based on the current subdomain,
 * and provides it to all child components via React Context.
 * Also injects CSS variables for dynamic theme coloring.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { cpTrpc } from "@/lib/cpPortalTrpc";
import {
  getCpSubdomain,
  applyCpBrandingColors,
  resetBrandingColors,
  type CpBrandingData,
} from "@/lib/cpBranding";

interface BrandingContextValue {
  /** The resolved branding data, or null if not on a CP domain / still loading */
  branding: CpBrandingData | null;
  /** True while the branding data is being fetched */
  loading: boolean;
  /** The detected CP subdomain, or null */
  subdomain: string | null;
  /** Whether we're on a CP-branded domain */
  isCpBranded: boolean;
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: null,
  loading: false,
  subdomain: null,
  isCpBranded: false,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const subdomain = useMemo(() => getCpSubdomain(), []);

  // Only fetch branding if we detected a CP subdomain
  const { data, isLoading } = cpTrpc.auth.branding.useQuery(
    { subdomain: subdomain! },
    {
      enabled: !!subdomain,
      staleTime: 30 * 60 * 1000, // Cache for 30 minutes
      retry: 1,
    }
  );

  // Apply CSS variables when branding data arrives
  useEffect(() => {
    if (data?.brandPrimaryColor) {
      applyCpBrandingColors(data.brandPrimaryColor);
    }
    return () => {
      resetBrandingColors();
    };
  }, [data?.brandPrimaryColor]);

  const value = useMemo<BrandingContextValue>(
    () => ({
      branding: data
        ? {
            companyName: data.companyName,
            logoUrl: data.logoUrl,
            primaryColor: data.brandPrimaryColor,
            subdomain: subdomain!,
          }
        : null,
      loading: isLoading,
      subdomain,
      isCpBranded: !!subdomain && !!data?.found,
    }),
    [data, isLoading, subdomain]
  );

  return (
    <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
  );
}

/**
 * Hook to access CP branding data from any component.
 */
export function useBranding() {
  return useContext(BrandingContext);
}
