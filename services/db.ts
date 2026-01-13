
import { GeneratedImage, Session, User, ActivityLog, Project } from "../types";

const DB_NAME = 'GeminiStudioDB';
const STORE_IMAGES = 'image_history';
const STORE_SESSIONS = 'chat_sessions';
const STORE_USERS = 'users';
const STORE_LOGS = 'activity_logs';
const STORE_PROJECTS = 'projects';
const DB_VERSION = 10; 

// --- App Configuration (Branding) ---
export const CONFIG_KEY = 'dpr_app_config';
export const EVENT_CONFIG_UPDATED = 'dpr_config_updated';

export interface AppConfig {
    appName: string;
    logoUrl?: string; // Base64 string
}

export const getAppConfig = (): AppConfig => {
    try {
        const stored = localStorage.getItem(CONFIG_KEY);
        return stored ? JSON.parse(stored) : { appName: 'DPR AI Studio' };
    } catch {
        return { appName: 'DPR AI Studio' };
    }
};

export const saveAppConfig = (config: AppConfig) => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    // Dispatch event for reactive UI updates
    window.dispatchEvent(new Event(EVENT_CONFIG_UPDATED));
};

// --- IndexedDB Initialization ---

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const tx = (e.target as IDBOpenDBRequest).transaction;
      
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
      
      let userStore;
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        userStore = db.createObjectStore(STORE_USERS, { keyPath: 'email' }); // Email as key
      } else {
        userStore = tx?.objectStore(STORE_USERS);
      }

      // cleanup old users if they exist
      if (userStore) {
        // We attempt to delete the deprecated users
        try {
            userStore.delete('admin@dpr.studio');
            userStore.delete('collab@dpr.studio');
        } catch(e) { /* ignore if not found */ }

        // Ensure specific users exist
        try {
            userStore.put({
                id: 'karim-benkiran',
                email: 'karim.benkiran@dprgroup.com',
                password: '1234',
                name: 'Karim',
                role: 'admin'
            } as User);
            
            userStore.put({
                id: 'ilyass-eladani',
                email: 'ilyass.eladani@dprgroup.ma',
                password: '1234',
                name: 'Ilyass',
                role: 'user'
            } as User);

            // New Test Users
            userStore.put({
                id: 'test-user-1',
                email: 'test1@dpr.com',
                password: 'USER1',
                name: 'Test User 1',
                role: 'user'
            } as User);

            userStore.put({
                id: 'test-user-2',
                email: 'test2@dpr.com',
                password: 'USER2',
                name: 'Test User 2',
                role: 'user'
            } as User);
        } catch (e) {
            console.log("Users might already exist");
        }
      }
      
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        db.createObjectStore(STORE_LOGS, { keyPath: 'id' });
      }

      let projStore;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        projStore = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        projStore.add({
            id: 'project-general',
            name: 'General',
            createdAt: Date.now(),
            imageCount: 0
        } as Project);
      } else {
        projStore = tx?.objectStore(STORE_PROJECTS);
      }

      if (projStore) {
        const newProjects = [
            'Danette',
            'Danone',
            'BMCI',
            'JTI',
            'FRMG'
        ];
        
        newProjects.forEach(name => {
             const id = `project-${name.toLowerCase().replace(/\s+/g, '-')}`;
             // Try to get first to avoid overwriting existing data if possible, 
             // but inside upgradeneeded we can't async wait easily. 
             // We use put which updates or inserts.
             try {
                 projStore.put({
                     id: id,
                     name: name,
                     createdAt: Date.now(),
                     imageCount: 0
                 } as Project);
             } catch (e) { console.error(e); }
        });
      }
    };
  });
};

// --- Project Methods ---

export const getProjects = async (): Promise<Project[]> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, 'readonly');
        const store = tx.objectStore(STORE_PROJECTS);
        const request = store.getAll();
        request.onsuccess = () => {
            let projects = request.result as Project[];
            // Sort: General first, then Alphabetical
            projects.sort((a, b) => {
                if (a.id === 'project-general') return -1;
                if (b.id === 'project-general') return 1;
                return a.name.localeCompare(b.name);
            });
            resolve(projects);
        };
        request.onerror = () => reject(request.error);
    });
};

export const createProject = async (name: string): Promise<Project> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, 'readwrite');
        const store = tx.objectStore(STORE_PROJECTS);
        const newProject: Project = {
            id: crypto.randomUUID(),
            name,
            createdAt: Date.now(),
            imageCount: 0
        };
        const request = store.add(newProject);
        request.onsuccess = () => resolve(newProject);
        request.onerror = () => reject(request.error);
    });
};

export const deleteProject = async (id: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, 'readwrite');
        const store = tx.objectStore(STORE_PROJECTS);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const incrementProjectImageCount = async (projectId: string, amount: number = 1): Promise<void> => {
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_PROJECTS, 'readwrite');
        const store = tx.objectStore(STORE_PROJECTS);
        const getReq = store.get(projectId);
        
        getReq.onsuccess = () => {
            const project = getReq.result as Project;
            if (project) {
                project.imageCount = (project.imageCount || 0) + amount;
                store.put(project);
            }
        };
    } catch (e) {
        console.error("Failed to update project stats", e);
    }
};

