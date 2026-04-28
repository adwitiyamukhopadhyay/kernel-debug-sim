# Kernel Debugging & Rootkit Detection Simulation
## Web Application

### Quick Start (30 seconds)

```bash
npm install
npm start
```

Then open: **http://localhost:3001**

### Requirements
- Node.js v14+ ([Download](https://nodejs.org/))
- npm v6+
- Modern web browser

### What This App Does

**Backend (server.js):**
- Simulates Windows process environment
- User-mode process view (incomplete, hooked)
- Kernel-mode process view (complete truth)
- Hidden rootkit detection
- WinDbg command emulation
- Cross-view analysis

**Frontend (public/index.html):**
- Modern cyberpunk dark theme
- Interactive process explorer
- Real-time cross-view comparison
- Rootkit detection engine
- Terminal-style command executor
- Mobile responsive design

### Features

✓ User-mode process enumeration (4 visible processes)
✓ Kernel-mode complete view (5 processes including hidden rootkit)
✓ Click processes for detailed information
✓ Run WinDbg commands: `!peb`, `!process 0 0`, `lm`
✓ Automatic rootkit detection
✓ Cross-view anomaly analysis
✓ Responsive design (desktop & mobile)

### Public Usage

1. **Start Server**:
   ```bash
   npm start
   ```

2. **Open the Simulator**:
   - URL: `http://your-server:3001`
   - Or locally: `http://localhost:3001`

3. **Explore Simulation**:
   - Click "📊 Scan Processes (User-Mode)"
   - Click "🔍 Kernel Inspection (WinDbg)"
   - Click "⚔️ Compare Views"
   - Click "🚨 Rootkit Detection"
   - Try WinDbg commands

4. **Investigate Findings**:
   - Why is sysmon.exe hidden?
   - How does cross-view comparison work?
   - What detection methods revealed the rootkit?

### API Endpoints

```
GET  /api/processes/user-mode          → User-mode process list
GET  /api/processes/kernel-mode        → Kernel-mode process list
GET  /api/analysis/cross-view-comparison → Compare views, find IOCs
GET  /api/process/:name/details        → Detailed process info
POST /api/windbg-command               → Emulate WinDbg commands
GET  /api/analysis/rootkit-detection   → Run detection engine
```

### Customization

**Add More Processes:**
Edit `server.js`, find `kernelProcessData` object, add:
```javascript
'myprocess.exe': {
  pid: 9999,
  kernelAddr: '0xffff8000a0500000',
  modules: [...],
  threads: 10,
  handles: 200
}
```

**Change Port:**
```bash
PORT=3002 npm start
```

**Change Theme:**
Edit `public/index.html`, modify CSS color variables:
```css
--primary: #00ff88;    /* Neon green */
--secondary: #00ffff;  /* Neon cyan */
--background: #0a0e27; /* Dark background */
```

### Troubleshooting

**Q: "Port 3001 already in use"**
```bash
PORT=3002 npm start
```

**Q: "Cannot find module 'express'"**
```bash
npm install
```

**Q: "Frontend loads but no data"**
- Check browser console (F12)
- Restart server
- Clear browser cache

**Q: "CORS error"**
- Server must be running
- Verify API URL matches port

### Production Deployment

See **DEPLOYMENT_GUIDE.md** for:
- AWS/DigitalOcean deployment
- Docker deployment
- Heroku deployment
- Nginx reverse proxy
- Security configuration
- Rate limiting
- Monitoring

### File Structure

```
kernel-debug-sim/
├── server.js              ← Backend (Express.js)
├── public/
│   └── index.html         ← Frontend (HTML/CSS/JS)
├── package.json           ← Dependencies
└── package-lock.json      ← Lock file
```

### Performance

- Response time: <100ms per API call
- Typical payload: 2-5 KB
- Concurrent connections: 100+
- Mobile optimized
- Zero external dependencies in frontend

### Security Notes

✓ Backend code stays server-side
✓ Visitors use only the web interface
✓ All logic server-side
✓ No client-side source exposure for detection logic
✓ Safe public simulation environment
✓ Educational simulation only

### Browser Compatibility

✓ Chrome/Chromium 80+
✓ Firefox 75+
✓ Safari 13+
✓ Edge 80+
✓ Mobile browsers supported

### Author

**Developed By:** Adwitiya Mukhopadhyay

### License

Educational Use Only  
Non-commercial use  
Credit the author in derivative works

---

**Ready to explore?** Run `npm start` and share the URL.

For complete documentation, see the other guide files included in the package.
