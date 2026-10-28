const { readEnquiries } = require('./enquiries-store');

try {
  const entries = readEnquiries();
  if (!entries.length) {
    console.log('No adoption enquiries are saved in the local inbox.');
  } else {
    console.log('Private local inbox — applicant details below; do not share this terminal output.');
    process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
  }
} catch {
  console.error('Could not open the encrypted local inbox. Keep the local key file and encrypted data file together.');
  process.exitCode = 1;
}
