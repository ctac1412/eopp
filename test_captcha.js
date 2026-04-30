import fs from 'fs';
import https from 'https';

const args = process.argv.slice(2);
const filePath = args[0];
const autoSolve = args.includes('--auto');
const hostIndex = args.indexOf('--host');
const HOST = hostIndex !== -1 && args[hostIndex + 1] ? args[hostIndex + 1] : 'https://china.alabai.netcraze.pro';

if (!filePath) {
  console.error('Usage: node test_captcha.js <path/to/test_file.json> [--auto] [--host https://host:port]');
  console.error('Example: node test_captcha.js tests/test_cases/test_answ_01.json --host https://china.alabai.netcraze.pro');
  console.error('  --auto  — use auto_solve (solver returns best answer immediately)');
  console.error('  --host  — server URL (default: https://china.alabai.netcraze.pro)');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

function post(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const jsonData = JSON.stringify(body);

    const req = https.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(jsonData),
        },
        rejectUnauthorized: false,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on('error', reject);
    req.write(jsonData);
    req.end();
  });
}

async function run() {
  console.log(`Sending captcha from: ${filePath}\n`);

  const payload = autoSolve ? { ...data, auto_solve: true } : data;
  const { status, body } = await post(`${HOST}/solve-captcha`, payload);

  if (status >= 200 && status < 300) {
    console.log(`\x1b[32m✓ Success (${status})\x1b[0m`);
    console.log(JSON.stringify(body, null, 2));
  } else {
    console.log(`\x1b[31m✗ Failed (${status})\x1b[0m`);
    console.log(JSON.stringify(body, null, 2));
  }
}

run().catch((err) => {
  console.error(`\x1b[31m✗ Error: ${err.message}\x1b[0m`);
});
