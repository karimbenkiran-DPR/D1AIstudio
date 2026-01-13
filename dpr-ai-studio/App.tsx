
import React, { useState, useEffect } from 'react';
import { Tab, User } from './types';
import { GenerateView } from './components/GenerateView';
import { HistoryView } from './components/HistoryView';
import { LoginView } from './components/LoginView';
import { AdminView } from './components/AdminView';
import { AnglesView } from './components/AnglesView';
import { Sparkles, History, Layout, ShieldCheck, LogOut, Box, Wallet } from 'lucide-react';
import { getConsumedCredits, EVENT_CREDITS_UPDATED, formatCurrency } from './services/credits';
import { getUserByEmail, getAppConfig, EVENT_CONFIG_UPDATED } from './services/db';

const TOTAL_BUDGET = 800.00;

// Default user to bypass login
const DEFAULT_USER: User = {
    id: 'karim-benkiran',
    email: 'karim.benkiran@dprgroup.com',
    password: '1234',
    name: 'Karim',
    role: 'admin'
};

export default function App() {
  // Auth State - Defaulted to Karim to skip login screen
  const [currentUser, setCurrentUser] = useState<User | null>(DEFAULT_USER);
  const [loadingSession, setLoadingSession] = useState(true);

  // App State
  const [activeTab, setActiveTab] = useState<Tab>(Tab.GENERATE);
  const [totalCost, setTotalCost] = useState(0);
  const [appConfig, setAppConfig] = useState(getAppConfig());

  // State for jumping from History to Generate
  const [historyJumpImage, setHistoryJumpImage] = useState<string | null>(null);
  
  // State for jumping from Generate to Angles
  const [anglesJumpImage, setAnglesJumpImage] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
        // 1. Costs
        setTotalCost(getConsumedCredits());
        
        // 2. Load latest config
        const cfg = getAppConfig();
        setAppConfig(cfg);
        document.title = cfg.appName;
        
        setLoadingSession(false);
    };

    init();

    // Listen for updates
    const handleCostUpdate = () => {
      setTotalCost(getConsumedCredits());
    };
    
    const handleConfigUpdate = () => {
        const cfg = getAppConfig();
        setAppConfig(cfg);
        document.title = cfg.appName;
    };

    window.addEventListener(EVENT_CREDITS_UPDATED, handleCostUpdate);
    window.addEventListener(EVENT_CONFIG_UPDATED, handleConfigUpdate);

    return () => {
        window.removeEventListener(EVENT_CREDITS_UPDATED, handleCostUpdate);
        window.removeEventListener(EVENT_CONFIG_UPDATED, handleConfigUpdate);
    };
  }, []);

  const handleLogout = () => {
      // In this "No Login" version, logout just resets the tab
      setActiveTab(Tab.GENERATE);
      alert("Identification removed. You are browsing as " + currentUser?.name);
  };

  const handleHistoryJump = (imageUrl: string) => {
      setHistoryJumpImage(imageUrl);
      setActiveTab(Tab.GENERATE);
  };

  const handleJumpToAngles = (imageUrl: string) => {
      setAnglesJumpImage(imageUrl);
      setActiveTab(Tab.ANGLES);
  };

  if (loadingSession) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950">
            <div className="animate-pulse flex flex-col items-center">
                <Layout className="w-10 h-10 text-purple-500 mb-4" />
                <p className="text-zinc-500 text-sm">Loading Studio...</p>
            </div>
        </div>
      );
  }

  const remainingBudget = TOTAL_BUDGET - totalCost;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 font-sans selection:bg-purple-500/30">
      
      {/* Decorative Top Gradient Line */}
      <div className="h-1.5 w-full bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 fixed top-0 z-50"></div>

      {/* Navigation Bar */}
      <nav className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800 pt-1.5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            
            {/* Logo & Branding - Clickable to go to Generate */}
            <div 
                className="flex items-center gap-3 cursor-pointer transition-opacity hover:opacity-80" 
                onClick={() => setActiveTab(Tab.GENERATE)}
                title="Go to Home"
            >
                <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-tr from-purple-600 to-pink-600 rounded-lg blur opacity-30 group-hover:opacity-75 transition duration-200"></div>
                    <div className="relative w-9 h-9 bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-700 shadow-xl overflow-hidden">
                       {appConfig.logoUrl ? (
                           <img src={appConfig.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                       ) : (
                           <Layout className="w-5 h-5 text-purple-400" />
                       )}
                    </div>
                </div>
                <div>
                    <h1 className="text-lg font-bold text-zinc-100 tracking-tight leading-none">
                        {appConfig.appName}
                    </h1>
                    <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                        Creative Suite <span className="text-zinc-600 mx-1">|</span> {currentUser?.name}
                    </p>
                </div>
            </div>

            {/* Right Side: Credits & User */}
            <div className="flex items-center gap-4">
                
                {/* Budget Counter */}
                <div className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 pr-4 pl-1.5 py-1.5 rounded-full shadow-sm">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center border ${remainingBudget < 10 ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
                        <Wallet className={`w-3.5 h-3.5 ${remainingBudget < 10 ? 'text-red-500' : 'text-green-500'}`} />
                    </div>
                    <div className="flex flex-col leading-none">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Budget</span>
                        <span className={`text-sm font-bold ${remainingBudget < 0 ? 'text-red-400' : 'text-zinc-200'}`}>
                            {formatCurrency(remainingBudget)}
                        </span>
                    </div>
                </div>

                <button 
                    onClick={handleLogout}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded-lg transition-colors"
                    title="Reset Session"
                >
                    <LogOut className="w-5 h-5" />
                </button>
            </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Intro Text */}
        <div className="mb-8">
            <p className="text-zinc-400 text-lg">
              Create and Edit images using the latest Gemini Pro & Flash models.
            </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-zinc-800 mb-8 overflow-x-auto pb-1">
            <button
            onClick={() => setActiveTab(Tab.GENERATE)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-t-lg transition-all font-medium text-sm whitespace-nowrap border-b-2 ${
                activeTab === Tab.GENERATE
                ? 'border-purple-500 text-purple-400 bg-purple-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
            >
            <Sparkles className="w-4 h-4" />
            Generate
            </button>
            <button
            onClick={() => setActiveTab(Tab.ANGLES)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-t-lg transition-all font-medium text-sm whitespace-nowrap border-b-2 ${
                activeTab === Tab.ANGLES
                ? 'border-orange-500 text-orange-400 bg-orange-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
            >
            <Box className="w-4 h-4" />
            Angles
            </button>
            <button
            onClick={() => setActiveTab(Tab.HISTORY)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-t-lg transition-all font-medium text-sm whitespace-nowrap border-b-2 ${
                activeTab === Tab.HISTORY
                ? 'border-zinc-500 text-zinc-200 bg-zinc-800/50'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
            >
            <History className="w-4 h-4" />
            History
            </button>

            {/* Admin Tab - Only visible to admin role */}
            {currentUser?.role === 'admin' && (
                <button
                onClick={() => setActiveTab(Tab.ADMIN)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-t-lg transition-all font-medium text-sm whitespace-nowrap border-b-2 ${
                    activeTab === Tab.ADMIN
                    ? 'border-green-500 text-green-400 bg-green-500/5'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                >
                <ShieldCheck className="w-4 h-4" />
                Admin
                </button>
            )}
        </div>

        {/* Views */}
        <div className="animate-in fade-in duration-300 slide-in-from-bottom-2">
            {activeTab === Tab.GENERATE && (
                <GenerateView 
                    currentUser={currentUser!} 
                    initialImage={historyJumpImage} 
                    onConsumeInitialImage={() => setHistoryJumpImage(null)}
                    onJumpToAngles={handleJumpToAngles}
                />
            )}
            {activeTab === Tab.ANGLES && (
                <AnglesView 
                    currentUser={currentUser!}
                    initialSourceImage={anglesJumpImage}
                    onConsumeInitialSource={() => setAnglesJumpImage(null)}
                />
            )}
            {activeTab === Tab.HISTORY && <HistoryView onJumpToGen={handleHistoryJump} onJumpToAngles={handleJumpToAngles} />}
            {activeTab === Tab.ADMIN && currentUser?.role === 'admin' && <AdminView />}
        </div>
      </main>
    </div>
  );
}
