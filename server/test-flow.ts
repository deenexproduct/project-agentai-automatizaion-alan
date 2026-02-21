import axios from 'axios';

const API_URL = 'http://localhost:3000/api/linkedin';
const headers = {
  // Use the exact JWT from the user's curl
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTk4OTA2MTUyMWU5OWViZWNmZTM5ZDciLCJlbWFpbCI6ImFsYW5uYWltdGFwaWFAZ21haWwuY29tIiwiaWF0IjoxNzcxNjA2MTMzLCJleHAiOjE3NzQxOTgxMzN9.83OZ1BhLhbdHj9KEnPTA3q5NeqTbj3EQ8qx_5yD1qU0',
  'Content-Type': 'application/json'
};

async function run() {
  try {
    console.log('1. Launching LinkedIn browser...');
    const launchRes = await axios.post(`${API_URL}/launch`, {}, { headers });
    console.log('Launch response:', launchRes.data);

    console.log('\n2. Waiting 15 seconds for login to settle...');
    await new Promise(r => setTimeout(r, 15000));

    // Try prospecting
    console.log('\n3. Starting prospecting...');
    const urls = ["https://www.linkedin.com/in/tomaspereyrairaola/"];
    const rspRes = await axios.post(`${API_URL}/start-prospecting`, { urls, sendNote: false }, { headers });
    console.log('Prospecting response:', rspRes.data);
    
  } catch (err: any) {
    if (err.response) {
      console.error('Error response:', err.response.data);
    } else {
      console.error('Network Error:', err.message);
    }
  }
}

run();
