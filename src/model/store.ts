import { useCallback, useReducer } from 'react';
import type { Diagram } from './types';

interface State {
  past: Diagram[];
  present: Diagram;
  future: Diagram[];
  lastKey?: string;
  lastTime: number;
}

type Action =
  | { type: 'commit'; fn: (d: Diagram) => Diagram; key?: string; time: number }
  | { type: 'replace'; fn: (d: Diagram) => Diagram }
  | { type: 'load'; doc: Diagram }
  | { type: 'undo' }
  | { type: 'redo' };

const LIMIT = 120;
const COALESCE_MS = 900;

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'commit': {
      const next = a.fn(s.present);
      if (next === s.present) return s;
      if (a.key && a.key === s.lastKey && a.time - s.lastTime < COALESCE_MS) {
        return { ...s, present: next, lastTime: a.time, future: [] };
      }
      return {
        past: [...s.past, s.present].slice(-LIMIT),
        present: next,
        future: [],
        lastKey: a.key,
        lastTime: a.time,
      };
    }
    case 'replace': {
      const next = a.fn(s.present);
      return next === s.present ? s : { ...s, present: next };
    }
    case 'load':
      return { past: [], present: a.doc, future: [], lastKey: undefined, lastTime: 0 };
    case 'undo': {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return {
        past: s.past.slice(0, -1),
        present: prev,
        future: [s.present, ...s.future],
        lastKey: undefined,
        lastTime: 0,
      };
    }
    case 'redo': {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return { past: [...s.past, s.present], present: next, future: rest, lastKey: undefined, lastTime: 0 };
    }
  }
}

export interface ChangeOptions {
  /** consecutive changes with the same key within a short window share one undo step */
  key?: string;
  /** update without creating an undo step (used mid-drag) */
  replace?: boolean;
}

export type ChangeFn = (fn: (d: Diagram) => Diagram, opts?: ChangeOptions) => void;

export function useDiagramStore(initial: () => Diagram) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    past: [],
    present: initial(),
    future: [],
    lastTime: 0,
  }));

  const change: ChangeFn = useCallback((fn, opts) => {
    if (opts?.replace) dispatch({ type: 'replace', fn });
    else dispatch({ type: 'commit', fn, key: opts?.key, time: Date.now() });
  }, []);

  return {
    doc: state.present,
    change,
    load: useCallback((doc: Diagram) => dispatch({ type: 'load', doc }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
