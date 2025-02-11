# MorScout 2024 Backend

Backend server for MorScout 2024 scouting application.

## Setup

1. Install Dependencies
bash
npm install

2. Firebase Setup
- Create project at [Firebase Console](https://console.firebase.google.com)
- Get service account key from Project Settings > Service Accounts
- Save as `serviceAccountKey.json` in root directory

3. Environment Setup
- Copy `.env.example` to `.env`
- Set port number (default 8000)

4. Start Server
   bash
Development
npm run dev
Production
npm start

## API Endpoints

### Match Scouting
- `POST /api/matchscout/:teamNumber` - Submit match scout data
- `GET /api/matchscout/export/csv` - Export all match scout data as CSV

### Button Status
- `GET /api/matchscout/:teamNumber/:matchNumber/button` - Get button status
- `POST /api/matchscout/:teamNumber/:matchNumber/button` - Toggle button status

## Firebase Structure
matchscout/
└── teamNumber/
└── match{number}/
└── username: {
// match scout data
}
buttons/
└── teamNumber-matchNumber/
└── status: "avaiable" | "working"

## Common Issues
1. Check if `serviceAccountKey.json` is present
2. Verify Firebase Rules allow read/write
3. Change PORT in .env if 8000 is taken
