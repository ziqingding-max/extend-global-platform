/**
 * CP Context Store — Global Admin-side Context Switcher (Task Group B)
 *
 * Manages the currently selected Channel Partner context for the Admin panel.
 * When a CP is selected, all core list pages (Customers, Employees, Invoices)
 * automatically filter data to that CP's scope.
 *
 * Modes:
 * - "all"       → No filter, show all data across all CPs (default)
 * - "specific"  → Filter to a specific CP by channelPartnerId
 * - "direct"    → Filter to EG-DIRECT (isInternal=true CP, channelPartnerId=null for customers)
 *
 * Persistence: Saved to sessionStorage so it survives page refreshes within a session
 * but resets when the browser tab is closed.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type CpContextMode = "all" | "specific" | "direct";

export interface CpContextState {
  /** Current mode */
  mode: CpContextMode;
  /** Selected CP ID (only meaningful when mode === "specific") */
  cpId: number | null;
  /** Selected CP name for display purposes */
  cpName: string | null;
  /** Whether the selected CP is internal (EG-DIRECT) */
  isInternal: boolean;

  /** Switch to "All CPs" mode */
  setAll: () => void;
  /** Switch to a specific CP */
  setCp: (cpId: number, cpName: string, isInternal: boolean) => void;
  /** Switch to EG-DIRECT mode */
  setDirect: (cpId: number) => void;
  /** Reset to default (all) */
  reset: () => void;

  /**
   * Helper: Get the channelPartnerId value to pass to backend queries.
   * - "all" mode → undefined (no filter)
   * - "specific" mode → cpId (number)
   * - "direct" mode → null (EG-DIRECT customers have no CP intermediary)
   */
  getFilterValue: () => number | null | undefined;
}

export const useCpContext = create<CpContextState>()(
  persist(
    (set, get) => ({
      mode: "all",
      cpId: null,
      cpName: null,
      isInternal: false,

      setAll: () =>
        set({ mode: "all", cpId: null, cpName: null, isInternal: false }),

      setCp: (cpId, cpName, isInternal) => {
        if (isInternal) {
          // EG-DIRECT CP → use "direct" mode
          set({ mode: "direct", cpId, cpName, isInternal: true });
        } else {
          set({ mode: "specific", cpId, cpName, isInternal: false });
        }
      },

      setDirect: (cpId) =>
        set({ mode: "direct", cpId, cpName: "EG-DIRECT", isInternal: true }),

      reset: () =>
        set({ mode: "all", cpId: null, cpName: null, isInternal: false }),

      getFilterValue: () => {
        const state = get();
        switch (state.mode) {
          case "all":
            return undefined;
          case "specific":
            return state.cpId;
          case "direct":
            return null; // EG-DIRECT customers have channelPartnerId = null
          default:
            return undefined;
        }
      },
    }),
    {
      name: "eg-cp-context",
      storage: createJSONStorage(() => sessionStorage),
      // Only persist serializable fields, not functions
      partialize: (state) => ({
        mode: state.mode,
        cpId: state.cpId,
        cpName: state.cpName,
        isInternal: state.isInternal,
      }),
    }
  )
);
