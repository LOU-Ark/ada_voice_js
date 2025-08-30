

import React, { useState, useCallback, ChangeEvent, useEffect, useMemo, useRef } from 'react';
import { Persona, PersonaState, PersonaHistoryEntry, ChatMessage, PersonaCreationChatMessage, MbtiProfile } from '../types';
import * as geminiService from '../services/geminiService';
// Fix: Removed unused 'BackIcon' which is not exported from './icons'.
// Fix: Import EditIcon to resolve reference error.
import { MagicWandIcon, TextIcon, SaveIcon, CloseIcon, HistoryIcon, SendIcon, UndoIcon, UploadIcon, SearchIcon, SparklesIcon, BrainIcon, EditIcon } from './icons';
import { Loader } from './Loader';
import { RadarChart } from './RadarChart';

interface CreatePersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (persona: PersonaState) => Promise<void>;
}

const emptyPersona: PersonaState = {
  name: '', role: '', tone: '', personality: '', worldview: '', experience: '', other: '', summary: '', sources: [],
};

export const CreatePersonaModal: React.FC<CreatePersonaModalProps> = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [summary, setSummary] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const resetState = useCallback(() => {
        setName('');
        setSummary('');
        setIsLoading(false);
        setLoadingMessage('');
        setError(null);
    }, []);

    useEffect(() => {
        if (isOpen) {
            resetState();
        }
    }, [isOpen, resetState]);

    const handleSave = async () => {
        if (!name.trim()) {
            setError('Persona name is required.');
            return;
        }
        setIsLoading(true);
        setLoadingMessage("Creating persona...");
        try {
            await onSave({ ...emptyPersona, name, summary });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create persona.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleFileUploadForExtraction = useCallback(async (file: File) => {
        if (!file) return;

        const isJson = file.type === "application/json" || file.name.endsWith('.json');
        const isText = file.type === "text/plain" || file.name.endsWith('.txt');

        if (!isJson && !isText) {
            setError("Please upload a valid .txt or .json file.");
            return;
        }

        const text = await file.text();
        if (!text) {
            setError("File is empty.");
            return;
        }

        setError(null);
        setIsLoading(true);

        try {
            if (isJson) {
                setLoadingMessage("Parsing JSON file...");
                const importedData = JSON.parse(text);

                if (typeof importedData.name === 'undefined') {
                    throw new Error("Invalid persona JSON. It must be a single persona object with at least a 'name' property.");
                }
                
                const personaState: PersonaState = {
                    name: importedData.name || '',
                    role: importedData.role || '',
                    tone: importedData.tone || '',
                    personality: importedData.personality || '',
                    worldview: importedData.worldview || '',
                    experience: importedData.experience || '',
                    other: importedData.other || '',
                    summary: importedData.summary || '',
                    sources: importedData.sources || [],
                    mbtiProfile: importedData.mbtiProfile,
                };
                setLoadingMessage("Creating persona from JSON...");
                await onSave(personaState);

            } else { // isText
                setLoadingMessage("AI is analyzing the document...");
                const extractedParams = await geminiService.extractParamsFromDoc(text);
                setLoadingMessage("AI is generating a summary...");
                const summary = await geminiService.generateSummaryFromParams(extractedParams);
                setLoadingMessage("Finalizing persona...");
                await onSave({ ...extractedParams, summary });
            }
        } catch (err) {
            if (err instanceof SyntaxError) {
                setError("Invalid JSON format in the provided file.");
            } else {
                setError(err instanceof Error ? err.message : "Failed to create persona from file.");
            }
        } finally {
            setIsLoading(false);
        }
    }, [onSave]);

    const handleUploadClick = () => fileInputRef.current?.click();
    const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files?.[0]) handleFileUploadForExtraction(e.dataTransfer.files[0]);
    };
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" onClick={onClose}>
            {isLoading && <Loader message={loadingMessage} />}
            <div className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl flex flex-col relative" onClick={e => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">Create New Persona</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon/></button>
                </header>

                <main className="p-6 space-y-6">
                    {error && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-md mb-4 text-sm">{error}</div>}
                    
                    <p className="text-gray-400 text-sm">Quickly create a new persona by providing a name and summary, or upload a character sheet.</p>

                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-400 mb-1">Name</label>
                        <input type="text" id="name" value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-800/60 rounded-md p-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors" />
                    </div>
                     <div>
                        <label htmlFor="summary" className="block text-sm font-medium text-gray-400 mb-1">Summary (Optional)</label>
                        <textarea id="summary" value={summary} onChange={e => setSummary(e.target.value)} rows={3} className="w-full bg-gray-800/60 rounded-md p-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors" />
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true"><div className="w-full border-t border-gray-700"></div></div>
                        <div className="relative flex justify-center"><span className="px-2 bg-gray-800 text-sm text-gray-500">OR</span></div>
                    </div>

                    <div onClick={handleUploadClick} onDrop={handleFileDrop} onDragOver={handleDragOver} className="flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-500 hover:bg-gray-800/50 transition-all">
                        <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.json" onChange={(e) => e.target.files && handleFileUploadForExtraction(e.target.files[0])} />
                        <UploadIcon />
                        <p className="mt-2 font-semibold text-gray-400">Create From File</p>
                        <p className="text-xs text-gray-500">Drag & drop or click to upload a .txt or .json file.</p>
                    </div>
                </main>

                <footer className="flex-shrink-0 flex justify-end p-4 border-t border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white mr-2">Cancel</button>
                    <button onClick={handleSave} disabled={isLoading || !name.trim()} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors rounded-md shadow-lg disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <SaveIcon />
                        Create Persona
                    </button>
                </footer>
            </div>
        </div>
    );
};

