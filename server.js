const express = require('express');
const cors = require('cors');
const { submitMatchScoutForm, getPitScoutData, getMatchScoutData, submitPitScoutForm, convertMatchScoutToCSV } = require('./functions/api');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes - Note the reordered routes
app.get('/api/matchscout/export/csv', convertMatchScoutToCSV); // This needs to be first
app.post('/api/matchscout/:teamNumber', submitMatchScoutForm);
app.get('/api/matchscout/:teamNumber', getMatchScoutData);
app.post('/api/pitscout/:teamNumber', submitPitScoutForm);
app.get('/api/pitscout/:teamNumber', getPitScoutData);

// Start server with error handling
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is busy, trying ${PORT + 1}`);
    server.listen(PORT + 1);
  } else {
    console.error('Server error:', err);
  }
}); 