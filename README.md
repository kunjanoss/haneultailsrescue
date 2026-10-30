# Haneul Tails Rescue - local rescue-dog website prototype

A private, local-first website prototype for one rescue organization. It has a homepage, available-dog listing, individual dog profiles, search and filters, a four-language interface (Dutch, French, German, English), a local adoption-enquiry form, and a draft-review page.

## Privacy and publication status

- The server binds only to `127.0.0.1` (your own computer). It is not exposed to your network or the internet.
- No account, hosting, domain, purchase, or external database is used. The prototype makes no third-party network requests.
- The adoption form stores submissions only in an AES-256-GCM encrypted file at `data/enquiries.enc`; it does not send email, Telegram messages, or data to a third party.
- The encryption key is stored separately at `%LOCALAPPDATA%/HaneulTailsRescue/enquiries.key` (or `AppData/Local/HaneulTailsRescue/enquiries.key` under the OS home fallback). Keep the key and encrypted file together; losing the key makes enquiries unreadable. Encryption at rest is not a guarantee against compromise of the same signed-in Windows account or computer.
- The server binds only to loopback, so this local preview is not reachable by prospective adopters online. An adopter must be using the preview on this computer for a submission to reach this local inbox. No secure public backend, hosting, or email delivery is configured.
- Use `npm run inbox` from the project folder to read saved enquiries in the local terminal. This displays sensitive applicant details; do not share or paste its output. The inbox module and private data files are not served by the website.
- Legacy `data/enquiries.json` submissions are encrypted on server startup and the plaintext file is removed only after the encrypted write succeeds. Do not delete or move the key; preserve a protected backup if you need recoverability.
- Dog profiles with `status: "draft"` appear only in the local review screen. Approving one explicitly changes it to `available` in the local preview. It does not publish online.
- Two fictional test dogs are included. They are labeled as test examples, excluded from available-dog search, and rejected by the enquiry API.
- Organization name and branding are temporary placeholders; all fonts use local system fallbacks.
- The warm visual layer is local-only and supports reduced-motion settings, responsive layouts, subtle reveal/card/button feedback, and same-document page transitions. Transitions use native CSS/JavaScript, the History API, and the browser View Transitions API with a CSS fallback; no animation package or framework was added. The story artwork is an illustration, not a photograph of a real rescue dog; add only approved, dog-specific photos to individual profiles.
- Each vaccination/documentation claim is shown only when that item has its own per-dog confirmation flag set to exactly `true`.
- Individual profile health status fields are optional and must be explicitly verified (`vaccinationStatusConfirmed`, `microchipStatusConfirmed`, `sterilisationStatusConfirmed`, `dewormingStatusConfirmed`, `fleaTreatmentStatusConfirmed`, `documentationStatusConfirmed`). Only known status values are rendered; an explicit `pending` or `unknown` is shown distinctly. Missing/unverified values are omitted.
- `/adoption.html` explains the stated rescue process, usual veterinary preparation, limitations of health checks, €550 contribution (€50 reservation deposit + €500 before handover), contract timing, and the need to verify local post-arrival requirements with the relevant authorities/veterinarian.
- `/application.html` is a four-step suitability form. The server validates and encrypts the answers in the existing local inbox. Photos/videos are not accepted: no secure upload backend is configured. Applicants may indicate they can share media later through a privately agreed channel; this local preview does not email or contact them.
- Application questions include short explanations of why each group of information is relevant. No exact street address, identity documents, bank details, or unnecessary phone number are requested.
- The contribution information is informational only; no payment or bank details are collected. Country-specific chip registration and veterinary/passport procedures are not asserted as legal advice and must be verified for the adopter’s country.


## Requirements

- Windows 10/11
- Node.js 18 or later (no npm packages need to be installed)

## Run locally on Windows

1. Open **Command Prompt** or **PowerShell**.
2. Run:

   ```text
   cd C:\Users\Kunja\RescueDogsWebsite
   npm run dev
   ```

3. Open **http://127.0.0.1:4173** in your browser.
4. To stop the server, return to the command window and press **Ctrl+C**.