// =========================================================================================

interface PersonaEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (persona: PersonaState & { id?: string }) => Promise<void>;
  initialPersona: Persona;
}

const parameterLabels: Record<keyof Omit<PersonaState, 'id' | 'summary' | 'shortSummary' | 'shortTone' | 'sources' | 'mbtiProfile'>, string> = {
  name: "Name",
  role: "Role",
  tone: "Tone",
  personality: "Personality",
  worldview: "Worldview / Background",
  experience: "Experience / History",
  other: "Other Notes"
};


const TappableParameter: React.FC<{ label: string, value: string, onClick: () => void }> = ({ label, value, onClick }) => (
    <div onClick={onClick} className="bg-gray-800/60 p-3 rounded-lg cursor-pointer hover:bg-gray-700/80 transition-colors group">
        <div className="flex justify-between items-center">
            <label className="block text-sm font-medium text-gray-400 mb-1">{label}</label>
            <EditIcon className="h-4 w-4 text-gray-500 group-hover:text-indigo-400 transition-colors" />
        </div>
        <p className="text-gray-300 text-sm line-clamp-2 pr-4">
            {value || <span className="italic text-gray-500">Not set</span>}
        </p>
    </div>
);

const ParameterDetailModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (field: keyof PersonaState, value: string) => void;
  fieldData: { field: keyof PersonaState; label: string; value: string } | null;
  children?: React.ReactNode;
}> = ({ isOpen, onClose, onSave, fieldData, children }) => {
    const [currentValue, setCurrentValue] = useState('');

    useEffect(() => {
        if (fieldData) {
            setCurrentValue(fieldData.value);
        }
    }, [fieldData]);

    if (!isOpen || !fieldData) return null;

    const handleSave = () => {
        onSave(fieldData.field, currentValue);
    };

    const isTextArea = fieldData.field !== 'name';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[60] p-4" onClick={onClose}>
            <div className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl flex flex-col relative h-[70vh]" onClick={e => e.stopPropagation()}>
                <header className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-700">
                    <h3 className="text-lg font-bold text-gray-200">{fieldData.label}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon /></button>
                </header>
                <main className="p-4 flex-grow flex flex-col min-h-0">
                    {isTextArea ? (
                         <textarea
                            value={currentValue}
                            onChange={e => setCurrentValue(e.target.value)}
                            className="w-full h-full bg-gray-900 rounded-md p-3 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    ) : (
                         <input
                            type="text"
                            value={currentValue}
                            onChange={e => setCurrentValue(e.target.value)}
                            className="w-full bg-gray-900 rounded-md p-3 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                         />
                    )}
                   
                    {children && <div className="flex-shrink-0 mt-4">{children}</div>}
                </main>
                <footer className="flex-shrink-0 flex justify-end p-4 border-t border-gray-700">
                     <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white mr-2">Cancel</button>
                     <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors rounded-md shadow-lg">Done</button>
                </footer>
            </div>
        </div>
    );
};


