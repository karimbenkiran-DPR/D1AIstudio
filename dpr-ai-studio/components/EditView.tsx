import React, { useState, useRef, useEffect } from 'react';
import { editImage } from '../services/gemini';
import { addConsumedCredits, PRICE_PER_IMAGE_FLASH, formatCurrency } from '../services/credits';
import { Loader2, Upload, Eraser, Download, X, Box, Brush, ZoomIn, ZoomOut, RotateCcw, ImagePlus, Eye, EyeOff, Sparkles, Hand, Palette, MousePointer2, Layers } from 'lucide-react';

interface EditViewProps {
    onJumpToAngles?: (imageUrl: string) => void;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

type Tool = 'select' | 'brush' | 'eraser' | 'pan';

// Helper for rectangle subtraction (Mask logic)
function subtractRect(r1: Rect, r2: Rect): Rect[] {
    const x1 = Math.max(r1.x, r2.x);
    const y1 = Math.max(r1.y, r2.y);
    const x2 = Math.min(r1.x + r1.w, r2.x + r2.w);
    const y2 = Math.min(r1.y + r1.h, r2.y + r2.h);

    if (x1 >= x2 || y1 >= y2) {
        return [r1];
    }

    const res: Rect[] = [];
    if (r1.y < y1) res.push({ x: r1.x, y: r1.y, w: r1.w, h: y1 - r1.y });
    if (r1.y + r1.h > y2) res.push({ x: r1.x, y: y2, w: r1.w, h: (r1.y + r1.h) - y2 });
    if (r1.x < x1) res.push({ x: r1.x, y: y1, w: x1 - r1.x, h: y2 - y1 });
    if (r1.x + r1.w > x2) res.push({ x: x2, y: y1, w: (r1.x + r1.w) - x2, h: y2 - y1 });

    return res;
}

export const EditView: React.FC<EditViewProps> = ({ onJumpToAngles }) => {
  // Image State
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [refImage, setRefImage] = useState<File | null>(null);
  
  // UI State
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isMaskVisible, setIsMaskVisible] = useState(true);
  
  // Canvas / Tool State
  const [scale, setScale] = useState(1);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [brushSize, setBrushSize] = useState(30);
  const [brushColor, setBrushColor] = useState('#a855f7'); // Default Purple
  const [isDrawing, setIsDrawing] = useState(false);

