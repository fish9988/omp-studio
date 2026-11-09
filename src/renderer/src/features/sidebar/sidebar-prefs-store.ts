// 侧栏客户端偏好与活动状态（对齐 pi-agent-desktop-more 的 pinnedChats 与 unreadSessionIds）：
// - pinnedIds：置顶的任务 ID 或历史会话 ID（持久化于 localStorage），在文件夹内与时间线下均置顶优先排序；
// - unreadTaskIds：在后台运行完成、用户尚未点开查看的任务 ID，展示未读呼吸圆点与折叠文件夹未读计数，选中后自动清除。
import { createStore, useStoreValue } from "../../store/create-store.ts";

const PINNED_STORAGE_KEY = "omp-studio:pinned-ids";
const UNREAD_STORAGE_KEY = "omp-studio:unread-tasks";

function readStoredSet(key: string): ReadonlySet<string> {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((item): item is string => typeof item === "string" && item !== ""));
    }
  } catch {
    // 忽略 localStorage 读取异常
  }
  return new Set();
}

function writeStoredSet(key: string, set: ReadonlySet<string>): void {
  try {
    if (set.size === 0) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, JSON.stringify([...set]));
  } catch {
    // 忽略配额异常
  }
}

interface SidebarPrefsState {
  pinnedIds: ReadonlySet<string>;
  unreadTaskIds: ReadonlySet<string>;
}

const store = createStore<SidebarPrefsState>({
  pinnedIds: readStoredSet(PINNED_STORAGE_KEY),
  unreadTaskIds: readStoredSet(UNREAD_STORAGE_KEY),
});

export function usePinnedIds(): ReadonlySet<string> {
  return useStoreValue(store, (state) => state.pinnedIds);
}

export function useUnreadTaskIds(): ReadonlySet<string> {
  return useStoreValue(store, (state) => state.unreadTaskIds);
}

export function isItemPinned(id: string): boolean {
  return store.get().pinnedIds.has(id);
}

export function toggleItemPinned(id: string): boolean {
  const current = store.get().pinnedIds;
  const next = new Set(current);
  const nowPinned = !next.has(id);
  if (nowPinned) next.add(id);
  else next.delete(id);
  writeStoredSet(PINNED_STORAGE_KEY, next);
  store.set({ ...store.get(), pinnedIds: next });
  return nowPinned;
}

export function markTasksUnread(ids: readonly string[]): void {
  if (ids.length === 0) return;
  const current = store.get().unreadTaskIds;
  const next = new Set(current);
  let changed = false;
  for (const id of ids) {
    if (!next.has(id)) {
      next.add(id);
      changed = true;
    }
  }
  if (!changed) return;
  writeStoredSet(UNREAD_STORAGE_KEY, next);
  store.set({ ...store.get(), unreadTaskIds: next });
}

export function clearTaskUnread(id: string): void {
  const current = store.get().unreadTaskIds;
  if (!current.has(id)) return;
  const next = new Set(current);
  next.delete(id);
  writeStoredSet(UNREAD_STORAGE_KEY, next);
  store.set({ ...store.get(), unreadTaskIds: next });
}
