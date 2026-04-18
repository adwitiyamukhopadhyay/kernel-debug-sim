const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== SIMULATED KERNEL DATA ====================

// Simulate real Windows processes with their kernel-mode vs user-mode views
const kernelProcessData = {
  'system.exe': {
    pid: 4,
    kernelAddr: '0xffff8000a0000000',
    modules: [
      { name: 'ntoskrnl.exe', kernelBase: '0xfffff80000000000', userView: 'HIDDEN' },
      { name: 'hal.dll', kernelBase: '0xfffff80000100000', userView: 'HIDDEN' },
      { name: 'drivers.sys', kernelBase: '0xfffff80000200000', userView: 'HIDDEN' }
    ],
    threads: 247,
    handles: 3421
  },
  'explorer.exe': {
    pid: 2104,
    kernelAddr: '0xffff8000a0100000',
    modules: [
      { name: 'explorer.exe', kernelBase: '0x00400000', userView: 'explorer.exe' },
      { name: 'shell32.dll', kernelBase: '0x76000000', userView: 'shell32.dll' },
      { name: 'ntdll.dll', kernelBase: '0x77000000', userView: 'ntdll.dll' }
    ],
    threads: 18,
    handles: 512
  },
  'notepad.exe': {
    pid: 3456,
    kernelAddr: '0xffff8000a0200000',
    modules: [
      { name: 'notepad.exe', kernelBase: '0x01000000', userView: 'notepad.exe' },
      { name: 'kernel32.dll', kernelBase: '0x75000000', userView: 'kernel32.dll' },
      { name: 'ntdll.dll', kernelBase: '0x77000000', userView: 'ntdll.dll' }
    ],
    threads: 6,
    handles: 89
  },
  'svchost.exe': {
    pid: 1248,
    kernelAddr: '0xffff8000a0300000',
    modules: [
      { name: 'svchost.exe', kernelBase: '0x01400000', userView: 'svchost.exe' },
      { name: 'kernel32.dll', kernelBase: '0x75000000', userView: 'kernel32.dll' },
      { name: 'ntdll.dll', kernelBase: '0x77000000', userView: 'ntdll.dll' }
    ],
    threads: 12,
    handles: 234
  },
  // HIDDEN ROOTKIT PROCESS (kernel-level only, invisible to user-mode)
  'sysmon.exe': {
    pid: 5678,
    kernelAddr: '0xffff8000a0400000',
    isHidden: true,
    modules: [
      { name: 'sysmon.exe', kernelBase: '0xdeadbeef0000', userView: 'HIDDEN' },
      { name: 'rootkit.sys', kernelBase: '0xdeadbeef1000', userView: 'HIDDEN' }
    ],
    threads: 4,
    handles: 128
  }
};

// ==================== API ENDPOINTS ====================

// Get user-mode process view (what Task Manager sees - incomplete)
app.get('/api/processes/user-mode', (req, res) => {
  const userView = {};
  Object.entries(kernelProcessData).forEach(([name, data]) => {
    if (!data.isHidden) {
      userView[name] = {
        pid: data.pid,
        modules: data.modules.filter(m => m.userView !== 'HIDDEN').map(m => ({
          name: m.userView,
          base: '0x????????' // Obfuscated in user view
        })),
        threadCount: data.threads,
        handleCount: data.handles
      };
    }
  });
  res.json({
    source: 'User-Mode (Task Manager / CreateToolhelp32Snapshot)',
    processCount: Object.keys(userView).length,
    data: userView,
    metadata: 'This view may be hooked by rootkits'
  });
});

