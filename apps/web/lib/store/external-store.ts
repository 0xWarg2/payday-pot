"use client";

import { useSyncExternalStore } from "react";

/**
 * Store tối giản trên `useSyncExternalStore`.
 *
 * Vì sao tự viết thay vì kéo zustand: version pin là hard rule và lockfile
 * không có nó. Nhưng lý do thật nằm ở `getServerSnapshot` — mọi store ở đây
 * BẮT BUỘC khai báo một snapshot phía server, và snapshot đó luôn là hằng số
 * "masked/rỗng". Đó là cách cơ chế hoá non-negotiable #5: không tồn tại đường
 * nào để một giá trị đã decrypt lọt vào HTML server render, kể cả khi người
 * viết component quên nghĩ về SSR.
 */
export interface ExternalStore<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  /**
   * Luôn trả về CÙNG MỘT reference. React so sánh bằng `Object.is` mỗi lần
   * render server; trả object mới sẽ thành vòng lặp vô hạn chứ không phải bug
   * hiển thị — nên hằng số này được truyền vào lúc tạo store, không dựng tại chỗ.
   */
  getServerSnapshot(): T;
}

export function createExternalStore<T>(initial: T, serverSnapshot: T = initial): ExternalStore<T> {
  let current = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => current,
    getServerSnapshot: () => serverSnapshot,
    set(next) {
      const value = typeof next === "function" ? (next as (prev: T) => T)(current) : next;
      if (Object.is(value, current)) return;
      current = value;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStore<T>(store: ExternalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.getServerSnapshot);
}
