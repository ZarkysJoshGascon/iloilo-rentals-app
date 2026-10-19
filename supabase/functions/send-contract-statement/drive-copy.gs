// Iloilo Rentals: keeps a copy of every contract statement in Google Drive.
// Runs as a Google Apps Script web app on the Google account whose Drive
// holds the copies (a service account can't create files in a personal
// Drive: it has no storage of its own). statement.ts sends it each file.
//
// Set up once, signed in to that Google account (about 5 minutes):
//   1. Open https://script.google.com and click "New project".
//   2. Delete what's in the editor and paste this whole file. Name the project
//      "Iloilo Rentals statements".
//   3. Paste the secret you were given between the quotes of SECRET below.
//      Click Save.
//   4. Click Deploy > New deployment > (gear) Web app.
//      Execute as: Me. Who has access: Anyone. Click Deploy.
//      Google asks to allow access to your Drive: choose your account, then
//      Advanced > "Go to Iloilo Rentals statements (unsafe)" > Allow. (It
//      says unsafe only because the script is yours and not reviewed by Google.)
//   5. Copy the "Web app" URL and send it to whoever manages the site. They
//      set it on Supabase:
//        supabase secrets set DRIVE_UPLOAD_URL=<the URL> DRIVE_UPLOAD_SECRET=<the secret>
//
// Statements then land in My Drive > Contracts > <unit code>, named like
// "2026-11-20 Sent Statement-9S-CT-0012.xlsx". Anyone can reach the URL, but
// only requests carrying the secret are saved.

const SECRET = ''
const ROOT_FOLDER = 'Contracts'

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents)
    if (!SECRET || body.secret !== SECRET) return reply({ error: 'Not allowed' })
    if (!body.file || !body.filename) return reply({ error: 'Missing file' })

    const folder = subfolder(subfolder(DriveApp.getRootFolder(), ROOT_FOLDER), clean(body.folder) || 'Other')
    const name = clean(body.filename)
    // Sent again with the same name: replace the old copy rather than add one.
    const same = folder.getFilesByName(name)
    while (same.hasNext()) same.next().setTrashed(true)

    const blob = Utilities.newBlob(Utilities.base64Decode(body.file), MimeType.MICROSOFT_EXCEL, name)
    const file = folder.createFile(blob)
    return reply({ ok: true, id: file.getId(), url: file.getUrl() })
  } catch (err) {
    return reply({ error: String(err) })
  }
}

function subfolder(parent, name) {
  const found = parent.getFoldersByName(name)
  return found.hasNext() ? found.next() : parent.createFolder(name)
}

// Letters, numbers, spaces, dots, dashes and underscores only.
function clean(s) {
  return String(s || '').replace(/[^\w .-]+/g, '-').slice(0, 150).trim()
}

function reply(out) {
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON)
}