// Get kernel-mode process view (WinDbg reality - complete truth)
app.get('/api/processes/kernel-mode', (req, res) => {
  const kernelView = {};
  Object.entries(kernelProcessData).forEach(([name, data]) => {
    kernelView[name] = {
      pid: data.pid,
      kernelAddr: data.kernelAddr,
      modules: data.modules.map(m => ({
        name: m.name,
        kernelBase: m.kernelBase,
        userVisible: m.userView !== 'HIDDEN' ? 'yes' : 'no'
      })),
      threadCount: data.threads,
      handleCount: data.handles,
      hidden: data.isHidden ? 'YES - ROOTKIT DETECTED' : 'no'
    };
  });
  res.json({
    source: 'Kernel-Mode (WinDbg / !process 0 0)',
    processCount: Object.keys(kernelView).length,
    data: kernelView,
    metadata: 'Complete and accurate (cannot be hooked from user-mode)'
  });
});

// Compare the two views and identify discrepancies
app.get('/api/analysis/cross-view-comparison', (req, res) => {
  const userProcs = Object.keys(kernelProcessData).filter(p => !kernelProcessData[p].isHidden);
  const allProcs = Object.keys(kernelProcessData);
  
  const hidden = allProcs.filter(p => !userProcs.includes(p));
  const hookedModules = [];
  
  Object.entries(kernelProcessData).forEach(([name, data]) => {
    const hiddenCount = data.modules.filter(m => m.userView === 'HIDDEN').length;
    if (hiddenCount > 0) {
      hookedModules.push({
        process: name,
        hiddenModules: hiddenCount,
        modules: data.modules.filter(m => m.userView === 'HIDDEN').map(m => m.name)
      });
    }
  });

  res.json({
    hiddenProcesses: {
      count: hidden.length,
      list: hidden,
      risk: hidden.length > 0 ? 'CRITICAL' : 'LOW',
      explanation: 'Processes in kernel view but not in user view = hidden by rootkit'
    },
    hookedSystemDlls: {
      count: hookedModules.length,
      affected: hookedModules,
      risk: hookedModules.length > 0 ? 'HIGH' : 'LOW',
      explanation: 'System DLLs marked as HIDDEN = API hooking likely'
    },
    indicatorsOfCompromise: [
      'Thread count discrepancy (kernel allows more precise count)',
      'Handle count mismatch (hooked EnumHandles)',
      'Missing system services in user-mode view',
      'Impossible memory addresses in kernel view'
    ]
  });
});

// Get detailed process structure (simulating !peb / !process WinDbg commands)
app.get('/api/process/:name/details', (req, res) => {
  const processName = req.params.name;
  const procData = kernelProcessData[processName];
  
  if (!procData) {
    return res.status(404).json({ error: 'Process not found', available: Object.keys(kernelProcessData) });
  }

  res.json({
    name: processName,
    kernelAddress: procData.kernelAddr,
    pid: procData.pid,
    ring0: !procData.isHidden ? 'Ring 3 (User)' : 'Ring 0 (Kernel)',
    pebAddress: '0x' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0'),
    moduleCount: procData.modules.length,
    modules: procData.modules,
    threadCount: procData.threads,
    handleCount: procData.handles,
    imageBase: '0x00400000',
    entryPoint: '0x00401000',
    flags: {
      isHidden: procData.isHidden || false,
      hasKernelHooks: procData.modules.some(m => m.userView === 'HIDDEN'),
      isSystemProcess: procData.pid < 1000
    }
  });
});

