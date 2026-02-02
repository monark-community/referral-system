import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MetaMaskSDK } from '@metamask/sdk';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// MetaMask SDK setup
const metamaskSDK = new MetaMaskSDK({
  dappMetadata: { 
    name: 'Reffinity Referral System',
    url: 'http://localhost:3001' 
}
});

// Basic auth endpoint
app.post('/api/auth/login', (req, res) => {
  const { address } = req.body;
  // more code to be added here for real authentication
  res.json({ message: 'Login successful', address });
});

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
