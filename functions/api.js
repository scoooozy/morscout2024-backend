const express = require("express");
const cors = require("cors");
const db = require("../firebase");
const excel = require("xlsx");
const serverless = require("serverless-http");
const { Parser } = require('json2csv');
const fs = require('fs').promises;
const app = express();
const router = express.Router();
const isDevelopment = process.env.NODE_ENV !== "production";

// Apply middleware first
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Then apply routes based on environment
if (isDevelopment) {
  app.use("/api", router);
} else {
  app.use("/.netlify/functions/api", router);
}

async function getMatchScoutData(documents) {
  let matchScoutData = [];

  for (const document of documents) {
    const documentRef = await document.get();
    const data = documentRef.data();

    // Iterate through all fields that start with "match"
    for (const [key, matchData] of Object.entries(data)) {
      if (key.startsWith("match")) {
        const username = Object.keys(matchData)[0];
        matchScoutData.push({
          teamNumber: document.id,
          matchNumber: key.replace("match", ""), // Extract match number
          ...matchData[username],
          username: username,
        });
      }
    }
  }

  // Sort by team number and match number
  matchScoutData.sort((a, b) => {
    if (a.teamNumber !== b.teamNumber) {
      return a.teamNumber.localeCompare(b.teamNumber);
    }
    return parseInt(a.matchNumber) - parseInt(b.matchNumber);
  });

  return matchScoutData;
}

const submitMatchScoutForm = async (req, res) => {
  try {
    const { teamNumber } = req.params;
    const { username, matchNumber, ...formFields } = req.body;

    // Create PST timestamp
    const pstTimestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    const teamDocRef = db.collection("matchscout").doc(teamNumber);
    const teamDoc = await teamDocRef.get();

    // Add timestamp to form data
    const formDataWithTimestamp = {
      ...formFields,
      submissionTimestamp: pstTimestamp
    };

    if (teamDoc.exists) {
      await teamDocRef.update({
        [`match${matchNumber}`]: {
          [username]: formDataWithTimestamp
        }
      });
    } else {
      const initialData = {
        [`match${matchNumber}`]: {
          [username]: formDataWithTimestamp
        }
      };
      await teamDocRef.set(initialData);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

router.post("/matchscout/:teamNumber", submitMatchScoutForm);

// Route to get the status of the button
router.get("/matchscout/:teamNumber/:matchNumber/button", async (req, res) => {
  try {
    const { teamNumber, matchNumber } = req.params;

    const buttonRef = db
      .collection("buttons")
      .doc(teamNumber + "-" + matchNumber);
    const buttonDoc = await buttonRef.get();
    let status;
    if (!buttonDoc.exists) {
      status = "avaiable";
    } else {
      status = buttonDoc.data().status;
    }

    return res.status(200).json({ status });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, error: "Internal Server Error" });
  }
});

// Route to save the status of the button
router.post("/matchscout/:teamNumber/:matchNumber/button", async (req, res) => {
  try {
    const { teamNumber, matchNumber } = req.params;

    const buttonRef = db
      .collection("buttons")
      .doc(teamNumber + "-" + matchNumber);
    const buttonDoc = await buttonRef.get();
    let newStatus;

    if (!buttonDoc.exists) {
      newStatus = "working";
      await buttonRef.set({ status: newStatus });
    } else {
      const currentStatus = buttonDoc.data().status;
      newStatus = currentStatus === "avaiable" ? "working" : "avaiable";
      await buttonRef.update({ status: newStatus });
    }

    return res.status(200).json({ status: newStatus });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, error: "Internal Server Error" });
  }
});