// Simulate WinDbg commands for memory inspection
app.post('/api/windbg-command', (req, res) => {
  const { command } = req.body;
  
  const commands = {
    '!peb': {
      output: `
        PEB at 0x7ffd6000
          InheritedAddressSpace:    No
          ReadImageFileExecOptions: No
          BeingDebugged:            No
          ImageBaseAddress:         0x00400000
          Ldr                       0x76f3c0d0 -> .Flink = 0x00a78ac8, .Blink = 0x00a79c38
          Ldr.Initialized:          Yes
          ...
      `,
      education: 'PEB contains process environment info - invisible to rootkit APIs when hooked'
    },
    '!process 0 0': {
      output: `
        PROCESS ffff8000a0000000
          SessionId: none  Cid: 0004    Peb: 00000000  ParentCid: 0000
          DirBase: 001ad000  ObjectTable: fffffa8000000000  HandleCount: 3421.
          Image: System
          
        PROCESS ffff8000a0100000
          SessionId: 1  Cid: 083a    Peb: 7ffd6000  ParentCid: 0868
          DirBase: 0c6b5000  ObjectTable: fffffa8000100000  HandleCount: 512.
          Image: explorer.exe
          
        PROCESS ffff8000a0400000 [ROOTKIT - HIDDEN]
          SessionId: none  Cid: 162e    Peb: deadbeef  ParentCid: 0000
          DirBase: deadbeef  ObjectTable: fffffa8000400000  HandleCount: 128.
          Image: sysmon.exe
      `,
      education: 'Kernel view shows ALL processes - invisible ones are rootkits'
    },
    'lm': {
      output: `
        Start             End                 Module Name
        fffff800'00000000 fffff800'003d9000   ntoskrnl
        fffff800'01000000 fffff800'01400000   hal
        fffff800'02000000 fffff800'02100000   volmgr
        fffffa80'00000000 fffffa80'00020000   rootkit [HIDDEN IN USER VIEW]
      `,
      education: 'List modules - kernel drivers hidden from user-mode enumeration'
    }
  };

  if (commands[command]) {
    res.json(commands[command]);
  } else {
    res.status(400).json({ 
      error: 'Unknown command',
      available: Object.keys(commands),
      tip: 'Try: "!peb", "!process 0 0", "lm"'
    });
  }
});

// Rootkit detection engine
app.get('/api/analysis/rootkit-detection', (req, res) => {
  const indicators = [];
  
  // Check for hidden processes
  const userProcs = Object.keys(kernelProcessData).filter(p => !kernelProcessData[p].isHidden);
  const kernelProcs = Object.keys(kernelProcessData);
  const hidden = kernelProcs.filter(p => !userProcs.includes(p));
  
  if (hidden.length > 0) {
    indicators.push({
      severity: 'CRITICAL',
      type: 'Hidden Process Detection',
      description: `Found ${hidden.length} process(es) in kernel view but not in user view`,
      processes: hidden,
      detection: 'DKOM (Direct Kernel Object Manipulation)'
    });
  }

  // Check for hooked system DLLs
  const hookedDlls = [];
  Object.entries(kernelProcessData).forEach(([name, data]) => {
    data.modules.forEach(m => {
      if (m.userView === 'HIDDEN' && m.name.includes('.dll')) {
        hookedDlls.push(`${name}/${m.name}`);
      }
    });
  });

  if (hookedDlls.length > 0) {
    indicators.push({
      severity: 'HIGH',
      type: 'API Hooking Detected',
      description: `${hookedDlls.length} system DLL(s) hidden from user-mode enumeration`,
      modules: hookedDlls,
      detection: 'IAT/SSDT Hook'
    });
  }

  // Ring 0 execution detection
  indicators.push({
    severity: 'CRITICAL',
    type: 'Ring 0 Execution',
    description: 'Some processes execute at kernel privilege level',
    location: 'Only visible via WinDbg kernel debugging',
    detection: 'Privilege level mismatch'
  });

  res.json({
    timestamp: new Date().toISOString(),
    systemStatus: indicators.length > 0 ? 'COMPROMISED' : 'CLEAN',
    totalIndicators: indicators.length,
    indicators: indicators,
    recommendations: [
      'Run full kernel-mode memory forensics',
      'Capture crash dump for offline analysis',
      'Isolate system from network immediately if Critical',
      'Compare with clean baseline'
    ]
  });
});

// ==================== SERVER START ====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🔐 Kernel Debugging Simulation Server running on port ${PORT}`);
  console.log(`📍 Student frontend will connect to: http://localhost:${PORT}`);
  console.log(`\n✓ API endpoints available:`);
  console.log(`   GET  /api/processes/user-mode`);
  console.log(`   GET  /api/processes/kernel-mode`);
  console.log(`   GET  /api/analysis/cross-view-comparison`);
  console.log(`   GET  /api/process/:name/details`);
  console.log(`   POST /api/windbg-command`);
  console.log(`   GET  /api/analysis/rootkit-detection\n`);
});
