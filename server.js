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

// ==================== SIMULATED NETWORK DATA ====================

const networkPackets = [];

// 1. HTTP POST cleartext (1 packet)
networkPackets.push({
  id: 'pkt_1', timestamp: '10:01:23.412', protocol: 'HTTP',
  src_ip: '192.168.1.105', dst_ip: '198.51.100.45', src_port: 54321, dst_port: 80,
  size_bytes: 412, ttl: 64, flags: 'PSH, ACK',
  payload_preview: 'POST /login HTTP/1.1\r\nHost: example.com\r\n\r\nusername=admin&password=password123',
  is_suspicious: true, suspicion_reason: 'Cleartext credentials detected'
});

// 2. TCP SYN port scan (5 packets)
for(let i=1; i<=5; i++) {
  networkPackets.push({
    id: `pkt_${1+i}`, timestamp: `10:01:23.${420+i}`, protocol: 'TCP',
    src_ip: '10.0.0.55', dst_ip: '192.168.1.10', src_port: 44444+i, dst_port: 20+i,
    size_bytes: 60, ttl: 128, flags: 'SYN',
    payload_preview: '',
    is_suspicious: true, suspicion_reason: 'Port scan detected'
  });
}

// 3. ARP Spoofing (3 packets)
for(let i=1; i<=3; i++) {
  networkPackets.push({
    id: `pkt_${6+i}`, timestamp: `10:01:24.${100+i}`, protocol: 'ARP',
    src_ip: '192.168.1.99', dst_ip: '255.255.255.255', src_port: '-', dst_port: '-',
    size_bytes: 42, ttl: 1, flags: '',
    payload_preview: 'ARP Reply 192.168.1.1 is-at 00:0c:29:11:22:33',
    is_suspicious: true, suspicion_reason: 'ARP spoofing attempt'
  });
}

// 4. Normal traffic (21 packets)
for(let i=1; i<=21; i++) {
  const isDNS = i % 3 === 0;
  const isICMP = i % 7 === 0;
  let proto = isICMP ? 'ICMP' : (isDNS ? 'UDP' : 'HTTPS');
  networkPackets.push({
    id: `pkt_${9+i}`, timestamp: `10:01:${25+i}.${200+i}`, protocol: proto,
    src_ip: `192.168.1.${100 + (i%5)}`, dst_ip: isDNS ? '8.8.8.8' : (isICMP ? '1.1.1.1' : '104.18.2.1'),
    src_port: isICMP ? '-' : 50000+i, dst_port: isICMP ? '-' : (isDNS ? 53 : 443),
    size_bytes: isICMP ? 74 : (isDNS ? 85 : 1240), ttl: 64, flags: isDNS || isICMP ? '' : 'ACK',
    payload_preview: isICMP ? 'Echo Request id=0x1234 seq=1' : (isDNS ? 'Standard query A www.google.com' : 'Encrypted Application Data...'),
    is_suspicious: false, suspicion_reason: null
  });
}

// ==================== API ENDPOINTS ====================

// Helper function to simulate malware data obfuscation (XOR + Base64)
const obfuscateXOR = (text, key) => {
  const buffer = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i++) {
    buffer[i] = text.charCodeAt(i) ^ key;
  }
  return buffer.toString('base64');
};

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

