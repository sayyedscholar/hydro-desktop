# Hydro Desktop

Windows tray app that reminds you to drink water and take short wellness breaks. Runs in the system tray, starts with Windows, and shows a small always-on-top popup that does not steal keyboard focus.

## Features
- Daily goal from body weight (35 ml/kg plus an activity bump). Generic heuristic, not medical advice.
- Drink types: water, tea, herbal tea, coffee, other. All count toward the goal. Warning at about 4 cups of coffee.
- Popup reminder on an interval you set (1-480 min). Reminds sooner when you are behind the day's pace. Only inside your awake window (default 08-22).
- Popup hides itself after 10 seconds if ignored. Snooze 15 minutes.
- Live countdown to the next reminder on the dashboard.
- After the goal is reached: drink popups stop, a short break reminder appears every 90 minutes.
- Rotating wellness tips: walk, eyes, namaz, water, sleep, meals. Namaz tips are generic; the app does not know prayer times.
- Data stays local in a JSON file under `%APPDATA%`. No network, no account.

## Run from source
```
npm install
npm start
```
Requires Node.js 18+. If `npm install` skips dev dependencies, check that `NODE_ENV` is not set to `production`.

## Build the Windows installer
```
npm run dist
```
Output: `dist\Hydro Setup 1.0.0.exe`. The installer bundles its own runtime, so Node.js is not needed on the target PC. The installer is unsigned, so Windows SmartScreen will warn: More info, then Run anyway.

"Start with Windows" only registers from the installed build, not from `npm start`.

## Notes
- Closing the window hides it to the tray. Quit from the tray menu.
- Tray menu: Open Hydro, +250 ml, +500 ml, Remind me now, Quit.
- Tips live in the `TIPS` list at the top of `main.js`.
- Desktop only. No phone version and no sync.
