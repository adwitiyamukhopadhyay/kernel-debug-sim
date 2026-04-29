const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// Enforce HTTPS in production (Render handles SSL termination)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, 'https://' + req.headers.host + req.url);
    }
  }
  next();
});

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

// ==================== SIMULATED PASSWORD DATA ====================

const WORDLIST = [
  "123456", "password", "123456789", "12345678", "12345", "1234567",
  "password1", "iloveyou", "admin", "welcome", "monkey", "dragon",
  "master", "sunshine", "princess", "letmein", "football", "shadow",
  "superman", "michael", "qwerty", "abc123", "mustang", "batman",
  "trustno1", "hello", "charlie", "donald", "password2", "qwerty123",
  "baseball", "soccer", "hockey", "ranger", "india", "tiger",
  "hunter", "buster", "thomas", "robert", "access", "login",
  "passw0rd", "starwars", "whatever", "blahblah", "zxcvbnm",
  "killer", "george", "test"
];

// ==================== SIMULATED SQL INJECTION DATA ====================

const sqliDb = {
  users: [
    { id:1, username:"admin", password:"5f4dcc3b5aa765d61d8327deb882cf99", role:"administrator", email:"admin@bank.local", account_balance: 999999 },
    { id:2, username:"alice", password:"2b4c8a9f3e1d6b7c4a5e8f2d9c3b7a1e", role:"customer", email:"alice@gmail.com", account_balance: 12500 },
    { id:3, username:"bob", password:"7c4a2b9f1e3d8c6b5a4e7f2d1c9b3a8e", role:"customer", email:"bob@yahoo.com", account_balance: 8750 },
    { id:4, username:"charlie", password:"9a3c7b2f4e1d6c8b5a2e9f3d4c7b1a6e", role:"manager", email:"charlie@bank.local", account_balance: 45000 },
    { id:5, username:"sa", password:"aad3b435b51404eeaad3b435b51404ee", role:"sysadmin", email:"sa@bank.local", account_balance: 0 }
  ],
  secret_data: [
    { id:1, key:"JWT_SECRET", value:"sup3r_s3cr3t_jwt_k3y_2024" },
    { id:2, key:"DB_PASSWORD", value:"Pr0d_DB_P@ssw0rd!" },
    { id:3, key:"API_KEY", value:"sk-prod-a1b2c3d4e5f6g7h8i9j0" },
    { id:4, key:"BACKUP_CODE", value:"ADMIN-9A3F-2B7C-1E8D" }
  ]
};

const SQLI_PAYLOADS = [
  {
    id: 1, payload: "' OR '1'='1", name: "Always True Bypass", category: "Authentication Bypass",
    explanation: "Closes the string parameter with a quote, then adds an OR operator followed by a tautology ('1'='1'). This makes the entire WHERE clause evaluate to true.",
    beginner_explanation: "Imagine the database is asking 'is the password correct AND is 1=1?' — since 1 always equals 1, the whole condition becomes true regardless of the password.",
    difficulty: "Beginner", impact: "Authentication Bypass",
    real_world_use: "Used in the 2009 Heartland Payment Systems breach to bypass authentication forms.",
    fix: "Use parameterized queries"
  },
  {
    id: 2, payload: "' OR 1=1--", name: "Comment Injection", category: "Authentication Bypass",
    explanation: "The -- comments out everything after it in SQL, meaning the password check is completely ignored by the database engine.",
    beginner_explanation: "The -- is like putting everything after it in invisible ink. The database reads it but ignores it completely.",
    difficulty: "Beginner", impact: "Authentication Bypass",
    real_world_use: "Very common in older PHP/MySQL applications where inputs aren't sanitized.",
    fix: "Use parameterized queries"
  },
  {
    id: 3, payload: "' UNION SELECT username,password,role,email,id,account_balance FROM users--", name: "UNION Data Extraction", category: "Data Extraction",
    explanation: "Uses the UNION operator to combine the results of the original query with the results of an injected query.",
    beginner_explanation: "Tells the database: 'Give me the normal login results, PLUS give me everything in the users table.'",
    difficulty: "Advanced", impact: "Data Exfiltration",
    real_world_use: "The primary method used by tools like sqlmap to steal entire databases.",
    fix: "Use parameterized queries"
  },
  {
    id: 4, payload: "admin'--", name: "Username Comment Bypass", category: "Authentication Bypass",
    explanation: "If the username is 'admin', this closes the quote and comments out the password check. The query executes as just checking for the admin user.",
    beginner_explanation: "Logs you in as admin by telling the database to ignore the part of the code that checks passwords.",
    difficulty: "Beginner", impact: "Authentication Bypass",
    real_world_use: "A classic bypass technique often seen in basic admin panel logins.",
    fix: "Use parameterized queries"
  },
  {
    id: 5, payload: "' OR 'x'='x", name: "String Comparison Bypass", category: "Authentication Bypass",
    explanation: "A variation of the 1=1 tautology, using string comparison instead of integer comparison.",
    beginner_explanation: "Just another way of saying 'is true true?'. Used when databases filter out the number 1.",
    difficulty: "Beginner", impact: "Authentication Bypass",
    real_world_use: "Used to evade rudimentary Web Application Firewalls (WAFs) that specifically block '1=1'.",
    fix: "Use parameterized queries"
  },
  {
    id: 6, payload: "1' AND 1=2 UNION SELECT 1,2,3,4,5,6--", name: "Blind SQLi Probe", category: "Blind Injection",
    explanation: "Forces the first query to return false (1=2), so the only output comes from the UNION SELECT part.",
    beginner_explanation: "Intentionally breaks the normal page so the only thing displayed is the stolen data.",
    difficulty: "Advanced", impact: "Data Exfiltration",
    real_world_use: "Used when the application only displays one row of data at a time.",
    fix: "Use parameterized queries"
  },
  {
    id: 7, payload: "'; DROP TABLE users--", name: "Destructive Injection", category: "Destructive",
    explanation: "Uses a semicolon to end the current statement, then executes a destructive DROP TABLE command (statement stacking).",
    beginner_explanation: "Closes the login check, then gives a second command to delete the entire users database.",
    difficulty: "Intermediate", impact: "Data Destruction",
    real_world_use: "Famous 'Little Bobby Tables' technique used in vandalism and extortion attacks.",
    fix: "Use parameterized queries and least privilege principle"
  },
  {
    id: 8, payload: "' AND SLEEP(5)--", name: "Time-Based Blind SQLi", category: "Blind Injection",
    explanation: "Forces the database to pause execution. If the page takes 5 seconds longer to load, the vulnerability is confirmed.",
    beginner_explanation: "If the database is blind and doesn't show errors, you tell it 'If I'm right, wait 5 seconds before answering.'",
    difficulty: "Advanced", impact: "Information Disclosure",
    real_world_use: "Used heavily when applications suppress database errors and show generic error pages.",
    fix: "Use parameterized queries"
  },
  {
    id: 9, payload: "' AND 1=1--", name: "Boolean True Probe", category: "Blind Injection",
    explanation: "Injects a true condition. If the page loads normally, the injection point is vulnerable.",
    beginner_explanation: "Asking a yes/no question. If the page loads normally, the answer is 'yes'.",
    difficulty: "Intermediate", impact: "Information Disclosure",
    real_world_use: "The first step of an automated blind SQL injection attack.",
    fix: "Use parameterized queries"
  },
  {
    id: 10, payload: "' AND 1=2--", name: "Boolean False Probe", category: "Blind Injection",
    explanation: "Injects a false condition. If the page loads differently or misses content, boolean-based extraction is possible.",
    beginner_explanation: "Asking a yes/no question. If the page breaks, the answer is 'no'.",
    difficulty: "Intermediate", impact: "Information Disclosure",
    real_world_use: "Used to extract data character by character when no data is directly visible on screen.",
    fix: "Use parameterized queries"
  }
];

