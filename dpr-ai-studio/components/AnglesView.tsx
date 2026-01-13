import React, { useState, useRef, useEffect } from 'react';
import { generateAngleVariation } from '../services/gemini';
import { Loader2, Upload, Download, ArrowRight, X, Info, Box, Sparkles, Clock, Trash2, Layout, Frame, Layers, Folder, DollarSign, ChevronDown, Plus, Monitor } from 'lucide-react';
import { addConsumedCredits, PRICE_PER_IMAGE_PRO, PRICE_PER_IMAGE_4K, formatCurrency } from '../services/credits';
import { saveImageToHistory, getImageHistory, deleteImageFromHistory, getProjects, logActivity, incrementProjectImageCount } from '../services/db';
import { GeneratedImage, AspectRatio, Resolution, Project, User } from '../types';

interface AnglesViewProps {
    initialSourceImage?: string | null;
    onConsumeInitialSource?: () => void;
    currentUser: User;
}

interface SessionGroup {
    sessionId: string;
    images: GeneratedImage[];
    timestamp: number;
}

export const AnglesView: React.FC<AnglesViewProps> = ({ initialSourceImage, onConsumeInitialSource, currentUser }) => {
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data State
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // History State
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");

  // Angle State
  const [rotation, setRotation] = useState(30);
  const [tilt, setTilt] = useState(0);
  const [zoom, setZoom] = useState<'Close Up' | 'Medium' | 'Wide'>('Medium');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [resolution, setResolution] = useState<Resolution>(Resolution.RES_1K);
  const [prompt, setPrompt] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cube Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    loadData();
  }, []);

  // Handle incoming image from other tabs (like Generate)
  useEffect(() => {
    if (initialSourceImage && onConsumeInitialSource) {
        try {
            const arr = initialSourceImage.split(',');
            const mimeMatch = arr[0].match(/:(.*?);/);
            if (mimeMatch) {
                const mime = mimeMatch[1];
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while(n--){
                    u8arr[n] = bstr.charCodeAt(n);
                }
                const file = new File([u8arr], "source_angle.png", {type:mime});
                
                // Start a new session automatically
                const newSessionId = crypto.randomUUID();
                setCurrentSessionId(newSessionId);
                
                setSourceImage(file);
                setResultImage(null);
                setRotation(30);
                setTilt(0);
            }
        } catch (e) {
            console.error("Failed to convert initial image", e);
        }
        onConsumeInitialSource();
    }
  }, [initialSourceImage, onConsumeInitialSource]);

  const loadData = async () => {
      // Load History
      const allImages = await getImageHistory();
      // Filter history to show only images relevant to the Angles tool
      const angleImages = allImages.filter(img => 
          img.projectName === 'Angles Workspace' || 
          img.prompt.includes('Camera Rotation:')
      );
      
      // Group by Session ID (stored in systemInstruction for this tool)
      const groups: Record<string, GeneratedImage[]> = {};
      angleImages.forEach(img => {
          const sId = img.systemInstruction || 'legacy'; // Using systemInstruction to store session ID hack
          if (!groups[sId]) groups[sId] = [];
          groups[sId].push(img);
      });

      const groupArray: SessionGroup[] = Object.keys(groups).map(key => ({
          sessionId: key,
          images: groups[key],
          timestamp: groups[key][0]?.timestamp || 0
      })).sort((a, b) => b.timestamp - a.timestamp);

      setSessionGroups(groupArray);

      // Load Projects
      const projList = await getProjects();
      setProjects(projList);
      if (projList.length > 0 && !selectedProjectId) {
          setSelectedProjectId(projList[0].id);
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSourceImage(e.target.files[0]);
      setResultImage(null);
      // Generate new Session ID for this new source
      setCurrentSessionId(crypto.randomUUID());
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      setSourceImage(e.dataTransfer.files[0]);
      setResultImage(null);
      setCurrentSessionId(crypto.randomUUID());
    }
  };

  const clearSource = () => {
    setSourceImage(null);
    setResultImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setRotation(30);
    setTilt(0);
    setCurrentSessionId("");
  };

  const getEstimatedCost = () => {
      return resolution === Resolution.RES_4K ? PRICE_PER_IMAGE_4K : PRICE_PER_IMAGE_PRO;
  };

  const handleGenerate = async () => {
    if (!sourceImage) return;
    if (!selectedProjectId) {
        setError("Please select a project first.");
        return;
    }
    setLoading(true);
    setError(null);

    // Ensure we have a session ID (fallback)
    const activeSessionId = currentSessionId || crypto.randomUUID();
    if (!currentSessionId) setCurrentSessionId(activeSessionId);

    try {
      const result = await generateAngleVariation(sourceImage, rotation, tilt, zoom, aspectRatio, resolution, prompt);
      if (!result) {
        setError("Could not generate angle variation.");
      } else {
        setResultImage(result);
        
        // Cost Tracking
        const cost = getEstimatedCost();
        addConsumedCredits(cost);
        await incrementProjectImageCount(selectedProjectId, 1);

        // Save to History with Session ID
        const promptDesc = `Angle: ${rotation}°, ${tilt}°, ${zoom} ${prompt ? `| ${prompt}` : ''}`;
        const newRecord: GeneratedImage = {
            id: crypto.randomUUID(),
            url: result,
            prompt: promptDesc,
            systemInstruction: activeSessionId, // Storing Session ID here
            timestamp: Date.now(),
            projectId: selectedProjectId,
            projectName: 'Angles Workspace'
        };
        
        await saveImageToHistory(newRecord);
        
        // Log Activity
        await logActivity(
            currentUser.id,
            currentUser.email,
            'GENERATE',
            promptDesc,
            'Angle Variation Generated',
            result,
            selectedProjectId,
            cost
        );
        
        await loadData(); // Reload groups
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistoryItem = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (window.confirm("Delete this image?")) {
          await deleteImageFromHistory(id);
          await loadData();
      }
  };

  const handleSelectHistoryItem = (img: GeneratedImage) => {
      setResultImage(img.url);
  };

  // --- Cube Logic ---
  const handleCubeMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleCubeMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setRotation(prev => {
        const next = prev + dx;
        return next > 360 ? next - 360 : (next < 0 ? next + 360 : next);
    });

    // Inverted Tilt
    setTilt(prev => {
        const next = prev + dy; 
        return Math.max(-90, Math.min(90, next));
    });
  };

  const handleCubeMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-220px)] min-h-[600px]">
      
      {/* 1. LEFT: History Sidebar (Grouped by Session) */}
      <div className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-3">
        <button 
            onClick={clearSource}
            className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-3 rounded-xl font-medium transition-colors border border-zinc-700"
        >
            <Plus className="w-5 h-5" />
            <span>New Session</span>
        </button>

        <div className="flex-1 flex flex-col bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 backdrop-blur-sm">
                <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-orange-400" /> History
                </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {sessionGroups.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 text-zinc-600 text-xs">
                        <Clock className="w-6 h-6 mb-2 opacity-20" />
                        <p>No history yet</p>
                    </div>
                )}

                {sessionGroups.map((group) => (
                    <div key={group.sessionId} className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
                            Session {new Date(group.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {group.images.map((item) => (
                                <div 
                                    key={item.id} 
                                    onClick={() => handleSelectHistoryItem(item)}
                                    className={`
                                        group relative aspect-square bg-zinc-900 rounded-md overflow-hidden border cursor-pointer transition-all
                                        ${resultImage === item.url ? 'border-orange-500 ring-1 ring-orange-500' : 'border-zinc-800 hover:border-orange-500/50'}
                                    `}
                                >
                                    <img src={item.url} alt="H" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                                            className="absolute top-0 right-0 p-1 text-zinc-200 hover:text-red-400"
                                        >
                                            <X className="w-2.5 h-2.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>

      {/* 2. CENTER: Controls */}
      <div className="w-full lg:w-96 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
         {!sourceImage ? (
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="h-full border-2 border-dashed border-zinc-700 hover:border-orange-500 hover:bg-zinc-900/50 rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center group"
            >
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
              />
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-zinc-400 group-hover:text-orange-400" />
              </div>
              <h3 className="text-lg font-medium text-zinc-200 mb-2">Upload Source</h3>
              <p className="text-sm text-zinc-500">Drag & drop or click</p>
            </div>
         ) : (
             <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 relative flex-1 flex flex-col overflow-y-auto">
                 <button onClick={clearSource} className="absolute top-4 right-4 text-zinc-500 hover:text-red-400 transition-colors z-10">
                    <X className="w-5 h-5" />
                 </button>

                 <div className="mb-6 flex flex-col items-center">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2">Source</p>
                     <div className="w-20 h-20 rounded-lg overflow-hidden border border-zinc-700 bg-black">
                         <img src={URL.createObjectURL(sourceImage)} className="w-full h-full object-contain opacity-80" alt="Source" />
                     </div>
                 </div>
                 
                 {/* Project Selection */}
                <div className="mb-4 space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide flex items-center gap-1">
                        <Folder className="w-3 h-3" /> Project
                    </label>
                    <div className="relative">
                        <select
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 appearance-none outline-none focus:ring-2 focus:ring-orange-500"
                        >
                            {projects.length === 0 && <option value="">No projects available</option>}
                            {projects.map((proj) => (
                                <option key={proj.id} value={proj.id}>
                                    {proj.name}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-zinc-500 pointer-events-none" />
                    </div>
                </div>

                 {/* 3D Cube Interactive Area */}
                 <div className="flex flex-col items-center justify-center h-48 mb-6 bg-zinc-950/50 rounded-xl border border-zinc-800/50 relative overflow-hidden flex-shrink-0">
                    <div 
                        className="w-24 h-24 relative cursor-grab active:cursor-grabbing"
                        style={{ perspective: '800px' }}
                        onMouseDown={handleCubeMouseDown}
                        onMouseMove={handleCubeMouseMove}
                    >
                        <div 
                            className="w-full h-full relative"
                            style={{
                                transformStyle: 'preserve-3d',
                                transform: `rotateX(${-tilt}deg) rotateY(${rotation}deg)`,
                                transition: isDragging ? 'none' : 'transform 0.3s ease-out'
                            }}
                        >
                            <div className="absolute inset-0 bg-zinc-800/80 border border-zinc-600 flex items-center justify-center text-[10px] text-zinc-400 backface-hidden" style={{ transform: 'translateZ(48px)' }}><Box className="w-6 h-6" /></div>
                            <div className="absolute inset-0 bg-zinc-800/80 border border-zinc-600 flex items-center justify-center text-[10px] text-zinc-400" style={{ transform: 'rotateY(180deg) translateZ(48px)' }}>Back</div>
                            <div className="absolute inset-0 bg-zinc-800/80 border border-zinc-600 flex items-center justify-center text-[10px] text-zinc-400" style={{ transform: 'rotateY(90deg) translateZ(48px)' }}>Right</div>
                            <div className="absolute inset-0 bg-zinc-800/80 border border-zinc-600 flex items-center justify-center text-[10px] text-zinc-400" style={{ transform: 'rotateY(-90deg) translateZ(48px)' }}>Left</div>
                            <div className="absolute inset-0 bg-zinc-800/80 border border-zinc-600 flex items-center justify-center text-[10px] text-zinc-400" style={{ transform: 'rotateX(90deg) translateZ(48px)' }}>Top</div>
                            <div className="absolute inset-0 bg-zinc-800/80 border border-zinc-600 flex items-center justify-center text-[10px] text-zinc-400" style={{ transform: 'rotateX(-90deg) translateZ(48px)' }}>Bot</div>
                        </div>
                    </div>
                 </div>

                 {/* Controls */}
                 <div className="space-y-4 mb-6">
                     <div className="grid grid-cols-4 items-center gap-2">
                         <label className="text-xs font-medium text-zinc-400">Rot</label>
                         <input type="range" min="0" max="360" value={rotation} onChange={(e) => setRotation(Number(e.target.value))} className="col-span-2 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
                         <span className="text-xs font-mono text-zinc-300 text-right">{Math.round(rotation)}°</span>
                     </div>
                     <div className="grid grid-cols-4 items-center gap-2">
                         <label className="text-xs font-medium text-zinc-400">Tilt</label>
                         <input type="range" min="-90" max="90" value={tilt} onChange={(e) => setTilt(Number(e.target.value))} className="col-span-2 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
                         <span className="text-xs font-mono text-zinc-300 text-right">{Math.round(tilt)}°</span>
                     </div>
                     <div className="grid grid-cols-4 items-center gap-2">
                         <label className="text-xs font-medium text-zinc-400">Zoom</label>
                         <div className="col-span-3 flex gap-1">
                             {['Close Up', 'Medium', 'Wide'].map((z) => (
                                 <button key={z} onClick={() => setZoom(z as any)} className={`flex-1 text-[10px] py-1.5 rounded border ${zoom === z ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>{z}</button>
                             ))}
                         </div>
                     </div>
                     <div className="grid grid-cols-4 items-center gap-2">
                         <label className="text-xs font-medium text-zinc-400">Ratio</label>
                         <div className="col-span-3">
                             <div className="relative">
                                 <select 
                                    value={aspectRatio}
                                    onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded-lg px-2 py-1.5 appearance-none focus:border-orange-500 outline-none"
                                 >
                                     {Object.values(AspectRatio).map(r => (
                                         <option key={r} value={r}>{r}</option>
                                     ))}
                                 </select>
                                 <Frame className="absolute right-2 top-2 w-3 h-3 text-zinc-600 pointer-events-none" />
                             </div>
                         </div>
                     </div>
                     <div className="grid grid-cols-4 items-center gap-2">
                         <label className="text-xs font-medium text-zinc-400">Quality</label>
                         <div className="col-span-3">
                             <div className="relative">
                                 <select 
                                    value={resolution}
                                    onChange={(e) => setResolution(e.target.value as Resolution)}
                                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded-lg px-2 py-1.5 appearance-none focus:border-orange-500 outline-none"
                                 >
                                     {Object.values(Resolution).map(r => (
                                         <option key={r} value={r}>{r}</option>
                                     ))}
                                 </select>
                                 <Monitor className="absolute right-2 top-2 w-3 h-3 text-zinc-600 pointer-events-none" />
                             </div>
                         </div>
                     </div>
                     
                     {/* Text Prompt */}
                     <div className="space-y-1">
                         <label className="text-xs font-medium text-zinc-400">Additional Instructions (Optional)</label>
                         <textarea 
                             value={prompt}
                             onChange={(e) => setPrompt(e.target.value)}
                             placeholder="e.g. Make the lighting darker, add a cinematic glow..."
                             className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 outline-none focus:border-orange-500 h-16 resize-none"
                         />
                     </div>
                 </div>

                 <div className="space-y-2 mt-auto">
                    <button
                        onClick={handleGenerate}
                        disabled={loading || !selectedProjectId}
                        className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-xl shadow-lg hover:shadow-yellow-400/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                        Generate
                    </button>
                    <div className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-500">
                        <DollarSign className="w-3 h-3 text-green-500/70" />
                        <span>Estimated cost: <span className="text-green-500 font-medium">{formatCurrency(getEstimatedCost())}</span></span>
                    </div>
                 </div>
             </div>
         )}
      </div>

      {/* 3. RIGHT: Result Area */}
      <div className="flex-1 bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-center mb-4">
               <h3 className="font-bold text-zinc-200 flex items-center gap-2"><Layout className="w-5 h-5 text-zinc-500" /> Result</h3>
               {resultImage && (
                    <a 
                        href={resultImage} 
                        download="angle-variation.png"
                        className="text-xs flex items-center gap-2 text-zinc-300 hover:text-white transition-colors bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700"
                    >
                        <Download className="w-4 h-4" /> Download
                    </a>
               )}
          </div>
          
          <div className="flex-1 flex items-center justify-center bg-black/40 rounded-xl border-2 border-dashed border-zinc-800/50 relative overflow-hidden">
               {resultImage ? (
                   <img src={resultImage} alt="Generated Angle" className="w-full h-full object-contain" />
               ) : (
                   <div className="text-center text-zinc-600">
                       <Box className="w-16 h-16 mx-auto mb-4 opacity-10" />
                       <p className="text-sm font-medium">No image generated yet</p>
                       <p className="text-xs opacity-60">Use the controls to generate a new view</p>
                   </div>
               )}
               {error && (
                    <div className="absolute bottom-4 left-4 right-4 p-3 bg-red-900/90 border border-red-800 rounded-lg text-red-100 text-sm text-center backdrop-blur-md">
                        {error}
                    </div>
               )}
          </div>
      </div>

    </div>
  );
};