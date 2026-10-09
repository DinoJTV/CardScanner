# Card Scanner

Scan a trading card with your phone or tablet, see what it is, how rare it is,
what year it came out and roughly what it is worth, and keep a collection that
adds up its total value.

## Put it on the internet with GitHub Pages

1. Go to github.com, sign in, and press **New repository**. Name it `card-scanner`, choose **Public**, press **Create**.
2. Press **uploading an existing file**. Unzip this download on a computer, then drag **everything inside the folder** (including the `vendor` folder) onto the page. Press **Commit changes**.
3. Open **Settings → Pages**. Under **Branch** choose `main` and `/ (root)`, then press **Save**.
4. Wait about a minute. Your app is at `https://YOUR-USERNAME.github.io/card-scanner/`.
5. On your phone, open that link and choose **Add to Home Screen** so it works like an app.

## What is in the folder

| File | What it does |
| --- | --- |
| `index.html` | The page itself |
| `style.css` | Colours and layout |
| `app.js` | All the app's brains |
| `vendor/` | The text reader (Tesseract.js), stored in the app so no outside code runs |
| `manifest.webmanifest`, `icon.svg` | Lets phones add it to the home screen |
| `.nojekyll` | Tells GitHub to serve the files exactly as they are |

## How it works

- **Scanning** reads the words printed on the card, on your device. The photo is never uploaded.
- **Card type** is worked out from clue words (for example "HP" and "Weakness" mean Pokémon, "Formula 1" or a driver's name means F1).
- **Prices** for Pokémon, Magic, Yu-Gi-Oh! and Lorcana come from free card databases (TCGplayer market averages).
- **F1 Turbo Attax cards** are matched against the Turbo Attax Collector checklist (name, number, team and card type). It has no prices, so use the eBay button.
- **Sports, F1 and other cards** have no free price list, so the app fills in what it read and gives you a button that opens eBay's sold listings, newest first. Type the price you see and the app remembers it.
- **Your collection** is saved in your browser on your device only. Use Settings → Save a backup file now and then.

## Safety

- No accounts, passwords, secret keys, ads or trackers.
- A Content Security Policy in `index.html` only lets the app run its own code and talk to the listed card databases.
- Everything shown on screen is added as plain text, and backup files are checked before loading.

Prices are a guide only. This app is not made or endorsed by any card company or by eBay.