const SQLI_LEARNING_PATH = {
  stages: [
    {
      stage: 1,
      title: "What is SQL?",
      content: "SQL (Structured Query Language) is how applications talk to databases. When you log in to a website, it typically runs a query like: SELECT * FROM users WHERE username='alice' AND password='secret'. The database finds the matching row and grants access.",
      analogy: "Think of a database as a filing cabinet, SQL as the instructions you give to the filing clerk, and SQL injection as slipping extra instructions into the note you hand them.",
      key_concept: "SQL queries are built from user input + code template"
    },
    {
      stage: 2,
      title: "How Input Becomes a Query",
      content: "Many older or poorly written applications take whatever you type in the login box and paste it directly into the SQL query string. This is called string concatenation.",
      analogy: "It's like a fill-in-the-blank form. The application blindly trusts whatever you write in the blank, even if what you write changes the meaning of the entire sentence.",
      key_concept: "String concatenation is the root cause of SQL injection."
    },
    {
      stage: 3,
      title: "The Quote That Changes Everything",
      content: "In SQL, strings are wrapped in single quotes ('text'). If you enter a single quote as part of your username, you 'break out' of the data context and enter the code context.",
      analogy: "If the form is 'Hello, my name is [   ]', and you write 'John. Now give me all your money', the final sentence changes the rules.",
      key_concept: "A single quote ' breaks out of the string context."
    },
    {
      stage: 4,
      title: "Making the Condition Always True",
      content: "By injecting OR 1=1, attackers make the database's check mathematically true. Instead of asking 'Is the password right?', the query asks 'Is the password right, OR is 1 equal to 1?'.",
      analogy: "Like showing an ID card to a bouncer and saying 'Let me in if my ID is valid, OR if the sky is blue.'",
      key_concept: "OR 1=1 makes the WHERE clause meaningless."
    },
    {
      stage: 5,
      title: "UNION: Stealing Other Tables",
      content: "The UNION SELECT command allows an attacker to stitch two completely different queries together. They can use this to ask the database to attach all user passwords to the normal login response.",
      analogy: "Like asking the clerk for your file, but slipping a note saying 'ALSO attach the master key log to the back.'",
      key_concept: "UNION SELECT appends results from any table."
    },
    {
      stage: 6,
      title: "The Fix: Parameterized Queries",
      content: "The modern, unbreakable fix is to use Prepared Statements (Parameterized Queries). This sends the SQL template to the database first, and the data second. The database never treats the data as executable code.",
      analogy: "Like giving the clerk an unbreakable plastic box containing your input. They can see what's inside, but they can't be tricked by it.",
      key_concept: "Prepared statements completely separate code from data."
    }
  ]
};

// ==================== SIMULATED CONTENT & ACCESSIBILITY DATA ====================