const ParametersPanel: React.FC<{
  parameters: PersonaState;
  onEditField: (field: keyof PersonaState, label: string) => void;
}> = ({ parameters, onEditField }) => (
    <div className="space-y-4 bg-gray-900/50 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-300 mb-2">Parameters</h3>
        {Object.entries(parameterLabels).map(([key, label]) => (
            <TappableParameter
                key={key}
                label={label}
                value={parameters[key as keyof typeof parameterLabels]}
                onClick={() => onEditField(key as keyof PersonaState, label)}
            />
        ))}
    </div>
);

const SummaryPanel: React.FC<{
  parameters: PersonaState;
  onEditField: (field: keyof PersonaState, label: string) => void;
}> = ({ parameters, onEditField }) => (
    <div className="bg-gray-900/50 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-300 mb-2">AI-Generated Summary</h3>
        <TappableParameter
            label="Summary"
            value={parameters.summary}
            onClick={() => onEditField('summary', 'AI-Generated Summary')}
        />
        {parameters.sources && parameters.sources.length > 0 && (
            <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-400">Sources:</h4>
                <ul className="list-disc list-inside text-xs text-gray-500 mt-1 space-y-1">
                    {parameters.sources.map((source, index) => (
                        <li key={index}><a href={source.uri} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 underline truncate">{source.title}</a></li>
                    ))}
                </ul>
            </div>
        )}
      </div>
);

const MbtiPanel: React.FC<{
  mbtiProfile: MbtiProfile | undefined;
  isLoading: boolean;
  onAnalyze: () => void;
}> = ({ mbtiProfile, isLoading, onAnalyze }) => {
    const radarData = useMemo(() => {
        if (!mbtiProfile) return [];
        const { scores } = mbtiProfile;
        return [
            { label: 'Mind', value: scores.mind }, // I to E
            { label: 'Energy', value: scores.energy }, // S to N
            { label: 'Nature', value: scores.nature }, // T to F
            { label: 'Tactics', value: scores.tactics }, // J to P
        ];
    }, [mbtiProfile]);

    return (
        <div className="flex flex-col bg-gray-900/50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-300 mb-2">MBTI Personality Profile</h3>
            {!mbtiProfile ? (
                <div className="text-center bg-gray-800/60 rounded-lg p-6 flex flex-col items-center justify-center">
                    <p className="text-sm text-gray-400 mb-4">Analyze persona to determine their MBTI type.</p>
                    <button onClick={onAnalyze} disabled={isLoading} className="flex items-center justify-center gap-2 w-full px-3 py-1.5 text-sm bg-indigo-600/80 hover:bg-indigo-600 disabled:bg-indigo-900/50 disabled:cursor-not-allowed transition-colors rounded-md">
                        <BrainIcon /> Analyze Personality
                    </button>
                </div>
            ) : (
                <div className="bg-gray-800/60 rounded-lg p-4 space-y-4">
                    <div className="flex items-baseline gap-3">
                        <h4 className="text-3xl font-bold text-indigo-400">{mbtiProfile.type}</h4>
                        <p className="text-md text-gray-400">{mbtiProfile.typeName}</p>
                    </div>
                    <div className="flex flex-col md:flex-row items-center gap-4">
                        <div className="flex-shrink-0">
                            <RadarChart data={radarData} size={150} />
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed">{mbtiProfile.description}</p>
                    </div>
                     <button onClick={onAnalyze} disabled={isLoading} className="flex items-center justify-center gap-2 w-full px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700/50 disabled:cursor-not-allowed transition-colors rounded-md">
                        <BrainIcon /> Re-analyze
                    </button>
                </div>
            )}
        </div>
    );
};


