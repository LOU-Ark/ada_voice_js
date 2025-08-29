
import React, { useState, useCallback, useEffect } from 'react';
import { Persona, PersonaState, PersonaHistoryEntry, Voice } from './types';
import { PersonaEditorModal, CreatePersonaModal } from './components/PersonaEditorModal';
import { PersonaList } from './components/PersonaList';
import { ProductionChat } from './components/ProductionChat';
import { PlusIcon, EditIcon, ChatBubbleIcon } from './components/icons';
import * as geminiService from './services/geminiService';
import { VoiceManagerModal } from './components/VoiceManagerModal';

const App: React.FC = () => {
  const [personas, setPersonas] = useState<Persona[]>([
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
      history: []
    }
  ]);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [activeView, setActiveView] = useState<'editor' | 'chat'>('editor');
  const [initialChatPersonaId, setInitialChatPersonaId] = useState<string | undefined>();
  
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isVoiceManagerOpen, setIsVoiceManagerOpen] = useState(false);

  // Load voices from localStorage on initial render
  useEffect(() => {
    try {
      const storedVoices = localStorage.getItem('fishAudioVoices');
      if (storedVoices) {
        setVoices(JSON.parse(storedVoices));
      }
    } catch (error) {
      console.error("Failed to load voices from localStorage:", error);
    }
  }, []);

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
    const existingPersona = personas.find(p => p.id === personaToSave.id);
    
    if (existingPersona) {
      // Update existing persona and save history
      const oldState: PersonaState = {
        name: existingPersona.name,
        role: existingPersona.role,
        tone: existingPersona.tone,
        personality: existingPersona.personality,
        worldview: existingPersona.worldview,
        experience: existingPersona.experience,
        other: existingPersona.other,
        summary: existingPersona.summary,
      };

      const changeSummary = await geminiService.generateChangeSummary(oldState, personaToSave);
      
      const newHistoryEntry: PersonaHistoryEntry = {
        state: oldState,
        timestamp: new Date().toISOString(),
        changeSummary: changeSummary,
      };
      
      const updatedHistory = [newHistoryEntry, ...existingPersona.history].slice(0, 10);

      const updatedPersona: Persona = {
        ...existingPersona,
        ...personaToSave,
        history: updatedHistory,
      };
      
      setPersonas(prevPersonas => prevPersonas.map(p => p.id === updatedPersona.id ? updatedPersona : p));
      setEditingPersona(updatedPersona); // This will re-render the modal with updated data, keeping it open
    } else {
      // Create new persona
      const newPersona: Persona = {
        ...personaToSave,
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

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      <div className={`container mx-auto px-4 py-8 ${activeView === 'chat' ? 'flex flex-col h-screen max-h-screen' : ''}`}>
        <header className="flex-shrink-0">
          <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
            <div className="text-center md:text-left">
              <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">
                Interactive Persona Editor
              </h1>
              <p className="text-gray-400 mt-1">AI-powered character creation studio.</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 self-center md:self-auto">
              <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
                  <button onClick={() => setActiveView('editor')} className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeView === 'editor' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}><EditIcon /> Editor</button>
                  <button onClick={() => setActiveView('chat')} className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeView === 'chat' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}><ChatBubbleIcon /> Chat</button>
              </div>
            </div>
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
            />
          ) : (
            <ProductionChat 
              personas={personas}
              onAddPersona={handleOpenCreateModal}
              initialPersonaId={initialChatPersonaId}
              voices={voices}
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