Keep the server window open while testing. Do not replace `127.0.0.1` with `0.0.0.0`; loopback binding keeps this preview on your computer.

## Run tests

From the project folder, run:

```text
npm test
```

The tests start a temporary local server on port 4174, check the main pages, confirm fictional samples cannot be submitted as real adoption enquiries, and ensure private data files are not served.

## Add a dog draft

Profiles are stored in `data/dogs.json`. A draft object can use this shape:

```json
{
  "id": "unique-lowercase-id",
  "name": "Dog's public name",
  "status": "draft",
  "example": false,
  "vaccinatedConfirmed": false,
  "documentationConfirmed": false,
  "vaccinationStatusConfirmed": false,
  "documentationStatusConfirmed": false,
  "age": "2 years",
  "ageEstimated": false,
  "size": "medium",
  "physicalDetails": "Verified, relevant physical details",
  "breed": "Breed or mix",
  "originCountry": "China",
  "location": "Belgium - municipality/region",
  "temperament": "Verified description",
  "compatibility": {
    "children": "Verified assessment, if known",
    "dogs": "Verified assessment, if known",
    "cats": "Verified assessment, if known"
  },
  "healthConfirmed": false,
  "health": "Verified health information",
  "medicalNeedsConfirmed": false,
  "medicalNeeds": "Confirmed medical or special care needs, when applicable",
  "vaccinationStatus": "",
  "documentationStatus": "",
  "needs": "Care and behaviour needs",
  "home": "Suitable home",
  "description": "Public profile text",
  "photos": ["/public/dogs/unique-lowercase-id-1.jpg", "/public/dogs/unique-lowercase-id-2.jpg"],
  "photo": "/public/dogs/unique-lowercase-id.jpg",
  "updatedAt": "2026-01-01"
}
```

Set `originCountry` to exactly `China` or `South Korea` only when that individual dog's rescue country is confirmed; leave it empty when unknown. The filter contains only China and South Korea, plus a separate reset control. Do not infer an origin. Use `status` values `draft`, `available`, `reserved`, or `adopted`; fictional samples stay `example` and are never available. Set `ageEstimated` to `true` only for an estimated age. Add `compatibility.children`, `.dogs`, and `.cats` only when that assessment is known. Set `vaccinatedConfirmed` and `documentationConfirmed` to `true` only for the confirmed positive claims (vaccinated; valid documents). For a confirmed non-positive or pending status, set `vaccinationStatusConfirmed` or `documentationStatusConfirmed` and use only the supported values: vaccination `vaccinated`, `not-vaccinated`, or `pending`; documentation `valid`, `invalid`, or `pending`. Each item stays hidden unless its matching confirmation flag is exactly `true`. Set `healthConfirmed` and `medicalNeedsConfirmed` before showing those details. `photos` may contain multiple local `/public/dogs/` paths; the older single `photo` field remains supported. No specific medical, passport, microchip, travel, or veterinary details are inferred. Keep new profiles as `draft` until reviewed at **http://127.0.0.1:4173/review.html**. Approval changes status only in the local preview. New Telegram submissions are not automatically synced by a bot; during development, the assistant can prepare the local draft and place supplied photos in the project when available to the session.

## Data handling

This is a development prototype, not a production adoption platform. Form submissions are encrypted at rest with AES-256-GCM and stored only in `data/enquiries.enc`; the 32-byte key is created locally outside the project at `%LOCALAPPDATA%/HaneulTailsRescue/enquiries.key`. On Windows, file permissions inherit the signed-in account's access controls, so this does not protect against compromise of that account or computer. The key is not backed up; deleting it makes the inbox unrecoverable. Do not enter real adopter data until you have decided how to protect and back up the local key/data.

No email, Telegram notification, or external delivery is configured. The loopback-only preview cannot accept applications from adopters elsewhere. To receive real applications online, a separately approved secure hosting/backend and delivery destination must be configured and tested first. No account, service, or publication has been created or configured by this prototype.

Older plaintext enquiries in `data/enquiries.json` are migrated to the encrypted file at server startup; after the encrypted file is written successfully, the plaintext source is deleted. The test suite uses a disposable data directory and key, not your real enquiry data.