// Simulate extracting an obfuscated configuration block from memory
app.get('/api/analysis/obfuscated-config', (req, res) => {
  const config = {
    c2_server: '198.51.100.45',
    c2_port: 443,
    hidden_process: 'sysmon.exe',
    hidden_driver: 'rootkit.sys',
    exfiltration_dir: 'C:\\Windows\\Temp\\~dmp'
  };
  const jsonString = JSON.stringify(config);
  const xorKey = 0x42; // Example key: 66 in decimal, 'B' in ASCII
  
  res.json({
    source: 'Memory Dump (Address: 0xfffffa8000020000 - rootkit.sys)',
    obfuscatedData: obfuscateXOR(jsonString, xorKey),
    hint: 'Data is XOR obfuscated with a single-byte key (0x42), then Base64 encoded.',
    education: 'Malware often obfuscates its configuration in memory to evade static string analysis and hide Indicators of Compromise (IOCs). Analysts must identify the encoding (e.g., Base64) and the obfuscation method (e.g., XOR) to extract these details. A single-byte XOR key is common because it is fast and easy to implement in C/C++.'
  });
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

// ==================== NETWORK PACKET SIMULATION API ====================

// Helper function to format hex dump up to 64 bytes
const getHexDump = (str) => {
  const buf = Buffer.from(str || '0000000000000000');
  let hex = '';
  let ascii = '';
  for (let i = 0; i < Math.min(buf.length, 64); i += 16) {
    let hexRow = [];
    let asciiRow = [];
    for (let j = 0; j < 16; j++) {
      if (i + j < buf.length) {
        const b = buf[i + j];
        hexRow.push(b.toString(16).padStart(2, '0'));
        asciiRow.push(b >= 32 && b <= 126 ? String.fromCharCode(b) : '.');
      } else {
        hexRow.push('  ');
        asciiRow.push(' ');
      }
    }
    hexRow.splice(8, 0, ' '); // Insert middle gap for classical hex dump aesthetic
    hex += hexRow.join(' ') + '\n';
    ascii += asciiRow.join('') + '\n';
  }
  return { hex: hex.trimEnd(), ascii: ascii.trimEnd() };
};

// Get full packet stream
app.get('/api/network/packet-stream', (req, res) => {
  res.json(networkPackets);
});

// Get specific packet details
app.get('/api/network/packet/:id', (req, res) => {
  const packet = networkPackets.find(p => p.id === req.params.id);
  if (!packet) return res.status(404).json({ error: 'Packet not found' });
  
  const { hex, ascii } = getHexDump(packet.payload_preview);
  let explanation = '';
  switch(packet.protocol) {
    case 'TCP': explanation = 'Transmission Control Protocol ensures reliable, ordered delivery of data. Notice the flags (SYN, ACK) used to establish and manage connections.'; break;
    case 'UDP': explanation = 'User Datagram Protocol sends messages with minimal overhead. It is fast but does not guarantee delivery or exact order.'; break;
    case 'HTTP': explanation = 'Hypertext Transfer Protocol transmits data in cleartext. Anyone intercepting the packet on the network can easily read its contents, including sensitive data like passwords.'; break;
    case 'HTTPS': explanation = 'HTTP Secure uses TLS to encrypt data in transit. The payload is unreadable to interceptors without the decryption key.'; break;
    case 'ARP': explanation = 'Address Resolution Protocol maps IP addresses to MAC addresses on a local subnet. Attackers can flood ARP replies to intercept network traffic (ARP Spoofing).'; break;
    case 'ICMP': explanation = 'Internet Control Message Protocol is used for network diagnostics (e.g., ping). Attackers often use it to sweep a network and discover live hosts.'; break;
    default: explanation = 'Standard network communications protocol.';
  }

  let threat_level = 'LOW';
  if (packet.is_suspicious) {
    if (packet.suspicion_reason.includes('Cleartext')) threat_level = 'CRITICAL';
    else if (packet.suspicion_reason.includes('ARP')) threat_level = 'HIGH';
    else threat_level = 'MEDIUM';
  }

  res.json({
    ...packet,
    tcp_flags_decoded: ['TCP', 'HTTP', 'HTTPS'].includes(packet.protocol) ? `TCP Flags: [${packet.flags}]` : 'N/A',
    hex_dump: hex,
    ascii_representation: ascii,
    protocol_explanation: explanation,
    threat_level
  });
});

// Filter packet stream
app.get('/api/network/filter', (req, res) => {
  let filtered = networkPackets;
  const { protocol, suspicious_only } = req.query;
  
  if (protocol && protocol !== 'ALL') {
    filtered = filtered.filter(p => p.protocol === protocol);
  }
  if (suspicious_only === 'true') {
    filtered = filtered.filter(p => p.is_suspicious);
  }
  res.json(filtered);
});

// Network Traffic Analysis
app.get('/api/network/analysis', (req, res) => {
  const protocols_breakdown = {};
  const ip_counts = {};
  
  networkPackets.forEach(p => {
    protocols_breakdown[p.protocol] = (protocols_breakdown[p.protocol] || 0) + 1;
    if(p.src_ip !== '-') ip_counts[p.src_ip] = (ip_counts[p.src_ip] || 0) + 1;
  });

  const top_talkers = Object.entries(ip_counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(entry => ({ ip: entry[0], count: entry[1] }));

  const detected_attacks = [
    { attack_type: 'Cleartext Credentials', severity: 'CRITICAL', packets_involved: 1, recommendation: 'Enforce HTTPS (TLS) for all authentication endpoints. Deprecate HTTP.' },
    { attack_type: 'Port Scan (SYN)', severity: 'MEDIUM', packets_involved: 5, recommendation: 'Configure IDS/IPS to rate-limit or temporarily block IPs performing sequential port probing.' },
    { attack_type: 'ARP Spoofing', severity: 'HIGH', packets_involved: 3, recommendation: 'Implement Dynamic ARP Inspection (DAI) on network switches.' }
  ];

  res.json({
    total_packets: networkPackets.length,
    suspicious_count: networkPackets.filter(p => p.is_suspicious).length,
    protocols_breakdown,
    top_talkers,
    detected_attacks
  });
});

// ==================== SERVER START ====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🔐 Kernel Debugging Simulation Server running on port ${PORT}`);
  console.log(`📍 Public frontend will connect to: http://localhost:${PORT}`);
  console.log(`\n✓ API endpoints available:`);
  console.log(`   GET  /api/processes/user-mode`);
  console.log(`   GET  /api/processes/kernel-mode`);
  console.log(`   GET  /api/analysis/cross-view-comparison`);
  console.log(`   GET  /api/process/:name/details`);
  console.log(`   POST /api/windbg-command`);
  console.log(`   GET  /api/analysis/obfuscated-config`);
  console.log(`   GET  /api/analysis/rootkit-detection\n`);
});