const HistoryPanel: React.FC<{
  previousParameters: (PersonaState & { id?: string }) | null;
  handleUndo: () => void;
  initialPersona: Persona;
  handleRevert: (entry: PersonaHistoryEntry) => void;
}> = ({ previousParameters, handleUndo, initialPersona, handleRevert }) => (
    <div className="flex flex-col bg-gray-900/50 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <h3 className="text-lg font-semibold text-gray-300">Version History</h3>
        {previousParameters && <button onClick={handleUndo} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"><UndoIcon /> Undo Last AI Edit</button>}
      </div>
      <div className="space-y-3">
        {initialPersona.history.length > 0 ? (
          initialPersona.history.map(entry => (
            <div key={entry.timestamp} className="bg-gray-800/70 p-3 rounded-md">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold text-gray-300">{entry.changeSummary}</p>
                  <p className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleString()}</p>
                </div>
                <button onClick={() => handleRevert(entry)} className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded-md transition-colors">Revert</button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">No saved versions yet.</p>
        )}
      </div>
    </div>
);

const AiToolsPanel: React.FC<{
    parameters: PersonaState & { id?: string };
    setParameters: React.Dispatch<React.SetStateAction<PersonaState & { id?: string; }>>;
    setPreviousParameters: React.Dispatch<React.SetStateAction<(PersonaState & { id?: string; }) | null>>;
    isLoading: boolean;
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setLoadingMessage: React.Dispatch<React.SetStateAction<string>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
    handleGenerateSummary: (params: PersonaState, message?: string) => Promise<void>;
    setActiveTab: (tab: 'editor' | 'ai_tools' | 'chat') => void;
    onEditField: (field: keyof PersonaState, label: string) => void;
}> = ({ parameters, setParameters, setPreviousParameters, isLoading, setIsLoading, setLoadingMessage, setError, handleGenerateSummary, setActiveTab, onEditField }) => {
    const [searchTopic, setSearchTopic] = useState('');
    const [refinementChatHistory, setRefinementChatHistory] = useState<PersonaCreationChatMessage[]>([]);
    const [refinementChatInput, setRefinementChatInput] = useState('');
    const [isRefinementChatLoading, setIsRefinementChatLoading] = useState(false);
    const [showRefinementChat, setShowRefinementChat] = useState(false);
    const [isChatInputFocused, setIsChatInputFocused] = useState(false);

    const generateWelcomeMessage = useCallback(async () => {
        // This check is important to prevent re-fetching on every render.
        if (refinementChatHistory.length > 0) return;

        setIsRefinementChatLoading(true);
        setError(null);
        try {
            const welcomeText = await geminiService.generateRefinementWelcomeMessage(parameters);
            const welcomeMessage: PersonaCreationChatMessage = { role: 'model', text: welcomeText };
            setRefinementChatHistory([welcomeMessage]);
        } catch (err) {
            const errorMessage: PersonaCreationChatMessage = { 
                role: 'model', 
                text: "チャットを開始できませんでした。エラーが発生しました。" 
            };
            setRefinementChatHistory([errorMessage]);
            setError(err instanceof Error ? err.message : "Failed to start chat.");
        } finally {
            setIsRefinementChatLoading(false);
        }
    }, [parameters, setError, refinementChatHistory.length]);

    useEffect(() => {
        // Only generate the welcome message if the chat is shown and is empty.
        // This prevents re-generating the message on re-renders if it already exists.
        if (showRefinementChat && refinementChatHistory.length === 0) {
            generateWelcomeMessage();
        }
    }, [showRefinementChat, refinementChatHistory.length, generateWelcomeMessage]);


    const handleCreateFromWeb = async () => {
        if (!searchTopic.trim()) {
          setError("Please enter a topic to search for.");
          return;
        }
        setError(null);
        setIsLoading(true);
        setLoadingMessage("Searching the web and creating persona...");
        setPreviousParameters(parameters); // for undo
        try {
          const { personaState } = await geminiService.createPersonaFromWeb(searchTopic);
          const newParams = { ...parameters, ...personaState };
          setParameters(newParams);
          await handleGenerateSummary(newParams, "AI is generating a summary...");
          setActiveTab('editor');
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to create persona from the web.");
          setPreviousParameters(null);
        } finally {
          setIsLoading(false);
        }
    };

    const handleRefinementChatMessageSend = async () => {
        if (!refinementChatInput.trim() || isRefinementChatLoading) return;
        const newUserMessage: PersonaCreationChatMessage = { role: 'user', text: refinementChatInput };
        const newHistory = [...refinementChatHistory, newUserMessage];
        setRefinementChatHistory(newHistory);
        setRefinementChatInput('');
        setIsRefinementChatLoading(true);
        setError(null);
        
        try {
            const { responseText, updatedParameters } = await geminiService.continuePersonaCreationChat(newHistory, parameters);
            const modelMessage: PersonaCreationChatMessage = { role: 'model', text: responseText };
            setRefinementChatHistory(prev => [...prev, modelMessage]);
            setParameters(prev => ({ ...prev, ...updatedParameters }));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to get chat response.");
            setRefinementChatHistory(refinementChatHistory); // Revert history
        } finally {
            setIsRefinementChatLoading(false);
        }
    };

    if (showRefinementChat) {
        return (
            <div className="flex flex-col h-full bg-gray-900/50 rounded-lg p-4">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-200">Refine with AI Chat</h3>
                    <button onClick={() => setShowRefinementChat(false)} className="text-sm text-indigo-400 hover:text-indigo-300">Done</button>
                 </div>
                <div className="flex-grow flex flex-col gap-4 min-h-0">
                    <div className="flex-grow flex flex-col bg-gray-800/60 rounded-lg p-2 min-h-0">
                        <div className="flex-grow overflow-y-auto pr-2 space-y-3">
                            {refinementChatHistory.map((msg, index) => (
                                <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm flex-shrink-0">AI</div>}
                                    <div className={`max-w-md px-3 py-2 rounded-lg text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}><p className="whitespace-pre-wrap">{msg.text}</p></div>
                                </div>
                            ))}
                            {isRefinementChatLoading && <div className="flex items-end gap-2 justify-start"><div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm flex-shrink-0">AI</div><div className="px-4 py-2 rounded-lg bg-gray-700 text-gray-200"><div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></span><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.2s]"></span><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.4s]"></span></div></div></div>}
                        </div>
                        <div className="mt-2 flex gap-2">
                            <input
                                type="text"
                                value={refinementChatInput}
                                onChange={(e) => setRefinementChatInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleRefinementChatMessageSend()}
                                onFocus={() => setIsChatInputFocused(true)}
                                onBlur={() => setIsChatInputFocused(false)}
                                placeholder="e.g., Make her more cynical"
                                className="w-full bg-gray-700/80 rounded-md p-2 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                disabled={isRefinementChatLoading}
                            />
                            <button onClick={handleRefinementChatMessageSend} disabled={isRefinementChatLoading || !refinementChatInput.trim()} className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800/50 rounded-md"><SendIcon /></button>
                        </div>
                    </div>
                    {!isChatInputFocused && (
                        <div className="flex-shrink-0 bg-gray-800/60 rounded-lg p-3">
                            <h4 className="text-md font-semibold text-gray-300 mb-2">Live Preview</h4>
                            <div className="max-h-24 overflow-y-auto space-y-2 pr-2">
                                {Object.entries(parameterLabels).map(([key, label]) => (
                                    <TappableParameter
                                        key={key}
                                        label={label}
                                        value={parameters[key as keyof typeof parameterLabels] || ''}
                                        onClick={() => onEditField(key as keyof PersonaState, label)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    
    return (
        <div className="bg-gray-900/50 p-4 rounded-lg space-y-6">
            <h3 className="text-lg font-semibold text-gray-300">AI Tools</h3>
            <div>
                <h4 className="text-md font-semibold text-gray-300 mb-2">Re-generate from Topic</h4>
                <div className="flex gap-2">
                    <input type="text" value={searchTopic} onChange={(e) => setSearchTopic(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleCreateFromWeb()} placeholder="e.g., 'A stoic samurai'" className="w-full bg-gray-800/60 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button onClick={handleCreateFromWeb} disabled={isLoading || !searchTopic.trim()} className="flex-shrink-0 flex items-center gap-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800/50 text-sm rounded-md"><SearchIcon/> Generate</button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Overwrites current parameters based on a new topic.</p>
            </div>
            <div>
                 <button onClick={() => setShowRefinementChat(true)} className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800 hover:bg-gray-700/80 transition-colors rounded-lg shadow-md text-left">
                    <SparklesIcon />
                    <div>
                        <p className="font-semibold text-indigo-400">Refine with AI Chat</p>
                        <p className="text-xs text-gray-500">Fine-tune persona parameters with conversational commands.</p>
                    </div>
                </button>
            </div>
        </div>
    );
};


export const PersonaEditorModal: React.FC<PersonaEditorModalProps> = ({ isOpen, onClose, onSave, initialPersona }) => {
  const [parameters, setParameters] = useState<PersonaState & { id: string }>({ ...emptyPersona, ...initialPersona });
  const [previousParameters, setPreviousParameters] = useState<PersonaState & { id: string } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<{ field: keyof PersonaState; label: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'editor' | 'ai_tools' | 'chat'>('editor');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens/closes or initial persona changes
  useEffect(() => {
    setParameters({ ...emptyPersona, ...initialPersona });
    setPreviousParameters(null);
    setError(null);
    setActiveTab('editor');
    setChatHistory([]);
    setChatInput('');
    setEditingField(null);
  }, [initialPersona, isOpen]);
  
  // Auto-scroll chat to the bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleTabChange = (tab: 'editor' | 'ai_tools' | 'chat') => {
    setActiveTab(tab);
    if (tab === 'chat' && chatHistory.length === 0) {
      const welcomeMessage: ChatMessage = {
        role: 'model',
        parts: [{ text: `こんにちは、${parameters.name}です。何かお話ししましょう。` }]
      };
      setChatHistory([welcomeMessage]);
    }
  };
  
  const handleEditField = (field: keyof PersonaState, label: string) => {
    setEditingField({ field, label });
  };

  const handleSaveField = (field: keyof PersonaState, value: string) => {
    setParameters(prev => ({ ...prev, [field]: value }));
    setEditingField(null);
  };

  const handleGenerateSummary = useCallback(async (paramsToSummarize: PersonaState, message = "AI is generating a summary...") => {
    if(!paramsToSummarize.name) {
      setError("Please provide a name before generating a summary.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setLoadingMessage(message);
    try {
      const generatedSummary = await geminiService.generateSummaryFromParams({ ...paramsToSummarize, summary: '' });
      setParameters(prev => ({...prev, summary: generatedSummary}));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSyncFromSummary = async () => {
    if (!parameters.summary.trim()) { setError("Summary is empty."); return; }
    setError(null);
    setIsLoading(true);
    setLoadingMessage("AI is updating parameters from summary...");
    setPreviousParameters(parameters); // Save current state for undo
    try {
      const extractedParams = await geminiService.updateParamsFromSummary(parameters.summary);
      setParameters(prev => ({ ...prev, ...extractedParams }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update parameters from summary.");
      setPreviousParameters(null); // Clear undo state on error
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleAnalyzeMbti = async () => {
    setError(null);
    setIsLoading(true);
    setLoadingMessage("AI is analyzing personality...");
    try {
        const mbtiProfile = await geminiService.generateMbtiProfile(parameters);
        setParameters(prev => ({ ...prev, mbtiProfile }));
    } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to analyze MBTI profile.");
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleSave = async () => {
    if (!parameters.name) { setError("Persona name is required."); return; }
    setIsLoading(true);
    setLoadingMessage("Saving and analyzing changes...");
    try {
      await onSave(parameters);
      setActiveTab('editor');
    } catch (err) {
        setError(err instanceof Error ? err.message : "An unknown error occurred during save.");
    } finally {
        setIsLoading(false);
    }
  }

  const handleRevert = useCallback((historyEntry: PersonaHistoryEntry) => {
    setParameters(prev => ({ ...prev, ...historyEntry.state }));
    setPreviousParameters(null); // History revert clears undo state
  }, []);
  
  const handleUndo = useCallback(() => {
    if (previousParameters) {
        setParameters(previousParameters);
        setPreviousParameters(null);
    }
  }, [previousParameters]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const newUserMessage: ChatMessage = { role: 'user', parts: [{ text: chatInput }] };
    const newHistory = [...chatHistory, newUserMessage];
    setChatHistory(newHistory);
    setChatInput('');
    setIsChatLoading(true);
    setError(null);
    try {
      const responseText = await geminiService.getPersonaChatResponse(parameters, newHistory);
      const modelMessage: ChatMessage = { role: 'model', parts: [{ text: responseText }] };
      setChatHistory(prev => [...prev, modelMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get chat response.");
      setChatHistory(chatHistory); // Revert history on error
    } finally {
      setIsChatLoading(false);
    }
  };
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" onClick={onClose}>
       {isLoading && <Loader message={loadingMessage} />}
      <div className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
        <header className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">{initialPersona.name}</h2>
          <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-gray-900 p-1 rounded-lg">
                <button onClick={() => handleTabChange('editor')} className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${activeTab === 'editor' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Editor</button>
                <button onClick={() => handleTabChange('ai_tools')} className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${activeTab === 'ai_tools' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>AI Tools</button>
                <button onClick={() => handleTabChange('chat')} className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${activeTab === 'chat' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Test Chat</button>
              </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon/></button>
          </div>
        </header>
        
        <main className="flex-grow p-1 sm:p-6 overflow-y-auto min-h-0">
          {error && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-md mb-4 text-sm">{error}</div>}
          
          {activeTab === 'editor' && (
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <div className="space-y-6">
                     <ParametersPanel parameters={parameters} onEditField={handleEditField}/>
                 </div>
                 <div className="space-y-6">
                     <SummaryPanel parameters={parameters} onEditField={handleEditField} />
                     <MbtiPanel mbtiProfile={parameters.mbtiProfile} isLoading={isLoading} onAnalyze={handleAnalyzeMbti} />
                     <HistoryPanel previousParameters={previousParameters} handleUndo={handleUndo} initialPersona={initialPersona} handleRevert={handleRevert} />
                </div>
            </div>
          )}

          {activeTab === 'ai_tools' && (
              <AiToolsPanel 
                parameters={parameters}
                setParameters={setParameters}
                setPreviousParameters={setPreviousParameters}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
                setLoadingMessage={setLoadingMessage}
                setError={setError}
                handleGenerateSummary={handleGenerateSummary}
                setActiveTab={setActiveTab}
                onEditField={handleEditField}
              />
          )}

          {activeTab === 'chat' && (
             <div className="flex flex-col h-full bg-gray-900/50 rounded-lg">
                <div ref={chatContainerRef} className="flex-grow p-4 overflow-y-auto space-y-4">
                    {chatHistory.map((msg, index) => (
                        <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm flex-shrink-0">{parameters.name.charAt(0) || 'P'}</div>}
                            <div className={`max-w-md lg:max-w-xl px-4 py-2 rounded-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                                <p className="whitespace-pre-wrap">{msg.parts[0].text}</p>
                            </div>
                        </div>
                    ))}
                    {isChatLoading && <div className="flex items-end gap-2 justify-start">
                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm flex-shrink-0">{parameters.name.charAt(0) || 'P'}</div>
                        <div className="px-4 py-2 rounded-lg bg-gray-700 text-gray-200">
                          <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></span><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.2s]"></span><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.4s]"></span></div>
                        </div>
                    </div>}
                </div>
                <div className="flex-shrink-0 p-4 border-t border-gray-700 flex items-center gap-2">
                    <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="ペルソナとしてメッセージをテスト..." className="w-full bg-gray-700/80 rounded-md p-3 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" disabled={isChatLoading} />
                    <button onClick={handleSendMessage} disabled={isChatLoading || !chatInput.trim()} className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800/50 disabled:cursor-not-allowed transition-colors rounded-md shadow-lg flex items-center justify-center"><SendIcon /></button>
                </div>
             </div>
          )}
        </main>
        
        <footer className="flex-shrink-0 flex justify-end p-4 border-t border-gray-700">
            <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white mr-2">Cancel</button>
            <button onClick={handleSave} disabled={isLoading || !parameters.name} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors rounded-md shadow-lg disabled:bg-gray-600 disabled:cursor-not-allowed">
                <SaveIcon />
                Save Persona
            </button>
        </footer>
      </div>
       <ParameterDetailModal
            isOpen={!!editingField}
            onClose={() => setEditingField(null)}
            onSave={handleSaveField}
            // FIX: Ensure value passed to ParameterDetailModal is a string. The `parameters` object can
            // contain non-string values (like `sources` or `mbtiProfile`), but the modal is only 
            // designed for editing strings. This check prevents a type error.
            fieldData={editingField ? { ...editingField, value: typeof parameters[editingField.field] === 'string' ? parameters[editingField.field] as string : '' } : null}
        >
            {editingField?.field === 'summary' && (
                 <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <button onClick={async () => { await handleGenerateSummary(parameters); setEditingField(null); }} disabled={isLoading || !parameters.name} className="flex items-center justify-center gap-2 w-full px-3 py-1.5 text-sm bg-indigo-600/80 hover:bg-indigo-600 disabled:bg-indigo-900/50 disabled:cursor-not-allowed transition-colors rounded-md"><MagicWandIcon /> Refresh Summary</button>
                  <button onClick={async () => { await handleSyncFromSummary(); setEditingField(null); }} disabled={isLoading || !parameters.summary} className="flex items-center justify-center gap-2 w-full px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700/50 disabled:cursor-not-allowed transition-colors rounded-md"><TextIcon /> Sync from Summary</button>
                 </div>
            )}
       </ParameterDetailModal>
    </div>
  );
};