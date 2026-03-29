<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { Play, Pause, Save, Download, FastForward, Rewind } from 'lucide-vue-next';
import Dexie from 'dexie';

// --- Types ---
interface Target {
  id: string;
  name: string;
  path: string;
}

interface LogEntry {
  id: string;
  offset: number;
  content: string;
}

// --- State ---
const targets = ref<Target[]>([]);
const selectedTarget = ref<Target | null>(null);
const isPlaying = ref(false);
const logs = ref<LogEntry[]>([]);
const filterText = ref('');
const isRecording = ref(false);
const currentWsOffset = ref(0);

// Dexie DB for Record Feature (Quadro de Análise)
const db = new Dexie('LogzordAnalysisDB');
db.version(1).stores({
  recordedLogs: '++id, content, offset'
});
const recordedCount = ref(0);

let ws: WebSocket | null = null;

// --- Computed ---
const filteredLogs = computed(() => {
  if (!filterText.value) return logs.value;
  return logs.value.filter(log => log.content.includes(filterText.value));
});

function syntaxHighlight(content: string) {
  // Simple syntax highlighting (P0)
  return content
    .replace(/\[ERROR\]/g, '<span class="text-red-500 font-bold">[ERROR]</span>')
    .replace(/\[WARN\]/g, '<span class="text-yellow-500 font-bold">[WARN]</span>')
    .replace(/\[INFO\]/g, '<span class="text-blue-500 font-bold">[INFO]</span>')
    .replace(/(ORA-\d+)/g, '<span class="text-red-600 font-bold bg-red-100 px-1 rounded">$1</span>');
}

// --- Methods ---
async function fetchTargets() {
  try {
    const res = await fetch('http://localhost:3001/api/targets');
    targets.value = await res.json();
    if (targets.value.length > 0) {
      selectTarget(targets.value[0]);
    }
  } catch (error) {
    console.error("Failed to fetch targets:", error);
  }
}

function selectTarget(target: Target) {
  selectedTarget.value = target;
  logs.value = [];
  currentWsOffset.value = 0;
  if (isPlaying.value) {
    stopStream();
    startStream();
  }
}

function connectWebSocket() {
  if (ws) {
    ws.close();
  }
  ws = new WebSocket('ws://localhost:3001');
  
  ws.onopen = () => {
    console.log('Connected to WS');
    if (isPlaying.value) {
      startStream();
    }
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'LOG_CHUNK') {
      // Split chunk by newlines for better rendering (simplified)
      const lines = data.content.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const logEntry = {
          id: Math.random().toString(36).substring(7),
          offset: data.offset, // In a real app we'd track precise offset per line
          content: line
        };
        logs.value.push(logEntry);

        // Keep buffer manageable
        if (logs.value.length > 2000) {
          logs.value.shift();
        }

        // Feature CA 3: Record
        if (isRecording.value) {
           // CA 4 / Refinamento: Only record if it matches current filter
           if (!filterText.value || line.includes(filterText.value)) {
              await db.table('recordedLogs').add({
                content: line,
                offset: data.offset
              });
              recordedCount.value = await db.table('recordedLogs').count();
           }
        }
      }
      currentWsOffset.value = data.offset;
      scrollToBottom();
    } else if (data.type === 'STREAM_END') {
      isPlaying.value = false;
    } else if (data.type === 'ERROR') {
      console.error('Server error:', data.message);
      isPlaying.value = false;
    }
  };

  ws.onclose = () => {
    console.log('Disconnected from WS');
    setTimeout(connectWebSocket, 5000); // Reconnect loop
  };
}

function startStream() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!selectedTarget.value) return;
  
  ws.send(JSON.stringify({
    type: 'START_STREAM',
    targetId: selectedTarget.value.id,
    offset: currentWsOffset.value // ADR-001 send offset to resume
  }));
}

function stopStream() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  ws.send(JSON.stringify({
    type: 'PAUSE_STREAM'
  }));
}

function togglePlay() {
  isPlaying.value = !isPlaying.value;
  if (isPlaying.value) {
    startStream();
  } else {
    stopStream();
  }
}

function toggleRecord() {
  isRecording.value = !isRecording.value;
}

async function clearRecord() {
  await db.table('recordedLogs').clear();
  recordedCount.value = 0;
}