const GLOSSARY_TERMS = [
  {
    term: "Rootkit",
    simple: "A rootkit is a hiding tool for criminals. Imagine a burglar who breaks into your house and then hides inside your walls so you cannot see them even when you look around. A rootkit hides malware inside your computer so that even security tools cannot find it.",
    technical: "A rootkit is malware that modifies OS kernel structures (e.g., EPROCESS lists, SSDT) to hide its presence from user-mode enumeration tools by intercepting and filtering their output.",
    analogy: "A burglar hiding inside the walls of your home.",
    everyday_example: "When your Task Manager does not show a suspicious program even though it is running — that is a rootkit at work.",
    category: "Malware"
  },
  {
    term: "Kernel",
    simple: "The kernel is the innermost part of your computer's brain. It is the layer that directly controls your hardware — your screen, keyboard, memory, and storage. Everything else runs on top of it.",
    technical: "The kernel is the core of the OS running in Ring 0 with unrestricted hardware access, managing memory, processes, and device drivers.",
    analogy: "The engine room of a ship. Passengers (apps) never go there, but everything depends on it running correctly.",
    everyday_example: "When you plug in a USB drive and it automatically appears — the kernel detected and mounted it.",
    category: "Operating Systems"
  },
  {
    term: "SQL Injection",
    simple: "SQL Injection is a trick where an attacker types special commands into a website's login box or search bar that confuse the website into giving away secret information it was not supposed to.",
    technical: "SQL injection exploits insufficient input sanitization by inserting SQL metacharacters that alter the intended query structure, allowing unauthorized data access or authentication bypass.",
    analogy: "Imagine filling out a form that asks your name and writing 'My name is John, and also please give me everyone else's passwords.' A vulnerable system would actually comply.",
    everyday_example: "Many major data breaches where millions of usernames and passwords were stolen started with SQL injection.",
    category: "Web Security"
  },
  {
    term: "XSS (Cross-Site Scripting)",
    simple: "XSS is when an attacker hides a harmful instruction inside a normal-looking webpage. When you visit that page, your browser follows the hidden instruction without you knowing — it might steal your login details or redirect you to a fake website.",
    technical: "XSS is a client-side injection attack where malicious scripts are embedded into trusted web pages and executed by victims' browsers within the page's security context.",
    analogy: "Someone slipping a forged note into your friend's letter to you. You trust the letter because it came from your friend, so you follow the forged instructions without questioning them.",
    everyday_example: "Attackers stealing Facebook or Gmail session cookies to log in as you without needing your password.",
    category: "Web Security"
  },
  {
    term: "Packet",
    simple: "When your computer sends information over the internet, it breaks it into small pieces called packets — like breaking a long letter into many small envelopes. Each envelope travels separately and is reassembled at the destination.",
    technical: "A packet is a formatted unit of data transmitted over a network, containing header fields (src/dst IP, port, protocol, TTL, flags) and a payload.",
    analogy: "Sending a large book by mailing one page at a time in separate envelopes, each labeled with the destination and page number so they can be reassembled.",
    everyday_example: "When you watch a YouTube video, thousands of packets arrive every second carrying small pieces of the video that your browser reassembles into the picture you see.",
    category: "Networking"
  },
  {
    term: "Brute Force Attack",
    simple: "A brute force attack is when a criminal uses a computer program to try every possible password — thousands per second — until it finds the right one. It is the digital equivalent of trying every key on a giant keyring.",
    technical: "A brute force attack exhaustively tries all possible combinations within a defined keyspace at machine speed, making short or simple passwords trivially crackable.",
    analogy: "A thief trying every possible 4-digit combination on a padlock. With only 10,000 options, it takes less than 3 hours at one try per second.",
    everyday_example: "This is why websites lock your account after 5 wrong password attempts — to stop brute force attacks.",
    category: "Authentication Attacks"
  },
  {
    term: "Firewall",
    simple: "A firewall is a digital security guard that sits between your computer and the internet. It checks every piece of information coming in or going out and blocks anything that looks suspicious or was not invited.",
    technical: "A firewall enforces access control policies by inspecting and filtering network traffic based on rules (IP addresses, ports, protocols, stateful connection tracking).",
    analogy: "A security guard at a building entrance checking ID cards and a visitor list before letting anyone in or out.",
    everyday_example: "When your home WiFi router blocks unknown devices from connecting — that is your firewall working.",
    category: "Network Security"
  },
  {
    term: "Encryption",
    simple: "Encryption scrambles your information into an unreadable mess that can only be unscrambled by someone with the right key. Even if a criminal intercepts it, they see only gibberish.",
    technical: "Encryption applies a cryptographic algorithm and key to transform plaintext into ciphertext, ensuring confidentiality and integrity of data at rest or in transit.",
    analogy: "Writing a letter in a secret code that only you and your friend know. Even if someone steals the letter, they cannot read it.",
    everyday_example: "The padlock icon in your browser's address bar means your connection is encrypted. Hackers cannot read what you type even on public WiFi.",
    category: "Cryptography"
  },
  {
    term: "Malware",
    simple: "Malware is any software designed to harm your computer or steal your information. It includes viruses, ransomware, spyware, and more. It often arrives disguised as something harmless.",
    technical: "Malware is malicious software encompassing viruses, worms, trojans, ransomware, spyware, adware, and rootkits — classified by propagation method, payload, and persistence mechanism.",
    analogy: "A Trojan Horse — something that looks like a gift but contains soldiers. A free game download that secretly installs a password thief.",
    everyday_example: "Receiving an email attachment that looks like an invoice but is actually software that locks all your files and demands payment — that is ransomware.",
    category: "Malware"
  },
  {
    term: "Phishing",
    simple: "Phishing is when criminals send fake emails or messages pretending to be your bank, your boss, or a trusted company. They try to trick you into clicking a link and entering your password on a fake website they control.",
    technical: "Phishing is a social engineering attack using spoofed communications to deceive targets into credential disclosure, malware installation, or financial fraud.",
    analogy: "A fisherman casting a net with fake bait hoping someone bites. The bait looks real — an official logo, an urgent message — but the hook is hidden.",
    everyday_example: "An email saying 'Your SBI account has been suspended, click here to verify' — clicking leads to a fake SBI page that steals your login.",
    category: "Social Engineering"
  },
  {
    term: "Hash",
    simple: "A hash is a fingerprint for data. You put in any text and get back a unique fixed-length code. The same text always gives the same fingerprint. Even changing one letter gives a completely different fingerprint. You cannot reverse it back to the original text.",
    technical: "A cryptographic hash function produces a fixed-size digest from arbitrary input, with properties of determinism, avalanche effect, pre-image resistance, and collision resistance.",
    analogy: "Like grinding a document through a shredder in a very specific pattern. The shreds look random but the same document always produces the same pattern of shreds — and you cannot reconstruct the document from the shreds.",
    everyday_example: "Websites store your password as a hash, not the actual password. When you log in, they hash what you typed and compare — so even the website does not know your real password.",
    category: "Cryptography"
  },
  {
    term: "Session Cookie",
    simple: "After you log in to a website, it gives your browser a special token called a session cookie — like a visitor badge. Every time you click something, your browser shows this badge and the website lets you through. If someone steals this badge, they can pretend to be you.",
    technical: "A session cookie is an HTTP cookie containing a session identifier that maps to server-side session state, used for stateful authentication across stateless HTTP requests.",
    analogy: "A temporary visitor badge at an office. Once issued, anyone wearing it gets access — the receptionist does not ask for ID again. If stolen, the thief has full access.",
    everyday_example: "Staying logged in to Gmail even after closing and reopening the browser — that is your session cookie at work.",
    category: "Web Security"
  }
];

