
import React, { useState, useCallback, ChangeEvent, useEffect, useMemo, useRef } from 'react';
import { Persona, PersonaState, PersonaHistoryEntry, ChatMessage } from '../types';
import * as geminiService from '../services/geminiService';
import { DocumentIcon, MagicWandIcon, TextIcon, SaveIcon, CloseIcon, HistoryIcon, BackIcon, SendIcon, UndoIcon } from './icons';
import { Loader } from './Loader';

interface PersonaEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (persona: PersonaState & { id?: string }) => void;
  initialPersona: Persona | null;
}

const emptyPersona: PersonaState = {
  name: '',
  role: '',
  tone: '',
  personality: '',
  worldview: '',
  experience: '',
  other: '',
  summary: '',
};

// Debounce function
const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<F>): Promise<ReturnType<F>> =>
        new Promise(resolve => {
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(() => resolve(func(...args)), waitFor);
        });
};


export const PersonaEditorModal: React.FC<PersonaEditorModalProps> = ({ isOpen, onClose, onSave, initialPersona }) => {
  const [referenceText, setReferenceText] = useState<string>('');
  const [parameters, setParameters] = useState<PersonaState & { id?: string }>(initialPersona || { ...emptyPersona });
  const [previousParameters, setPreviousParameters] = useState<PersonaState & { id?: string } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'editor' | 'chat'>('editor');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  const isInitialMount = useRef(true);
  
  // Reset state when modal opens/closes or initial persona changes
  useEffect(() => {
    setParameters(initialPersona || { ...emptyPersona });
    setPreviousParameters(null);
    setReferenceText('');
    setError(null);
    setActiveTab('editor');
    setChatHistory([]);
    setChatInput('');
    isInitialMount.current = true;

    const timerId = setTimeout(() => {
      isInitialMount.current = false;
    }, 100);

    return () => clearTimeout(timerId);

  }, [initialPersona, isOpen]);

  const handleGenerateSummary = useCallback(async (paramsToSummarize: PersonaState, message = "AI is generating a summary...") => {
    if(!paramsToSummarize.name) return; // Don't generate if there's no name
    setError(null);
    setIsLoading(true);
    setLoadingMessage(message);
    try {
      // Pass all params but with an empty summary to avoid biasing the model
      const generatedSummary = await geminiService.generateSummaryFromParams({ ...paramsToSummarize, summary: '' });
      setParameters(prev => ({...prev, summary: generatedSummary}));
    } catch (err) {
      // Don't show summary generation errors as blocking errors
      console.error("Failed to auto-generate summary:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const debouncedGenerateSummary = useMemo(() => debounce(handleGenerateSummary, 1500), [handleGenerateSummary]);

  const { summary, ...paramsOnly } = parameters;
  const paramsOnlyString = useMemo(() => JSON.stringify(paramsOnly), [paramsOnly]);

  useEffect(() => { // Sync: Parameters -> Summary
    if (isInitialMount.current) {
        return;
    }
    if (isOpen && activeTab === 'editor') {
        debouncedGenerateSummary(parameters, "AI is updating summary...");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsOnlyString, isOpen, activeTab, debouncedGenerateSummary]);


  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "text/plain") {
      const reader = new FileReader();
      reader.onload = (e) => {
        setReferenceText(e.target?.result as string);
        setError(null);
      };
      reader.readAsText(file);
    } else {
      setError("Please upload a valid .txt file.");
    }
  }, []);

  const handleParamChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setParameters(prev => ({ ...prev, [name]: value }));
  }, []);
  
  const handleSummaryChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = e.target;
    setParameters(prev => ({ ...prev, summary: value }));
  }, []);

  const handleExtractFromDoc = useCallback(async () => {
    if (!referenceText) { setError("Reference document is empty."); return; }
    setError(null);
    setIsLoading(true);
    setLoadingMessage("AI is analyzing the document...");
    setPreviousParameters(parameters); // Save current state for undo
    try {
      const extractedParams = await geminiService.extractParamsFromDoc(referenceText);
      setParameters(prev => ({ ...prev, ...extractedParams, other: prev.other || extractedParams.other || '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
      setPreviousParameters(null); // Clear undo state on error
    } finally {
      setIsLoading(false);
    }
  }, [referenceText, parameters]);
  
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
  
  const handleSave = async () => {
    if (!parameters.name) { setError("Persona name is required."); return; }
    setIsLoading(true);
    setLoadingMessage("Saving and analyzing changes...");
    try {
      await onSave(parameters);
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
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
        <header className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">{initialPersona ? 'Edit Persona' : 'Create New Persona'}</h2>
          <div className="flex gap-1 bg-gray-900/50 p-1 rounded-lg">
              <button onClick={() => setActiveTab('editor')} className={`tab-button ${activeTab === 'editor' ? 'bg-indigo-600' : 'hover:bg-gray-700'}`}>Editor</button>
              <button onClick={() => setActiveTab('chat')} className={`tab-button ${activeTab === 'chat' ? 'bg-indigo-600' : 'hover:bg-gray-700'}`}>Test Chat</button>
          </div>
          <style>{`.tab-button { padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; transition: background-color 0.2s; }`}</style>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon/></button>
        </header>

        {error && (
            <div className="bg-red-900/50 text-red-300 p-3 m-4 rounded-md border border-red-700 text-sm absolute top-16 left-0 right-0 z-10">
                <strong>Error:</strong> {error}
            </div>
        )}
        
        <div className="flex-grow overflow-hidden">
        {activeTab === 'editor' ? (
          <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
            <div className="flex flex-col bg-gray-900/50 rounded-lg p-4 gap-3">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-gray-300"><DocumentIcon /> Reference Document</h3>
              <div className="flex-shrink-0">
                  <input type="file" accept=".txt" onChange={handleFileChange} className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-indigo-50 hover:file:bg-indigo-700 w-full" />
                  <p className="text-xs text-gray-500 mt-1">Upload a .txt file containing character information.</p>
              </div>
              <textarea readOnly value={referenceText} placeholder="Upload a text file to see its content here..." className="w-full flex-grow bg-gray-800/60 rounded-md p-3 text-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div className="flex flex-col bg-gray-900/50 rounded-lg p-4 overflow-y-auto">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-lg text-gray-300">Parameters</h3>
                    {previousParameters && (
                    <button 
                        onClick={handleUndo} 
                        className="flex items-center gap-1.5 text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
                    >
                        <UndoIcon /> Undo Update
                    </button>
                    )}
                </div>
              <div className="flex flex-col gap-3">
              {Object.keys(emptyPersona).filter(k => k !== 'summary').map((key) => (
                <div key={key}>
                  <label htmlFor={key} className="block text-sm font-medium text-gray-400 capitalize mb-1">{key === 'worldview' ? 'Worldview' : key}</label>
                  {key === 'other' ? (
                     <textarea id={key} name={key} value={parameters[key as keyof PersonaState] || ''} onChange={handleParamChange} className="w-full bg-gray-800/60 rounded-md p-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-y" />
                  ) : (
                     <input type="text" id={key} name={key} value={parameters[key as keyof PersonaState] || ''} onChange={handleParamChange} className="w-full bg-gray-800/60 rounded-md p-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  )}
                </div>
              ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-700/50">
                  <h4 className="font-semibold text-base flex items-center gap-2 text-gray-300 mb-2"><HistoryIcon /> Version History</h4>
                  {initialPersona?.history && initialPersona.history.length > 0 ? (
                      <ul className="space-y-2 max-h-48 overflow-y-auto pr-2">
                          {initialPersona.history.map((entry, index) => (
                              <li key={index} className="flex justify-between items-center bg-gray-800/70 p-2 rounded-md">
                                  <div>
                                    <p className="text-sm font-medium text-gray-200">{entry.changeSummary}</p>
                                    <span className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleString()}</span>
                                  </div>
                                  <button onClick={() => handleRevert(entry)} className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors flex-shrink-0 ml-2" title="Revert to this version"><BackIcon /> Revert</button>
                              </li>
                          ))}
                      </ul>
                  ) : <p className="text-sm text-gray-500">No previous versions saved.</p>}
              </div>
            </div>

            <div className="flex flex-col bg-gray-900/50 rounded-lg p-4 gap-3">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-gray-300 relative group">
                <TextIcon /> AI-Generated Summary
                <div className="absolute bottom-full mb-2 w-max max-w-xs bg-gray-600 text-white text-xs text-center rounded py-2 px-3 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 shadow-lg pointer-events-none -translate-x-1/2 left-1/2">
                    このサマリーは編集可能です！ここで行った変更は、「Sync from Summary」ボタンを押すことでAIによって分析され、左側のパラメータが自動的に更新されます。
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-600"></div>
                </div>
              </h3>
              <textarea value={parameters.summary} onChange={handleSummaryChange} placeholder="Summary will be generated here based on parameters..." className="w-full flex-grow bg-gray-800/60 rounded-md p-3 text-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <div className="flex-shrink-0 grid grid-cols-2 gap-2">
                <div className="relative group flex justify-center">
                    <button onClick={handleExtractFromDoc} disabled={isLoading || !referenceText} className="ai-button w-full"><MagicWandIcon /> From Doc</button>
                    <div className="absolute bottom-full mb-2 w-max max-w-xs bg-gray-600 text-white text-xs text-center rounded py-2 px-3 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 shadow-lg pointer-events-none">
                        参考文書パネルのテキストを解析し、キャラクターのパラメータを自動的に抽出・入力します。
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-600"></div>
                    </div>
                </div>
                 <div className="relative group flex justify-center">
                    <button onClick={handleSyncFromSummary} disabled={isLoading || !parameters.summary} className="ai-button w-full"><MagicWandIcon /> Sync from Summary</button>
                    <div className="absolute bottom-full mb-2 w-max max-w-xs bg-gray-600 text-white text-xs text-center rounded py-2 px-3 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 shadow-lg pointer-events-none">
                        現在のサマリーテキストを解析し、パラメータを自動的に更新します。
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-600"></div>
                    </div>
                </div>
              </div>
              <div className="relative group flex justify-center">
                    <button onClick={() => handleGenerateSummary(parameters)} disabled={isLoading} className="ai-button w-full"><MagicWandIcon /> Refresh Summary</button>
                    <div className="absolute bottom-full mb-2 w-max max-w-xs bg-gray-600 text-white text-xs text-center rounded py-2 px-3 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 shadow-lg pointer-events-none">
                        現在のパラメータ設定に基づいて、サマリーを手動で再生成します。
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-600"></div>
                    </div>
                </div>
              <style>{`.ai-button { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.5rem 1rem; background-color: #374151; color: white; border-radius: 0.375rem; font-size: 0.875rem; transition: background-color 0.2s; } .ai-button:hover:not(:disabled) { background-color: #4b5563; } .ai-button:disabled { opacity: 0.5; cursor: not-allowed; }`}</style>
            </div>
          </div>
        ) : ( // Chat Tab
          <div className="flex flex-col h-full p-4">
              <div className="flex-grow overflow-y-auto mb-4 p-4 bg-gray-900/50 rounded-lg">
                  {chatHistory.length === 0 ? (
                      <div className="flex items-center justify-center h-full"><p className="text-gray-500">Chat with "{parameters.name || 'your persona'}" to test them.</p></div>
                  ) : (
                      <div className="space-y-4">
                          {chatHistory.map((msg, index) => (
                              <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                  {msg.role === 'model' && (<div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm flex-shrink-0">{parameters.name ? parameters.name.charAt(0) : 'A'}</div>)}
                                  <div className={`max-w-md lg:max-w-xl px-4 py-2 rounded-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}><p className="whitespace-pre-wrap">{msg.parts[0].text}</p></div>
                              </div>
                          ))}
                          {isChatLoading && (
                              <div className="flex items-end gap-2 justify-start">
                                  <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm flex-shrink-0">{parameters.name ? parameters.name.charAt(0) : 'A'}</div>
                                  <div className="px-4 py-2 rounded-lg bg-gray-700 text-gray-200"><div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></span><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.2s]"></span><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.4s]"></span></div></div>
                              </div>
                          )}
                      </div>
                  )}
              </div>
              <div className="flex-shrink-0 flex gap-2">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder={`Message ${parameters.name || 'persona'}...`} className="w-full bg-gray-800/60 rounded-md p-3 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" disabled={isChatLoading} />
                  <button onClick={handleSendMessage} disabled={isChatLoading || !chatInput.trim()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800/50 disabled:cursor-not-allowed transition-colors rounded-md shadow-lg flex items-center justify-center"><SendIcon /></button>
              </div>
          </div>
        )}
        </div>
        <footer className="flex justify-end p-4 border-t border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white mr-2">Cancel</button>
          <button onClick={handleSave} disabled={isLoading} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors rounded-md shadow-lg disabled:bg-indigo-800/50 disabled:cursor-not-allowed">
            <SaveIcon />
            Save
          </button>
        </footer>
      </div>
    </div>
  );
};