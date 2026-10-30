const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readEnquiries, writeEnquiries, migrateLegacyEnquiries } = require('./enquiries-store');

const ROOT = __dirname;
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 4173);
const HOST = '127.0.0.1';
let enquiryStoreReady = true;
try { migrateLegacyEnquiries(DATA); readEnquiries(DATA); } catch { enquiryStoreReady = false; }
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { const target = path.join(DATA, file); const tmp = `${target}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(tmp, target); }
function send(res, status, body, type='application/json; charset=utf-8') { res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" }); res.end(body); }
function json(res, status, value) { send(res, status, JSON.stringify(value)); }
function readBody(req, max=12000) { return new Promise((resolve, reject) => { let data=''; req.on('data', chunk => { data += chunk; if (data.length > max) { reject(new Error('too large')); req.destroy(); } }); req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('bad json')); } }); req.on('error', reject); }); }
function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function dogs() { return readJson('dogs.json', []); }
function primaryPhoto(dog) {
  const values = [...(Array.isArray(dog?.photos) ? dog.photos : []), dog?.photo];
  for (const item of values) {
    const src = typeof item === 'string' ? item : item && typeof item.src === 'string' ? item.src : '';
    if (src.startsWith('/') && !src.startsWith('//') && !src.includes('..')) return src;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { secureEnquiries: enquiryStoreReady });
    if (req.method === 'GET' && url.pathname === '/api/dog-info') {
      const id = clean(url.searchParams.get('id'), 100);
      const dog = dogs().find(d => d.id === id && !d.example && ['available', 'reserved', 'adopted'].includes(d.status));
      if (!dog) return json(res, 404, { error: 'Dog profile not found.' });
      return json(res, 200, { id: dog.id, name: dog.name, status: dog.status, photo: primaryPhoto(dog) });
    }
    if (req.method === 'GET' && url.pathname === '/api/dogs') return json(res, 200, dogs().filter(d => ['available', 'example'].includes(d.status)));
    if (req.method === 'GET' && url.pathname === '/api/all-dogs') return json(res, 200, dogs());
    if (req.method === 'GET' && url.pathname === '/api/review') return json(res, 200, dogs().filter(d => ['draft', 'available'].includes(d.status)));
    const dogSlugMatch = url.pathname.match(/^\/dog\/([a-zA-Z0-9_-]+)$/);
    if (req.method === 'GET' && dogSlugMatch) {
      const dogId = decodeURIComponent(dogSlugMatch[1]);
      const dog = dogs().find(d => d.id === dogId);
      if (!dog) return json(res, 404, { error: 'Dog profile not found.' });
      const filename = path.resolve(ROOT, '/dog.html');
      const ext = path.extname(filename).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" });
      fs.createReadStream(filename).pipe(res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/enquiries') {
      if (!enquiryStoreReady) return json(res, 503, { error: 'Secure local storage is unavailable.' });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'JSON content type required.' });
      const body = await readBody(req, 18000);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Invalid request.' });
      if (clean(body.website, 200)) return json(res, 201, { saved: true, delivery: 'encrypted-local-inbox' });
      const dogId = clean(body.dogId, 100);
      const currentDog = dogId === 'suggestions' ? null : dogs().find(d => d.id === dogId);
      const dog = currentDog && currentDog.status === 'available' && !currentDog.example ? currentDog : null;
      if (dogId !== 'suggestions' && currentDog && !currentDog.example && currentDog.status !== 'available') return json(res, 409, { error: 'This dog is no longer available.' });
      const name = clean(body.name, 100), email = clean(body.email, 254), message = clean(body.message, 4000);
      const household = clean(body.household, 2000), experience = clean(body.experience, 2000);
      const emailParts = email.split('@');
      const emailValid = emailParts.length === 2 && emailParts[0].length > 0 && emailParts[1].includes('.') && emailParts[1].split('.').every(part => part.length > 0) && ![...email].some(character => character.charCodeAt(0) <= 32 || character === '<' || character === '>');
      const countryChoice = clean(body.country, 30);
      const country = countryChoice === 'other' ? clean(body.otherCountry, 100) : countryChoice;
      const countryValid = ['Belgium', 'Netherlands', 'Luxembourg'].includes(country) || (countryChoice === 'other' && country.length > 0);
      const application = body.applicationVersion === 2;
      const applicationData = application ? {
        residenceRegion: clean(body.region, 120), homeType: clean(body.homeType, 40), tenure: clean(body.tenure, 40),
        landlordPermission: clean(body.landlordPermission, 30), outdoorAccess: clean(body.outdoorAccess, 40),
        householdMembers: clean(body.householdMembers, 1200), workSchedule: clean(body.workSchedule, 1000),
        aloneDuration: clean(body.aloneDuration, 20), dogExperience: clean(body.dogExperience, 1200),
        currentPets: clean(body.currentPets, 1000), previousPets: clean(body.previousPets, 1000),
        exercisePlan: clean(body.exercisePlan, 1200), introductionsPlan: clean(body.introductionsPlan, 1200),
        motivation: clean(body.motivation, 1500), expectations: clean(body.expectations, 1500),
        questions: clean(body.questions, 1500), mediaInterest: body.mediaInterest === 'yes',
        commitmentConfirmed: body.commitment === 'yes'
      } : null;
      const applicationValid = !application || (
        !Object.hasOwn(body, 'files') && !Object.hasOwn(body, 'attachments') &&
        applicationData.residenceRegion && ['house','apartment','other'].includes(applicationData.homeType) &&
        ['own','rent','other'].includes(applicationData.tenure) &&
        (applicationData.tenure !== 'rent' || ['yes','no','pending'].includes(applicationData.landlordPermission)) &&
        ['garden','terrace','shared','none'].includes(applicationData.outdoorAccess) &&
        applicationData.householdMembers && applicationData.workSchedule &&
        ['under-2h','2-4h','4-6h','over-6h','varies'].includes(applicationData.aloneDuration) &&
        applicationData.dogExperience && applicationData.currentPets && applicationData.previousPets &&
        applicationData.exercisePlan && applicationData.introductionsPlan && applicationData.motivation &&
        applicationData.expectations && applicationData.commitmentConfirmed
      );
      if (!name || !/^\S+@\S+\.\S+$/.test(email) || !emailValid || !countryValid || !household || !experience || !message || body.consent !== 'on' || !applicationValid || (dogId !== 'suggestions' && !dog)) return json(res, 400, { error: 'Please complete the required fields.' });
      const entries = readEnquiries(DATA);
      const entry = { id: crypto.randomUUID(), applicationVersion: application ? 2 : 1, dogId: dog ? dog.id : null, dogName: dog ? dog.name : null, dogPhoto: dog ? primaryPhoto(dog) : null, openToSuggestions: dogId === 'suggestions', name, email, country, household, experience, message, language: clean(body.language, 5), createdAt: new Date().toISOString() };
      if (application) Object.assign(entry, applicationData);
      entries.push(entry);
      writeEnquiries(entries, DATA);
      return json(res, 201, { saved: true, delivery: 'encrypted-local-inbox' });
    }
    const approveMatch = url.pathname.match(/^\/api\/review\/([a-zA-Z0-9_-]+)\/approve$/);
    if (req.method === 'POST' && approveMatch) {
      const all = dogs(); const target = all.find(d => d.id === approveMatch[1] && d.status === 'draft');
      if (!target) return json(res, 404, { error: 'Draft not found.' });
      target.status = 'available'; target.approvedAt = new Date().toISOString();
      writeJson('dogs.json', all);
      return json(res, 200, { approved: true, online: false, note: 'Visible only in the local preview.' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    if (pathname.includes('..') || pathname.startsWith('/data') || pathname === '/server.js' || pathname === '/enquiries-store.js' || pathname === '/inbox.js' || pathname === '/package.json' || pathname.startsWith('/test/')) return json(res, 404, { error: 'Not found.' });
    const filename = path.resolve(ROOT, `.${pathname}`);
    if (!filename.startsWith(ROOT + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return json(res, 404, { error: 'Not found.' });
    const ext = path.extname(filename).toLowerCase();
    if (!MIME[ext]) return json(res, 404, { error: 'Not found.' });
    res.writeHead(200, { 'Content-Type': MIME[ext], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filename).pipe(res);
  } catch (error) {
    if (!res.headersSent) {
      const status = error.message === 'too large' ? 413 : error.message === 'bad json' ? 400 : 500;
      const message = status === 413 ? 'Request too large.' : status === 400 ? 'Invalid request.' : 'Unable to save securely.';
      json(res, status, { error: message });
    }
  }
});
server.listen(PORT, HOST, () => console.log(`Private local preview: http://${HOST}:${PORT}`));
