import React, { useState, useEffect } from 'react';
import { authenticateUser, getAppConfig } from '../services/db';
import { User } from '../types';
import { Loader2, Layout, Lock, Mail, Eye, EyeOff, CheckSquare, Square, User as UserIcon } from 'lucide-react';

interface LoginViewProps {
    onLogin: (user: User, remember: boolean) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [appName, setAppName] = useState('DPR AI Studio');

    useEffect(() => {
        setAppName(getAppConfig().appName);
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Artificial delay for effect
            await new Promise(r => setTimeout(r, 800));
            
            const user = await authenticateUser(identifier, password);
            if (user) {
                onLogin(user, rememberMe);
            } else {
                setError('Invalid credentials');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = () => {
        alert("Please contact your administrator to reset your password.");
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                
                {/* Decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600"></div>
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl"></div>

                <div className="flex flex-col items-center mb-8 relative z-10">
                    <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center border border-zinc-700 shadow-lg mb-4">
                       <Layout className="w-6 h-6 text-purple-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-zinc-100">Welcome Back</h1>
                    <p className="text-zinc-500 text-sm mt-1">Sign in to {appName}</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4 relative z-10">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Email or Name</label>
                        <div className="relative">
                            <UserIcon className="absolute left-3 top-3 w-5 h-5 text-zinc-600" />
                            <input 
                                type="text" 
                                value={identifier}
                                onChange={e => setIdentifier(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500 transition-all placeholder:text-zinc-700"
                                placeholder="name@company.com or Name"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 w-5 h-5 text-zinc-600" />
                            <input 
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-10 pr-12 py-3 text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500 transition-all placeholder:text-zinc-700"
                                placeholder="••••••••"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 transition-colors"
                                title={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                         <div 
                            className="flex items-center gap-2 cursor-pointer group"
                            onClick={() => setRememberMe(!rememberMe)}
                         >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${rememberMe ? 'bg-purple-600 border-purple-600' : 'border-zinc-600 group-hover:border-zinc-400'}`}>
                                {rememberMe && <CheckSquare className="w-3 h-3 text-white" />}
                            </div>
                            <span className="text-xs text-zinc-400 group-hover:text-zinc-300 select-none">
                                Se souvenir de moi (1h)
                            </span>
                         </div>

                        <button
                            type="button"
                            onClick={handleForgotPassword}
                            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                        >
                            Mot de passe oublié ?
                        </button>
                    </div>

                    {error && (
                        <div className="text-red-400 text-sm bg-red-900/10 border border-red-900/50 p-3 rounded-lg text-center">
                            {error}
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
                    </button>

                    <div className="mt-6 text-center text-xs text-zinc-600">
                        <p>Demo Credentials:</p>
                        <p>Admin: <span className="text-zinc-400">Karim / 1234</span></p>
                    </div>
                </form>
            </div>
        </div>
    );
}