# Macro & Fitness Tracker (PWA)

Vanilla HTML/CSS/JS, no build step. All data lives in the browser (IndexedDB), so it works fully offline once loaded/installed.

## Run locally
From this folder:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser. (Opening `index.html` directly via `file://` will NOT work — IndexedDB and the service worker both require a real http/https origin.)

## Deploy to GitHub Pages
1. Push this folder's contents to a GitHub repo (root, or a `/docs` folder — your call).
2. In the repo settings, enable Pages pointing at that branch/folder.
3. Visit the published URL on your phone and use "Add to Home Screen" (iOS Safari) or the install prompt (Android Chrome) to install it as an app.

## Notes for later (GitHub sync phase)
- `DB.exportAll()` / `DB.importAll()` in `js/db.js` already produce/consume a single JSON blob of all data — this is the foundation for a future "backup to GitHub" feature using a personal access token.
- All records use UUIDs (not autoincrement numbers), which makes merging data from multiple devices/users much safer later.
- The Dashboard already has an "Export Backup (JSON)" button that downloads this blob today, as a manual stopgap until GitHub sync exists.
- When we build the GitHub sync + admin page, we'll add a `settings.userId` (or similar) so each device/user writes to its own uniquely-named JSON file in the repo, and an admin view to browse/manage all users' files.

## Data model (IndexedDB, db name `fitness-tracker`)
- `foodItems` — reusable food items library (name, protein, carbs, fat), auto-populated whenever you log a meal
- `mealEntries` — logged meals by date, each with a list of items + computed totals
- `weightEntries` — date + weight
- `workoutSessions` — date + session name + list of exercises (exercise, sets, reps, weight, notes)
- `settings` — target weight, etc.