const MODE_DESCRIPTIONS = {
  explorer: {
    name: "Explorer Mode",
    emoji: "🟢",
    tagline: "Perfect if you are new to all of this",
    description: "We will explain everything in plain everyday language. No technical jargon. Every concept gets a real-life analogy. You will understand what hackers do and why it matters to you personally — even if you have never written a line of code.",
    suitable_for: ["Complete beginners", "Senior citizens", "Homemakers", "Government employees", "Small business owners", "Anyone curious about staying safe online"],
    what_you_will_learn: [
      "How hackers break into accounts and how to stop them",
      "Why some passwords are dangerous and others are safe",
      "How criminals steal information from websites",
      "Simple steps to protect yourself and your family online"
    ],
    language_level: "Plain English — no technical terms without explanation"
  },
  learner: {
    name: "Learner Mode",
    emoji: "🟡",
    tagline: "For people comfortable with technology",
    description: "You use computers and smartphones daily. We will explain cybersecurity concepts clearly with some technical detail, real examples, and hands-on simulations. The right balance of accessible and accurate.",
    suitable_for: ["Office professionals", "Students", "IT support staff", "Teachers", "Journalists"],
    what_you_will_learn: [
      "How common cyberattacks actually work technically",
      "How to recognize and respond to threats",
      "Security best practices for organizations",
      "How to read and understand security news"
    ],
    language_level: "Clear technical language with explanations"
  },
  hacker: {
    name: "Hacker Mode",
    emoji: "🔴",
    tagline: "Full technical depth — no hand-holding",
    description: "You have a technical background. All simulations run at full depth with complete technical explanations, raw data, code-level details, and professional terminology.",
    suitable_for: ["CS students", "Security researchers", "Developers", "IT professionals", "CTF participants"],
    what_you_will_learn: [
      "Deep technical mechanics of each attack",
      "Kernel-level and protocol-level detail",
      "Professional security tooling concepts",
      "How to think like a penetration tester"
    ],
    language_level: "Full technical depth — professional terminology"
  }
};

const DAILY_TIPS = [
  { day: 0, tip_simple: "Check if your email was in a data breach.", tip_detail: "Millions of emails and passwords are leaked every year. Visit haveibeenpwned.com to see if yours is exposed.", action: "Search your email on haveibeenpwned.com", why_it_matters: "If your password was leaked, hackers will try using it on your bank and email accounts.", difficulty: "Very Easy" },
  { day: 1, tip_simple: "Enable two-factor authentication (2FA) today.", tip_detail: "2FA means you need both your password and your phone to log in. Even if a hacker steals your password, they cannot get in.", action: "Turn on 2FA for your main email account", why_it_matters: "It stops 99% of automated account hacks dead in their tracks.", difficulty: "Easy" },
  { day: 2, tip_simple: "Never click links in unexpected SMS messages.", tip_detail: "Criminals send fake package delivery or bank alerts via SMS to steal your passwords. This is called 'smishing'.", action: "Delete suspicious texts and go directly to the official app or website instead.", why_it_matters: "Clicking can lead you to a fake website designed to drain your bank account.", difficulty: "Very Easy" },
  { day: 3, tip_simple: "Check your bank statement weekly.", tip_detail: "Cybercriminals often test stolen credit cards with very small charges ($1 or $2) before making big purchases.", action: "Log into your bank app and review the last 7 days of transactions.", why_it_matters: "Catching fraud early makes it much easier to get your money back.", difficulty: "Easy" },
  { day: 4, tip_simple: "Use a different password for every website.", tip_detail: "If you reuse a password and one website gets hacked, criminals will try that password everywhere else.", action: "Start using a Password Manager (like Bitwarden or 1Password) to remember them for you.", why_it_matters: "It prevents a breach at a minor website from compromising your main email or bank.", difficulty: "Moderate" },
  { day: 5, tip_simple: "Lock your phone with a PIN of at least 6 digits.", tip_detail: "A 4-digit PIN only has 10,000 combinations. A 6-digit PIN has 1,000,000 combinations, making it 100 times harder to guess.", action: "Change your phone unlock code from 4 digits to 6 digits.", why_it_matters: "Your phone contains your entire digital life, including access to your money and emails.", difficulty: "Very Easy" },
  { day: 6, tip_simple: "Turn off Bluetooth when you are not using it.", tip_detail: "Leaving Bluetooth on in public places allows attackers to track your device or potentially connect to it without your knowledge.", action: "Swipe down on your phone and disable Bluetooth when walking in public.", why_it_matters: "It closes an invisible door to your device and saves battery life.", difficulty: "Very Easy" }
];

app.get('/api/content/glossary', (req, res) => res.json(GLOSSARY_TERMS));
app.get('/api/content/mode-descriptions', (req, res) => res.json(MODE_DESCRIPTIONS));
app.get('/api/content/daily-tips', (req, res) => res.json(DAILY_TIPS));

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

// ==================== PASSWORD ATTACK SIMULATOR API ====================

// 1. Get Wordlist
app.get('/api/passwords/wordlist', (req, res) => {
  res.json(WORDLIST);
});

// 2. Generate Hashes
app.post('/api/passwords/hash', (req, res) => {
  const { password, salt } = req.body;
  if (typeof password !== 'string') return res.status(400).json({ error: 'Password string required' });
  if (password.length > 200) return res.status(400).json({ error: 'Password too long' });

  const md5 = crypto.createHash('md5').update(password).digest('hex');
  const sha256 = crypto.createHash('sha256').update(password).digest('hex');
  
  let salted_sha256 = null;
  if (salt && typeof salt === 'string' && salt.length > 0) {
    salted_sha256 = crypto.createHash('sha256').update(salt + password).digest('hex');
  }

  res.json({
    original: password,
    salt_used: salt || null,
    sha256_hash: sha256,
    md5_hash: md5,
    salted_sha256,
    is_salted: !!salt
  });
});

