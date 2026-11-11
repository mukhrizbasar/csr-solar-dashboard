# CSR Solar Projects dashboard: setup

The app is a set of plain files (`index.html`, `app.js`, `config.js`).
It runs free on GitHub Pages, keeps its data in Firebase (Google), and shows a free OpenStreetMap street map with a satellite option.
The project data is never stored in the repository: it lives only in Firebase.

You need a Google account and a GitHub account. Total time is about 20 minutes.

## 1. Firebase (database and sign-in)
1. Go to https://console.firebase.google.com and click **Create a project**. Any name works, for example `csr-solar-dashboard`. Google Analytics is not needed.
2. **Build > Firestore Database > Create database.** Choose location `asia-southeast1 (Singapore)` and start in **production mode**.
3. In Firestore, open the **Rules** tab, replace everything with the contents of `firestore.rules`, and click **Publish**.
4. In Firestore **Data**, click **Start collection**:
   - Collection ID: `config`, Document ID: `access`
   - Field `editors`, type **array**: add each editor's Google email (yours first, in lowercase)
   - Field `viewers`, type **array**: emails that may only view (can be empty)
   - Field `publicRead`, type **boolean**: `false` (set `true` only if anyone with the link may view)
5. **Build > Authentication > Get started > Google**, turn it on, and save.
6. **Project settings (gear icon) > General > Your apps > Web (`</>`)**. Register an app (no hosting needed) and copy the `apiKey`, `authDomain`, `projectId` and `appId` values into `config.js`.

## 2. Google Maps key (skip: this dashboard uses the free OpenStreetMap map)
Leave `googleMapsKey` empty in `config.js`. The steps below are only for switching to Google Maps later.

Google Maps needs a billing account on the same Google Cloud project. Normal use by a small team stays inside Google's free monthly quota.
1. Open https://console.cloud.google.com, select the Firebase project from the top bar.
2. **Billing**: link a billing account if asked.
3. **APIs & Services > Library**: enable **Maps JavaScript API**.
4. **APIs & Services > Credentials > Create credentials > API key**. Then edit the key:
   - Application restrictions: **Websites**, add `https://YOUR-GITHUB-NAME.github.io/*`
   - API restrictions: **Maps JavaScript API** only
5. Paste the key into `googleMapsKey` in `config.js`.
6. Optional but recommended: **Billing > Budgets & alerts**, set a small budget (for example RM 20) so you get an email if usage ever goes past the free quota.

If you leave `googleMapsKey` empty, the app uses a free OpenStreetMap street map with a satellite option instead.

## 3. Publish on GitHub Pages
1. Create a new repository on GitHub, for example `csr-solar-dashboard` (private is fine on paid plans; public on free plans).
2. Upload all files from this folder to it.
3. **Settings > Pages**: Source **Deploy from a branch**, branch `main`, folder `/ (root)`. The site appears at `https://YOUR-GITHUB-NAME.github.io/csr-solar-dashboard/` after a minute.
4. Back in Firebase: **Authentication > Settings > Authorized domains > Add domain**: `YOUR-GITHUB-NAME.github.io`.

## 4. First run
Open the site, click **Sign in with Google** with an editor email. The list will be empty with an **Import projects file** button. Click it and choose `seed-projects.json` (sent to you separately, not kept in GitHub). Do this once.

## Day-to-day
- Add or remove editors and viewers by editing `config/access` in the Firestore console.
- Click any pin or row to see details. Editors click **Edit project** to change status, value, dates, capacity or location. **Pick on map** with satellite view is the quickest way to pin the exact rooftop.
- **Export to Excel** downloads the current list in the Masterlist column layout plus coordinates.
