const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const base = 'http://127.0.0.1:4174';
let server;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(__dirname, '..', '.tmp-test-data-'));
  const samples = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'dogs.json'), 'utf8'));
  samples.push({ id: 'test-available-dog', name: 'Fixture Dog', status: 'available', example: false, photos: ['/styles.css'] });
  samples.push({ id: 'test-available-dog-two', name: 'Second Fixture Dog', status: 'available', example: false, photos: ['/interactions.css'] });
  samples.push({ id: 'test-profile-fields', name: 'QA profile fixture', status: 'reserved', example: false, originCountry: 'China', age: 'about 2 years', ageEstimated: true, size: 'medium', physicalDetails: 'QA-only physical detail', temperament: 'QA-only temperament', compatibility: { children: 'QA-only child assessment', dogs: 'QA-only dog assessment' }, vaccinatedConfirmed: true, vaccinationStatus: 'vaccinated', documentationConfirmed: false, documentationStatus: 'valid', healthConfirmed: true, health: 'QA-only verified health', medicalNeedsConfirmed: false, medicalNeeds: 'QA-only hidden medical detail', photos: ['/styles.css', '/interactions.css'] });
  samples.push({ id: 'test-draft-dog', name: 'Draft Fixture', status: 'draft', example: false });
  fs.writeFileSync(path.join(dataDir, 'dogs.json'), JSON.stringify(samples));
  fs.writeFileSync(path.join(dataDir, 'enquiries.json'), '[]');
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: '4174', DATA_DIR: dataDir, ENQUIRIES_KEY_FILE: path.join(dataDir, 'enquiries.key') }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { await fetch(base); return; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('Local test server did not start.');
});
after(() => { if (server && !server.killed) server.kill(); if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true }); });

test('serves the homepage and core pages', async () => {
  for (const page of ['/', '/dogs.html', '/dog.html', '/review.html', '/adoption.html', '/application.html']) {
    const response = await fetch(base + page);
    assert.equal(response.status, 200, page);
    assert.match(response.headers.get('content-type'), /text\/html/);
  }
});
test('secure local inbox readiness is reported without exposing submissions', async () => {
  const response = await fetch(base + '/api/status');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { secureEnquiries: true });
});

test('test examples are clearly marked and are never available dogs', async () => {
  const response = await fetch(base + '/api/dogs');
  const dogs = await response.json();
  assert.equal(dogs.filter(d => d.example).length, 2);
  assert.ok(dogs.filter(d => d.example).every(d => d.status === 'example'));
  assert.ok(dogs.some(d => d.id === 'test-available-dog' && d.status === 'available'));
});
test('private data, server source and inbox modules are not served', async () => {
  for (const route of ['/data/dogs.json', '/data/enquiries.enc', '/api/enquiries', '/server.js', '/enquiries-store.js', '/inbox.js', '/package.json']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404, route);
  }
});
test('legacy enquiries migrate to encrypted storage and plaintext is removed after success', () => {
  const migrationDir = fs.mkdtempSync(path.join(__dirname, '..', '.tmp-test-data-migration-'));
  const keyFile = path.join(migrationDir, 'local.key');
  const legacy = [{ id: 'qa-legacy', name: 'Synthetic QA', email: 'qa@example.test' }];
  fs.writeFileSync(path.join(migrationDir, 'enquiries.json'), JSON.stringify(legacy));
  try {
    const { migrateLegacyEnquiries, readEnquiries } = require('../enquiries-store');
    assert.equal(migrateLegacyEnquiries(migrationDir, keyFile), 1);
    assert.equal(fs.existsSync(path.join(migrationDir, 'enquiries.json')), false);
    const encrypted = fs.readFileSync(path.join(migrationDir, 'enquiries.enc'), 'utf8');
    assert.ok(!encrypted.includes('qa@example.test'));
    assert.deepEqual(readEnquiries(migrationDir, keyFile), legacy);
  } finally {
    fs.rmSync(migrationDir, { recursive: true, force: true });
  }
});

