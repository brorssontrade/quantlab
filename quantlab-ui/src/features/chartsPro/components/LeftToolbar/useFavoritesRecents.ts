/**
 * useFavoritesRecents.ts
 * 
 * TV-20.13: State management for LeftToolbar Favorites + Recents
 * 
 * Features:
 * - Favorites: User-starred tools (visible immediately in toolbar)
 * - Recents: Last N used tools (quick access without opening flyouts)
 * - localStorage persistence under key "cp.leftToolbar"
 * - Exposed via dump().ui.leftToolbar for QA
 * 
 * Better workflow than TradingView:
 * - Favorited tools appear directly in main toolbar (no flyout needed)
 * - Recent tools visible in dedicated section (TradingView hides these)
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import type { Tool } from "../../state/controls";

const STORAGE_KEY = "cp.leftToolbar";
const MAX_RECENTS = 5;

export interface LeftToolbarState {
  favorites: string[];
  recents: string[];
}

const DEFAULT_STATE: LeftToolbarState = {
  favorites: [],
  recents: [],
};

/**
 * Load state from localStorage with validation
 */
function loadState(): LeftToolbarState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_STATE;
    
    const parsed = JSON.parse(stored);
    
    // Validate structure
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray(parsed.favorites) ||
      !Array.isArray(parsed.recents)
    ) {
      console.warn("[useFavoritesRecents] Invalid stored state, resetting");
      return DEFAULT_STATE;
    }
    
    // Filter to only valid strings
    return {
      favorites: parsed.favorites.filter((f: unknown) => typeof f === "string"),
      recents: parsed.recents.filter((r: unknown) => typeof r === "string").slice(0, MAX_RECENTS),
    };
  } catch (e) {
    console.warn("[useFavoritesRecents] Failed to load state:", e);
    return DEFAULT_STATE;
  }
}

/**
 * Save state to localStorage
 */
function saveState(state: LeftToolbarState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("[useFavoritesRecents] Failed to save state:", e);
  }
}

/**
 * Hook for managing favorites and recents
 * 
 * @returns State and actions for managing favorites/recents
 */
export function useFavoritesRecents() {
  const [state, setState] = useState<LeftToolbarState>(DEFAULT_STATE);
  const [initialized, setInitialized] = useState(false);
  
  // Load from localStorage on mount
  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    setInitialized(true);
  }, []);
  
  // Save to localStorage on state change (after initialization)
  useEffect(() => {
    if (initialized) {
      saveState(state);
    }
  }, [state, initialized]);
  
  /**
   * Toggle favorite status for a tool
   */
  const toggleFavorite = useCallback((toolId: string) => {
    setState(prev => {
      const isFavorite = prev.favorites.includes(toolId);
      const newFavorites = isFavorite
        ? prev.favorites.filter(f => f !== toolId)
        : [...prev.favorites, toolId];
      
      return { ...prev, favorites: newFavorites };
    });
  }, []);
  
  /**
   * Check if a tool is favorited
   */
  const isFavorite = useCallback((toolId: string) => {
    return state.favorites.includes(toolId);
  }, [state.favorites]);
  
  /**
   * Record a tool as recently used
   * - Moves to front if already in recents
   * - Trims to MAX_RECENTS
   * - Excludes "select" tool (always available)
   */
  const recordRecent = useCallback((toolId: string) => {
    // Don't track select tool - it's always available
    if (toolId === "select") return;
    
    setState(prev => {
      // Remove if already present
      const filtered = prev.recents.filter(r => r !== toolId);
      // Add to front, trim to max
      const newRecents = [toolId, ...filtered].slice(0, MAX_RECENTS);
      
      return { ...prev, recents: newRecents };
    });
  }, []);
  
  /**
   * Clear all favorites
   */
  const clearFavorites = useCallback(() => {
    setState(prev => ({ ...prev, favorites: [] }));
  }, []);
  
  /**
   * Clear all recents
   */
  const clearRecents = useCallback(() => {
    setState(prev => ({ ...prev, recents: [] }));
  }, []);
  
  /**
   * Get current state for dump()
   */
  const dumpState = useMemo((): LeftToolbarState => ({
    favorites: [...state.favorites],
    recents: [...state.recents],
  }), [state.favorites, state.recents]);
  
  return {
    favorites: state.favorites,
    recents: state.recents,
    toggleFavorite,
    isFavorite,
    recordRecent,
    clearFavorites,
    clearRecents,
    dumpState,
    initialized,
  };
}

export type UseFavoritesRecentsReturn = ReturnType<typeof useFavoritesRecents>;