async function exportRecord() {
    const allRecords = await db.table('recordedLogs').toArray();
    if (allRecords.length === 0) {
        alert("Nenhum log gravado no Quadro de Análise.");
        return;
    }
    
    const content = allRecords.map(r => r.content).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    
    // CA 5: Compressão (Mock: we pretend to compress if > 5MB, actual compression in pure frontend would require zipjs)
    if (blob.size > 5 * 1024 * 1024) {
         // mock download gzip/zip
         downloadBlob(blob, 'logzord_analysis.txt'); // in real implementation, use fflate or JSZip
         alert("Arquivo grande! Seria compactado para .zip ou .gz conforme CA 5.");
    } else {
        downloadBlob(blob, 'logzord_analysis.txt');
    }
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function scrollToBottom() {
  const container = document.getElementById('log-container');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// Lifecycle
onMounted(() => {
  fetchTargets();
  connectWebSocket();
  db.table('recordedLogs').count().then(c => recordedCount.value = c);
});

onUnmounted(() => {
  if (ws) ws.close();
});
</script>

<template>
  <div class="flex h-screen w-full bg-slate-950 text-slate-300 font-sans dark custom-scrollbar">
    
    <!-- Sidebar Targets -->
    <aside class="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
      <div class="p-4 border-b border-slate-800 flex items-center space-x-2">
        <div class="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg glow">
          L
        </div>
        <h1 class="text-xl font-bold text-white tracking-widest uppercase">Logzord</h1>
      </div>
      
      <div class="p-4 flex-1 overflow-y-auto">
        <h2 class="text-xs uppercase text-slate-500 font-semibold mb-3 tracking-wider">Targets</h2>
        <ul class="space-y-1">
          <li v-for="target in targets" :key="target.id">
            <button 
              @click="selectTarget(target)"
              class="w-full text-left px-3 py-2 rounded-md transition-all duration-200 text-sm flex items-center shadow-sm"
              :class="selectedTarget?.id === target.id ? 'bg-blue-600 text-white shadow-blue-500/20 shadow-lg font-medium' : 'hover:bg-slate-800 text-slate-400'"
            >
              <div class="w-2 h-2 rounded-full mr-2" :class="selectedTarget?.id === target.id ? 'bg-white' : 'bg-slate-600'"></div>
              {{ target.name }}
            </button>
          </li>
        </ul>
      </div>

      <!-- Analysis Board Status -->
      <div class="p-4 bg-slate-800/50 m-4 rounded-lg border border-slate-700 backdrop-blur-sm">
        <h3 class="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Quadro de Análise</h3>
        <p class="text-2xl font-bold text-white mb-2">{{ recordedCount }} <span class="text-sm font-normal text-slate-500">linhas</span></p>
        <div class="flex space-x-2">
            <button @click="exportRecord" class="flex-1 bg-slate-700 hover:bg-slate-600 text-xs py-1.5 rounded transition shadow-sm border border-slate-600">
                Exportar
            </button>
            <button @click="clearRecord" class="flex-1 bg-red-900/40 hover:bg-red-900/60 text-red-400 text-xs py-1.5 rounded transition shadow-sm border border-red-900/50">
                Limpar
            </button>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col min-w-0 bg-slate-950 relative overflow-hidden">
      
      <!-- Toolbar -->
      <header class="h-14 border-b border-slate-800 flex items-center px-4 justify-between bg-slate-900/80 backdrop-blur-md z-10 sticky top-0">
        <div class="flex items-center space-x-2">
          <!-- Play / Pause -->
          <button 
            @click="togglePlay"
            class="flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 transform active:scale-95 shadow-md"
            :class="isPlaying ? 'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30' : 'bg-green-500/20 text-green-500 hover:bg-green-500/30'"
            title="Play / Pause"
          >
            <Pause v-if="isPlaying" :size="20" class="fill-current" />
            <Play v-else :size="20" class="fill-current ml-1" />
          </button>

          <!-- Navigation (Mock) -->
          <div class="flex items-center bg-slate-800 rounded-full p-1 ml-4 border border-slate-700">
             <button class="p-1.5 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-slate-700">
                <Rewind :size="16" />
             </button>
             <button class="p-1.5 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-slate-700">
                <FastForward :size="16" />
             </button>
          </div>

          <!-- Record -->
          <button 
            @click="toggleRecord"
            class="ml-4 flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 border shadow-sm"
            :class="isRecording ? 'bg-red-500/20 text-red-500 border-red-500/50 pulse-ring' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'"
          >
            <div class="w-2.5 h-2.5 rounded-full mr-2 transition-all duration-300" :class="isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-500'"></div>
            {{ isRecording ? 'Gravando...' : 'Gravar' }}
          </button>
        </div>

        <!-- Filter -->
        <div class="relative w-72">
          <input 
            v-model="filterText"
            type="text" 
            placeholder="Filtrar logs..." 
            class="w-full bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-full pl-4 pr-10 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-inner"
          />
          <div class="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 text-xs font-mono opacity-50">
             /regex/
          </div>
        </div>
      </header>

      <!-- Log Viewer -->
      <div 
        id="log-container"
        class="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed scroll-smooth"
      >
        <div v-if="filteredLogs.length === 0" class="h-full flex items-center justify-center text-slate-500 flex-col">
          <div class="w-16 h-16 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin mb-4 opacity-50" v-if="isPlaying"></div>
          <p>{{ isPlaying ? 'Aguardando logs...' : 'Streaming pausado. Clique no Play para iniciar.' }}</p>
        </div>
        <div 
          v-for="log in filteredLogs" 
          :key="log.id"
          class="hover:bg-slate-800/50 px-2 py-0.5 rounded transition-colors break-all whitespace-pre-wrap border-l-2 border-transparent hover:border-slate-600"
          v-html="syntaxHighlight(log.content)"
        >
        </div>
      </div>
      
      <!-- Status Bar -->
      <footer class="h-8 border-t border-slate-800 bg-slate-900 flex items-center px-4 justify-between text-xs text-slate-500">
        <div class="flex items-center">
            <div class="w-2 h-2 rounded-full mr-2" :class="ws?.readyState === 1 ? 'bg-green-500' : 'bg-red-500'"></div>
            {{ ws?.readyState === 1 ? 'Conectado (ws://localhost:3001)' : 'Desconectado' }}
        </div>
        <div class="font-mono">
            OFFSET: <span class="text-slate-300 font-bold">{{ currentWsOffset }} bytes</span>
        </div>
      </footer>
    </main>

  </div>
</template>

<style>
/* Estilos globais e extras */
.custom-scrollbar::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 1);
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(51, 65, 85, 1);
  border-radius: 5px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(71, 85, 105, 1);
}

.glow {
  box-shadow: 0 0 15px rgba(37, 99, 235, 0.5);
}

.pulse-ring {
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  animation: pulse-ring 2s infinite cubic-bezier(0.66, 0, 0, 1);
}

@keyframes pulse-ring {
  to {
    box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
  }
}
</style>
