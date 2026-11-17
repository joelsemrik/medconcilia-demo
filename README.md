# MedConcilia: medical billing reconciliation (demo)

A web app that checks whether clinics actually paid health professionals for every consultation.

I built it for my own accounting clients, who are doctors. Clinics pay them through settlements ("liquidaciones") that cover many consultations at once. MedConcilia matches each consultation against the settlement lines, flags what is still unpaid, and shows payment delays and average values by health insurer.

> **Demo copy.** This is a sanitized public copy of a private app: no client data, no real Firebase project, no commit history.

## Features
- **Clients (doctors):** manage several professionals and work on one at a time
- **Data upload:** import consultations and clinic settlements from Excel
- **Reconciliation:** automatic matching of consultations to settlement lines, plus a "checks" view that scores how likely each pending item is to match
- **Dashboard:** reconciled vs. pending, total settled, average payment delay, and average value per consultation by insurer
- **Reports:** PDF export

## Stack
React · TypeScript · Vite · Express · Firebase (Google sign-in) · Gemini API · Recharts · SheetJS (xlsx) · jsPDF

Built with Google AI Studio.

## Run locally
```bash
npm install
cp .env.example .env.local   # add a GEMINI_API_KEY for the AI features
npm run dev
```
Data is stored in the browser (localStorage). To use Google sign-in, replace the placeholder values in `firebase-applet-config.json` with your own Firebase project.

---
Joel Semrik, Licensed Public Accountant · [LinkedIn](https://linkedin.com/in/joelsemrik)