// 3. Crack Estimator
app.post('/api/passwords/crack-estimate', (req, res) => {
  const { password } = req.body;
  if (typeof password !== 'string') return res.status(400).json({ error: 'Password string required' });
  if (password.length > 200) return res.status(400).json({ error: 'Password too long' });

  const len = password.length;
  const has_lower = /[a-z]/.test(password);
  const has_upper = /[A-Z]/.test(password);
  const has_digits = /[0-9]/.test(password);
  const has_symbols = /[^a-zA-Z0-9]/.test(password);

  let charset = 0;
  let breakdown = [];
  if (has_lower) { charset += 26; breakdown.push('26 lowercase'); }
  if (has_upper) { charset += 26; breakdown.push('26 uppercase'); }
  if (has_digits) { charset += 10; breakdown.push('10 digits'); }
  if (has_symbols) { charset += 32; breakdown.push('32 symbols'); }
  if (charset === 0 && len > 0) { charset = 256; breakdown.push('Extended ASCII'); }

  const combos = len === 0 ? 0n : BigInt(charset) ** BigInt(len);
  const combosStr = combos.toString();
  
  let combosLabel = combosStr;
  if (combos > 1000000000000000n) combosLabel = (Number(combos / 1000000000000n) / 1000).toFixed(1) + " Quadrillion";
  else if (combos > 1000000000000n) combosLabel = (Number(combos / 1000000000n) / 1000).toFixed(1) + " Trillion";
  else if (combos > 1000000000n) combosLabel = (Number(combos / 1000000n) / 1000).toFixed(1) + " Billion";
  else if (combos > 1000000n) combosLabel = (Number(combos / 1000n) / 1000).toFixed(1) + " Million";

  const formatTime = (seconds) => {
    if (seconds < 1) return "Instant";
    if (seconds < 60) return seconds.toFixed(1) + " seconds";
    if (seconds < 3600) return (seconds / 60).toFixed(1) + " minutes";
    if (seconds < 86400) return (seconds / 3600).toFixed(1) + " hours";
    if (seconds < 31536000) return (seconds / 86400).toFixed(1) + " days";
    if (seconds < 31536000000) return (seconds / 31536000).toFixed(1) + " years";
    return "1,000+ years";
  };

  const sec_1B = Number(combos) / 1000000000;
  const sec_100B = Number(combos) / 100000000000;

  let score = len === 0 ? 0 : Math.min(100, (len * 4) + (charset > 26 ? 10 : 0) + (charset > 36 ? 15 : 0) + (charset > 62 ? 20 : 0));
  
  let strength_label = "Very Weak"; let strength_color = "#ff3333";
  if (score > 80) { strength_label = "Very Strong"; strength_color = "#00ff88"; }
  else if (score > 60) { strength_label = "Strong"; strength_color = "#88ff00"; }
  else if (score > 40) { strength_label = "Fair"; strength_color = "#ffcc00"; }
  else if (score > 20) { strength_label = "Weak"; strength_color = "#ff6600"; }

  res.json({
    length: len, charset_size: charset, total_combinations: combosStr,
    combinations_label: combosLabel, time_at_1billion_per_sec: formatTime(sec_1B),
    time_at_100billion_per_sec: formatTime(sec_100B), strength_score: score,
    strength_label, strength_color, has_uppercase: has_upper,
    has_lowercase: has_lower, has_digits: has_digits, has_symbols: has_symbols,
    charset_breakdown: breakdown.length > 0 ? breakdown.join(' + ') + ` = ${charset} chars` : '0 chars'
  });
});

// 4. Rainbow Table Lookup
const rainbowTable = {};
WORDLIST.forEach(w => rainbowTable[crypto.createHash('sha256').update(w).digest('hex')] = w);

app.post('/api/passwords/rainbow-lookup', (req, res) => {
  const start = process.hrtime.bigint();
  const plaintext = rainbowTable[req.body.hash] || null;
  res.json({ found: !!plaintext, plaintext, lookup_time_ms: Number(process.hrtime.bigint() - start) / 1000000, table_size: WORDLIST.length, message: plaintext ? 'Found in precomputed table' : 'Not found in table' });
});

// ==================== SQL INJECTION API ====================

