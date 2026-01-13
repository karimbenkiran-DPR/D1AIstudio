
export enum Tab {
  GENERATE = 'GENERATE',
  ANGLES = 'ANGLES',
  HISTORY = 'HISTORY',
  ADMIN = 'ADMIN'
}

export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT_3_4 = '3:4',
  PORTRAIT_4_5 = '4:5',
  LANDSCAPE_4_3 = '4:3',
  PORTRAIT_9_16 = '9:16',
  LANDSCAPE_16_9 = '16:9'
}

export enum Resolution {
  RES_1K = '1K',
  RES_2K = '2K',
  RES_4K = '4K'
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  imageCount: number;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  systemInstruction?: string;
  timestamp: number;
  projectId?: string;
  projectName?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text?: string;
  image?: string;
}

export interface Session {
  id: string;
  name?: string; // Added for custom session naming
  timestamp: number;
  prompt: string; // The initial prompt
  systemInstruction: string;
  generatedImages: string[]; // URLs of initial images
  chatMessages: ChatMessage[]; // Refinement history
  aspectRatio: AspectRatio;
  resolution: Resolution;
  projectId?: string;
}

export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  password: string; // stored in plain text for this local demo only
  name: string;
  role: UserRole;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userEmail: string;
  action: 'GENERATE' | 'REFINE' | 'EDIT';
  prompt: string;
  details: string; // e.g., "3 images generated"
  thumbnailUrl?: string; // First image generated
  timestamp: number;
  projectId?: string;
  cost?: number; // Cost in USD
}

// Augment window for AI Studio helper by extending the expected AIStudio interface
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}
