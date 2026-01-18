// Script to capture and display console logs from the page
// Run this in the browser console on the Galaxy XR device

(function() {
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.log = function(...args) {
    logs.push({ type: 'log', args: Array.from(args), time: new Date().toISOString() });
    originalLog.apply(console, args);
  };
  
  console.error = function(...args) {
    logs.push({ type: 'error', args: Array.from(args), time: new Date().toISOString() });
    originalError.apply(console, args);
  };
  
  console.warn = function(...args) {
    logs.push({ type: 'warn', args: Array.from(args), time: new Date().toISOString() });
    originalWarn.apply(console, args);
  };
  
  // Function to get all captured logs
  window.getConsoleLogs = function() {
    return logs;
  };
  
  // Function to get AR-related logs
  window.getARLogs = function() {
    return logs.filter(log => {
      const message = log.args.join(' ').toLowerCase();
      return message.includes('ar') || 
             message.includes('xr') || 
             message.includes('webxr') || 
             message.includes('session') ||
             message.includes('renderer');
    });
  };
  
  console.log('✅ Console logger installed. Use getConsoleLogs() or getARLogs() to retrieve logs.');
})();