router.get("/matchscout", async (req, res) => {
  try {
    const matchScoutCollection = db.collection("matchscout");
    const matchScoutDocuments = await matchScoutCollection.listDocuments();
    const matchScoutData = await getMatchScoutData(matchScoutDocuments);
    res.json(matchScoutData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

const downloadExcel = (data, filename) => {
  const rearrangedData = data.map((entry) => {
    const { username, ...rest } = entry;
    const { submissionKey, ...fieldsExceptSubmissionKey } = rest;
    return { username, ...fieldsExceptSubmissionKey, submissionKey };
  });

  rearrangedData.sort((a, b) => {
    if (a.teamNumber !== b.teamNumber)
      return a.teamNumber.localeCompare(b.teamNumber);
    return a.username.localeCompare(b.username);
  });

  const ws = excel.utils.json_to_sheet(rearrangedData);
  const wb = excel.utils.book_new();
  excel.utils.book_append_sheet(wb, ws, "Sheet 1");
  excel.writeFile(wb, filename);
};

router.get("/pitscout", async (req, res) => {
  try {
    const pitScoutCollection = db.collection("pitscout");

    const pitScoutDocuments = await pitScoutCollection.listDocuments();
    const pitScoutData = [];

    for (const document of pitScoutDocuments) {
      const documentRef = await document.get();
      const pitscout = documentRef.data().pitscout;

      for (const submissionKey in pitscout) {
        const submissionData = pitscout[submissionKey];
        const username = Object.keys(submissionData)[0];
        pitScoutData.push({
          teamNumber: document.id,
          submissionKey: submissionKey,
          ...submissionData[username],
          username: username,
        });
      }
    }

    res.json(pitScoutData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

router.get("/all-scout-instances", async (req, res) => {
  try {
    const pitScoutCollection = db.collection("pitscout");
    const matchScoutCollection = db.collection("matchscout");

    const pitScoutDocuments = await pitScoutCollection.listDocuments();
    const matchScoutDocuments = await matchScoutCollection.listDocuments();

    let pitScoutInstances = [];
    let matchScoutInstances = [];

    for (const document of pitScoutDocuments) {
      const documentRef = await document.get();
      const pitscout = documentRef.data().pitscout;

      for (const submissionKey in pitscout) {
        const submissionData = pitscout[submissionKey];
        const username = Object.keys(submissionData)[0];
        pitScoutInstances.push({
          teamNumber: document.id,
          submissionKey,
          ...submissionData[username],
          username,
          scoutType: "pitscout",
        });
      }
    }

    for (const document of matchScoutDocuments) {
      const documentRef = await document.get();
      const matchscout = documentRef.data();

      const autoscout = matchscout.autoscout || {};
      const teleopscout = matchscout.teleopscout || {};

      const checkScoutInstances = (scoutData, scoutType) => {
        for (const submissionKey in scoutData) {
          const submissionData = scoutData[submissionKey];
          const username = Object.keys(submissionData)[0];
          matchScoutInstances.push({
            teamNumber: document.id,
            submissionKey,
            ...submissionData[username],
            username,
            scoutType,
          });
        }
      };

      checkScoutInstances(autoscout, "autoscout");
      checkScoutInstances(teleopscout, "teleopscout");
    }

    res.json({ pitScoutInstances, matchScoutInstances });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

const convertMatchScoutToCSV = async (req, res) => {
  try {
    const snapshot = await db.collection("matchscout").get();
    const records = [];
    
    for (const doc of snapshot.docs) {
      const teamNumber = doc.id;
      const teamData = doc.data();
      
      Object.entries(teamData).forEach(([matchKey, matchData]) => {
        Object.entries(matchData).forEach(([username, scoutData]) => {
          records.push({
            teamNumber,
            matchNumber: matchKey.replace('match', ''),
            username,
            // Auto
            autoL1Scores: scoutData.autoL1Scores || 0,
            autoL2Scores: scoutData.autoL2Scores || 0,
            autoL3Scores: scoutData.autoL3Scores || 0,
            autoL4Scores: scoutData.autoL4Scores || 0,
            autoL1Attempts: scoutData.autoL1Attempts || 0,
            autoL2Attempts: scoutData.autoL2Attempts || 0,
            autoL3Attempts: scoutData.autoL3Attempts || 0,
            autoL4Attempts: scoutData.autoL4Attempts || 0,
            autoProcessorAlgaeScores: scoutData.autoProcessorAlgaeScores || 0,
            autoProcessorAlgaeAttempts: scoutData.autoProcessorAlgaeAttempts || 0,
            autoNetAlgaeScores: scoutData.autoNetAlgaeScores || 0,
            autoNetAlgaeAttempts: scoutData.autoNetAlgaeAttempts || 0,
            leftStartingZone: scoutData.leftStartingZone || 'No',
            // Teleop
            teleopL1Scores: scoutData.teleopL1Scores || 0,
            teleopL2Scores: scoutData.teleopL2Scores || 0,
            teleopL3Scores: scoutData.teleopL3Scores || 0,
            teleopL4Scores: scoutData.teleopL4Scores || 0,
            teleopL1Attempts: scoutData.teleopL1Attempts || 0,
            teleopL2Attempts: scoutData.teleopL2Attempts || 0,
            teleopL3Attempts: scoutData.teleopL3Attempts || 0,
            teleopL4Attempts: scoutData.teleopL4Attempts || 0,
            teleopProcessorAlgaeScores: scoutData.teleopProcessorAlgaeScores || 0,
            teleopProcessorAlgaeAttempts: scoutData.teleopProcessorAlgaeAttempts || 0,
            teleopNetAlgaeScores: scoutData.teleopNetAlgaeScores || 0,
            teleopNetAlgaeAttempts: scoutData.teleopNetAlgaeAttempts || 0,
            // Endgame
            climbLevel: scoutData.climbLevel || '',
            climbSuccess: scoutData.climbSuccess || 'No',
            climbAttemptTime: scoutData.climbAttemptTime || '',
            // Ratings and Comments
            robotSpeed: scoutData.robotSpeed || '',
            defenseRating: scoutData.defenseRating || 'No Defense',
            climbComments: scoutData.climbComments || '',
            generalComments: scoutData.generalComments || ''
          });
        });
      });
    }

    if (records.length === 0) {
      return res.status(404).json({ error: "No scouting data found" });
    }

    // Define fields in the exact order you want them in the CSV
    const fields = [
      'teamNumber',
      'matchNumber',
      'autoL1Scores',
      'autoL2Scores',
      'autoL3Scores',
      'autoL4Scores',
      'autoL1Attempts',
      'autoL2Attempts',
      'autoL3Attempts',
      'autoL4Attempts',
      'autoProcessorAlgaeScores',
      'autoProcessorAlgaeAttempts',
      'autoNetAlgaeScores',
      'autoNetAlgaeAttempts',
      'leftStartingZone',
      'teleopL1Scores',
      'teleopL2Scores',
      'teleopL3Scores',
      'teleopL4Scores',
      'teleopL1Attempts',
      'teleopL2Attempts',
      'teleopL3Attempts',
      'teleopL4Attempts',
      'teleopProcessorAlgaeScores',
      'teleopProcessorAlgaeAttempts',
      'teleopNetAlgaeScores',
      'teleopNetAlgaeAttempts',
      'climbLevel',
      'climbSuccess',
      'climbAttemptTime',
      'climbComments',
      'robotSpeed',
      'defenseRating',
      'generalComments',
      'username',
      'submissionTimestamp'
    ];

    const json2csvParser = new Parser({ 
      fields,
      defaultValue: '0'
    });

    const csv = json2csvParser.parse(records);
    
    // Save CSV file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `matchscout_${timestamp}.csv`;
    const filePath = `./exports/${fileName}`;

    await fs.mkdir('./exports', { recursive: true });
    await fs.writeFile(filePath, csv);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.sendFile(filePath, { root: '.' });

  } catch (error) {
    console.error('Error converting to CSV:', error);
    res.status(500).json({ error: 'Failed to convert data to CSV' });
  }
};

router.get("/matchscout/export/csv", convertMatchScoutToCSV);

const PORT = process.env.PORT || 8000;

if (isDevelopment) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports.handler = serverless(app);

module.exports = {
  // ... existing exports ...
  convertMatchScoutToCSV
};
