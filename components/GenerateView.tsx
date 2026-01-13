import React, { useState, useRef, useEffect } from 'react';
import { AspectRatio, Resolution, GeneratedImage, ChatMessage, Session, User, Project } from '../types';
import { generateImages, refineImage } from '../services/gemini';
import { saveImageToHistory, saveSession, getSessions, deleteSession, logActivity, getProjects, incrementProjectImageCount } from '../services/db';
import { addConsumedCredits, PRICE_PER_IMAGE_PRO, PRICE_PER_IMAGE_4K, formatCurrency } from '../services/credits';
import { Loader2, Plus, Trash2, Download, Image as ImageIcon, Sparkles, MessageSquare, Send, Save, X, ChevronDown, Paperclip, Frame, LayoutGrid, Folder, Pencil, Check, Box, DollarSign, Monitor, RefreshCw, Target } from 'lucide-react';
import { ImageDetailModal } from './ImageDetailModal';

interface SavedInstruction {
  id: string;
  name: string;
  content: string;
}

interface GenerateViewProps {
    currentUser: User;
    initialImage?: string | null;
    onConsumeInitialImage?: () => void;
    onJumpToAngles?: (imageUrl: string) => void;
}

const ACTIVE_SESSION_KEY = 'dpr_active_session_id';

export const GenerateView: React.FC<GenerateViewProps> = ({ currentUser, initialImage, onConsumeInitialImage, onJumpToAngles }) => {
  // --- Global State ---
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  // --- Generation State ---
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [systemInstruction, setSystemInstruction] = useState('');
  const [instructionTitle, setInstructionTitle] = useState(''); 
  const [savedInstructions, setSavedInstructions] = useState<SavedInstruction[]>([]);
  
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [resolution, setResolution] = useState<Resolution>(Resolution.RES_1K);
  const [refImages, setRefImages] = useState<File[]>([]);
  const [generatedResults, setGeneratedResults] = useState<string[]>([]);
  
  const [activeContextImage, setActiveContextImage] = useState<string | null>(null);
  const [activeRequests, setActiveRequests] = useState(0); 
  const MAX_CONCURRENT = 2;
  const [error, setError] = useState<string | null>(null);

  // --- Chat/Refine State ---
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Modal State ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedImageForModal, setSelectedImageForModal] = useState<string | null>(null);

  // Load saved instructions and sessions on mount
  useEffect(() => {
    let loadedInstructions: SavedInstruction[] = [];
    const saved = localStorage.getItem('gemini_sys_instructions');
    if (saved) {
      try { loadedInstructions = JSON.parse(saved); } catch (e) { console.error(e); }
    }
    
    const marocInstruction = {
        id: 'inst-maroc-default',
        name: 'visages marocains',
        content: "tous les visages doivent etre marocains, toutes les scenes se passent au Maroc, les personnages sont modernes et les femmes ne sont pas voilées sauf si c'est demandé dans le prompt. Le rendu des images doit etre professionnel et publicitaire."
    };
    
    if (!loadedInstructions.find(i => i.name === 'visages marocains')) {
        loadedInstructions.push(marocInstruction);
        localStorage.setItem('gemini_sys_instructions', JSON.stringify(loadedInstructions));
    }
    
    setSavedInstructions(loadedInstructions);
    loadData(loadedInstructions);
  }, []);

  useEffect(() => {
    if (initialImage && onConsumeInitialImage) {
        setSelectedImageForModal(initialImage);
        setIsModalOpen(true);
        onConsumeInitialImage();
    }
  }, [initialImage, onConsumeInitialImage]);

  const loadData = async (currentInstructions?: SavedInstruction[]) => {
    const s = await getSessions();
    const p = await getProjects();
    setSessions(s);
    setProjects(p);
    
    if (p.length > 0 && !selectedProjectId) setSelectedProjectId(p[0].id);

    const lastSessionId = localStorage.getItem(ACTIVE_SESSION_KEY);
    let sessionToLoad = lastSessionId ? s.find(session => session.id === lastSessionId) : s[0];

    if (sessionToLoad) {
        handleSelectSession(sessionToLoad);
    }
  };

  const handleNewSession = () => {
    setCurrentSessionId(null);
    setPrompt('');
    setSystemInstruction('');
    setInstructionTitle('');
    setGeneratedResults([]);
    setChatMessages([]);
    setActiveContextImage(null);
    setRefImages([]);
    setAspectRatio(AspectRatio.SQUARE);
    setResolution(Resolution.RES_1K);
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  };

  const handleSelectSession = (session: Session) => {
    setCurrentSessionId(session.id);
    setPrompt(session.prompt);
    setSystemInstruction(session.systemInstruction);
    setGeneratedResults(session.generatedImages);
    setChatMessages(session.chatMessages);
    setAspectRatio(session.aspectRatio);
    setResolution(session.resolution);
    if (session.projectId) setSelectedProjectId(session.projectId);
    
    const foundInst = savedInstructions.find(i => i.content === session.systemInstruction);
    setInstructionTitle(foundInst ? foundInst.name : '');

    let lastImg = null;
    if (session.chatMessages.length > 0) {
        for (let i = session.chatMessages.length - 1; i >= 0; i--) {
            if (session.chatMessages[i].image) { lastImg = session.chatMessages[i].image; break; }
        }
    }
    if (!lastImg && session.generatedImages.length > 0) {
        lastImg = session.generatedImages[session.generatedImages.length - 1];
    }
    setActiveContextImage(lastImg || null);
    localStorage.setItem(ACTIVE_SESSION_KEY, session.id);
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Supprimer cette session ?")) {
        await deleteSession(id);
        setSessions(prev => prev.filter(s => s.id !== id));
        if (currentSessionId === id) handleNewSession();
    }
  };

  const handleGenerate = async () => {
    if (!prompt || !selectedProjectId || activeRequests >= MAX_CONCURRENT) return;
    setActiveRequests(prev => prev + 1);
    setError(null);
    
    let sessionIdToUse = currentSessionId || crypto.randomUUID();
    setCurrentSessionId(sessionIdToUse);

    try {
      const results = await generateImages(prompt, systemInstruction, [...refImages], aspectRatio, resolution);
      if (results.length === 0) {
        setError('Prompt bloqué ou service occupé.');
      } else {
        setGeneratedResults(prev => [...prev, ...results]);
        setActiveContextImage(results[results.length - 1]);
        const cost = results.length * (resolution === Resolution.RES_4K ? PRICE_PER_IMAGE_4K : PRICE_PER_IMAGE_PRO);
        addConsumedCredits(cost);
        await incrementProjectImageCount(selectedProjectId, results.length);
        const existingSession = sessions.find(s => s.id === sessionIdToUse);
        const sessionToSave: Session = {
            id: sessionIdToUse, 
            timestamp: Date.now(),
            prompt, systemInstruction,
            generatedImages: existingSession ? [...existingSession.generatedImages, ...results] : results,
            chatMessages: existingSession ? existingSession.chatMessages : [], 
            aspectRatio, resolution, projectId: selectedProjectId
        };
        await saveSession(sessionToSave);
        localStorage.setItem(ACTIVE_SESSION_KEY, sessionIdToUse);
        setSessions(prev => {
            const exists = prev.find(s => s.id === sessionToSave.id);
            if (exists) return prev.map(s => s.id === sessionToSave.id ? sessionToSave : s);
            return [sessionToSave, ...prev];
        });
        results.forEach(url => saveImageToHistory({ id: crypto.randomUUID(), url, prompt, systemInstruction, timestamp: Date.now(), projectId: selectedProjectId }));
      }
    } catch (err: any) { setError(err.message || "Erreur de génération."); } finally { setActiveRequests(prev => prev - 1); }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    let sourceImage = activeContextImage || (generatedResults.length > 0 ? generatedResults[generatedResults.length - 1] : null);
    if (!sourceImage) { setError("Générez une image d'abord."); return; }
    
    setIsRefining(true);
    const text = chatInput;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');

    try {
        const result = await refineImage(text, sourceImage, systemInstruction, undefined, undefined, Resolution.RES_1K);
        if (result) {
            addConsumedCredits(PRICE_PER_IMAGE_PRO);
            const modelMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', image: result };
            setChatMessages(prev => [...prev, modelMsg]);
            setActiveContextImage(result);
            if (currentSessionId) {
                const sess = sessions.find(s => s.id === currentSessionId);
                if (sess) {
                    const upSess = { ...sess, chatMessages: [...sess.chatMessages, userMsg, modelMsg] };
                    await saveSession(upSess);
                    setSessions(prev => prev.map(s => s.id === upSess.id ? upSess : s));
                }
            }
        }
    } catch (err) { console.error(err); } finally { setIsRefining(false); }
  };

  const handleImageDoubleClick = (imageUrl: string) => {
    setSelectedImageForModal(imageUrl);
    setIsModalOpen(true);
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  return (
    <div className="relative flex flex-col min-h-screen">
      
      {/* --- TOP BAR: Config Center --- */}
      <div className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800 p-4 mb-8 -mt-8 mx-[-1rem] lg:mx-0 rounded-b-3xl shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 items-center">
            <div className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 rounded-2xl px-4 py-2 w-full md:w-auto">
                <Folder className="w-4 h-4 text-blue-400" />
                <select
                    value={selectedProjectId}
                    onChange={(e) => { setSelectedProjectId(e.target.value); handleNewSession(); }}
                    className="bg-transparent text-sm text-zinc-200 outline-none font-medium min-w-[140px]"
                >
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            </div>

            <div className="h-8 w-px bg-zinc-800 hidden md:block"></div>

            <div className="flex-1 flex items-center gap-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl px-4 py-2 w-full">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <select
                    onChange={(e) => {
                        const found = savedInstructions.find(i => i.id === e.target.value);
                        if (found) { setSystemInstruction(found.content); setInstructionTitle(found.name); }
                    }}
                    className="bg-transparent text-xs text-zinc-400 outline-none border-r border-zinc-800 pr-4"
                    value={savedInstructions.find(i => i.content === systemInstruction)?.id || ""}
                >
                    <option value="">Presets Instructions</option>
                    {savedInstructions.map((inst) => <option key={inst.id} value={inst.id}>{inst.name}</option>)}
                </select>
                <input 
                    type="text" 
                    value={systemInstruction} 
                    onChange={e => setSystemInstruction(e.target.value)} 
                    placeholder="Instructions globales (ex: style publicitaire, visages marocains...)"
                    className="bg-transparent text-sm text-zinc-200 outline-none flex-1 placeholder:text-zinc-600"
                />
                <button 
                    onClick={() => {
                        const name = window.prompt("Nom du preset :") || "Sans titre";
                        const updated = [...savedInstructions, { id: Date.now().toString(), name, content: systemInstruction }];
                        setSavedInstructions(updated);
                        localStorage.setItem('gemini_sys_instructions', JSON.stringify(updated));
                    }}
                    className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors group"
                >
                    <Save className="w-4 h-4 text-zinc-500 group-hover:text-purple-400" />
                </button>
            </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1 pb-48">
        
        {/* --- LEFT: Session Sidebar --- */}
        <aside className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-4">
            <button 
                onClick={handleNewSession}
                className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 py-3.5 rounded-2xl font-bold transition-all border border-zinc-700 shadow-lg"
            >
                <Plus className="w-5 h-5" /> <span>Nouveau Concept</span>
            </button>
            
            <div className="flex-1 max-h-[calc(100vh-380px)] overflow-y-auto bg-zinc-900/20 rounded-3xl border border-zinc-800/50 p-3 space-y-2">
                {sessions.filter(s => (s.projectId || 'project-general') === selectedProjectId).map(session => (
                    <div 
                        key={session.id}
                        onClick={() => handleSelectSession(session)}
                        className={`group relative flex items-start gap-3 p-3 rounded-2xl cursor-pointer transition-all border ${currentSessionId === session.id ? 'bg-zinc-800 border-purple-500/50 shadow-xl' : 'hover:bg-zinc-800/40 border-transparent hover:border-zinc-800'}`}
                    >
                        <div className="w-10 h-10 rounded-xl bg-black flex-shrink-0 overflow-hidden border border-zinc-700">
                            {session.generatedImages[0] ? <img src={session.generatedImages[0]} className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-zinc-700 m-auto mt-2.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-zinc-200 truncate pr-4">{session.prompt || "Sans titre"}</p>
                            <p className="text-[10px] text-zinc-500 mt-1">{new Date(session.timestamp).toLocaleDateString()}</p>
                        </div>
                        <button onClick={(e) => handleDeleteSession(session.id, e)} className="absolute right-2 top-2 p-1.5 text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                ))}
            </div>
        </aside>

        {/* --- MAIN CONTENT: Grid & Chat --- */}
        <div className="flex-1 flex flex-col gap-10">
            {/* Résultats de génération */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-3">
                        <ImageIcon className="w-6 h-6 text-zinc-500" /> 
                        Planche de résultats
                    </h2>
                    {activeRequests > 0 && <span className="flex items-center gap-2 text-xs font-bold text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full animate-pulse"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Génération active...</span>}
                </div>

                {generatedResults.length === 0 ? (
                    <div className="h-80 flex flex-col items-center justify-center bg-zinc-900/10 rounded-3xl border-2 border-zinc-800/50 border-dashed">
                        <LayoutGrid className="w-16 h-16 text-zinc-800 mb-4" />
                        <p className="text-zinc-500 text-sm font-medium">Utilisez la barre en bas pour lancer une création</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {generatedResults.map((img, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => setActiveContextImage(img)}
                                onDoubleClick={() => handleImageDoubleClick(img)}
                                className={`group relative aspect-square rounded-3xl overflow-hidden border-2 transition-all cursor-pointer ${activeContextImage === img ? 'border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.2)]' : 'border-zinc-800 hover:border-zinc-700'}`}
                            >
                                <img src={img} className="w-full h-full object-contain bg-black/40" />
                                {activeContextImage === img && (
                                    <div className="absolute top-4 left-4 bg-purple-600 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-2 shadow-xl border border-purple-400/50">
                                        <Target className="w-3.5 h-3.5" /> Sélectionné
                                    </div>
                                )}
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all flex flex-col gap-2">
                                    <button onClick={(e) => { e.stopPropagation(); onJumpToAngles?.(img); }} className="p-2.5 bg-black/60 hover:bg-black text-white hover:text-orange-400 rounded-xl backdrop-blur-md" title="Angles 3D"><Box className="w-5 h-5" /></button>
                                    <a href={img} download={`gen-${idx}.png`} onClick={e => e.stopPropagation()} className="p-2.5 bg-black/60 hover:bg-black text-white rounded-xl backdrop-blur-md" title="Télécharger"><Download className="w-5 h-5" /></a>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Chat Section */}
            {generatedResults.length > 0 && (
                <section className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6 flex flex-col min-h-[500px] shadow-sm">
                    <div className="flex items-center gap-3 mb-6 border-b border-zinc-800 pb-5">
                        <MessageSquare className="w-6 h-6 text-purple-500" />
                        <h3 className="font-bold text-zinc-100">Magic Chat Refinement</h3>
                    </div>
                    
                    <div className="flex-1 space-y-6 overflow-y-auto max-h-[600px] mb-6 pr-4">
                        {chatMessages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-3xl p-3 ${msg.role === 'user' ? 'bg-purple-600/20 text-purple-50 border border-purple-500/20' : 'bg-zinc-800/60 border border-zinc-700 shadow-sm'}`}>
                                    {msg.text && <p className="px-3 py-1.5 text-sm leading-relaxed">{msg.text}</p>}
                                    {msg.image && (
                                        <div 
                                            onClick={() => setActiveContextImage(msg.image!)} 
                                            onDoubleClick={() => handleImageDoubleClick(msg.image!)}
                                            className={`relative mt-2 rounded-2xl overflow-hidden border-2 cursor-pointer transition-all ${activeContextImage === msg.image ? 'border-purple-500 shadow-lg' : 'border-zinc-700/50'}`}
                                        >
                                            <img src={msg.image} className="w-full h-auto" />
                                            {activeContextImage === msg.image && <Target className="absolute top-3 left-3 w-5 h-5 text-purple-400 drop-shadow-xl" />}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isRefining && (
                            <div className="flex justify-start">
                                <div className="bg-zinc-800/40 px-4 py-3 rounded-2xl flex items-center gap-3">
                                    <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                                    <span className="text-xs text-zinc-500 font-medium">Retouche en cours...</span>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="flex items-center gap-3 bg-zinc-950/50 p-2 rounded-2xl border border-zinc-800">
                        <input 
                            value={chatInput} 
                            onChange={e => setChatInput(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Ex: Change la couleur du fond en bleu, ajoute des lunettes..." 
                            className="flex-1 bg-transparent border-none rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:ring-0"
                        />
                        <button onClick={handleSendMessage} disabled={!chatInput.trim() || isRefining} className="p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-500 transition-all disabled:opacity-30 disabled:grayscale">
                            <Send className="w-5 h-5" />
                        </button>
                    </div>
                </section>
            )}
        </div>
      </div>

      {/* --- FLOATING BOTTOM BAR: Generator Dock --- */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)] max-w-5xl z-50">
        <div className="bg-zinc-900/80 backdrop-blur-2xl border border-zinc-700/60 p-5 rounded-[2.5rem] shadow-[0_25px_60px_rgba(0,0,0,0.6)] flex flex-col gap-4">
            
            {/* Options & References */}
            <div className="flex items-center justify-between gap-4 border-b border-zinc-800/50 pb-3">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 overflow-x-auto max-w-[300px] scrollbar-hide">
                        {refImages.map((f, i) => (
                            <div key={i} className="relative w-12 h-12 rounded-xl overflow-hidden border border-zinc-700 shrink-0 shadow-lg">
                                <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" />
                                <button onClick={() => setRefImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute inset-0 bg-red-900/60 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity"><X className="w-4 h-4 text-white" /></button>
                            </div>
                        ))}
                        <label className="w-12 h-12 rounded-xl border-2 border-dashed border-zinc-700 flex items-center justify-center cursor-pointer hover:bg-zinc-800 hover:border-zinc-500 transition-all shrink-0">
                            <Paperclip className="w-5 h-5 text-zinc-500" />
                            <input type="file" multiple className="hidden" onChange={e => e.target.files && setRefImages(prev => [...prev, ...Array.from(e.target.files!)])} />
                        </label>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 gap-2">
                        <Frame className="w-3.5 h-3.5 text-zinc-500" />
                        <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value as any)} className="bg-transparent text-xs font-bold text-zinc-300 outline-none">
                            <option value="1:1">1:1 Square</option>
                            <option value="4:3">4:3 Photo</option>
                            <option value="4:5">4:5 Portrait</option>
                            <option value="16:9">16:9 Wide</option>
                            <option value="9:16">9:16 Reel</option>
                        </select>
                    </div>
                    <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 gap-2">
                        <Monitor className="w-3.5 h-3.5 text-zinc-500" />
                        <select value={resolution} onChange={e => setResolution(e.target.value as any)} className="bg-transparent text-xs font-bold text-zinc-300 outline-none">
                            <option value="1K">1K Std</option>
                            <option value="2K">2K High</option>
                            <option value="4K">4K Ultra</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Input & Action */}
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <textarea 
                        value={prompt} 
                        onChange={e => setPrompt(e.target.value)} 
                        placeholder="Décrivez votre vision ici..."
                        className="w-full bg-zinc-950/50 border border-zinc-800 rounded-[1.5rem] px-5 py-4 text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500/50 resize-none h-20 text-base leading-relaxed"
                    />
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                    <button 
                        onClick={handleGenerate}
                        disabled={activeRequests >= MAX_CONCURRENT || !prompt}
                        className="h-20 px-8 bg-gradient-to-br from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white font-black rounded-[1.5rem] shadow-[0_10px_25px_rgba(168,85,247,0.3)] transition-all disabled:opacity-30 disabled:grayscale flex items-center gap-3"
                    >
                        {activeRequests > 0 ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
                        <span className="text-lg">CRÉER</span>
                    </button>
                </div>
            </div>
            
            <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-4">
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest flex items-center gap-1.5">
                        <DollarSign className="w-3 h-3 text-green-500" /> Coût estimé : 
                        <span className="text-zinc-400">{formatCurrency((resolution === Resolution.RES_4K ? PRICE_PER_IMAGE_4K : PRICE_PER_IMAGE_PRO)*2)}</span>
                    </p>
                </div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Nano Banana Pro v3</p>
            </div>
        </div>
      </div>

      <ImageDetailModal 
        isOpen={isModalOpen} 
        imageUrl={selectedImageForModal} 
        onClose={() => setIsModalOpen(false)} 
        onGenerateEdit={async (p, ref, file) => {
            const res = await refineImage(p, ref, systemInstruction, file, undefined, Resolution.RES_1K);
            if (res) {
                const modelMsg: ChatMessage = { id: Date.now().toString(), role: 'model', image: res };
                setChatMessages(prev => [...prev, modelMsg]);
                setActiveContextImage(res);
                if (currentSessionId) {
                    const sess = sessions.find(s => s.id === currentSessionId);
                    if (sess) {
                        await saveSession({ ...sess, chatMessages: [...sess.chatMessages, {id:'m', role:'user', text:p}, modelMsg] });
                    }
                }
            }
        }} 
      />
    </div>
  );
};