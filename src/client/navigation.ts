import { useSyncExternalStore } from 'react'

export type ModuleId = 'workbench' | 'knowledge' | 'creator';
export interface NavigationState {
  active: ModuleId | null;
  focused: boolean;
  visited: readonly ModuleId[];
}
export interface Navigation {
  getSnapshot(): NavigationState;
  subscribe(listener: () => void): () => void;
  open(id: ModuleId): void;
  chat(): void;
  toggleFocus(): void;
}

/** One runtime-owned navigation store; individual plugins keep their own drafts. */
export function createNavigation(selectPanel?: (active: ModuleId | null) => void): Navigation {
  let state: NavigationState = { active: null, focused: false, visited: [] };
  const listeners = new Set<() => void>();
  function publish(next: NavigationState): void { state = next; for (const listener of listeners) listener(); }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open(id) {
      if (!['workbench', 'knowledge', 'creator'].includes(id)) throw new Error('UNKNOWN_MODULE');
      if (state.active === id) return;
      selectPanel?.(id);
      publish({ active: id, focused: false, visited: state.visited.includes(id) ? state.visited : [...state.visited, id] });
    },
    chat() { if (state.active) { publish({ ...state, active: null, focused: false }); selectPanel?.(null); } },
    toggleFocus() { if (state.active) publish({ ...state, focused: !state.focused }); },
  };
}

export function useNavigation(navigation: Navigation): NavigationState {
  return useSyncExternalStore(navigation.subscribe, navigation.getSnapshot, navigation.getSnapshot)
}