test('empty legacy enquiry file is preserved on startup', () => {
  const emptyDir = fs.mkdtempSync(path.join(__dirname, '..', '.tmp-test-data-empty-'));
  const legacyPath = path.join(emptyDir, 'enquiries.json');
  fs.writeFileSync(legacyPath, '[]');
  try {
    const { migrateLegacyEnquiries } = require('../enquiries-store');
    assert.equal(migrateLegacyEnquiries(emptyDir, path.join(emptyDir, 'local.key')), 0);
    assert.equal(fs.readFileSync(legacyPath, 'utf8'), '[]');
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});

const validEnquiry = overrides => ({ dogId: 'test-available-dog', name: 'Test Adopter', email: 'adopter@example.com', country: 'Belgium', household: 'Two adults, no pets.', experience: 'We have had dogs before.', message: 'I would like to learn more.', consent: 'on', ...overrides });
test('enquiry API rejects fictional examples', async () => {
  const response = await fetch(base + '/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validEnquiry({ dogId: 'example-luna' })) });
  assert.equal(response.status, 400);
});
test('enquiry API rejects missing fields, invalid email, unconsented data and non-JSON requests', async () => {
  for (const payload of [validEnquiry({ name: '' }), validEnquiry({ email: 'not-an-email' }), validEnquiry({ email: 'a@@example.test' }), validEnquiry({ country: '' }), validEnquiry({ country: 'other', otherCountry: '' }), validEnquiry({ household: '' }), validEnquiry({ experience: '' }), validEnquiry({ message: '' }), validEnquiry({ dogId: 'missing-dog' }), validEnquiry({ consent: '' })]) {
    const response = await fetch(base + '/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(response.status, 400);
  }
  const contentType = await fetch(base + '/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'nope' });
  assert.equal(contentType.status, 415);
});
test('enquiry API accepts suggestions and permits other residence countries', async () => {
  const response = await fetch(base + '/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validEnquiry({ dogId: 'suggestions', country: 'other', otherCountry: 'France' })) });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).saved, true);
});
const validApplication = overrides => validEnquiry({ applicationVersion: 2, dogId: 'suggestions', country: 'Belgium', region: 'Leuven', homeType: 'apartment', tenure: 'rent', landlordPermission: 'yes', outdoorAccess: 'terrace', householdMembers: 'Two adults, no children.', workSchedule: 'Hybrid schedule.', aloneDuration: '2-4h', dogExperience: 'We have cared for dogs before.', currentPets: 'One cat.', previousPets: 'A dog in the past.', exercisePlan: 'Daily walks and positive training.', introductionsPlan: 'Slow introductions with barriers.', motivation: 'We are ready to adopt.', expectations: 'We expect a settling-in period and will seek veterinary care if needed.', commitment: 'yes', consent: 'on', ...overrides });
test('multi-step applications require suitability answers and persist them encrypted', async () => {
  const valid = await fetch(base + '/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validApplication()) });
  assert.equal(valid.status, 201);
  assert.equal((await valid.json()).delivery, 'encrypted-local-inbox');
  const { readEnquiries } = require('../enquiries-store');
  const entries = readEnquiries(dataDir, path.join(dataDir, 'enquiries.key'));
  assert.ok(entries.some(entry => entry.applicationVersion === 2 && entry.residenceRegion === 'Leuven' && entry.landlordPermission === 'yes' && entry.commitmentConfirmed === true));
  for (const missing of [validApplication({ region: '' }), validApplication({ currentPets: '' }), validApplication({ commitment: '' }), validApplication({ files: [{ name: 'photo.jpg' }] })]) {
    const response = await fetch(base + '/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(missing) });
    assert.equal(response.status, 400);
  }
});
test('enquiry API accepts a valid enquiry and stores only authenticated ciphertext locally', async () => {
  const response = await fetch(base + '/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validEnquiry()) });
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.saved, true);
  assert.equal(saved.delivery, 'encrypted-local-inbox');
  const encryptedPath = path.join(dataDir, 'enquiries.enc');
  assert.ok(fs.existsSync(encryptedPath));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'enquiries.json'), 'utf8')), []);
  const ciphertext = fs.readFileSync(encryptedPath, 'utf8');
  assert.ok(!ciphertext.includes('adopter@example.com'));
  const { readEnquiries } = require('../enquiries-store');
  const entries = readEnquiries(dataDir, path.join(dataDir, 'enquiries.key'));
  assert.equal(entries.length, 3);
  assert.ok(entries.some(entry => entry.dogId === 'test-available-dog' && entry.country === 'Belgium' && entry.household === 'Two adults, no pets.'));
  const originalCiphertext = fs.readFileSync(encryptedPath, 'utf8');
  const tampered = JSON.parse(ciphertext);
  const tag = Buffer.from(tampered.tag, 'base64');
  tag[0] ^= 1;
  tampered.tag = tag.toString('base64');
  fs.writeFileSync(encryptedPath, JSON.stringify(tampered));
  assert.throws(() => readEnquiries(dataDir, path.join(dataDir, 'enquiries.key')));
  fs.writeFileSync(encryptedPath, originalCiphertext);
});

test('draft is hidden until explicit local approval and never claims to be online', async () => {
  let listings = await (await fetch(base + '/api/dogs')).json();
  assert.ok(!listings.some(d => d.id === 'test-draft-dog'));
  const review = await (await fetch(base + '/api/review')).json();
  assert.ok(review.some(d => d.id === 'test-draft-dog' && d.status === 'draft'));
  const response = await fetch(base + '/api/review/test-draft-dog/approve', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).online, false);
  listings = await (await fetch(base + '/api/dogs')).json();
  assert.ok(listings.some(d => d.id === 'test-draft-dog' && d.status === 'available'));
});

test('origin filter and motion stylesheet are present', async () => {
  const [appResponse, cssResponse, pageResponse, formCssResponse] = await Promise.all([
    fetch(base + '/app.js'), fetch(base + '/interactions.css'), fetch(base + '/dogs.html'), fetch(base + '/forms.css')
  ]);
  assert.equal(pageResponse.status, 200);
  assert.equal(formCssResponse.status, 200);
  const app = await appResponse.text();
  const css = await cssResponse.text();
  const page = await pageResponse.text();
  const formCss = await formCssResponse.text();
  assert.equal(app.split('<option value="China">China</option><option value="South Korea">South Korea</option>').length - 1, 1);
  assert.ok(app.includes('id="clear-origin"'));
  assert.ok(app.includes('function enquiryFormMarkup') && app.includes('/application.html${query}'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
  assert.ok(css.includes('::view-transition-new(root)'));
  assert.ok(page.includes('href="/interactions.css"') && page.includes('href="/forms.css"'));
  assert.ok(formCss.includes('.honeypot') && formCss.includes('max-width:520px'));
});

test('profile fields remain optional and confirmed health claims are gated', async () => {
  const dogs = await (await fetch(base + '/api/all-dogs')).json();
  const dog = dogs.find(d => d.id === 'test-profile-fields');
  assert.equal(dog.status, 'reserved');
  assert.equal(dog.originCountry, 'China');
  assert.deepEqual(dog.compatibility, { children: 'QA-only child assessment', dogs: 'QA-only dog assessment' });
  assert.equal(dog.vaccinatedConfirmed, true);
  assert.equal(dog.documentationConfirmed, false);
  const app = await (await fetch(base + '/app.js')).text();
  assert.ok(app.includes('profileRows(d)'));
  assert.ok(app.includes('d.vaccinatedConfirmed===true'));
  assert.ok(app.includes('d.documentationConfirmed===true'));
  assert.ok(app.includes("['China','South Korea'].includes(d.originCountry)"));
});

test('application pages localize and explicitly refuse file uploads', async () => {
  const [uiResponse, htmlResponse] = await Promise.all([fetch(base + '/adoption-ui.js'), fetch(base + '/application.html')]);
  assert.equal(uiResponse.status, 200);
  assert.equal(htmlResponse.status, 200);
  const ui = await uiResponse.text();
  assert.ok(ui.includes('File uploads are not available here'));
  assert.ok(ui.includes('Le dépôt de fichiers n’est pas disponible ici'));
  assert.ok(ui.includes('Datei-Uploads sind hier nicht verfügbar'));
  assert.ok(!/type=["']file["']/i.test(ui));
  assert.ok(ui.includes('€550') && ui.includes('€50') && ui.includes('€500'));
});

test('only loopback is used by the server', () => {
  const source = require('node:fs').readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(source, /const HOST = '127\.0\.0\.1'/);
});

test('dog-profile API and application journey integrations', async () => {
  const info = await (await fetch(base + '/api/dog-info?id=test-available-dog')).json();
  assert.equal(info.id, 'test-available-dog');
  assert.equal(info.status, 'available');
  assert.equal(info.name, 'Fixture Dog');
  assert.ok(typeof info.photo === 'string');

  const reservedInfo = await (await fetch(base + '/api/dog-info?id=test-profile-fields')).json();
  assert.equal(reservedInfo.status, 'reserved');

  const missingInfo = await (await fetch(base + '/api/dog-info?id=missing-dog')).json();
  assert.equal((await fetch(base + '/api/dog-info?id=missing-dog')).status, 404);

  const appForReserved = await fetch(base + '/api/enquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validApplication({ dogId: 'test-profile-fields' }))
  });
  assert.equal(appForReserved.status, 409);

  const validForDog = await fetch(base + '/api/enquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validApplication({ dogId: 'test-available-dog-two' }))
  });
  assert.equal(validForDog.status, 201);
  const savedDog = (await validForDog.json());
  assert.equal(savedDog.delivery, 'encrypted-local-inbox');

  const { readEnquiries } = require('../enquiries-store');
  const entries = readEnquiries(dataDir, path.join(dataDir, 'enquiries.key'));
  const dogEntry = entries.find(e => e.dogId === 'test-available-dog-two' && e.applicationVersion === 2);
  assert.ok(dogEntry);
  assert.equal(dogEntry.dogName, 'Second Fixture Dog');
  assert.equal(dogEntry.dogPhoto, '/interactions.css');
  assert.equal(dogEntry.residenceRegion, 'Leuven');
  assert.equal(dogEntry.commitmentConfirmed, true);

  const ui = await (await fetch(base + '/adoption-ui.js')).text();
  assert.ok(ui.includes('function profileAdoptionCta'));
  assert.ok(ui.includes('Ready to welcome ${name} home?'));
  assert.ok(ui.includes('Klaar om ${name} een thuis te geven?'));
  assert.ok(ui.includes('Prêt(e) à accueillir ${name} chez vous ?'));
  assert.ok(ui.includes('Bereit, ${name} ein Zuhause zu schenken?'));
  assert.ok(ui.includes('class="selected-dog-card"'));
  assert.ok(ui.includes('name="dogId"'));
  assert.ok(ui.includes('Review your application'));
  assert.ok(ui.includes('localStorage.removeItem(\'adoption-progress\')'));
  assert.ok(ui.includes('saveApplicationProgress'));
  assert.ok(ui.includes('restoreApplicationProgress'));
  assert.ok(ui.includes('function whatsappButton'));
});

test('clean dog URLs and Schema.org markup', async () => {
  const app = await (await fetch(base + '/app.js')).text();
  assert.ok(app.includes('path.startsWith(\'/dog.html\')'));
  assert.ok(app.includes('/dog.html?id=${encodeURIComponent(d.id)}'));

  const dogHtml = await (await fetch(base + '/dog.html')).text();
  assert.ok(dogHtml.includes('application/ld+json'));
  assert.ok(dogHtml.includes('"@type":"Pet"'));
  assert.ok(dogHtml.includes('"@context":"https://schema.org"'));
});

test('WhatsApp button and mobile filter toggle are present', async () => {
  const app = await (await fetch(base + '/app.js')).text();
  assert.ok(app.includes('whatsappButton()'));
  assert.ok(app.includes('https://wa.me/'));
  assert.ok(app.includes('filter-toggle'));
  assert.ok(app.includes('mobile-collapsed'));

  const css = await (await fetch(base + '/adoption.css')).text();
  assert.ok(css.includes('.whatsapp-float'));
  assert.ok(css.includes('background:#25D366'));
  assert.ok(css.includes('.filter-toggle'));
  assert.ok(css.includes('.filter-panel.open'));
});

test('trust line and FAQ section are present in adoption info', async () => {
  const ui = await (await fetch(base + '/adoption-ui.js')).text();
  assert.ok(ui.includes('trustLine'));
  assert.ok(ui.includes('trust-card'));
  assert.ok(ui.includes('adoption-faq'));
});

test('descriptive alt text is used for dog photos', async () => {
  const app = await (await fetch(base + '/app.js')).text();
  assert.ok(app.includes('photo(d)') && app.includes('alt'));
  assert.ok(app.includes('temperament'));
});
