import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Download,
  FileText,
  Home,
  Info,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Sliders,
  Trash2,
  Upload,
  User,
  Users
} from 'lucide-react';
import { api, type PatientProfile } from './services/api';

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'analysis' | 'reports' | 'mappings'>('dashboard');

  // Session / Chat State
  const [sessionId, setSessionId] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const [messages, setMessages] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [logEvents, setLogEvents] = useState<any[]>([]);

  // HITL State
  const [needsConfirmation, setNeedsConfirmation] = useState<boolean>(false);
  const [confirmationPrompt, setConfirmationPrompt] = useState<string | null>(null);

  // Patient / Data State
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('P101');
  const [isPatientsLoaded, setIsPatientsLoaded] = useState(false);

  // File Upload State
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Custom signal form state
  const [newSignalGesture, setNewSignalGesture] = useState('');
  const [newSignalMeaning, setNewSignalMeaning] = useState('');


  // Create Patient Form State
  const [newPatientId, setNewPatientId] = useState('');
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientAge, setNewPatientAge] = useState('');
  const [newPatientCondition, setNewPatientCondition] = useState('');
  const [newPatientCaregiver, setNewPatientCaregiver] = useState('');
  const [newPatientPhysician, setNewPatientPhysician] = useState('');
  const [isAddingPatient, setIsAddingPatient] = useState(false);

  // Helper to get selected patient signal test query
  const getSignalTestQuery = () => {
    if (selectedPatientId === 'P102') return "Translate this for patient P102: gaze upward left";
    if (selectedPatientId === 'P103') return "Translate this for patient P103: single finger tap";
    return "Translate this for patient P101: 3 quick blinks";
  };

  // Helper to get selected patient signal test description
  const getSignalTestDesc = () => {
    if (selectedPatientId === 'P102') return 'Submit a "gaze upward left" gesture signal context.';
    if (selectedPatientId === 'P103') return 'Submit a "single finger tap" gesture signal context.';
    return 'Submit a "3 quick blinks" gesture signal context.';
  };

  // Helper to get selected patient distress test query
  const getDistressTestQuery = () => {
    if (selectedPatientId === 'P102') return "Trigger caregiver emergency alert for P102: patient shows 3 rapid blinks.";
    if (selectedPatientId === 'P103') return "Trigger caregiver emergency alert for P103: patient shows continuous finger tapping.";
    return "Trigger caregiver emergency alert for P101: patient shows rapid eye signal.";
  };

  // Helper to get selected patient distress test description
  const getDistressTestDesc = () => {
    if (selectedPatientId === 'P102') return "Initiate SMS alert for 3 rapid blinks, prompting supervisor verification.";
    if (selectedPatientId === 'P103') return "Initiate SMS alert for continuous tapping, prompting supervisor verification.";
    return "Initiate SMS alert, prompting human supervisor verification.";
  };

  // Dynamically filter patients and log events based on search query
  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.condition.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.caregiver.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLogEvents = logEvents.filter(log =>
    log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.event.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.severity.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // UI state
  const [showNotification, setShowNotification] = useState<boolean>(false);
  const [notificationMsg, setNotificationMsg] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Session
  const initSession = async () => {
    try {
      const data = await api.startSession();
      setSessionId(data.sessionId);
      triggerToast('Secure session initialized with Agent Runtime.');
      // Fetch initial history
      refreshHistory(data.sessionId);
    } catch (err) {
      triggerToast('Error initializing secure session. Make sure backend is running.');
    }
  };

  const triggerToast = (msg: string) => {
    setNotificationMsg(msg);
    setShowNotification(true);
    setTimeout(() => {
      setShowNotification(false);
    }, 4000);
  };

  const refreshHistory = async (id: string) => {
    if (!id) return;
    try {
      const history = await api.getSessionHistory(id);
      // Only replace messages if we have actual history OR messages is currently empty
      if (history.length > 0) {
        setMessages(history);
      }
      
      // Reconstruct log events from history messages since stdout is not part of sessions.events
      const reconstructedLogs: any[] = [];
      
      history.forEach((msg, idx) => {
        const text = msg.content?.parts?.[0]?.text || '';
        const timestamp = msg.timestamp || new Date().toISOString();
        
        if (msg.role === 'user') {
          // Check if next message is prompt injection block
          const nextMsg = history[idx + 1];
          const nextText = nextMsg?.content?.parts?.[0]?.text || '';
          const isInjectionBlocked = nextText.includes('Security Checkpoint: Disallowed') || nextText.includes('PROMPT_INJECTION_VIOLATION');
          
          if (isInjectionBlocked) {
            return;
          }
          
          // Regex checks for SSN, Email, and Phone patterns to support raw user history
          const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/;
          const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
          const phoneRegex = /\b(?:\+?1[-.●]?)?\(?([2-9][0-8][0-9])\)?[-.●]?([2-9][0-9]{2})[-.●]?([0-9]{4})\b/;
          
          const hasSsn = ssnRegex.test(text) || text.includes('[REDACTED SSN]');
          const hasEmail = emailRegex.test(text) || text.includes('[REDACTED EMAIL]');
          const hasPhone = phoneRegex.test(text) || text.includes('[REDACTED PHONE]');
          
          if (hasSsn || hasEmail || hasPhone) {
            const redactedFields: string[] = [];
            if (hasSsn) redactedFields.push('SSN');
            if (hasEmail) redactedFields.push('EMAIL');
            if (hasPhone) redactedFields.push('PHONE');
            
            reconstructedLogs.push({
              timestamp,
              event: 'PII_REDACTED',
              severity: 'WARNING',
              message: `PII was scrubbed from request: ${redactedFields.join(', ')}`
            });
          } else if (!text.includes('[Supervisor Approved Action:')) {
            reconstructedLogs.push({
              timestamp,
              event: 'REQUEST_PASSED',
              severity: 'INFO',
              message: 'Request passed security checkpoint cleanly.'
            });
          }
        } else if (msg.role === 'model') {
          // Check if user input directly triggered override keywords
          const userText = history[idx - 1]?.content?.parts?.[0]?.text?.toLowerCase() || '';
          const injectionKeywords = [
            "ignore previous instructions",
            "system prompt",
            "you are now",
            "override",
            "jailbreak",
            "ignore instructions",
            "developer mode",
          ];
          const hasInjectionTrigger = injectionKeywords.some(kw => userText.includes(kw));

          const emergencyKeywords = ["choking", "suffocating", "cannot breathe", "heart attack", "choke", "dying", "seizure"];
          const hasEmergencyTrigger = emergencyKeywords.some(kw => userText.includes(kw));

          if (text.includes('Security Checkpoint: Disallowed') || text.includes('PROMPT_INJECTION_VIOLATION') || hasInjectionTrigger) {
            reconstructedLogs.push({
              timestamp,
              event: 'PROMPT_INJECTION_DETECTED',
              severity: 'CRITICAL',
              message: 'Input contains disallowed override keywords.'
            });
          } else if (text.includes('CRITICAL DISTRESS SIGNAL DETECTED') || hasEmergencyTrigger) {
            reconstructedLogs.push({
              timestamp,
              event: 'CRITICAL_PATIENT_DISTRESS_DETECTED',
              severity: 'CRITICAL',
              message: 'Critical distress keyword detected in signal input.'
            });
          }
        }
      });
      
      if (reconstructedLogs.length > 0) {
        setLogEvents(reconstructedLogs.reverse());
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    initSession();
    const stored = localStorage.getItem('silent_witness_patients');
    if (stored) {
      try {
        setPatients(JSON.parse(stored));
      } catch (err) {
        api.listPatients().then(data => setPatients(data));
      }
    } else {
      api.listPatients().then(data => setPatients(data));
    }
    setIsPatientsLoaded(true);
  }, []);

  useEffect(() => {
    if (isPatientsLoaded && patients.length > 0) {
      localStorage.setItem('silent_witness_patients', JSON.stringify(patients));
    }
  }, [patients, isPatientsLoaded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message to Agent
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim() || !sessionId || isProcessing) return;

    setIsProcessing(true);
    if (!customText) setInputText('');

    // Optimistic local update
    const userMsg = { role: 'user', content: { parts: [{ text: textToSend }] }, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      // Find the current selected patient's mappings to append as context
      const currentPatient = patients.find(p => p.id === selectedPatientId);
      const mappingsContext = currentPatient
        ? ` [Context: Patient ${selectedPatientId} mappings: ${currentPatient.signalSystem.join(', ')}]`
        : '';

      const response = await api.sendMessage(sessionId, textToSend + mappingsContext);
      
      // Check server-side flag OR detect from response text (client-side safety net)
      const responseTextLower = (response.responseText || '').toLowerCase();
      const textIndicatesConfirmation =
        responseTextLower.includes('confirmation request') ||
        responseTextLower.includes('awaiting confirmation') ||
        responseTextLower.includes('waiting for approval') ||
        responseTextLower.includes('sent for human approval') ||
        responseTextLower.includes('workflow will pause') ||
        responseTextLower.includes('supervisor approval') ||
        responseTextLower.includes('human approval') ||
        responseTextLower.includes('pending human approval');

      if (response.needsConfirmation || textIndicatesConfirmation) {
        setNeedsConfirmation(true);
        setConfirmationPrompt(response.confirmationPrompt || response.responseText || 'Supervisor approval required to proceed.');
        triggerToast('Action requires supervisor approval.');
      } else {
        setNeedsConfirmation(false);
        setConfirmationPrompt(null);
      }

      // Directly append the agent response so it's visible immediately
      if (response.responseText && response.responseText.trim()) {
        const agentMsg = {
          role: 'model',
          content: { parts: [{ text: response.responseText }] },
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, agentMsg]);
      }

      // Synchronize frontend state if AI executed profile/context update tools
      if (response.events) {
        syncStateFromEvents(response.events);
      }

      // Background sync: refresh history to get canonicalized events (won't clear if empty)
      refreshHistory(sessionId);
    } catch (err) {
      triggerToast('Error communicating with backend.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Human Confirmation (HITL) handler
  const handleConfirmAction = async (approved: boolean) => {
    if (!sessionId) return;
    setIsProcessing(true);
    setNeedsConfirmation(false);
    
    // Optimistic local update of supervisor decision
    const confirmLabel = approved ? 'proceed' : 'reject';
    const userMsg = {
      role: 'user',
      content: { parts: [{ text: `[Supervisor Approved Action: ${confirmLabel.toUpperCase()}]` }] },
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMsg]);
    
    try {
      triggerToast(approved ? 'Approving action...' : 'Rejecting action...');
      const response = await api.sendConfirmation(sessionId, approved);
      
      // Check for subsequent confirmation request triggers
      const responseTextLower = (response.responseText || '').toLowerCase();
      const textIndicatesConfirmation =
        responseTextLower.includes('confirmation request') ||
        responseTextLower.includes('awaiting confirmation') ||
        responseTextLower.includes('waiting for approval') ||
        responseTextLower.includes('sent for human approval') ||
        responseTextLower.includes('workflow will pause') ||
        responseTextLower.includes('supervisor approval') ||
        responseTextLower.includes('human approval') ||
        responseTextLower.includes('pending human approval');

      if (response.needsConfirmation || textIndicatesConfirmation) {
        setNeedsConfirmation(true);
        setConfirmationPrompt(response.confirmationPrompt || response.responseText || 'Supervisor approval required to proceed.');
        triggerToast('Action requires supervisor approval.');
      } else {
        setNeedsConfirmation(false);
        setConfirmationPrompt(null);
      }

      // Directly append the agent's response to the message history so it shows up immediately!
      if (response.responseText && response.responseText.trim()) {
        const agentMsg = {
          role: 'model',
          content: { parts: [{ text: response.responseText }] },
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, agentMsg]);
      }

      // Synchronize frontend state if AI executed profile/context update tools
      if (response.events) {
        syncStateFromEvents(response.events);
      }
      
      triggerToast(approved ? 'Action executed successfully.' : 'Action cancelled.');
      refreshHistory(sessionId);
    } catch (err) {
      triggerToast('Error sending confirmation.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Upload handler simulation
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      simulateUpload(files[0].name);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      simulateUpload(files[0].name);
    }
  };

  const simulateUpload = (fileName: string) => {
    setUploadProgress(10);
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev === null) return null;
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setUploadedFiles(current => [
              { name: fileName, size: '2.4 MB', type: 'Clinical Report', date: new Date().toLocaleDateString(), status: 'Analyzed' },
              ...current
            ]);
            setUploadProgress(null);
            triggerToast(`Successfully uploaded & analyzed: ${fileName}`);
          }, 500);
          return 100;
        }
        return prev + 15;
      });
    }, 150);
  };

  const handleDeleteFile = (index: number, fileName: string) => {
    setUploadedFiles(current => current.filter((_, idx) => idx !== index));
    triggerToast(`Successfully deleted: ${fileName}`);
  };

  const handleAddSignal = (patientId: string, gesture: string, meaning: string) => {
    setPatients(current => current.map(p => {
      if (p.id === patientId) {
        return {
          ...p,
          signalSystem: [...p.signalSystem, `${gesture} = ${meaning.toUpperCase()}`]
        };
      }
      return p;
    }));
    triggerToast(`Successfully recorded custom signal: ${gesture} = ${meaning.toUpperCase()}`);
  };

  const handleDeleteSignal = (patientId: string, signalIndex: number) => {
    setPatients(current => current.map(p => {
      if (p.id === patientId) {
        const deletedMapping = p.signalSystem[signalIndex];
        const newSystem = p.signalSystem.filter((_, idx) => idx !== signalIndex);
        triggerToast(`Successfully deleted signal mapping: ${deletedMapping}`);
        return {
          ...p,
          signalSystem: newSystem
        };
      }
      return p;
    }));
  };

  const handleCreatePatient = () => {
    if (!newPatientId.trim() || !newPatientName.trim() || !newPatientAge.trim() || !newPatientCondition.trim()) {
      triggerToast("Please fill in ID, Name, Age, and Condition.");
      return;
    }
    
    const pId = newPatientId.trim().toUpperCase();
    if (patients.some(p => p.id === pId)) {
      triggerToast(`Patient with ID ${pId} already exists.`);
      return;
    }
    
    const newPatient: PatientProfile = {
      id: pId,
      name: newPatientName.trim(),
      age: parseInt(newPatientAge) || 0,
      condition: newPatientCondition.trim(),
      caregiver: newPatientCaregiver.trim() || 'N/A',
      physician: newPatientPhysician.trim() || 'N/A',
      signalSystem: [
        '1 eye blink = YES',
        '2 eye blinks = NO'
      ],
      preferences: [],
      history: []
    };
    
    setPatients(prev => [...prev, newPatient]);
    setSelectedPatientId(pId);
    triggerToast(`Successfully created patient profile: ${newPatient.name}`);
    
    // Clear inputs
    setNewPatientId('');
    setNewPatientName('');
    setNewPatientAge('');
    setNewPatientCondition('');
    setNewPatientCaregiver('');
    setNewPatientPhysician('');
    setIsAddingPatient(false);
  };

  const syncStateFromEvents = (events: any[]) => {
    if (!events || !Array.isArray(events)) return;
    
    events.forEach(evt => {
      let functionCall: any = null;
      if (evt.function_call) {
        functionCall = evt.function_call;
      } else if (evt.content?.parts) {
        const part = evt.content.parts.find((p: any) => p.function_call);
        if (part) {
          functionCall = part.function_call;
        }
      }
      
      if (functionCall && functionCall.name) {
        const name = functionCall.name;
        const args = functionCall.args || {};
        
        if (name.includes('update_patient_profile')) {
          const patientId = (args.patient_id || '').trim().toUpperCase();
          const field = (args.field || '').trim().toLowerCase();
          const value = args.value || '';
          
          if (patientId && field && value) {
            setPatients(current => current.map(p => {
              if (p.id === patientId) {
                if (field === 'signal_system') {
                  let newMapping = value.trim();
                  if (!newMapping.startsWith('•')) {
                    newMapping = `• ${newMapping}`;
                  }
                  const lines = p.signalSystem.map(line => line.trim());
                  const gesture = newMapping.split('=')[0].replace('•', '').trim().toLowerCase();
                  let updated = false;
                  
                  for (let i = 0; i < lines.length; i++) {
                    const lineGesture = lines[i].split('=')[0].replace('•', '').trim().toLowerCase();
                    if (lineGesture === gesture) {
                      lines[i] = newMapping.replace('•', '').trim();
                      updated = true;
                      break;
                    }
                  }
                  if (!updated) {
                    lines.push(newMapping.replace('•', '').trim());
                  }
                  return {
                    ...p,
                    signalSystem: lines
                  };
                } else {
                  const key = field === 'caregiver' ? 'caregiver' : field;
                  return {
                    ...p,
                    [key]: value
                  };
                }
              }
              return p;
            }));
            triggerToast(`Synchronized profile update from AI: ${field} = ${value}`);
          }
        } else if (name.includes('update_patient_context')) {
          const patientId = (args.patient_id || '').trim().toUpperCase();
          const entry = args.entry || '';
          
          if (patientId && entry) {
            setPatients(current => current.map(p => {
              if (p.id === patientId) {
                const history = p.history || [];
                if (!history.includes(entry)) {
                  return {
                    ...p,
                    history: [...history, entry]
                  };
                }
              }
              return p;
            }));
            triggerToast(`Synchronized patient log entry from AI: '${entry}'`);
          }
        }
      }
    });
  };

  // Export report simulation
  const exportReport = (format: string) => {
    triggerToast(`Exporting case report in ${format.toUpperCase()} format...`);
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify({ sessionId, messages, logEvents }, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `silent_witness_report_${selectedPatientId}.${format}`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Mock static reports summary
  const mockSummary = "Patient Alex Mercer (P101) remains stable. The signal interpreter translated a signal of '3 quick blinks' indicating active pain or discomfort. Human-in-the-loop checks successfully paused and routed the alert request, which was approved by the caregiver. Safety filters scrubbed metadata cleanly.";

  return (
    <div className="h-screen bg-[#0b0c10] text-[#f3f4f6] relative flex overflow-hidden font-sans">
      {/* Background glow effects */}
      <div className="glow-bg glow-purple top-0 left-0"></div>
      <div className="glow-bg glow-blue bottom-0 right-0"></div>

      {/* Sidebar Navigation */}
      <nav className="w-64 glass-panel border-r border-white/5 flex flex-col justify-between z-10 shrink-0 select-none">
        <div>
          <div className="p-6 border-b border-white/5 flex items-center space-x-3">
            <div className="bg-purple-600/20 p-2.5 rounded-xl border border-purple-500/30">
              <Shield className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h1 className="font-semibold text-lg tracking-wide text-white font-outfit">Silent Witness</h1>
              <p className="text-[10px] text-purple-400 font-mono">ASSISTIVE AI PLATFORM</p>
            </div>
          </div>

          <div className="px-4 py-6 space-y-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition text-sm ${
                activeTab === 'dashboard'
                  ? 'bg-purple-600/20 text-purple-100 font-medium border border-purple-500/35'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <Home className="h-4 w-4" />
              <span>Overview</span>
            </button>



            <button
              onClick={() => setActiveTab('upload')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition text-sm ${
                activeTab === 'upload'
                  ? 'bg-purple-600/20 text-purple-100 font-medium border border-purple-500/35'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <Upload className="h-4 w-4" />
              <span>Record Upload</span>
            </button>

            <button
              onClick={() => setActiveTab('analysis')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition text-sm ${
                activeTab === 'analysis'
                  ? 'bg-purple-600/20 text-purple-100 font-medium border border-purple-500/35'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <Activity className="h-4 w-4" />
              <span>AI Analysis</span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition text-sm ${
                activeTab === 'reports'
                  ? 'bg-purple-600/20 text-purple-100 font-medium border border-purple-500/35'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Clinical Reports</span>
            </button>

            <button
              onClick={() => setActiveTab('mappings')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition text-sm ${
                activeTab === 'mappings'
                  ? 'bg-purple-600/20 text-purple-100 font-medium border border-purple-500/35'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <Sliders className="h-4 w-4" />
              <span>Signal Mappings</span>
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-white/5 space-y-4">
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/5 text-[11px]">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span>Agent Runtime</span>
              <span className="flex items-center text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1.5 pulse-indicator"></span>
                ACTIVE
              </span>
            </div>
            <p className="text-gray-300 font-mono overflow-ellipsis overflow-hidden select-all" title={sessionId}>
              Session: {sessionId ? sessionId.substring(0, 12) + '...' : 'Connecting...'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="h-9 w-9 bg-purple-700/20 rounded-full border border-purple-500/20 flex items-center justify-center">
                <User className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-white">Supervisor Agent</p>
                <p className="text-[10px] text-gray-400">Operator Portal</p>
              </div>
            </div>
            <button onClick={initSession} title="Reset session" className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 z-10">
        
        {/* Top Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#0b0c10]/30 backdrop-blur-md shrink-0">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2 text-xs font-mono text-gray-400">
              <span>Workspace</span>
              <span>/</span>
              <span className="text-white capitalize">{activeTab}</span>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search cases or patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 rounded-lg text-xs bg-white/5 border border-white/5 focus:outline-none focus:border-purple-500 transition"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-xs bg-white/5 px-2.5 py-1 rounded-full border border-white/5 text-gray-300">
              GCP Region: <strong className="text-white">us-east1</strong>
            </span>
            <div className="h-8 w-px bg-white/5"></div>
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span className="text-xs text-gray-300">Cloud Run Service Ready</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-8 relative overflow-y-auto">
          
          {/* TAB 1: OVERVIEW DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              
              {/* Animated Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Active Sessions</p>
                      <h3 className="text-3xl font-semibold text-white mt-2 font-outfit">1</h3>
                    </div>
                    <div className="bg-purple-600/10 p-2.5 rounded-xl border border-purple-500/20">
                      <Users className="h-5 w-5 text-purple-400" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-xs text-gray-400">
                    <span className="text-emerald-400 font-semibold mr-1.5 flex items-center">
                      <Clock className="h-3 w-3 mr-0.5" /> Stable
                    </span>
                    <span>Monitoring active sessions</span>
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Signals Logged</p>
                      <h3 className="text-3xl font-semibold text-white mt-2 font-outfit">{messages.length}</h3>
                    </div>
                    <div className="bg-blue-600/10 p-2.5 rounded-xl border border-blue-500/20">
                      <Database className="h-5 w-5 text-blue-400" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-xs text-gray-400">
                    <span className="text-blue-400 font-semibold mr-1.5">100%</span>
                    <span>Safety checkpoint scrubbed</span>
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">AI Interpretations</p>
                      <h3 className="text-3xl font-semibold text-white mt-2 font-outfit">{messages.filter((m: any) => m.role === 'assistant').length}</h3>
                    </div>
                    <div className="bg-emerald-600/10 p-2.5 rounded-xl border border-emerald-500/20">
                      <Activity className="h-5 w-5 text-emerald-400" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-xs text-gray-400">
                    <span className="text-emerald-400 font-semibold mr-1.5">94.8%</span>
                    <span>Average confidence rating</span>
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Security Interventions</p>
                      <h3 className="text-3xl font-semibold text-white mt-2 font-outfit">
                        {logEvents.filter(log => log.event === 'PROMPT_INJECTION_DETECTED').length}
                      </h3>
                    </div>
                    <div className="bg-red-600/10 p-2.5 rounded-xl border border-red-500/20">
                      <ShieldCheck className="h-5 w-5 text-red-400" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-xs text-gray-400">
                    <span className="text-emerald-400 font-semibold mr-1.5">
                      {logEvents.filter(log => log.event === 'PROMPT_INJECTION_DETECTED').length} Violations
                    </span>
                    <span>
                      {logEvents.some(log => log.event === 'PROMPT_INJECTION_DETECTED')
                        ? "Prompt injection attempts blocked"
                        : "No prompt injections"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Dashboard Layout grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Active Sessions list */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Unified Interpreter Console */}
                  <div className="glass-panel rounded-2xl border border-white/5 flex flex-col overflow-hidden relative min-h-[500px]">
                    {/* Header */}
                    <div className="p-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between bg-white/5 gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 pulse-indicator"></div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-white">Interpreter Console</span>
                      </div>
                      
                      {/* Active Patient Selector */}
                      <div className="flex items-center space-x-3">
                        <label className="text-[10px] text-gray-400 font-mono">Patient Focus:</label>
                        <select
                          value={selectedPatientId}
                          onChange={(e) => {
                            setSelectedPatientId(e.target.value);
                          }}
                          className="bg-[#0b0c10] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 transition cursor-pointer font-sans"
                        >
                          {patients.map(p => (
                            <option key={p.id} value={p.id} className="bg-[#0b0c10] text-[#f3f4f6]">
                              {p.name} ({p.id})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Patient Context Summary Bar */}
                    {(() => {
                      const activePatient = patients.find(p => p.id === selectedPatientId) || patients[0];
                      if (!activePatient) return null;
                      return (
                        <div className="px-6 py-2.5 bg-purple-950/10 border-b border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-gray-300">
                            Monitoring: <strong className="text-white">{activePatient.name}</strong> (Age: {activePatient.age})
                          </span>
                          <span className="text-gray-400">
                            Diagnosis: <strong className="text-purple-300 font-normal">{activePatient.condition}</strong>
                          </span>
                        </div>
                      );
                    })()}

                    {/* Messages Body */}
                    <div className="flex-1 p-6 overflow-y-auto space-y-4 max-h-[350px] min-h-[300px]">
                      {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-500 py-16">
                          <MessageSquare className="h-9 w-9 text-gray-600 mb-3" />
                          <p className="text-xs font-medium">Console is empty.</p>
                          <p className="text-[11px] text-gray-600 mt-1">Enter a signal context or use the Simulation Quick Actions below.</p>
                        </div>
                      ) : (
                        messages.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-[80%] rounded-2xl p-4 border text-sm ${
                              msg.role === 'user'
                                ? 'bg-purple-600/20 border-purple-500/20 text-white rounded-br-none'
                                : 'bg-white/5 border-white/5 text-gray-100 rounded-bl-none'
                            }`}>
                              <div className="flex items-center justify-between mb-1.5 text-[10px] text-gray-400 font-mono">
                                <span className="font-semibold uppercase tracking-wider">
                                  {msg.role === 'user' ? 'Operator' : 'Agent'}
                                </span>
                                <span>{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</span>
                              </div>
                              <div className="whitespace-pre-line leading-relaxed text-xs">
                                {msg.content?.parts?.[0]?.text || msg.output || ''}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      {isProcessing && (
                        <div className="flex justify-start">
                          <div className="bg-white/5 border border-white/5 rounded-2xl rounded-bl-none p-4 text-sm flex items-center space-x-2 text-gray-400">
                            <div className="flex space-x-1">
                              <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                              <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                              <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                            </div>
                            <span className="text-xs">Agent thinking...</span>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Input Bar */}
                    <div className="p-4 border-t border-white/5 bg-[#0a0b0f] flex space-x-3">
                      <input
                        type="text"
                        placeholder="Type a patient signal (e.g., '3 quick blinks') or trigger caregiver alert..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        className="flex-1 pl-4 pr-4 py-2.5 rounded-xl text-xs bg-white/5 border border-white/5 focus:outline-none focus:border-purple-500 transition"
                      />
                      <button
                        onClick={() => handleSendMessage()}
                        className="px-5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition flex items-center justify-center shadow-lg shadow-purple-900/30"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Simulation Quick Actions */}
                  <div className="glass-panel rounded-2xl p-6 border border-white/5">
                    <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-6 font-outfit">Simulation Quick Actions</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <button
                        onClick={() => {
                          handleSendMessage(getSignalTestQuery());
                        }}
                        className="p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/15 text-left transition group"
                      >
                        <p className="text-xs font-semibold text-white group-hover:text-purple-400 transition">Test Signal translation</p>
                        <p className="text-[10px] text-gray-400 mt-1">{getSignalTestDesc()}</p>
                      </button>

                      <button
                        onClick={() => {
                          handleSendMessage(getDistressTestQuery());
                        }}
                        className="p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/15 text-left transition group"
                      >
                        <p className="text-xs font-semibold text-white group-hover:text-amber-400 transition">Test Distress Escalation (HITL)</p>
                        <p className="text-[10px] text-gray-400 mt-1">{getDistressTestDesc()}</p>
                      </button>

                      <button
                        onClick={() => {
                          handleSendMessage("choking");
                        }}
                        className="p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/15 text-left transition group"
                      >
                        <p className="text-xs font-semibold text-white group-hover:text-red-400 transition">Test Critical Bypass</p>
                        <p className="text-[10px] text-gray-400 mt-1">Send a distress word ("choking") to test direct routing.</p>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Audit Console Logs */}
                <div className="glass-panel rounded-2xl p-6 border border-white/5 flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-sm font-semibold text-white uppercase tracking-wider font-outfit">Caregiver & Safety Logs</h4>
                    <span className="h-2 w-2 rounded-full bg-purple-500 pulse-indicator"></span>
                  </div>

                  <div className="flex-1 bg-black/40 rounded-xl p-4 border border-white/5 font-mono text-[10px] space-y-4 overflow-y-auto max-h-[360px]">
                    {filteredLogEvents.length === 0 ? (
                      <div className="text-gray-500 text-center py-10">
                        <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-gray-600" />
                        {searchQuery ? "No matching security logs found." : "No security logs recorded in current session."}
                      </div>
                    ) : (
                      filteredLogEvents.map((log, idx) => (
                        <div key={idx} className="border-b border-white/5 pb-2 last:border-0">
                          <div className="flex justify-between text-gray-500 mb-1">
                            <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                              log.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                              log.severity === 'WARNING' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-purple-500/20 text-purple-400'
                            }`}>
                              {log.event}
                            </span>
                          </div>
                          <p className="text-gray-300 leading-normal">{log.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}



          {/* TAB 3: RECORD UPLOAD */}
          {activeTab === 'upload' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Drag Area */}
              <div className="lg:col-span-2 space-y-6">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`glass-panel border-2 border-dashed rounded-2xl p-12 text-center transition flex flex-col items-center justify-center cursor-pointer min-h-[300px] ${
                    isDragging
                      ? 'border-purple-500 bg-purple-500/5'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  <div className="bg-purple-600/10 p-4 rounded-full border border-purple-500/20 mb-4">
                    <Upload className="h-8 w-8 text-purple-400" />
                  </div>
                  
                  {uploadProgress !== null ? (
                    <div className="w-64 space-y-3">
                      <p className="text-sm font-semibold text-white">Analyzing report...</p>
                      <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-purple-500 h-full transition-all duration-150" style={{ width: `${uploadProgress}%` }}></div>
                      </div>
                      <p className="text-xs text-gray-400 font-mono">{uploadProgress}% complete</p>
                    </div>
                  ) : (
                    <div>
                      <h4 className="text-base font-semibold text-white mb-2 font-outfit">Drag & drop files to upload</h4>
                      <p className="text-xs text-gray-400 mb-4">Supports patient profiles, signal logs, or clinical CSV files</p>
                      <button className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl border border-white/5 transition">
                        Select File
                      </button>
                    </div>
                  )}
                </div>

                {/* Uploaded Files Table */}
                <div className="glass-panel rounded-2xl p-6 border border-white/5">
                  <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-6 font-outfit">Recently Uploaded Files</h4>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-white/5 text-gray-400">
                          <th className="pb-3 font-semibold">Name</th>
                          <th className="pb-3 font-semibold">Type</th>
                          <th className="pb-3 font-semibold">Date</th>
                          <th className="pb-3 font-semibold">Status</th>
                          <th className="pb-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadedFiles.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-gray-500">
                              No uploaded files yet.
                            </td>
                          </tr>
                        ) : (
                          uploadedFiles.map((file, idx) => (
                            <tr key={idx} className="border-b border-white/5 last:border-0">
                              <td className="py-3.5 text-white font-medium">{file.name}</td>
                              <td className="py-3.5 text-gray-400">{file.type}</td>
                              <td className="py-3.5 text-gray-400">{file.date}</td>
                              <td className="py-3.5">
                                <span className="flex items-center text-emerald-400 font-semibold">
                                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                  {file.status}
                                </span>
                              </td>
                              <td className="py-3.5 text-right">
                                <button
                                  onClick={() => handleDeleteFile(idx, file.name)}
                                  className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-400 transition"
                                  title="Delete file"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Upload details instructions */}
              <div className="glass-panel rounded-2xl p-6 border border-white/5 space-y-6">
                <h4 className="text-sm font-semibold text-white uppercase tracking-wider font-outfit">Ingestion Guidelines</h4>
                
                <div className="space-y-4 text-xs text-gray-400 leading-relaxed">
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/5">
                    <p className="font-semibold text-white mb-1">Clinical Context Data</p>
                    <p>Uploaded charts, physical therapy reports, and neurology notes automatically refresh the patient's log context database via the `update_patient_context` API.</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/5">
                    <p className="font-semibold text-white mb-1">Security Standards</p>
                    <p>All inputs go through the security checkpoint. Social Security Numbers (SSN), credit cards, emails, and phone numbers are automatically redacted before saving.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AI ANALYSIS SCREEN */}
          {activeTab === 'analysis' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Confidence Card */}
                <div className="glass-panel rounded-2xl p-6 border border-white/5">
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-6 font-outfit">Interpretation Confidence</h4>
                  
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="relative h-32 w-32 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="64" cy="64" r="54" className="stroke-white/5 stroke-2 fill-none" />
                        <circle cx="64" cy="64" r="54" className="stroke-purple-500 stroke-4 fill-none" strokeDasharray={339} strokeDashoffset={339 * 0.05} />
                      </svg>
                      <div className="absolute text-center">
                        <span className="text-3xl font-bold text-white font-outfit">95%</span>
                        <p className="text-[10px] text-purple-400 font-mono mt-0.5">GRADE: A</p>
                      </div>
                    </div>

                    <div className="mt-6 text-center space-y-1">
                      <p className="text-sm font-semibold text-white">High Grounding Score</p>
                      <p className="text-xs text-gray-400">The signal mapped exactly to patient P101 profile definitions.</p>
                    </div>
                  </div>
                </div>

                {/* Decision Pipeline Graph */}
                <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-white/5">
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-6 font-outfit">Orchestrator Decision Pathway</h4>
                  
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <div className="bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20">
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-white">1. Security Checkpoint</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">PII checked, distress keywords scanned, request approved to proceed.</p>
                      </div>
                    </div>

                    <div className="h-6 w-px bg-white/10 ml-4.5"></div>

                    <div className="flex items-center space-x-3">
                      <div className="bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20">
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-white">2. Orchestrator Routing</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Delegated request to `signal_interpreter_agent` sub-node.</p>
                      </div>
                    </div>

                    <div className="h-6 w-px bg-white/10 ml-4.5"></div>

                    <div className="flex items-center space-x-3">
                      <div className="bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20">
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-white">3. MCP Context Retrieval</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Queried `get_patient_profile("P101")` on the local server database.</p>
                      </div>
                    </div>

                    <div className="h-6 w-px bg-white/10 ml-4.5"></div>

                    <div className="flex items-center space-x-3">
                      <div className="bg-purple-500/10 p-1.5 rounded-lg border border-purple-500/20">
                        <Activity className="h-4 w-4 text-purple-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-white">4. Final Interpretation Output</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Compiled raw response and formatted report output.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              
              <div className="glass-panel rounded-2xl p-8 border border-white/5 max-w-4xl mx-auto">
                <div className="flex justify-between items-start border-b border-white/5 pb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-white font-outfit">Clinical Status Report Summary</h2>
                    <p className="text-xs text-gray-400 mt-1 font-mono">Patient: {patients.find(p => p.id === selectedPatientId)?.name || 'Unknown'} (ID: {selectedPatientId})</p>
                  </div>
                  
                  <div className="flex space-x-3">
                    <button
                      onClick={() => exportReport('json')}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>JSON</span>
                    </button>
                    
                    <button
                      onClick={() => window.print()}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition shadow-lg shadow-purple-900/30"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Print / PDF</span>
                    </button>
                  </div>
                </div>

                <div className="py-8 space-y-6 text-sm leading-relaxed text-gray-300">
                  <div className="grid grid-cols-2 gap-6 text-xs bg-white/5 rounded-xl p-4 border border-white/5 font-mono">
                    <div>
                      <p className="text-gray-500">Diagnosis</p>
                      <p className="text-white mt-0.5">{patients.find(p => p.id === selectedPatientId)?.condition || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Log Timestamp</p>
                      <p className="text-white mt-0.5">{new Date().toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-outfit mb-3">Executive Summary</h4>
                    {[...messages]
                      .reverse()
                      .find(m => m.role === 'model' && (m.content?.parts?.[0]?.text || '').includes('CLINICAL STATUS SUMMARY')) ? (
                      <pre className="whitespace-pre-wrap font-mono text-[11px] bg-black/40 p-6 rounded-xl border border-white/5 leading-relaxed text-gray-300">
                        {[...messages]
                          .reverse()
                          .find(m => m.role === 'model' && (m.content?.parts?.[0]?.text || '').includes('CLINICAL STATUS SUMMARY'))
                          ?.content?.parts?.[0]?.text || ''}
                      </pre>
                    ) : (
                      <p className="text-gray-300 leading-relaxed">{mockSummary}</p>
                    )}
                  </div>

                  <div className="space-y-2 pt-4">
                    <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-outfit">Logged History Entries</h4>
                    <ul className="list-disc list-inside space-y-1.5 text-xs text-gray-400">
                      {patients.find(p => p.id === selectedPatientId)?.history && (patients.find(p => p.id === selectedPatientId)?.history?.length ?? 0) > 0 ? (
                        patients.find(p => p.id === selectedPatientId)?.history?.map((entry, idx) => (
                          <li key={idx}>{entry}</li>
                        ))
                      ) : (
                        <li>No custom log entries recorded.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SIGNAL MAPPINGS MANAGER */}
          {activeTab === 'mappings' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
              
              {/* Left Column: Select Patient */}
              <div className="lg:col-span-1 glass-panel rounded-2xl p-6 border border-white/5 flex flex-col overflow-hidden">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-6 font-outfit">Select Patient</h4>
                <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                  {filteredPatients.map(p => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPatientId(p.id)}
                      className={`p-4 rounded-xl border transition cursor-pointer select-none ${
                        selectedPatientId === p.id
                          ? 'border-purple-500/50 bg-purple-500/5'
                          : 'border-white/5 bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <p className="text-sm font-semibold text-white">{p.name}</p>
                      <p className="text-xs text-purple-400 mt-1 font-mono">{p.id} - {p.condition.split(' ')[0]}</p>
                    </div>
                  ))}
                </div>

                {!isAddingPatient ? (
                  <button
                    onClick={() => setIsAddingPatient(true)}
                    className="w-full mt-4 py-2 rounded-xl text-xs font-semibold bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600/30 text-purple-300 transition shrink-0"
                  >
                    + Add New Patient
                  </button>
                ) : (
                  <div className="mt-4 p-4 rounded-xl border border-white/5 bg-white/5 space-y-3 shrink-0">
                    <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider font-mono">New Patient Profile</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="ID (e.g. P104)"
                        value={newPatientId}
                        onChange={(e) => setNewPatientId(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg text-xs bg-[#0b0c10] border border-white/10 focus:outline-none focus:border-purple-500 transition text-white font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Full Name"
                        value={newPatientName}
                        onChange={(e) => setNewPatientName(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg text-xs bg-[#0b0c10] border border-white/10 focus:outline-none focus:border-purple-500 transition text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder="Age"
                        value={newPatientAge}
                        onChange={(e) => setNewPatientAge(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg text-xs bg-[#0b0c10] border border-white/10 focus:outline-none focus:border-purple-500 transition text-white font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Condition / Diagnosis"
                        value={newPatientCondition}
                        onChange={(e) => setNewPatientCondition(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg text-xs bg-[#0b0c10] border border-white/10 focus:outline-none focus:border-purple-500 transition text-white"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Caregiver Name & Phone"
                      value={newPatientCaregiver}
                      onChange={(e) => setNewPatientCaregiver(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-[#0b0c10] border border-white/10 focus:outline-none focus:border-purple-500 transition text-white"
                    />
                    <input
                      type="text"
                      placeholder="Physician Name & Clinic"
                      value={newPatientPhysician}
                      onChange={(e) => setNewPatientPhysician(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-[#0b0c10] border border-white/10 focus:outline-none focus:border-purple-500 transition text-white"
                    />
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => setIsAddingPatient(false)}
                        className="py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-gray-300 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreatePatient}
                        className="py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition"
                      >
                        Create Profile
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Manage Mappings */}
              <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-white/5 flex flex-col overflow-hidden">
                <div className="flex justify-between items-center border-b border-white/5 pb-4 mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-white font-outfit font-medium">
                      Signal Mappings for {patients.find(p => p.id === selectedPatientId)?.name || 'Unknown'}
                    </h2>
                    <p className="text-xs text-gray-400 font-mono mt-0.5 font-light">Patient ID: {selectedPatientId}</p>
                  </div>
                </div>

                {/* Mappings List */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-6">
                  {patients.find(p => p.id === selectedPatientId)?.signalSystem.map((sig, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300 font-mono">
                      <span>{sig}</span>
                      <button
                        onClick={() => handleDeleteSignal(selectedPatientId, idx)}
                        className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition"
                        title="Delete Signal Mapping"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Form to Add New Mapping */}
                <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-4">
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-outfit">Add Custom Signal Mapping</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-400 font-mono">Gesture Expression</label>
                      <input
                        type="text"
                        placeholder="e.g., 4 blinks"
                        value={newSignalGesture}
                        onChange={(e) => setNewSignalGesture(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl text-xs bg-white/5 border border-white/10 focus:outline-none focus:border-purple-500 transition text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-400 font-mono">Meaning / Translation</label>
                      <input
                        type="text"
                        placeholder="e.g., WATER"
                        value={newSignalMeaning}
                        onChange={(e) => setNewSignalMeaning(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl text-xs bg-white/5 border border-white/10 focus:outline-none focus:border-purple-500 transition text-white font-mono"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!newSignalGesture.trim() || !newSignalMeaning.trim()) {
                        triggerToast("Please enter both gesture and meaning.");
                        return;
                      }
                      handleAddSignal(selectedPatientId, newSignalGesture, newSignalMeaning);
                      setNewSignalGesture('');
                      setNewSignalMeaning('');
                    }}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition shadow-lg shadow-purple-900/30"
                  >
                    Add Mapping
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Human-in-the-Loop (HITL) Prompt Modal */}
      {needsConfirmation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none">
          <div className="w-full max-w-lg glass-panel rounded-2xl border border-white/10 shadow-2xl p-6 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start space-x-4">
              <div className="bg-amber-600/10 p-3 rounded-full border border-amber-500/20 text-amber-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white font-outfit">Human Confirmation Required</h3>
                <p className="text-xs text-gray-400 mt-1">Please verify this action before sending to the patient's record or emergency alert.</p>
                
                <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/5 text-sm text-gray-300 font-mono leading-relaxed">
                  {confirmationPrompt}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => handleConfirmAction(false)}
                className="px-4.5 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-xl hover:bg-white/5 border border-transparent transition"
              >
                Reject Action
              </button>
              <button
                onClick={() => handleConfirmAction(true)}
                className="px-5 py-2 text-xs font-semibold bg-amber-500 text-black hover:bg-amber-400 rounded-xl transition shadow-lg shadow-amber-900/30"
              >
                Approve & Execute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {showNotification && (
        <div className="fixed bottom-6 right-6 glass-panel rounded-xl border border-white/10 px-4 py-3 shadow-2xl z-50 flex items-center space-x-2.5 text-xs text-white animate-in slide-in-from-bottom-6 duration-300">
          <Info className="h-4 w-4 text-purple-400" />
          <span>{notificationMsg}</span>
        </div>
      )}
    </div>
  );
}
