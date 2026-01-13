import React, { useEffect, useState } from 'react';
import { GeneratedImage, Project } from '../types';
import { getImageHistory, getProjects, getAppConfig } from '../services/db';
import { Clock, Download, ImageOff, Search, Copy, Folder, Filter, ExternalLink, Box } from 'lucide-react';

interface HistoryViewProps {
    onJumpToGen?: (imageUrl: string) => void;
    onJumpToAngles?: (imageUrl: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onJumpToGen, onJumpToAngles }) => {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [appLogo, setAppLogo] = useState<string>('');
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    const [history, projectsList] = await Promise.all([
        getImageHistory(),
        getProjects()
    ]);
    const config = getAppConfig();
    
    setImages(history);
    setProjects(projectsList);
    setAppLogo(config.logoUrl || '');
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCopyPrompt = (prompt: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(prompt);
  };

  const filteredImages = images.filter(img => {
    const matchesSearch = img.prompt.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (img.projectName && img.projectName.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesProject = selectedProjectId ? img.projectId === selectedProjectId : true;

    return matchesSearch && matchesProject;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
        <h2 className="text-xl font-semibold text-zinc-200 flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-400" />
          Generation History
        </h2>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {/* Project Filter */}
            <div className="relative">
                <Folder className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full sm:w-48 bg-zinc-950 border border-zinc-700 rounded-lg pl-9 pr-8 py-2 text-sm text-zinc-200 focus:ring-1 focus:ring-purple-500 outline-none appearance-none"
                >
                    <option value="">All Projects</option>
                    {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
                <Filter className="absolute right-3 top-2.5 w-3.5 h-3.5 text-zinc-600 pointer-events-none" />
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                <input 
                    type="text" 
                    placeholder="Search prompts..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full sm:w-64 bg-zinc-950 border border-zinc-700 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 focus:ring-1 focus:ring-purple-500 outline-none"
                />
            </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-square bg-zinc-900 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-500 border-2 border-dashed border-zinc-800 rounded-2xl">
          {appLogo ? (
              <img src={appLogo} alt="App Logo" className="w-16 h-16 mb-4 opacity-50 grayscale" />
          ) : (
              <ImageOff className="w-12 h-12 mb-4 opacity-50" />
          )}
          <p className="text-lg">No images found matching filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredImages.map((img) => (
            <div 
                key={img.id} 
                className="group flex flex-col bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-purple-500/50 transition-all"
            >
              <div className="aspect-square bg-black/50 relative">
                <img 
                  src={img.url} 
                  alt="Historical generation" 
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 backdrop-blur-sm">
                   <div className="flex gap-2">
                       {onJumpToAngles && (
                           <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onJumpToAngles(img.url);
                                }}
                                className="p-2 bg-white/10 hover:bg-white/20 text-white hover:text-orange-400 rounded-full backdrop-blur-md transition-colors"
                                title="Change Angle"
                           >
                                <Box className="w-5 h-5" />
                           </button>
                       )}
                       <a 
                         href={img.url}
                         download={`gemini-history-${img.timestamp}.png`}
                         className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors"
                         title="Download"
                         onClick={(e) => e.stopPropagation()}
                       >
                         <Download className="w-5 h-5" />
                       </a>
                   </div>
                </div>
              </div>
              
              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-zinc-500">
                        {new Date(img.timestamp).toLocaleDateString()}
                    </p>
                    {img.projectName && (
                        <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">
                            <Folder className="w-2.5 h-2.5" /> {img.projectName}
                        </span>
                    )}
                </div>

                <div className="relative group/text flex-1">
                    <p className="text-xs text-zinc-300 line-clamp-3 mb-1 font-medium" title={img.prompt}>
                    {img.prompt}
                    </p>
                    <button 
                        onClick={(e) => handleCopyPrompt(img.prompt, e)}
                        className="absolute bottom-0 right-0 p-1 text-zinc-500 hover:text-white bg-zinc-900/80 rounded opacity-0 group-hover/text:opacity-100 transition-opacity"
                        title="Copy Prompt"
                    >
                        <Copy className="w-3 h-3" />
                    </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};