  // Selection State
  const [selections, setSelections] = useState<Rect[]>([]);
  const [currentSelection, setCurrentSelection] = useState<Rect | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Init Canvas on Image Load
  useEffect(() => {
    if (sourceImage && imageRef.current && canvasRef.current) {
        // Reset canvas when source changes
        canvasRef.current.width = imageRef.current.naturalWidth;
        canvasRef.current.height = imageRef.current.naturalHeight;
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        
        // Reset Selections
        setSelections([]);
        setResultImage(null);
    }
  }, [sourceImage]);

  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.repeat) return;
        if (e.key === 'Alt') setIsAltPressed(true);
        if (e.key === 'Shift') setIsShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Alt') setIsAltPressed(false);
        if (e.key === 'Shift') setIsShiftPressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleImageLoad = () => {
      if (imageRef.current && canvasRef.current) {
          canvasRef.current.width = imageRef.current.naturalWidth;
          canvasRef.current.height = imageRef.current.naturalHeight;
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
        setSourceImage(e.target.files[0]);
        setResultImage(null);
        setSelections([]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]?.type.startsWith('image/')) {
        setSourceImage(e.dataTransfer.files[0]);
        setResultImage(null);
        setSelections([]);
    }
  };

  // --- Canvas Logic ---

  const getPointerPos = (e: React.MouseEvent) => {
    if (!containerRef.current || !imageRef.current) return { x: 0, y: 0, visualX: 0, visualY: 0 };
    
    const rect = containerRef.current.getBoundingClientRect();
    const visualX = (e.clientX - rect.left) / scale;
    const visualY = (e.clientY - rect.top) / scale;

    const displayedWidth = imageRef.current.width;
    const displayedHeight = imageRef.current.height;
    
    if (displayedWidth === 0 || displayedHeight === 0) return { x: 0, y: 0, visualX, visualY };

    const scaleX = imageRef.current.naturalWidth / displayedWidth;
    const scaleY = imageRef.current.naturalHeight / displayedHeight;

    return { 
        x: visualX * scaleX, 
        y: visualY * scaleY,
        visualX,
        visualY 
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!sourceImage || activeTool === 'pan') return;
    setIsDrawing(true);
    const { x, y } = getPointerPos(e);
    lastMousePos.current = { x, y };
    setDragStart({ x, y });

    if (activeTool === 'select') {
        if (!isShiftPressed && !isAltPressed) {
            setSelections([]);
        }
        setCurrentSelection({ x, y, w: 0, h: 0 });
    } else {
        draw(x, y, x, y);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    // Update cursor
    const { visualX, visualY, x, y } = getPointerPos(e);
    if (cursorRef.current) {
        cursorRef.current.style.left = `${visualX}px`;
        cursorRef.current.style.top = `${visualY}px`;
    }

    if (!isDrawing || activeTool === 'pan') return;

    if (activeTool === 'select') {
        const minX = Math.min(dragStart.x, x);
        const minY = Math.min(dragStart.y, y);
        const w = Math.abs(x - dragStart.x);
        const h = Math.abs(y - dragStart.y);
        setCurrentSelection({ x: minX, y: minY, w, h });
    } else {
        draw(x, y, lastMousePos.current.x, lastMousePos.current.y);
        lastMousePos.current = { x, y };
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && activeTool === 'select' && currentSelection) {
         if (currentSelection.w > 5 && currentSelection.h > 5) {
            if (isAltPressed) {
                 let resultList: Rect[] = [];
                 for (const existing of selections) {
                    resultList.push(...subtractRect(existing, currentSelection));
                 }
                 setSelections(resultList);
            } else {
                 setSelections(prev => [...prev, currentSelection!]);
            }
         }
    }
    setIsDrawing(false);
    setCurrentSelection(null);
  };

  const draw = (x: number, y: number, prevX: number, prevY: number) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    const scaleFactor = imageRef.current ? (imageRef.current.naturalWidth / imageRef.current.width) : 1;
    const actualBrushSize = brushSize * scaleFactor;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = actualBrushSize;
    
    if (activeTool === 'brush') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = brushColor;
        ctx.globalAlpha = 0.6;
    } else {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1.0;
    }

    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setSelections([]);
  };

  // --- Generation Logic ---

  const getMaskBoundingBox = (): Rect | null => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return null;

    const w = canvas.width;
    const h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h).data;

    let minX = w, minY = h, maxX = 0, maxY = 0;
    let found = false;

    for (let y = 0; y < h; y += 5) {
        for (let x = 0; x < w; x += 5) {
            const alpha = imageData[(y * w + x) * 4 + 3];
            if (alpha > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
    }

    if (!found) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };

  const handleEdit = async () => {
    if (!sourceImage || !prompt || !imageRef.current) return;
    setLoading(true);
    setError(null);

    try {
        let finalPrompt = prompt;
        
        const allZones = [...selections];
        const drawnRect = getMaskBoundingBox();
        if (drawnRect) allZones.push(drawnRect);
        
        if (allZones.length > 0) {
            const naturalW = imageRef.current.naturalWidth;
            const naturalH = imageRef.current.naturalHeight;
            let coordString = "";
            
            allZones.forEach(r => {
                const y1 = Math.floor((r.y / naturalH) * 1000);
                const x1 = Math.floor((r.x / naturalW) * 1000);
                const y2 = Math.floor(((r.y + r.h) / naturalH) * 1000);
                const x2 = Math.floor(((r.x + r.w) / naturalW) * 1000);
                coordString += ` [EDIT_ZONE: ${y1}, ${x1}, ${y2}, ${x2}]`;
            });
            finalPrompt += coordString;
        } else {
             setError("Please select or paint an area to edit.");
             setLoading(false);
             return;
        }

        const result = await editImage(finalPrompt, sourceImage, refImage || undefined);
        if (!result) throw new Error("Could not edit image.");
        
        addConsumedCredits(PRICE_PER_IMAGE_FLASH);
        setResultImage(result);
        
        // IMPORTANT: We do NOT clear canvas here so the mask remains visible for the user.
    } catch (err: any) {
        setError(err.message || "Edit failed");
    } finally {
        setLoading(false);
    }
  };

  // Helper to render selection rects in Visual Space
  const renderRect = (r: Rect, idx?: number, isCurrent = false) => {
    if (!imageRef.current) return null;
    const displayedWidth = imageRef.current.width;
    const displayedHeight = imageRef.current.height;
    if (displayedWidth === 0 || displayedHeight === 0) return null;

    const scaleX = imageRef.current.naturalWidth / displayedWidth;
    const scaleY = imageRef.current.naturalHeight / displayedHeight;
    
    const style: React.CSSProperties = {
        left: r.x / scaleX,
        top: r.y / scaleY,
        width: r.w / scaleX,
        height: r.h / scaleY
    };
    
    // Hide selections if mask is hidden
    if (!isMaskVisible) return null;
    
    return (
        <div 
            key={idx !== undefined ? idx : 'curr'}
            className={`absolute border-2 pointer-events-none ${isCurrent ? (isAltPressed ? 'border-red-500 bg-red-500/20' : 'border-purple-400 bg-purple-500/10') : 'border-purple-500 bg-purple-500/20'}`}
            style={style}
        />
    );
  };

  // --- Render ---

  if (!sourceImage) {
      return (
        <div 
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-zinc-700 hover:border-blue-500 hover:bg-zinc-900/50 rounded-2xl p-12 text-center cursor-pointer transition-all min-h-[400px] flex flex-col items-center justify-center group"
        >
          <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
          <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Upload className="w-10 h-10 text-zinc-400 group-hover:text-blue-400" />
          </div>
          <h3 className="text-2xl font-bold text-zinc-200 mb-2">Magic Editor</h3>
          <p className="text-zinc-500">Drag & drop an image to start editing</p>
        </div>
      );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-4">
        
        {/* Top Toolbar */}
        <div className="h-16 bg-zinc-900 border border-zinc-800 rounded-xl px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
                <button onClick={() => setSourceImage(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium">
                    <RotateCcw className="w-4 h-4" /> Start Over
                </button>
                <div className="h-6 w-px bg-zinc-800"></div>
                {resultImage && (
                    <button 
                        onMouseDown={() => setShowOriginal(true)}
                        onMouseUp={() => setShowOriginal(false)}
                        onMouseLeave={() => setShowOriginal(false)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-lg text-zinc-300 hover:text-white select-none active:bg-zinc-700"
                    >
                        {showOriginal ? <Eye className="w-4 h-4 text-blue-400" /> : <EyeOff className="w-4 h-4" />}
                        Hold to Compare
                    </button>
                )}
            </div>

            <div className="flex items-center gap-2">
                {resultImage && (
                    <>
                        {onJumpToAngles && (
                            <button onClick={() => onJumpToAngles(resultImage)} className="p-2 text-zinc-400 hover:text-orange-400 hover:bg-zinc-800 rounded-lg" title="Send to Angles">
                                <Box className="w-5 h-5" />
                            </button>
                        )}
                        <a href={resultImage} download="edited.png" className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg" title="Download">
                            <Download className="w-5 h-5" />
                        </a>
                    </>
                )}
            </div>
        </div>

        <div className="flex-1 flex gap-4 overflow-hidden">
            
            {/* Left: Tools Sidebar */}
            <div className="w-16 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col items-center py-4 gap-4 shrink-0">
                <button 
                    onClick={() => setActiveTool('select')}
                    className={`p-3 rounded-xl transition-all ${activeTool === 'select' ? 'bg-purple-600 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-800'}`}
                    title="Selection Box (Shift to add, Alt to subtract)"
                >
                    <MousePointer2 className="w-5 h-5" />
                </button>
                <button 
                    onClick={() => setActiveTool('brush')}
                    className={`p-3 rounded-xl transition-all ${activeTool === 'brush' ? 'bg-purple-600 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-800'}`}
                    title="Mask Brush"
                >
                    <Brush className="w-5 h-5" />
                </button>
                <button 
                    onClick={() => setActiveTool('eraser')}
                    className={`p-3 rounded-xl transition-all ${activeTool === 'eraser' ? 'bg-purple-600 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-800'}`}
                    title="Mask Eraser"
                >
                    <Eraser className="w-5 h-5" />
                </button>
                <button 
                    onClick={() => setActiveTool('pan')}
                    className={`p-3 rounded-xl transition-all ${activeTool === 'pan' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-800'}`}
                    title="Pan Mode"
                >
                    <Hand className="w-5 h-5" />
                </button>
                
                <div className="h-px w-8 bg-zinc-800 my-2"></div>
                
                {/* Mask Visibility Toggle */}
                <button
                    onClick={() => setIsMaskVisible(!isMaskVisible)}
                    className={`p-3 rounded-xl transition-all ${isMaskVisible ? 'text-purple-400 bg-purple-500/10' : 'text-zinc-600 hover:text-zinc-400'}`}
                    title={isMaskVisible ? "Hide Mask" : "Show Mask"}
                >
                    <Layers className="w-5 h-5" />
                </button>
                
                <div className="h-px w-8 bg-zinc-800 my-2"></div>

                {/* Color Picker (Only for Brush) */}
                {activeTool === 'brush' && (
                    <div className="flex flex-col items-center gap-2 animate-in fade-in">
                        <div className="relative group">
                            <div 
                                className="w-8 h-8 rounded-full border border-zinc-700 cursor-pointer flex items-center justify-center shadow-sm" 
                                style={{ backgroundColor: brushColor }}
                                title="Change Color"
                            >
                                <Palette className="w-4 h-4 text-white mix-blend-difference" />
                            </div>
                            <input 
                                type="color" 
                                value={brushColor}
                                onChange={e => setBrushColor(e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </div>
                    </div>
                )}
                
                {/* Brush Size */}
                <div className="flex flex-col items-center gap-2 h-32">
                     <span className="text-[10px] text-zinc-500 font-bold">{brushSize}</span>
                     <input 
                        type="range" 
                        min="5" 
                        max="100" 
                        value={brushSize} 
                        onChange={e => setBrushSize(Number(e.target.value))}
                        className="h-full w-1 bg-zinc-700 rounded-full appearance-none cursor-pointer vertical-slider"
                        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                     />
                </div>

                <div className="mt-auto">
                    <button onClick={clearCanvas} className="p-2 text-red-400 hover:bg-red-900/20 rounded-lg" title="Clear Mask">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Center: Canvas Workspace */}
            <div className="flex-1 bg-black/40 border border-zinc-800 rounded-xl relative overflow-hidden flex items-center justify-center p-8">
                <div 
                    className="relative shadow-2xl transition-transform duration-100 ease-out"
                    style={{ transform: `scale(${scale})` }}
                >
                     {/* Image Container with inline-block to tightly hug content */}
                    <div ref={containerRef} className={`relative inline-block select-none ${activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : (activeTool === 'select' ? 'cursor-crosshair' : 'cursor-none')}`}>
                        {/* 1. Base Image (or Result if active and not comparing) */}
                        <img 
                            ref={imageRef}
                            src={resultImage && !showOriginal ? resultImage : URL.createObjectURL(sourceImage)}
                            alt="Edit Target"
                            className="max-w-full max-h-[70vh] object-contain pointer-events-none block"
                            onMouseDown={(e) => e.preventDefault()}
                            onLoad={handleImageLoad}
                        />
                        
                        {/* 2. Drawing Canvas */}
                        <canvas 
                            ref={canvasRef}
                            className={`absolute inset-0 w-full h-full pointer-events-none ${isMaskVisible ? 'opacity-100' : 'opacity-0'}`}
                            onMouseDown={(e) => e.preventDefault()}
                        />

                        {/* 3. Rectangular Selections Overlay */}
                        {(resultImage && !showOriginal) ? null : selections.map((sel, idx) => renderRect(sel, idx))}
                        
                        {/* 4. Current Drag Rect */}
                        {(resultImage && !showOriginal) ? null : (currentSelection && activeTool === 'select' && renderRect(currentSelection, undefined, true))}

                        {/* 5. Custom Cursor */}
                        {(activeTool === 'brush' || activeTool === 'eraser') && (
                             <div 
                                ref={cursorRef}
                                className="absolute pointer-events-none border border-white rounded-full -translate-x-1/2 -translate-y-1/2 z-50 mix-blend-difference"
                                style={{ width: brushSize, height: brushSize }}
                             />
                        )}
                        
                        {/* Mouse Capture Layer */}
                        <div 
                            className="absolute inset-0 z-10"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        />
                    </div>
                </div>

                {/* Zoom Controls */}
                <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-zinc-900 border border-zinc-700 p-1.5 rounded-lg shadow-xl">
                    <button onClick={() => setScale(s => Math.max(0.2, s - 0.2))} className="p-2 hover:bg-zinc-800 rounded text-zinc-400"><ZoomOut className="w-4 h-4" /></button>
                    <span className="text-xs font-mono w-12 text-center text-zinc-300">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-2 hover:bg-zinc-800 rounded text-zinc-400"><ZoomIn className="w-4 h-4" /></button>
                </div>
            </div>

            {/* Right: Controls Sidebar */}
            <div className="w-80 bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-6 shrink-0 overflow-y-auto">
                <div>
                    <h3 className="text-lg font-bold text-zinc-100 mb-1">Edit Controls</h3>
                    <p className="text-xs text-zinc-500">Paint or Select an area to restrict editing to that zone.</p>
                </div>
                
                {/* Shortcuts hint */}
                <div className="text-[10px] text-zinc-500 bg-zinc-950 p-2 rounded border border-zinc-800 grid grid-cols-2 gap-x-2 gap-y-1">
                    <span>Shift + Select</span> <span className="text-right text-zinc-400">Add Box</span>
                    <span>Alt + Select</span> <span className="text-right text-zinc-400">Sub Box</span>
                </div>

                <div className="space-y-4">
                    {/* Prompt */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-400 uppercase">Instruction</label>
                        <textarea 
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder="e.g. Turn the cat into a dog, add sunglasses..."
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
                        />
                    </div>

                    {/* Reference Image Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-400 uppercase">Style/Content Reference</label>
                        <div className="relative group">
                            {refImage ? (
                                <div className="relative rounded-lg overflow-hidden border border-zinc-700 h-20 bg-black">
                                    <img src={URL.createObjectURL(refImage)} className="w-full h-full object-contain opacity-70" alt="ref" />
                                    <button onClick={() => setRefImage(null)} className="absolute top-1 right-1 bg-black/60 p-1 rounded-full text-zinc-300 hover:text-red-400"><X className="w-3 h-3" /></button>
                                </div>
                            ) : (
                                <label className="flex flex-col items-center justify-center h-20 border border-dashed border-zinc-700 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-colors">
                                    <ImagePlus className="w-5 h-5 text-zinc-500 mb-1" />
                                    <span className="text-[10px] text-zinc-500">Add Image</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && setRefImage(e.target.files[0])} />
                                </label>
                            )}
                        </div>
                    </div>
                </div>

                {error && <div className="p-3 bg-red-900/20 text-red-300 text-xs rounded-lg border border-red-800/50">{error}</div>}

                <div className="mt-auto pt-4 border-t border-zinc-800">
                    <button 
                        onClick={handleEdit}
                        disabled={loading || !prompt}
                        className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                        Generate Edit
                    </button>
                    <p className="text-[10px] text-center text-zinc-600 mt-2">
                        Uses Gemini Flash Image ({formatCurrency(PRICE_PER_IMAGE_FLASH)})
                    </p>
                </div>
            </div>
        </div>
    </div>
  );
};
