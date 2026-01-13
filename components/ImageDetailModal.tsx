import React, { useState, useRef, useEffect } from 'react';
import { AspectRatio } from '../types';
import { Download, X, Crop, Move, Sparkles, Loader2, ZoomIn, ZoomOut, Upload, MousePointer2, Hand, Scissors, Brush, Eraser, Palette, Circle } from 'lucide-react';

interface ImageDetailModalProps {
    isOpen: boolean;
    imageUrl: string | null;
    onClose: () => void;
    onGenerateEdit: (prompt: string, refImage: string, refFile?: File) => Promise<void>;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

type Tool = 'select' | 'brush' | 'eraser';

// Helper for rectangle subtraction
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

export const ImageDetailModal: React.FC<ImageDetailModalProps> = ({ isOpen, imageUrl, onClose, onGenerateEdit }) => {
    const [scale, setScale] = useState(1);
    
    // Tools
    const [activeTool, setActiveTool] = useState<Tool>('select');
    const [brushSize, setBrushSize] = useState(20);
    const [eraserSize, setEraserSize] = useState(30);
    const [brushColor, setBrushColor] = useState('#a855f7'); // Purple default

    // Selection State
    const [selections, setSelections] = useState<Rect[]>([]);
    const [currentSelection, setCurrentSelection] = useState<Rect | null>(null);
    
    // Interaction State
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [isAltPressed, setIsAltPressed] = useState(false);
    
    // Edit Prompt State
    const [editPrompt, setEditPrompt] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Ref Image State
    const [modalRefImage, setModalRefImage] = useState<File | null>(null);
    const [isDraggingRef, setIsDraggingRef] = useState(false);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cursorRef = useRef<HTMLDivElement>(null);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setScale(1);
            setSelections([]);
            setCurrentSelection(null);
            setEditPrompt('');
            setModalRefImage(null);
            setIsSpacePressed(false);
            setIsAltPressed(false);
            setActiveTool('select');
            // Clear canvas
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    }, [isOpen, imageUrl]);

    // Handle Keyboard Events
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.repeat) return;
            if (e.code === 'Space') {
                if (document.activeElement?.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    setIsSpacePressed(true);
                }
            }
            if (e.key === 'Alt') setIsAltPressed(true);
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') setIsSpacePressed(false);
            if (e.key === 'Alt') setIsAltPressed(false);
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isOpen]);

    // Sync Canvas Size to Image Size
    const handleImageLoad = () => {
        if (imageRef.current && canvasRef.current) {
            canvasRef.current.width = imageRef.current.width;
            canvasRef.current.height = imageRef.current.height;
        }
    };

    if (!isOpen || !imageUrl) return null;

    // -- Mouse Logic --
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        
        lastMousePos.current = { x, y };
        setDragStart({ x, y });
        setIsDragging(true);

        if (activeTool === 'select') {
            if (!e.shiftKey && !isAltPressed && !isSpacePressed) {
                setSelections([]);
            }
            setCurrentSelection({ x, y, w: 0, h: 0 });
        } else if (activeTool === 'brush' || activeTool === 'eraser') {
            if (!isSpacePressed) {
                draw(x, y, x, y, true);
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        
        const rect = containerRef.current.getBoundingClientRect();
        const currentX = (e.clientX - rect.left) / scale;
        const currentY = (e.clientY - rect.top) / scale;

        // Update custom cursor position directly
        if (cursorRef.current) {
            cursorRef.current.style.left = `${currentX}px`;
            cursorRef.current.style.top = `${currentY}px`;
        }
        
        const prevX = lastMousePos.current.x;
        const prevY = lastMousePos.current.y;
        lastMousePos.current = { x: currentX, y: currentY };

        // Only process tools if dragging
        if (!isDragging) return;

        if (isSpacePressed) {
             return;
        }

        if (activeTool === 'select') {
            setCurrentSelection({
                x: Math.min(dragStart.x, currentX),
                y: Math.min(dragStart.y, currentY),
                w: Math.abs(currentX - dragStart.x),
                h: Math.abs(currentY - dragStart.y)
            });
        } else {
            draw(currentX, currentY, prevX, prevY, false);
        }
    };

    const handleMouseUp = () => {
        if (isDragging) {
            if (activeTool === 'select' && currentSelection) {
                if (currentSelection.w > 5 && currentSelection.h > 5) {
                    if (isAltPressed) {
                        let resultList: Rect[] = [];
                        for (const existing of selections) {
                            resultList.push(...subtractRect(existing, currentSelection));
                        }
                        setSelections(resultList);
                    } else {
                        setSelections(prev => [...prev, currentSelection]);
                    }
                }
            }
        }
        setIsDragging(false);
        setCurrentSelection(null);
    };

    const draw = (x: number, y: number, prevX: number, prevY: number, isStart: boolean) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (activeTool === 'brush') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = brushColor;
            ctx.lineWidth = brushSize;
            ctx.globalAlpha = 0.5; 
        } else {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = eraserSize;
            ctx.globalAlpha = 1.0;
        }

        ctx.beginPath();
        if (isStart) {
            ctx.moveTo(x, y);
            ctx.lineTo(x, y);
        } else {
            ctx.moveTo(prevX, prevY);
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    };

    // Calculate bounding box of drawn pixels
    const getCanvasBoundingBox = (): Rect | null => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return null;

        const w = canvas.width;
        const h = canvas.height;
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        let minX = w, minY = h, maxX = 0, maxY = 0;
        let found = false;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const alpha = data[(y * w + x) * 4 + 3];
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

        return {
            x: minX,
            y: minY,
            w: maxX - minX,
            h: maxY - minY
        };
    };

    const handleZoneEdit = async () => {
        if (!editPrompt || !imageRef.current) return;
        
        // Combine selections + drawn area
        const finalSelections = [...selections];
        const drawnRect = getCanvasBoundingBox();
        if (drawnRect) {
            finalSelections.push(drawnRect);
        }

        if (finalSelections.length === 0) {
            alert("Please select or paint an area to edit.");
            return;
        }

        setIsProcessing(true);
        
        const img = imageRef.current;
        const displayW = img.width;
        const displayH = img.height;
        
        let coordinateInstructions = '';
        
        finalSelections.forEach((sel) => {
            const y1 = Math.floor((sel.y / displayH) * 1000);
            const x1 = Math.floor((sel.x / displayW) * 1000);
            const y2 = Math.floor(((sel.y + sel.h) / displayH) * 1000);
            const x2 = Math.floor(((sel.x + sel.w) / displayW) * 1000);
            coordinateInstructions += ` [EDIT_ZONE: ${y1}, ${x1}, ${y2}, ${x2}]`;
        });

        const fullPrompt = `${editPrompt}. STRICT INPAINTING INSTRUCTION: Only modify the pixels within the regions defined by these coordinates (0-1000 scale):${coordinateInstructions}. The rest of the image MUST remain identical pixel-for-pixel. Do not change the background or any other element outside the selected zones.`;

        await onGenerateEdit(fullPrompt, imageUrl, modalRefImage || undefined);
        setIsProcessing(false);
        onClose();
    };

    // Ref Drag
    const handleRefDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingRef(true); };
    const handleRefDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingRef(false); };
    const handleRefDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDraggingRef(false);
        if (e.dataTransfer.files?.[0]?.type.startsWith('image/')) setModalRefImage(e.dataTransfer.files[0]);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
            
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-7xl h-[90vh] flex flex-col md:flex-row overflow-hidden shadow-2xl">
                
                {/* TOOLBAR (Left) */}
                <div className="w-16 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-4 gap-4 z-20">
                    <button 
                        onClick={() => setActiveTool('select')}
                        className={`p-3 rounded-xl transition-all ${activeTool === 'select' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
                        title="Selection Box (Shift to add, Alt to subtract)"
                    >
                        <MousePointer2 className="w-5 h-5" />
                    </button>
                    
                    <button 
                        onClick={() => setActiveTool('brush')}
                        className={`p-3 rounded-xl transition-all ${activeTool === 'brush' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
                        title="Brush Tool"
                    >
                        <Brush className="w-5 h-5" />
                    </button>

                    <button 
                        onClick={() => setActiveTool('eraser')}
                        className={`p-3 rounded-xl transition-all ${activeTool === 'eraser' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
                        title="Eraser Tool"
                    >
                        <Eraser className="w-5 h-5" />
                    </button>

                    <div className="h-px w-8 bg-zinc-800 my-2"></div>

                    {/* Dynamic Tool Settings */}
                    {activeTool === 'brush' && (
                        <div className="flex flex-col items-center gap-3 animate-in slide-in-from-left-4 fade-in">
                            <div className="relative group">
                                <div className="w-8 h-8 rounded-full border border-zinc-700 cursor-pointer flex items-center justify-center" style={{ backgroundColor: brushColor }}>
                                    <Palette className="w-4 h-4 text-white mix-blend-difference" />
                                </div>
                                <input 
                                    type="color" 
                                    value={brushColor}
                                    onChange={e => setBrushColor(e.target.value)}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                            </div>
                            
                            <div className="flex flex-col items-center gap-1">
                                <Circle className="w-3 h-3 text-zinc-500" />
                                <input 
                                    type="range" 
                                    min="5" 
                                    max="100" 
                                    value={brushSize} 
                                    onChange={e => setBrushSize(Number(e.target.value))}
                                    className="h-24 w-1 bg-zinc-800 rounded-full appearance-none cursor-pointer vertical-slider"
                                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                                />
                            </div>
                        </div>
                    )}

                    {activeTool === 'eraser' && (
                        <div className="flex flex-col items-center gap-3 animate-in slide-in-from-left-4 fade-in">
                            <div className="flex flex-col items-center gap-1">
                                <Circle className="w-4 h-4 text-zinc-500" />
                                <input 
                                    type="range" 
                                    min="5" 
                                    max="100" 
                                    value={eraserSize} 
                                    onChange={e => setEraserSize(Number(e.target.value))}
                                    className="h-24 w-1 bg-zinc-800 rounded-full appearance-none cursor-pointer vertical-slider"
                                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Main Image Area */}
                <div className="flex-1 bg-black/50 relative overflow-hidden flex items-center justify-center p-4">
                    <div 
                        ref={containerRef}
                        className={`relative transition-transform duration-200 ease-out select-none ${isSpacePressed ? 'cursor-grabbing' : (activeTool === 'select' ? 'cursor-crosshair' : 'cursor-none')}`}
                        style={{ transform: `scale(${scale})` }}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                    >
                        {/* 1. Base Image */}
                        <img 
                            ref={imageRef}
                            src={imageUrl} 
                            alt="Detail" 
                            onLoad={handleImageLoad}
                            className="max-w-full max-h-[80vh] object-contain shadow-2xl pointer-events-none"
                            draggable={false}
                        />

                        {/* 2. Drawing Canvas Overlay */}
                        <canvas 
                            ref={canvasRef}
                            className="absolute inset-0 pointer-events-none"
                            style={{ width: '100%', height: '100%' }}
                        />

                        {/* 3. Rectangular Selections Overlay */}
                        {selections.map((sel, idx) => (
                            <div 
                                key={idx}
                                className="absolute border-2 border-purple-500 bg-purple-500/20 pointer-events-none"
                                style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
                            />
                        ))}
                        
                        {/* 4. Current Drag Rect */}
                        {currentSelection && activeTool === 'select' && (
                            <div 
                                className={`absolute border-2 pointer-events-none ${isAltPressed ? 'border-red-500 bg-red-500/20' : 'border-purple-400 bg-purple-500/10'}`}
                                style={{ left: currentSelection.x, top: currentSelection.y, width: currentSelection.w, height: currentSelection.h }}
                            />
                        )}

                        {/* 5. Brush Cursor (Directly updated via Ref) */}
                        {!isSpacePressed && activeTool !== 'select' && (
                            <div 
                                ref={cursorRef}
                                className="absolute pointer-events-none border border-white/50 rounded-full transform -translate-x-1/2 -translate-y-1/2"
                                style={{
                                    width: activeTool === 'brush' ? brushSize : eraserSize,
                                    height: activeTool === 'brush' ? brushSize : eraserSize,
                                    backgroundColor: activeTool === 'brush' ? brushColor : 'rgba(255,255,255,0.2)',
                                    left: lastMousePos.current.x,
                                    top: lastMousePos.current.y
                                }}
                            />
                        )}
                    </div>

                    {/* Zoom Controls */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-900/90 border border-zinc-700 p-2 rounded-full shadow-lg z-20">
                        <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="p-2 hover:bg-zinc-800 rounded-full"><ZoomOut className="w-4 h-4" /></button>
                        <span className="text-xs font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
                        <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="p-2 hover:bg-zinc-800 rounded-full"><ZoomIn className="w-4 h-4" /></button>
                    </div>
                </div>

                {/* Sidebar Controls */}
                <div className="w-full md:w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col z-20">
                    <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                        <h3 className="font-bold text-zinc-100">Editor</h3>
                        <div className="flex items-center gap-2">
                            <a 
                                href={imageUrl} 
                                download={`edited-${Date.now()}.png`}
                                className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-colors border border-zinc-700"
                                title="Download"
                            >
                                <Download className="w-4 h-4" />
                            </a>
                            <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        
                        {/* Reference Image Drag & Drop */}
                        <div 
                            onDragOver={handleRefDragOver}
                            onDragLeave={handleRefDragLeave}
                            onDrop={handleRefDrop}
                            className={`
                                relative border-2 border-dashed rounded-xl p-4 transition-colors flex flex-col items-center justify-center gap-2 min-h-[100px]
                                ${isDraggingRef ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-700 bg-zinc-950/50 hover:bg-zinc-900'}
                            `}
                        >
                            {modalRefImage ? (
                                <div className="relative group w-full h-32 rounded-lg overflow-hidden border border-zinc-700">
                                    <img src={URL.createObjectURL(modalRefImage)} alt="Ref" className="w-full h-full object-cover" />
                                    <button 
                                        onClick={() => setModalRefImage(null)}
                                        className="absolute top-2 right-2 bg-black/60 hover:bg-red-500 text-white p-1 rounded-full transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <Upload className="w-6 h-6 text-zinc-500" />
                                    <div className="text-center">
                                        <p className="text-xs text-zinc-400 font-medium">Add Reference</p>
                                    </div>
                                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => e.target.files?.[0] && setModalRefImage(e.target.files[0])} />
                                </>
                            )}
                        </div>

                        {/* Zone Edit */}
                        <div className="space-y-3 animate-in slide-in-from-top-2">
                            <label className="text-xs font-bold text-zinc-400 uppercase">Apply Changes</label>
                            <textarea 
                                value={editPrompt}
                                onChange={(e) => setEditPrompt(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:ring-2 focus:ring-purple-500 outline-none resize-none h-24"
                                placeholder="Describe changes (e.g. 'Add sunglasses')..."
                            />
                            <button 
                                onClick={handleZoneEdit}
                                disabled={(!editPrompt) || isProcessing}
                                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2"
                            >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                Modify
                            </button>
                        </div>
                        
                        <div className="text-[10px] text-zinc-500 text-center space-y-1 mt-4">
                            <p className="text-zinc-400 font-medium mb-2">Shortcuts</p>
                            <div className="grid grid-cols-2 gap-2 text-left bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                                <span>Space + Drag</span> <span className="text-right text-zinc-400">Pan</span>
                                <span>Shift + Select</span> <span className="text-right text-zinc-400">Add Box</span>
                                <span>Alt + Select</span> <span className="text-right text-zinc-400">Sub Box</span>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};
