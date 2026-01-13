import React, { useEffect, useState } from 'react';
import { ActivityLog, User, UserRole, Project } from '../types';
import { getAllActivityLogs, createUser, updateUser, getUsers, deleteUser, getProjects, createProject, deleteProject, getAppConfig, saveAppConfig } from '../services/db';
import { ShieldCheck, RefreshCw, Image, Search, Calendar, UserPlus, X, Lock, Mail, User as UserIcon, Loader2, Trash2, Folder, FolderPlus, PieChart, Pencil, Filter, Settings, Save, Upload, FileDown, DollarSign } from 'lucide-react';
import { formatCurrency } from '../services/credits';

export const AdminView: React.FC = () => {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Config State
    const [configAppName, setConfigAppName] = useState('');
    const [configLogo, setConfigLogo] = useState<string>('');
    const [configSaved, setConfigSaved] = useState(false);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterUser, setFilterUser] = useState<string>('');
    const [filterProject, setFilterProject] = useState<string>('');
    
    // Date Range Filters
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // User Modal State (Create or Edit)
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    
    // User Edit Fields
    const [userId, setUserId] = useState('');
    const [originalEmail, setOriginalEmail] = useState(''); // To track key changes
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<UserRole>('user');
    
    const [createError, setCreateError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Create Project State
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');

    const fetchData = async () => {
        setLoading(true);
        const [logsData, usersData, projectsData] = await Promise.all([
            getAllActivityLogs(),
            getUsers(),
            getProjects()
        ]);
        setLogs(logsData);
        setUsers(usersData);
        setProjects(projectsData);
        
        const config = getAppConfig();
        setConfigAppName(config.appName);
        setConfigLogo(config.logoUrl || '');
        
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- Config Handlers ---
    const handleSaveConfig = () => {
        saveAppConfig({
            appName: configAppName,
            logoUrl: configLogo
        });
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 2000);
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setConfigLogo(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    // --- User Handlers ---

    const openCreateUserModal = () => {
        setIsEditing(false);
        setUserId(crypto.randomUUID());
        setOriginalEmail('');
        setNewName('');
        setNewEmail('');
        setNewPassword('');
        setNewRole('user');
        setCreateError('');
        setIsUserModalOpen(true);
    };

    const openEditUserModal = (user: User) => {
        setIsEditing(true);
        setUserId(user.id);
        setOriginalEmail(user.email);
        setNewName(user.name);
        setNewEmail(user.email);
        setNewPassword(user.password);
        setNewRole(user.role);
        setCreateError('');
        setIsUserModalOpen(true);
    };

    const handleUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateError('');
        setIsSubmitting(true);

        try {
            const userPayload: User = {
                id: userId,
                name: newName,
                email: newEmail,
                password: newPassword,
                role: newRole
            };

            if (isEditing) {
                // Pass original email to handle key update (delete old -> create new)
                await updateUser(userPayload, originalEmail);
            } else {
                await createUser(userPayload);
                
                // --- EMAIL GENERATION LOGIC ---
                // Since this is a client-side app, we open the default mail client
                // with the credentials pre-filled.
                const siteUrl = window.location.origin;
                const subject = `Welcome to ${configAppName} - Your Access Details`;
                const body = `Hello ${newName},

You have been invited to collaborate on ${configAppName}.

Here are your session details:
- Site Link: ${siteUrl}
- Session Email: ${newEmail}
- Session Name: ${newName}
- Session Password: ${newPassword}

Please keep these credentials safe.

Best regards,
Admin`;

                // Open mailto link in new window to avoid disrupting app flow
                window.open(`mailto:${newEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
            }
            
            setIsUserModalOpen(false);
            fetchData();
        } catch (err: any) {
            setCreateError(err.message || "Failed to save user");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUser = async (email: string) => {
        if (window.confirm(`Are you sure you want to remove access for ${email}?`)) {
            await deleteUser(email);
            fetchData();
        }
    };

    // --- Project Handlers ---

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;
        setIsSubmitting(true);
        try {
            await createProject(newProjectName);
            setNewProjectName('');
            setIsCreatingProject(false);
            fetchData();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteProject = async (id: string, name: string) => {
        if (window.confirm(`Delete project "${name}"? This cannot be undone.`)) {
            await deleteProject(id);
            fetchData();
        }
    };

    // --- Filtering ---
    const filteredLogs = logs.filter(log => {
        const matchSearch = log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            log.prompt.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchUser = filterUser ? log.userEmail === filterUser : true;
        const matchProject = filterProject ? log.projectId === filterProject : true;

        // Date Range Logic
        let matchDate = true;
        const logTime = log.timestamp;
        
        if (startDate) {
            const start = new Date(startDate).setHours(0,0,0,0);
            if (logTime < start) matchDate = false;
        }
        
        if (endDate) {
            const end = new Date(endDate).setHours(23,59,59,999);
            if (logTime > end) matchDate = false;
        }

        return matchSearch && matchUser && matchProject && matchDate;
    });

    const clearFilters = () => {
        setFilterUser('');
        setFilterProject('');
        setStartDate('');
        setEndDate('');
        setSearchTerm('');
    };
    
    // --- Cost Calculation ---
    const totalCost = filteredLogs.reduce((acc, log) => acc + (log.cost || 0), 0);

    // --- Report Export ---
    const downloadFinancialReport = () => {
        const headers = ["Timestamp", "User Email", "Project ID", "Project Name", "Action", "Cost (USD)", "Details", "Prompt"];
        
        const rows = filteredLogs.map(log => {
            const projName = projects.find(p => p.id === log.projectId)?.name || 'N/A';
            return [
                new Date(log.timestamp).toLocaleString().replace(',', ''),
                log.userEmail,
                log.projectId || 'N/A',
                `"${projName}"`,
                log.action,
                (log.cost || 0).toFixed(4),
                `"${log.details}"`, 
                `"${log.prompt.replace(/"/g, '""')}"` 
            ]
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `financial_report_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                <div>
                    <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
                        <ShieldCheck className="w-6 h-6 text-green-400" />
                        Admin Dashboard
                    </h2>
                    <p className="text-zinc-500 text-sm mt-1">Manage users, projects, and view activity.</p>
                </div>
                <button 
                    onClick={fetchData}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition-colors"
                    title="Refresh Data"
                >
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>

            {/* --- Branding Configuration --- */}
            <div className="space-y-4">
                 <h3 className="text-xl font-bold text-zinc-200 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-pink-400" />
                    Application Branding
                </h3>
                
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-400 uppercase">Application Name</label>
                            <input 
                                type="text" 
                                value={configAppName}
                                onChange={(e) => setConfigAppName(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-200 outline-none focus:ring-2 focus:ring-pink-500"
                                placeholder="DPR AI Studio"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-400 uppercase">Logo (Square Recommended)</label>
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
                                    {configLogo ? (
                                        <img src={configLogo} alt="Logo" className="w-full h-full object-cover" />
                                    ) : (
                                        <Image className="w-5 h-5 text-zinc-600" />
                                    )}
                                </div>
                                <label className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg cursor-pointer border border-zinc-700 transition-colors text-sm">
                                    <Upload className="w-4 h-4" /> Upload Image
                                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                </label>
                                {configLogo && (
                                    <button onClick={() => setConfigLogo('')} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-6 flex justify-end">
                        <button 
                            onClick={handleSaveConfig}
                            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${configSaved ? 'bg-green-600 text-white' : 'bg-pink-600 hover:bg-pink-500 text-white'}`}
                        >
                            {configSaved ? 'Saved!' : 'Save Branding'}
                        </button>
                    </div>
                </div>
            </div>

            {/* --- Project Management Section --- */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-zinc-200 flex items-center gap-2">
                        <Folder className="w-5 h-5 text-blue-400" />
                        Project Management
                    </h3>
                    <button 
                        onClick={() => setIsCreatingProject(true)}
                        className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                    >
                        <FolderPlus className="w-3.5 h-3.5" /> New Project
                    </button>
                </div>
                
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-zinc-400">
                            <thead className="bg-zinc-900/80 text-zinc-200 uppercase font-medium border-b border-zinc-800">
                                <tr>
                                    <th className="px-6 py-3">Project Name</th>
                                    <th className="px-6 py-3">Images Generated</th>
                                    <th className="px-6 py-3">Created</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                                {projects.map(proj => (
                                    <tr key={proj.id} className="hover:bg-zinc-900/30">
                                        <td className="px-6 py-3 font-medium text-zinc-200">{proj.name}</td>
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-2">
                                                <PieChart className="w-4 h-4 text-blue-400" />
                                                <span className="font-bold">{proj.imageCount || 0}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3">{new Date(proj.createdAt).toLocaleDateString()}</td>
                                        <td className="px-6 py-3 text-right">
                                            <button 
                                                onClick={() => handleDeleteProject(proj.id, proj.name)}
                                                className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                                                title="Delete Project"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* --- User Management Section --- */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-zinc-200 flex items-center gap-2">
                        <UserIcon className="w-5 h-5 text-purple-400" />
                        User Management
                    </h3>
                    <button 
                        onClick={openCreateUserModal}
                        className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                    >
                        <UserPlus className="w-3.5 h-3.5" /> Add User
                    </button>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-zinc-400">
                            <thead className="bg-zinc-900/80 text-zinc-200 uppercase font-medium border-b border-zinc-800">
                                <tr>
                                    <th className="px-6 py-3">Name</th>
                                    <th className="px-6 py-3">Email</th>
                                    <th className="px-6 py-3">Role</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                                {users.map(user => (
                                    <tr key={user.email} className="hover:bg-zinc-900/30">
                                        <td className="px-6 py-3 font-medium text-zinc-200">{user.name}</td>
                                        <td className="px-6 py-3">{user.email}</td>
                                        <td className="px-6 py-3">
                                            <span className={`text-xs px-2 py-0.5 rounded border ${user.role === 'admin' ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-zinc-700 bg-zinc-800'}`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={() => openEditUserModal(user)}
                                                    className="text-zinc-500 hover:text-blue-400 transition-colors p-1"
                                                    title="Edit User"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                {user.role !== 'admin' || user.email !== 'karim.benkiran@dprgroup.com' ? (
                                                    <button 
                                                        onClick={() => handleDeleteUser(user.email)}
                                                        className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                                                        title="Remove User"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                ) : (
                                                    <span className="w-6" /> // spacer
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* --- Activity Logs Section --- */}
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h3 className="text-xl font-bold text-zinc-200 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-orange-400" />
                        Activity Logs & Financials
                    </h3>
                    
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
                            <input 
                                type="text" 
                                placeholder="Search prompts..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-zinc-950 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-200 focus:ring-1 focus:ring-purple-500 outline-none w-32"
                            />
                        </div>

                        <select 
                            value={filterUser}
                            onChange={(e) => setFilterUser(e.target.value)}
                            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:ring-1 focus:ring-purple-500 outline-none"
                        >
                            <option value="">All Users</option>
                            {users.map(u => <option key={u.email} value={u.email}>{u.name}</option>)}
                        </select>

                        <select 
                            value={filterProject}
                            onChange={(e) => setFilterProject(e.target.value)}
                            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:ring-1 focus:ring-purple-500 outline-none"
                        >
                            <option value="">All Projects</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>

                        <div className="flex items-center gap-1">
                            <input 
                                type="date"
                                title="Start Date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:ring-1 focus:ring-purple-500 outline-none w-32"
                            />
                            <span className="text-zinc-500 text-xs">-</span>
                            <input 
                                type="date"
                                title="End Date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:ring-1 focus:ring-purple-500 outline-none w-32"
                            />
                        </div>
                        
                        {(filterUser || filterProject || startDate || endDate || searchTerm) && (
                            <button 
                                onClick={clearFilters}
                                className="text-xs text-red-400 hover:text-red-300"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left text-sm text-zinc-400">
                        <thead className="bg-zinc-900/80 text-zinc-200 uppercase font-medium border-b border-zinc-800 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4">Time</th>
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Project</th>
                                <th className="px-6 py-4">Action</th>
                                <th className="px-6 py-4">Prompt</th>
                                <th className="px-6 py-4 text-right">Cost</th>
                                <th className="px-6 py-4">Preview</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {filteredLogs.map(log => {
                                const projName = projects.find(p => p.id === log.projectId)?.name || 'N/A';
                                return (
                                    <tr key={log.id} className="hover:bg-zinc-900/30 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-xs">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-zinc-300">{log.userEmail}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-zinc-400 text-xs bg-zinc-800 px-2 py-1 rounded border border-zinc-700">{projName}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-xs uppercase font-bold tracking-wider">{log.action}</span>
                                        </td>
                                        <td className="px-6 py-4 max-w-xs truncate text-xs">
                                            {log.prompt}
                                        </td>
                                        <td className="px-6 py-4 text-right text-xs font-mono text-green-400">
                                            {formatCurrency(log.cost || 0)}
                                        </td>
                                        <td className="px-6 py-4">
                                            {log.thumbnailUrl && (
                                                <a href={log.thumbnailUrl} target="_blank" rel="noreferrer" className="block w-8 h-8 rounded bg-zinc-800 border border-zinc-700 overflow-hidden">
                                                    <img src={log.thumbnailUrl} alt="log" className="w-full h-full object-cover" />
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredLogs.length === 0 && (
                                <tr><td colSpan={7} className="px-6 py-8 text-center">No logs match your filter.</td></tr>
                            )}
                        </tbody>
                        <tfoot className="bg-zinc-950 border-t border-zinc-800 sticky bottom-0 z-10">
                            <tr>
                                <td colSpan={5} className="px-6 py-4 text-right font-medium text-zinc-300">Total Filtered Cost:</td>
                                <td className="px-6 py-4 text-right font-bold text-green-400 font-mono text-sm">
                                    {formatCurrency(totalCost)}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                
                {/* Financial Export */}
                <div className="flex justify-end">
                    <button 
                        onClick={downloadFinancialReport}
                        disabled={filteredLogs.length === 0}
                        className="flex items-center gap-2 bg-green-700/20 hover:bg-green-700/30 text-green-400 border border-green-700/50 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <FileDown className="w-4 h-4" /> Download Financial Report
                    </button>
                </div>
            </div>

            {/* Create Project Modal */}
            {isCreatingProject && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                     <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                        <button onClick={() => setIsCreatingProject(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
                        <h3 className="text-lg font-bold text-white mb-4">Create New Project</h3>
                        <form onSubmit={handleCreateProject} className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-zinc-400 uppercase">Project Name</label>
                                <input 
                                    type="text" 
                                    required
                                    autoFocus
                                    value={newProjectName}
                                    onChange={e => setNewProjectName(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-200 outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                                    placeholder="Marketing Q3..."
                                />
                            </div>
                            <button 
                                type="submit" 
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Project"}
                            </button>
                        </form>
                     </div>
                </div>
            )}

            {/* User Modal (Create / Edit) */}
            {isUserModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                        <button 
                            onClick={() => setIsUserModalOpen(false)}
                            className="absolute top-4 right-4 text-zinc-500 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        
                        <h3 className="text-xl font-bold text-white mb-1">
                            {isEditing ? 'Edit User' : 'Add Collaborator'}
                        </h3>
                        <p className="text-zinc-500 text-sm mb-6">
                            {isEditing ? 'Update user details and access.' : 'Create a new session account for your team.'}
                        </p>
                        
                        <form onSubmit={handleUserSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-zinc-400 uppercase">Full Name</label>
                                <div className="relative">
                                    <UserIcon className="absolute left-3 top-3 w-4 h-4 text-zinc-600" />
                                    <input 
                                        type="text"
                                        required
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder="John Doe"
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-zinc-400 uppercase">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 w-4 h-4 text-zinc-600" />
                                    <input 
                                        type="email"
                                        required
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder="john@company.com"
                                    />
                                </div>
                                {isEditing && originalEmail !== newEmail && (
                                    <p className="text-[10px] text-yellow-500 mt-1">Changing email will create a new user record and remove the old one.</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-zinc-400 uppercase">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 w-4 h-4 text-zinc-600" />
                                    <input 
                                        type="text" 
                                        required
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-zinc-400 uppercase">Role</label>
                                <select 
                                    value={newRole}
                                    onChange={e => setNewRole(e.target.value as UserRole)}
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500"
                                >
                                    <option value="user">User (Collaborator)</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            {createError && (
                                <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-300 text-sm">
                                    {createError}
                                </div>
                            )}

                            <div className="pt-2">
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (isEditing ? "Save Changes" : "Create Account")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};