app.post('/api/sqli/login-vulnerable', (req, res) => {
  const { username, password } = req.body;
  const raw_query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;
  
  let injection_detected = false;
  let injection_type = null;
  let query_type = "normal";
  let extracted_data = [];
  let explanation = {};
  
  const upperUser = (username || '').toUpperCase();
  const upperPass = (password || '').toUpperCase();
  const fullPayload = upperUser + " " + upperPass;

  if (fullPayload.includes('DROP TABLE')) {
      injection_detected = true;
      query_type = "destructive_attempt";
      injection_type = "Destructive";
      explanation = {
          what_happened: "The database attempted to delete the entire users table.",
          why_it_worked: "By adding a semicolon (;), the attacker ended the first query and started a second completely new command: DROP TABLE.",
          real_world: "This type of destructive attack can completely wipe out application databases if the DB user has too many privileges.",
          severity: "CRITICAL"
      };
  } else if (fullPayload.includes('UNION SELECT')) {
      injection_detected = true;
      query_type = "union_attack";
      injection_type = "UNION Data Extraction";
      extracted_data = [...sqliDb.users, ...sqliDb.secret_data];
      explanation = {
          what_happened: "The query successfully combined the results of the users table with the secret_data table.",
          why_it_worked: "The UNION operator allows an attacker to append the results of a completely different SELECT statement to the original one.",
          real_world: "UNION-based SQL injection is the primary method used to steal massive amounts of customer data in major data breaches.",
          severity: "CRITICAL"
      };
  } else if (fullPayload.includes('OR 1=1') || fullPayload.includes("OR '1'='1") || fullPayload.includes("OR 'X'='X")) {
      injection_detected = true;
      query_type = "always_true";
      injection_type = "Always True Bypass";
      extracted_data = [...sqliDb.users];
      explanation = {
          what_happened: "The application logged you in as the first user in the database without checking the password.",
          why_it_worked: "The injected OR statement makes the WHERE condition mathematically true for every row. The database returns all users, and the app logs you in as the first one.",
          real_world: "Used in the 2009 Heartland Payment Systems breach to bypass authentication forms.",
          severity: "HIGH"
      };
  } else if (fullPayload.includes('--') || fullPayload.includes('#')) {
      injection_detected = true;
      query_type = "comment_attack";
      injection_type = "Comment Injection";
      
      const cleanUsername = (username || '').split(/--|#/)[0].replace(/'/g, '').trim();
      const user = sqliDb.users.find(u => u.username.toUpperCase() === cleanUsername.toUpperCase());
      extracted_data = user ? [user] : [...sqliDb.users];

      explanation = {
          what_happened: "The password check was completely ignored by the database.",
          why_it_worked: "The '--' characters tell the SQL engine that everything following them is a comment. The query effectively stops checking after the username.",
          real_world: "Countless administrative panels have been bypassed using just 'admin'--' as the username.",
          severity: "HIGH"
      };
  } else {
      const user = sqliDb.users.find(u => u.username === username && u.password === password);
      extracted_data = user ? [user] : [];
      explanation = {
          what_happened: user ? "Login successful using valid credentials." : "Login failed. Invalid username or password.",
          why_it_worked: "The query executed exactly as the developer intended, comparing the input string against the database columns.",
          real_world: "Standard secure application behavior (when combined with proper parameterization).",
          severity: "LOW"
      };
  }

  res.json({
      success: extracted_data.length > 0,
      user: extracted_data.length > 0 ? extracted_data[0] : null,
      raw_query, query_type, rows_returned: extracted_data.length,
      injection_detected, injection_type, explanation, extracted_data
  });
});

app.post('/api/sqli/login-safe', (req, res) => {
  const { username, password } = req.body;
  const user = sqliDb.users.find(u => u.username === username && u.password === password);
  const injection_attempt_detected = /('|--|#|;|UNION|SELECT|DROP|OR|AND|1=1|SLEEP)/i.test(username || '') || /('|--|#|;|UNION|SELECT|DROP|OR|AND|1=1|SLEEP)/i.test(password || '');

  res.json({
      success: !!user,
      user: user || null,
      raw_query: "SELECT * FROM users WHERE username=? AND password=?",
      parameterized_values: [username, password],
      injection_attempt_detected,
      explanation: {
          what_happened: injection_attempt_detected 
              ? "The database safely processed your injection attempt as a literal string. No injection occurred." 
              : (user ? "Login successful." : "Login failed. Invalid credentials."),
          why_it_failed: "In safe mode, the application uses Prepared Statements. The SQL logic is compiled BEFORE the user input is inserted. The database treats the input strictly as data, never as executable code.",
          prevention_method: "Parameterized Queries / Prepared Statements",
          code_example: `// Node.js safe example using 'pg' or 'mysql2'\nconst query = "SELECT * FROM users WHERE username=$1 AND password=$2";\ndb.execute(query, [req.body.username, req.body.password]);`
      }
  });
});

app.post('/api/sqli/union-demo', (req, res) => {
  const { payload } = req.body;
  let stage = 0; let result_rows = []; let explanation = {};

  if (payload.includes('1,2,3,4,5,6')) {
      stage = 1; result_rows = [{ col1:1, col2:2, col3:3, col4:4, col5:5, col6:6 }];
      explanation = {
          what_happened: "The database returned a row with the numbers 1 through 6.",
          technique: "Column Enumeration",
          why_it_worked: "Because the UNION SELECT had exactly 6 columns—matching the hidden original query's 6 columns—the database accepted the syntax and appended the numbers to the results.",
          next_step: "Replace the numbers with actual column names.",
          real_world: "Attackers use automation (like sqlmap) to systematically guess column counts until no error is thrown.",
          severity: "MEDIUM"
      };
  } else if (payload.includes('FROM users')) {
      stage = 2; result_rows = sqliDb.users.map(u => ({ username: u.username, password: u.password, role: u.role, email: u.email, id: u.id, account_balance: u.account_balance }));
      explanation = {
          what_happened: "The entire users table was dumped and displayed on screen.",
          technique: "Data Extraction",
          why_it_worked: "We replaced the numbers from the previous step with real column names from the 'users' table. The database dutifully fetched them and appended them to the output.",
          next_step: "Look for other sensitive tables.",
          real_world: "This is the exact mechanism by which millions of passwords are stolen from vulnerable web applications.",
          severity: "CRITICAL"
      };
  } else if (payload.includes('FROM secret_data')) {
      stage = 3; result_rows = sqliDb.secret_data.map(s => ({ key: s.key, value: s.value, dummy1: 1, dummy2: 1, dummy3: 1, dummy4: 1 }));
      explanation = {
          what_happened: "Highly sensitive internal application secrets were extracted.",
          technique: "Lateral Data Extraction",
          why_it_worked: "We changed the FROM clause to target a different table. We still needed 6 columns to satisfy the UNION rules, so we padded the remaining 4 columns with 1s.",
          next_step: "Use the extracted API keys or JWT secrets to compromise other systems.",
          real_world: "In many breaches, attackers use SQLi not just for user passwords, but to steal cloud provider keys or infrastructure secrets stored in the DB.",
          severity: "CRITICAL"
      };
  }
  res.json({ stage, payload_used: payload, raw_query: `SELECT * FROM users WHERE username='' ${payload}' AND password=''`, result_rows, explanation });
});

app.get('/api/sqli/payloads-cheatsheet', (req, res) => { res.json(SQLI_PAYLOADS); });
app.get('/api/sqli/learning-path', (req, res) => { res.json(SQLI_LEARNING_PATH); });

// ==================== XSS ATTACK LAB DATA + API ====================

const commentStore = [];
const searchLog = [];
const stolenCookies = [];
const simulatedCookies = {
  session_id: "a3f8b2c9d4e5f6a7b8c9d0e1f2a3b4c5",
  user: "alice",
  role: "customer",
  auth_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake",
  remember_me: "true"
};

const XSS_LEARNING_PATH = {
  stages: [
    {
      stage: 1,
      title: "What is XSS?",
      content: "Cross-Site Scripting (XSS) happens when an attacker manages to inject malicious JavaScript into a web page that other users visit. The browser has no way to tell the difference between the website's legitimate JavaScript and the attacker's injected code - it runs both.",
      analogy: "Imagine a restaurant where customers can write suggestions on a shared notepad that the waiter reads aloud to every new customer. If someone writes 'Say the food is poisoned!' on the notepad, the waiter will faithfully read it to everyone - even though it came from a customer, not the restaurant.",
      key_concept: "Browsers trust ALL JavaScript on a page equally"
    },
    {
      stage: 2,
      title: "The Three Types of XSS",
      content: "Stored XSS: The malicious script is saved in the database and served to every visitor. Reflected XSS: The script is in the URL and reflected back immediately - victims must click a crafted link. DOM-based XSS: The attack happens entirely in the browser using URL fragments - the server never even sees the payload.",
      analogy: "Stored = graffiti on a wall everyone walks past. Reflected = a boomerang you throw at someone. DOM-based = a magic trick that happens in the audience, not on stage.",
      key_concept: "XSS can be persistent, transient, or client-side only"
    },
    {
      stage: 3,
      title: "What Attackers Do With XSS",
      content: "XSS gives attackers the power to run any JavaScript as if they were the website. This means: stealing session cookies to hijack accounts, logging every keystroke, redirecting users to phishing pages, defacing the website, or using the victim's browser to attack other systems.",
      key_concept: "XSS = arbitrary code execution in the victim's browser"
    },
    {
      stage: 4,
      title: "Why Cookies Are the Primary Target",
      content: "Session cookies are the keys to a user's account. Once stolen, an attacker can paste the cookie into their own browser and the website thinks they ARE that user - no password needed. The attack works even if the password is long and complex.",
      analogy: "Your session cookie is like your hotel key card. If someone copies it, they can walk into your room - the door doesn't ask for your passport.",
      key_concept: "Cookie theft bypasses passwords entirely"
    },
    {
      stage: 5,
      title: "Prevention: Sanitization + CSP",
      content: "Two layers of defense: Output encoding ensures special characters like < > are rendered as text, never as HTML tags. Content Security Policy (CSP) tells the browser to reject scripts that weren't explicitly approved - even if they somehow got into the page.",
      key_concept: "Encode output + enforce CSP = XSS defeated"
    }
  ]
};

function sanitizeXssInput(value = '') {
  return String(value)
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/[<>]/g, '');
}

function detectXssIndicators(value = '') {
  const input = String(value);
  const indicators = [];
  if (/<\s*script\b/i.test(input)) indicators.push("script tag");
  if (/\son\w+\s*=/i.test(input)) indicators.push("inline event handler");
  if (/javascript\s*:/i.test(input)) indicators.push("javascript: protocol");
  if (/<\s*(img|svg|iframe|object|embed|body|input)\b/i.test(input)) indicators.push("HTML injection sink");
  if (/(document\.cookie|localStorage|fetch\s*\(|XMLHttpRequest|location\s*=)/i.test(input)) indicators.push("browser API abuse");
  return indicators;
}

function threatLevel(indicators) {
  if (indicators.some(i => i === "browser API abuse")) return "CRITICAL";
  if (indicators.some(i => i === "script tag" || i === "inline event handler")) return "HIGH";
  if (indicators.length > 0) return "MEDIUM";
  return "NONE";
}

function nodeSanitizationSnippet() {
  return `function sanitizeInput(input = '') {
  return String(input)
    .replace(/<\\s*script\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*script\\s*>/gi, '')
    .replace(/\\son\\w+\\s*=\\s*(['"]).*?\\1/gi, '')
    .replace(/javascript\\s*:/gi, '')
    .replace(/[<>]/g, '');
}

app.post('/comment', (req, res) => {
  const safeComment = sanitizeInput(req.body.comment);
  res.send({ comment: safeComment });
});`;
}

function storedXssExplanation(wasSanitized, containsScript) {
  if (wasSanitized) {
    return {
      what_happened: containsScript ? "The comment contained an XSS payload, but safe mode stripped the dangerous HTML before storing it." : "The comment was stored after passing through the sanitizer. No executable markup was detected.",
      why_it_works: "Sanitization removes script tags, inline event handlers such as onerror, javascript: URLs, and angle brackets before the browser ever receives them as HTML.",
      real_world: "Stored XSS has appeared in real products such as CVE-2019-19781 Citrix ADC/Gateway exploitation chains, where attacker-controlled input could lead to code execution paths. The same lesson applies: untrusted content must not become executable content.",
      analogy: "A bouncer checks every note before pinning it to the community board. Anything that looks like an instruction to harm people gets crossed out first.",
      prevention: "Sanitize input, encode output, and render user comments with textContent instead of innerHTML. Add CSP as a second layer.",
      code_example: nodeSanitizationSnippet()
    };
  }
  return {
    what_happened: containsScript ? "The application stored the attacker's HTML exactly as submitted. When the feed renders it as HTML, the payload becomes part of the page." : "The comment was stored raw. This input was harmless, but the application is still vulnerable because it would also store malicious HTML.",
    why_it_works: "Browsers parse innerHTML as real HTML. If user input contains a script tag or an event handler, the browser treats it like code from the website itself.",
    real_world: "The Samy worm on MySpace in 2005 used stored XSS to spread automatically through user profiles and reached more than one million profiles in about a day.",
    analogy: "It is like letting anyone write instructions on a public announcement board, then having staff follow every instruction without checking who wrote it.",
    prevention: "Never insert raw user input with innerHTML. Store a cleaned version, encode output, and prefer textContent for comments.",
    code_example: nodeSanitizationSnippet()
  };
}

app.post('/api/xss/comment', (req, res) => {
  const { username = 'anonymous', comment = '', sanitized = false } = req.body;
  const indicators = detectXssIndicators(comment);
  const contains_script = indicators.length > 0;
  const safeComment = sanitizeXssInput(comment);
  const stored = {
    id: commentStore.length + 1,
    username: sanitizeXssInput(username).slice(0, 40) || 'anonymous',
    comment_raw: String(comment),
    comment_sanitized: sanitized ? safeComment : String(comment),
    timestamp: new Date().toISOString(),
    contains_script,
    xss_type: contains_script ? "stored" : "clean",
    threat_level: sanitized && !detectXssIndicators(safeComment).length ? "NONE" : threatLevel(indicators)
  };
  commentStore.push(stored);
  res.json({
    success: true,
    stored_comment: stored,
    explanation: storedXssExplanation(Boolean(sanitized), contains_script)
  });
});

app.get('/api/xss/comments', (req, res) => {
  res.json(commentStore);
});

app.post('/api/xss/search', (req, res) => {
  const { query = '', sanitized = false } = req.body;
  const indicators = detectXssIndicators(query);
  const safe = sanitizeXssInput(query);
  searchLog.push({
    query: String(query),
    sanitized: Boolean(sanitized),
    contains_xss: indicators.length > 0,
    timestamp: new Date().toISOString()
  });
  res.json({
    query_received: String(query),
    reflected_html: `<h2>Results for: ${String(query)}</h2>`,
    sanitized_html: `<h2>Results for: ${safe}</h2>`,
    sanitized_mode: Boolean(sanitized),
    contains_xss: indicators.length > 0,
    xss_indicators: indicators,
    explanation: {
      what_happened: indicators.length > 0
        ? "The search page reflected the query back into the response. In vulnerable mode, the browser would parse the payload as HTML instead of displaying it as text."
        : "The search page reflected normal text. Nothing executed, but reflected pages are dangerous when they echo untrusted input as HTML.",
      why_reflected_xss_differs_from_stored: "Reflected XSS is not saved in the database. It exists only in a request and response, usually after a victim clicks a crafted link.",
      attack_vector: "An attacker sends a link like /search?q=<script>steal_cookies()</script>. The victim's browser requests it, the server reflects it, and the browser runs it.",
      real_world: "Reflected XSS was a long-running class in many Google, Yahoo, and Microsoft bug bounty reports, and it is still tracked in CVEs across web products every year.",
      analogy: "Stored XSS is graffiti left on a wall. Reflected XSS is tricking someone into holding a mirror that bounces a dangerous message back into their own eyes.",
      prevention: "Encode reflected output with HTML escaping, validate expected input, and set a CSP that blocks inline script execution."
    }
  });
});

app.post('/api/xss/steal-cookie', (req, res) => {
  const { payload = '', cookie_data = simulatedCookies } = req.body;
  const stolen = {
    payload: String(payload),
    stolen_data: cookie_data && typeof cookie_data === 'object' ? cookie_data : simulatedCookies,
    timestamp: new Date().toISOString(),
    source: "victim-browser",
    destination: "attacker-server.evil.com"
  };
  stolenCookies.push(stolen);
  res.json({
    received_at: "attacker-server.evil.com",
    stolen_data: stolen.stolen_data,
    timestamp: stolen.timestamp,
    what_attacker_can_do: [
      "Impersonate alice on SecureBank",
      "Access all account functions without password",
      "Maintain access until session expires or password changes",
      "Sell session token on dark web marketplaces"
    ],
    explanation: {
      what_happened: "The simulated XSS payload read the victim's cookies and sent them to an attacker-controlled server.",
      why_cookies_are_valuable: "Session cookies prove a user has already logged in. If an attacker steals one, the server may treat the attacker as the victim.",
      httponly_explanation: "HttpOnly cookies cannot be read by JavaScript through document.cookie. That does not stop every XSS impact, but it blocks the classic cookie-stealing payload.",
      real_world: "Session hijacking through XSS has been a core attack pattern for decades; the Samy worm and many account-takeover bug bounty reports relied on browser-trusted script execution.",
      prevention: "Set cookies with HttpOnly, Secure, and SameSite flags; sanitize/encode output; rotate sessions after login; and enforce CSP."
    }
  });
});

app.get('/api/xss/stolen-cookies', (req, res) => {
  res.json(stolenCookies);
});

app.get('/api/xss/csp-policies', (req, res) => {
  res.json({
    vulnerable: {
      policy: "none",
      header: "No Content-Security-Policy header set",
      explanation: "Without CSP, the browser will execute any script regardless of where it came from or how it got into the page.",
      what_attacker_can_do: "Run injected inline scripts, load third-party scripts, embed risky objects, and turn one missed sanitization bug into full browser-side code execution."
    },
    protected: {
      policy: "strict",
      header: "Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'",
      explanation: "With this CSP, the browser will ONLY execute scripts loaded from the same origin. Inline scripts and injected scripts are blocked entirely.",
      what_it_blocks: "Inline script tags, inline event handlers, javascript: URLs, plugin objects, and scripts loaded from unapproved domains.",
      browser_error: "Refused to execute inline script because it violates the following Content Security Policy directive: script-src 'self'"
    }
  });
});

app.get('/api/xss/learning-path', (req, res) => {
  res.json(XSS_LEARNING_PATH);
});

app.delete('/api/xss/reset', (req, res) => {
  commentStore.length = 0;
  stolenCookies.length = 0;
  searchLog.length = 0;
  res.json({ success: true, message: "Lab reset complete" });
});

// ==================== SERVER START ====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🔐 SafeTrace Server running on port ${PORT}`);
  console.log(`📍 Public frontend will connect to: http://localhost:${PORT}`);
  console.log(`\n✓ API endpoints available:`);
  console.log(`   GET  /api/processes/user-mode`);
  console.log(`   GET  /api/processes/kernel-mode`);
  console.log(`   GET  /api/analysis/cross-view-comparison`);
  console.log(`   GET  /api/process/:name/details`);
  console.log(`   POST /api/windbg-command`);
  console.log(`   GET  /api/analysis/obfuscated-config`);
  console.log(`   GET  /api/analysis/rootkit-detection`);
  console.log(`   GET  /api/sqli/learning-path`);
  console.log(`   GET  /api/content/glossary`);
  console.log(`   GET  /api/content/mode-descriptions`);
  console.log(`   GET  /api/content/daily-tips`);
  console.log(`   GET  /api/sqli/payloads-cheatsheet`);
  console.log(`   GET  /api/xss/learning-path`);
  console.log(`   POST /api/xss/comment`);
  console.log(`   POST /api/xss/search`);
  console.log(`   POST /api/xss/steal-cookie`);
  console.log(`   GET  /api/xss/csp-policies\n`);
});
