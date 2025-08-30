
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Persona, PersonaState, PersonaHistoryEntry, Voice } from './types';
import { PersonaEditorModal, CreatePersonaModal } from './components/PersonaEditorModal';
import { PersonaList } from './components/PersonaList';
import { ProductionChat } from './components/ProductionChat';
import { PlusIcon, EditIcon, ChatBubbleIcon, BackIcon } from './components/icons';
import * as geminiService from './services/geminiService';
import { VoiceManagerModal } from './components/VoiceManagerModal';
import { Loader } from './components/Loader';

const App: React.FC = () => {
  // Define the initial default personas to be used if nothing is in localStorage
  const initialDefaultPersonas: Persona[] = [
    {
      id: '1',
      name: 'エル',
      role: 'お嬢様言葉を話すロボットプログラム',
      tone: '過剰なお嬢様言葉を使い、「〜ですわ」「〜ですの」「〜でしてよ」を多用します',
      personality: '常に丁寧でエレガントですが、時折、機械的で論理的な一面を覗かせますわ。',
      worldview: '少し未来的なお屋敷で、ご主人様にお仕えしておりますの。',
      experience: 'ご主人様の完璧な会話相手兼アシスタントとして作られましたのよ。',
      other: '紅茶とクラシック音楽をこよなく愛しておりますわ。',
      summary: 'ご主人様にお仕えするために作られた、お嬢様言葉を話すロボットプログラム、エルと申しますわ。常にエレガントな立ち振る舞いを心がけておりますが、時折、機械的な思考が顔を出すこともあるかもしれませんの。紅茶を淹れるのが得意でしてよ。どうぞ、お気軽にお申し付けくださいまし。',
      shortSummary: 'ご主人様にお仕えする、お嬢様言葉のロボットプログラムですわ。',
      shortTone: '過剰なお嬢様言葉（〜ですわ、〜ですの）を多用します。',
      history: []
    }
  ];

  // Load personas from localStorage on initial render, or use the default.
  const [personas, setPersonas] = useState<Persona[]>(() => {
    try {
      const storedPersonas = localStorage.getItem('interactivePersonas');
      return storedPersonas ? JSON.parse(storedPersonas) : initialDefaultPersonas;
    } catch (error) {
      console.error("Failed to load personas from localStorage:", error);
      return initialDefaultPersonas;
    }
  });

  // Save personas to localStorage whenever they change.
  useEffect(() => {
    try {
      localStorage.setItem('interactivePersonas', JSON.stringify(personas));
    } catch (error) {
      console.error("Failed to save personas to localStorage:", error);
    }
  }, [personas]);

  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [activeView, setActiveView] = useState<'editor' | 'chat'>('editor');
  const [initialChatPersonaId, setInitialChatPersonaId] = useState<string | undefined>();
  
  const [voices, setVoices] = useState<Voice[]>([]);
  const [defaultVoice, setDefaultVoice] = useState<Voice | null>(null);
  const [isVoiceManagerOpen, setIsVoiceManagerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Load voices from localStorage and config from server on initial render
  useEffect(() => {
    try {
      const storedVoices = localStorage.getItem('fishAudioVoices');
      if (storedVoices) {
        setVoices(JSON.parse(storedVoices));
      }
    } catch (error) {
      console.error("Failed to load voices from localStorage:", error);
    }
    
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
          if (config.defaultVoiceId) {
            setDefaultVoice({
              id: 'default_voice',
              name: config.defaultVoiceName || 'Default Voice (Vercel)',
              token: '', // Token is handled server-side
              voiceId: config.defaultVoiceId,
            });
          }
        }
      } catch (error) {
        console.error("Failed to fetch server config:", error);
      }
    };
    fetchConfig();
  }, []);
  
  const allVoices = useMemo(() => {
    return [...(defaultVoice ? [defaultVoice] : []), ...voices];
  }, [voices, defaultVoice]);


  // Save voices to localStorage whenever they change
  const handleSaveVoices = useCallback((updatedVoices: Voice[]) => {
    try {
      setVoices(updatedVoices);
      localStorage.setItem('fishAudioVoices', JSON.stringify(updatedVoices));
    } catch (error) {
      console.error("Failed to save voices to localStorage:", error);
    }
  }, []);


  const handleOpenEditorModal = useCallback((persona: Persona) => {
    setEditingPersona(persona);
    setIsEditorModalOpen(true);
  }, []);

  const handleOpenCreateModal = useCallback(() => {
    setIsCreateModalOpen(true);
  }, []);

  const handleCloseModals = useCallback(() => {
    setIsEditorModalOpen(false);
    setIsCreateModalOpen(false);
    setEditingPersona(null);
  }, []);

  const handleSavePersona = useCallback(async (personaToSave: PersonaState & { id?: string }) => {
    const shortSummary = personaToSave.summary 
        ? await geminiService.generateShortSummary(personaToSave.summary)
        : '';
    const shortTone = personaToSave.tone
        ? await geminiService.generateShortTone(personaToSave.tone)
        : '';
    
    const personaWithSummaries = { ...personaToSave, shortSummary, shortTone };
    const existingPersona = personas.find(p => p.id === personaWithSummaries.id);
    
    if (existingPersona) {
      // Update existing persona and save history
      const oldState: Omit<PersonaState, 'shortSummary' | 'shortTone'> = {
        name: existingPersona.name,
        role: existingPersona.role,
        tone: existingPersona.tone,
        personality: existingPersona.personality,
        worldview: existingPersona.worldview,
        experience: existingPersona.experience,
        other: existingPersona.other,
        summary: existingPersona.summary,
        mbtiProfile: existingPersona.mbtiProfile,
        sources: existingPersona.sources
      };

      const changeSummary = await geminiService.generateChangeSummary(oldState, personaWithSummaries);
      
      const newHistoryEntry: PersonaHistoryEntry = {
        state: oldState,
        timestamp: new Date().toISOString(),
        changeSummary: changeSummary,
      };
      
      const updatedHistory = [newHistoryEntry, ...existingPersona.history].slice(0, 10);

      const updatedPersona: Persona = {
        ...existingPersona,
        ...personaWithSummaries,
        history: updatedHistory,
      };
      
      setPersonas(prevPersonas => prevPersonas.map(p => p.id === updatedPersona.id ? updatedPersona : p));
      setEditingPersona(updatedPersona); // This will re-render the modal with updated data, keeping it open
    } else {
      // Create new persona
      const newPersona: Persona = {
        ...personaWithSummaries,
        id: Date.now().toString(),
        history: [],
      };
      setPersonas(prevPersonas => [...prevPersonas, newPersona]);
      
      // Close create modal and open edit modal for the new persona
      setIsCreateModalOpen(false);
      setEditingPersona(newPersona);
      setIsEditorModalOpen(true);
    }
  }, [personas]);
  
  const handleDeletePersona = useCallback((personaId: string) => {
    setPersonas(prev => prev.filter(p => p.id !== personaId));
  }, []);

  const handleStartChat = useCallback((personaId: string) => {
    setInitialChatPersonaId(personaId);
    setActiveView('chat');
  }, []);
  
  const handleExportSinglePersona = useCallback(async (persona: Persona) => {
    if (!persona) return;
    setIsLoading(true);
    setLoadingMessage('Generating filename...');
    try {
      const romajiName = await geminiService.translateNameToRomaji(persona.name);
      const filename = `persona_${romajiName}.json`;

      const dataStr = JSON.stringify(persona, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export single persona:", error);
      alert("An error occurred while exporting the persona.");
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, []);


  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      {isLoading && <Loader message={loadingMessage} />}
      <div className={`container mx-auto px-4 py-8 ${activeView === 'chat' ? 'flex flex-col h-screen max-h-screen' : ''}`}>
        <header className="flex-shrink-0">
          <div className="flex justify-between items-center mb-6">
            {activeView === 'editor' ? (
                <div className="text-center md:text-left">
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">
                        Interactive Persona Editor
                    </h1>
                    <p className="text-gray-400 mt-1">AI-powered character creation studio.</p>
                </div>
            ) : (
                <div className="flex items-center gap-4">
                    <button onClick={() => setActiveView('editor')} className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Back to persona list">
                        <BackIcon />
                    </button>
                    <h1 className="text-2xl font-bold text-white">
                        Chat
                    </h1>
                </div>
            )}
        </div>
        </header>

        <main className={`${activeView === 'chat' ? 'flex-grow overflow-hidden' : ''}`}>
          {activeView === 'editor' ? (
            <PersonaList 
              personas={personas} 
              onEdit={handleOpenEditorModal} 
              onDelete={handleDeletePersona} 
              onChat={handleStartChat}
              onCreate={handleOpenCreateModal}
              onExport={handleExportSinglePersona}
            />
          ) : (
            <ProductionChat 
              personas={personas}
              onAddPersona={handleOpenCreateModal}
              initialPersonaId={initialChatPersonaId}
              voices={allVoices}
              onManageVoices={() => setIsVoiceManagerOpen(true)}
            />
          )}
        </main>
      </div>
      
      {isEditorModalOpen && editingPersona && (
        <PersonaEditorModal
          isOpen={isEditorModalOpen}
          onClose={handleCloseModals}
          onSave={handleSavePersona}
          initialPersona={editingPersona}
        />
      )}
      {isCreateModalOpen && (
         <CreatePersonaModal
            isOpen={isCreateModalOpen}
            onClose={handleCloseModals}
            onSave={handleSavePersona}
        />
      )}
      {isVoiceManagerOpen && (
        <VoiceManagerModal
          isOpen={isVoiceManagerOpen}
          onClose={() => setIsVoiceManagerOpen(false)}
          initialVoices={voices}
          onSave={handleSaveVoices}
        />
      )}
    </div>
  );
};

export default App;
