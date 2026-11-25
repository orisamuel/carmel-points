// The web-app URL of the Apps Script backend. Public by design: every call except
// ping, status and login needs a token, and the codes live only on the server.
const CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyMclGpYd-hWSX235RHskO23DChqZ1JjAgbm2CNWOZ2w1mYp9eiFUzbc9MIFPyWjPPNAQ/exec',
  POLL_MS: 20000,
};
