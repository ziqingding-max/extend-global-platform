/**
 * useCpBranding — React hook for CP white-label branding
 *
 * Detects if the current domain is a CP subdomain, fetches branding data
 * from the public API, and applies CSS variable overrides for Shadcn UI.
 *
 * Usage:
 *   const { branding, isCp, loading } = useCpBranding();
 *   // branding.companyName, branding.logoUrl, branding.primaryColor
 */
import { useState, useEffect } from "react";
import { getCpSubdomain, applyCpBrandingColors, resetBrandingColors, type CpBrandingData } from "@/lib/cpBranding";

interface CpBrandingState {
  branding: CpBrandingData | null;
  isCp: boolean;
  loading: boolean;
  error: string | null;
}

export function useCpBranding(): CpBrandingState {
  const subdomain = getCpSubdomain();
  const [state, setState] = useState<CpBrandingState>({
    branding: null,
    isCp: !!subdomain,
    loading: !!subdomain,
    error: null,
  });

  useEffect(() => {
    if (!subdomain) {
      resetBrandingColors();
      setState({ branding: null, isCp: false, loading: false, error: null });
      return;
    }

    let cancelled = false;

    async function fetchBranding() {
      try {
        const res = await fetch(`/api/public/branding/${subdomain}`);
        if (!res.ok) {
          throw new Error(`Branding fetch failed: ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;

        const branding: CpBrandingData = {
          companyName: data.companyName,
          logoUrl: data.logoUrl,
          primaryColor: data.brandPrimaryColor,
          subdomain: data.subdomain,
        };

        // Apply CSS variable overrides
        applyCpBrandingColors(branding.primaryColor);

        setState({
          branding,
          isCp: true,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch CP branding:", err);
        setState({
          branding: null,
          isCp: true,
          loading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    fetchBranding();

    return () => {
      cancelled = true;
      resetBrandingColors();
    };
  }, [subdomain]);

  return state;
}