// --- Auth Methods ---

export const authenticateUser = async (identifier: string, password: string): Promise<User | null> => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_USERS, 'readonly');
            const store = tx.objectStore(STORE_USERS);
            
            // We need to check both Email and Name.
            // Since 'email' is the key, we can try to get by key first.
            // If not found, we scan for name.
            
            const request = store.getAll(); // Get all users to check name or email
            
            request.onsuccess = () => {
                const users = request.result as User[];
                const found = users.find(u => 
                    (u.email.toLowerCase() === identifier.toLowerCase() || 
                     u.name.toLowerCase() === identifier.toLowerCase()) && 
                    u.password === password
                );
                
                resolve(found || null);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error("Auth error", e);
        return null;
    }
}

export const getUserByEmail = async (email: string): Promise<User | null> => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_USERS, 'readonly');
            const store = tx.objectStore(STORE_USERS);
            const request = store.get(email);

            request.onsuccess = () => {
                const user = request.result as User;
                resolve(user || null);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error("Get user error", e);
        return null;
    }
};

export const createUser = async (user: User): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_USERS, 'readwrite');
        const store = tx.objectStore(STORE_USERS);
        // Check if email exists
        const checkReq = store.get(user.email);
        checkReq.onsuccess = () => {
            if (checkReq.result) {
                reject(new Error("User with this email already exists"));
            } else {
                 const request = store.add(user);
                 request.onsuccess = () => resolve();
                 request.onerror = () => reject(request.error);
            }
        };
        checkReq.onerror = () => reject(checkReq.error);
    });
};

export const updateUser = async (user: User, oldEmail?: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_USERS, 'readwrite');
        const store = tx.objectStore(STORE_USERS);

        // If email changed, we must delete the old record and create a new one
        // because key (email) is immutable in indexedDB object stores
        if (oldEmail && oldEmail !== user.email) {
            const delReq = store.delete(oldEmail);
            delReq.onsuccess = () => {
                const addReq = store.add(user);
                addReq.onsuccess = () => resolve();
                addReq.onerror = () => reject(addReq.error);
            };
            delReq.onerror = () => reject(delReq.error);
        } else {
            // Normal update
            const request = store.put(user);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        }
    });
};

export const deleteUser = async (email: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_USERS, 'readwrite');
        const store = tx.objectStore(STORE_USERS);
        const request = store.delete(email);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getUsers = async (): Promise<User[]> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_USERS, 'readonly');
        const store = tx.objectStore(STORE_USERS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

// --- Activity Log Methods ---

export const logActivity = async (userId: string, userEmail: string, action: ActivityLog['action'], prompt: string, details: string, thumbnail?: string, projectId?: string, cost?: number): Promise<void> => {
    try {
        const db = await initDB();
        const log: ActivityLog = {
            id: crypto.randomUUID(),
            userId,
            userEmail,
            action,
            prompt,
            details,
            thumbnailUrl: thumbnail,
            timestamp: Date.now(),
            projectId,
            cost: cost || 0
        };
        
        const tx = db.transaction(STORE_LOGS, 'readwrite');
        tx.objectStore(STORE_LOGS).add(log);
    } catch (e) {
        console.error("Failed to log activity", e);
    }
}

export const getAllActivityLogs = async (): Promise<ActivityLog[]> => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_LOGS, 'readonly');
            const request = tx.objectStore(STORE_LOGS).getAll();
            
            request.onsuccess = () => {
                const results = request.result as ActivityLog[];
                resolve(results.sort((a, b) => b.timestamp - a.timestamp));
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        return [];
    }
}

// --- Image History Methods ---

export const saveImageToHistory = async (image: GeneratedImage): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, 'readwrite');
      const store = tx.objectStore(STORE_IMAGES);
      const request = store.add(image);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to save image to history", error);
  }
};

export const getImageHistory = async (): Promise<GeneratedImage[]> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, 'readonly');
      const store = tx.objectStore(STORE_IMAGES);
      const request = store.getAll();

      request.onsuccess = () => {
        // Return newest first
        const results = request.result as GeneratedImage[];
        resolve(results.sort((a, b) => b.timestamp - a.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to get image history", error);
    return [];
  }
};

export const deleteImageFromHistory = async (id: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_IMAGES, 'readwrite');
        const store = tx.objectStore(STORE_IMAGES);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// --- Session Methods ---

export const saveSession = async (session: Session): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readwrite');
      const store = tx.objectStore(STORE_SESSIONS);
      const request = store.put(session); // Use put to handle both add and update

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to save session", error);
  }
};

export const getSessions = async (): Promise<Session[]> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const store = tx.objectStore(STORE_SESSIONS);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result as Session[];
        resolve(results.sort((a, b) => b.timestamp - a.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to get sessions", error);
    return [];
  }
};

export const deleteSession = async (id: string): Promise<void> => {
  const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SESSIONS, 'readwrite');
        const store = tx.objectStore(STORE_SESSIONS);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};