/**
 * Storage adapter — swap `backend` for a server-backed implementation later
 * (same get/set/remove(key) => Promise contract) without touching callers.
 */
class LocalStorageBackend {
  async get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  async set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  async remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
}

const backend = new LocalStorageBackend();

export const storage = {
  get: (key) => backend.get(key),
  set: (key, value) => backend.set(key, value),
  remove: (key) => backend.remove(key),
};
